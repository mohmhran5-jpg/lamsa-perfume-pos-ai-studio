import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, writeBatch } from 'firebase/firestore';
import { cleanForFirestore, db, requireOwnerAuth } from './firebase';
import {
  projectBottleSizeCosts,
  projectBottleSizeFinancials,
  projectCostPolicySettings,
  projectFinancialAdminSettings,
  projectOperationalSavedMix,
  projectOperationalProduct,
  projectOperationalSale,
  projectOperationalStoreSettings,
  projectProductCost,
  projectTarekProduct,
  projectTarekSaleBottleSize,
  projectTarekSaleProduct,
  projectSaleCosts,
  projectSaleFinancials,
  projectSavedMixCosts,
  SEPARATED_COLLECTIONS,
} from './separatedDataModel';
import type { BottleSize, Product, Sale, SavedMixFormula, StoreSettings } from '../types';

type PendingDocument = {
  collection: string;
  id: string;
  data: unknown;
};

function checkedDocumentId(value: string): string {
  if (!value.trim() || value.includes('/')) throw new Error('invalid-separated-document-id');
  return value;
}

/** All separated writes remain owner-only until a trusted employee identity policy exists. */
async function commitSeparatedDocuments(documents: PendingDocument[]): Promise<void> {
  await requireOwnerAuth();
  const batch = writeBatch(db);
  for (const entry of documents) {
    batch.set(
      doc(db, entry.collection, checkedDocumentId(entry.id)),
      cleanForFirestore(entry.data),
    );
  }
  await batch.commit();
}

/** Writes only to the new split paths; does not update or migrate `products`. */
export async function saveSeparatedProductCloud(product: Product): Promise<void> {
  await requireOwnerAuth();
  const id = checkedDocumentId(String(product.id));
  const tarekRef = doc(db, SEPARATED_COLLECTIONS.tarekProducts, id);
  const operationRef = doc(db, SEPARATED_COLLECTIONS.productOperations, id);
  await runTransaction(db, async (transaction) => {
    const [tarekSnapshot, operationSnapshot] = await Promise.all([
      transaction.get(tarekRef),
      transaction.get(operationRef),
    ]);
    const currentStock = tarekSnapshot.exists()
      ? tarekSnapshot.data().stock_grams
      : operationSnapshot.exists() ? operationSnapshot.data().stock_grams : product.stock_grams;
    if (typeof currentStock !== 'number' || !Number.isFinite(currentStock) || currentStock < 0) {
      throw new Error(`tarek-catalog/invalid-canonical-stock:${id}`);
    }
    const currentProduct = { ...product, stock_grams: currentStock };
    transaction.set(operationRef, cleanForFirestore(projectOperationalProduct(currentProduct)));
    transaction.set(tarekRef, cleanForFirestore(projectTarekProduct(currentProduct)));
    transaction.set(doc(db, SEPARATED_COLLECTIONS.productCosts, id), cleanForFirestore(projectProductCost(product)));
    transaction.set(doc(db, SEPARATED_COLLECTIONS.tarekOperationalCosts, id), cleanForFirestore(projectProductCost(product)));
    transaction.set(doc(db, SEPARATED_COLLECTIONS.tarekSaleProducts, id), cleanForFirestore(projectTarekSaleProduct(product)));
  });
}

/** Writes formula/price separately from formula material costs; leaves `saved_mixes` untouched. */
export async function saveSeparatedMixCloud(formula: SavedMixFormula): Promise<void> {
  const id = checkedDocumentId(String(formula.id));
  await commitSeparatedDocuments([
    {
      collection: SEPARATED_COLLECTIONS.mixOperations,
      id,
      data: projectOperationalSavedMix(formula),
    },
    {
      collection: SEPARATED_COLLECTIONS.mixCosts,
      id,
      data: projectSavedMixCosts(formula),
    },
  ]);
}

/** Writes operational, cost, and profit/commission documents atomically to distinct paths. */
export async function saveSeparatedSaleCloud(sale: Sale): Promise<void> {
  const id = checkedDocumentId(String(sale.id));
  await commitSeparatedDocuments([
    {
      collection: SEPARATED_COLLECTIONS.saleOperations,
      id,
      data: projectOperationalSale(sale),
    },
    {
      collection: SEPARATED_COLLECTIONS.saleCosts,
      id,
      data: projectSaleCosts(sale),
    },
    {
      collection: SEPARATED_COLLECTIONS.saleFinancials,
      id,
      data: projectSaleFinancials(sale),
    },
  ]);
}

/** Keeps store-facing prices separate from cost catalogue and owner-only financial policy. */
export async function saveSeparatedStoreSettingsCloud(settings: StoreSettings): Promise<void> {
  const bottleCostCatalog = {
    schemaVersion: 1 as const,
    costPolicy: projectCostPolicySettings(settings),
    bottleSizes: (settings.bottleSizes ?? []).map(projectBottleSizeCosts),
  };
  await commitSeparatedDocuments([
    {
      collection: SEPARATED_COLLECTIONS.operationalSettings,
      id: 'store',
      data: projectOperationalStoreSettings(settings),
    },
    {
      collection: SEPARATED_COLLECTIONS.costCatalog,
      id: 'store-cost-inputs',
      data: bottleCostCatalog,
    },
    {
      collection: SEPARATED_COLLECTIONS.financialAdmin,
      id: 'store',
      data: {
        schemaVersion: 1,
        settings: projectFinancialAdminSettings(settings),
        bottleSizeMargins: (settings.bottleSizes ?? []).map(projectBottleSizeFinancials),
      },
    },
    ...(settings.bottleSizes ?? []).map((bottle) => ({
      collection: SEPARATED_COLLECTIONS.tarekSaleBottleSizes,
      id: checkedDocumentId(String(bottle.id)),
      data: projectTarekSaleBottleSize(bottle),
    })),
  ]);
}

/**
 * Explicit owner-only backfill for Tarek's stock, cost, and restricted sale
 * catalogue projections. Sale prices are isolated from cost fields; source
 * records are read-only and legacy documents are never mutated here.
 */
export async function prepareTarekReadOnlyCatalogCloud(): Promise<{
  products: number;
  bottleSizes: number;
  saleProducts: number;
  saleBottleSizes: number;
}> {
  await requireOwnerAuth();
  const [productsSnapshot, bottleSizesSnapshot, settingsSnapshot] = await Promise.all([
    getDocsFromServer(collection(db, 'products')),
    getDocsFromServer(collection(db, 'bottleSizes')),
    getDocFromServer(doc(db, 'settings', 'store')),
  ]);
  if (!settingsSnapshot.exists()) throw new Error('tarek-catalog/missing-owner-settings');

  const products = productsSnapshot.docs.map((snapshot) => ({
    ...snapshot.data(),
    id: snapshot.id,
  }) as Product);
  const bottleSizes = bottleSizesSnapshot.docs.map((snapshot) => ({
    ...snapshot.data(),
    id: snapshot.id,
  }) as BottleSize);
  for (const product of products) {
    if (!product.name || !Number.isFinite(product.stock_grams) || product.stock_grams < 0) {
      throw new Error(`tarek-catalog/invalid-product:${String(product.id)}`);
    }
  }

  const chunkSize = 100;
  for (let offset = 0; offset < products.length; offset += chunkSize) {
    const chunk = products.slice(offset, offset + chunkSize);
    await runTransaction(db, async (transaction) => {
      const refs = chunk.map((product) => {
        const id = checkedDocumentId(String(product.id));
        return {
          product,
          id,
          tarekRef: doc(db, SEPARATED_COLLECTIONS.tarekProducts, id),
          operationRef: doc(db, SEPARATED_COLLECTIONS.productOperations, id),
        };
      });
      const tarekSnapshots = await Promise.all(refs.map(({ tarekRef }) => transaction.get(tarekRef)));
      await Promise.all(refs.map(({ operationRef }) => transaction.get(operationRef)));
      for (let index = 0; index < refs.length; index += 1) {
        const { product, id, tarekRef, operationRef } = refs[index];
        const tarekSnapshot = tarekSnapshots[index];
        const tarekStock = tarekSnapshot.exists() ? tarekSnapshot.data().stock_grams : product.stock_grams;
        if (typeof tarekStock !== 'number' || !Number.isFinite(tarekStock) || tarekStock < 0) {
          throw new Error(`tarek-catalog/invalid-canonical-stock:${id}`);
        }
        const projectedProduct = { ...product, stock_grams: tarekStock };
        transaction.set(tarekRef, cleanForFirestore(projectTarekProduct(projectedProduct)));
        transaction.set(operationRef, cleanForFirestore(projectOperationalProduct(projectedProduct)));
        transaction.set(doc(db, SEPARATED_COLLECTIONS.productCosts, id), cleanForFirestore(projectProductCost(product)));
        transaction.set(doc(db, SEPARATED_COLLECTIONS.tarekOperationalCosts, id), cleanForFirestore(projectProductCost(product)));
        transaction.set(doc(db, SEPARATED_COLLECTIONS.tarekSaleProducts, id), cleanForFirestore(projectTarekSaleProduct(product)));
      }
    });
  }

  for (let offset = 0; offset < bottleSizes.length; offset += chunkSize) {
    const batch = writeBatch(db);
    for (const bottle of bottleSizes.slice(offset, offset + chunkSize)) {
      batch.set(
        doc(db, SEPARATED_COLLECTIONS.tarekSaleBottleSizes, checkedDocumentId(String(bottle.id))),
        cleanForFirestore(projectTarekSaleBottleSize(bottle)),
      );
    }
    await batch.commit();
  }

  const settings = settingsSnapshot.data() as StoreSettings;
  const settingsWithCurrentBottles = { ...settings, bottleSizes };
  const costCatalog = {
    schemaVersion: 1,
    costPolicy: projectCostPolicySettings(settingsWithCurrentBottles),
    bottleSizes: bottleSizes.map(projectBottleSizeCosts),
  };
  const costBatch = writeBatch(db);
  costBatch.set(
    doc(db, SEPARATED_COLLECTIONS.costCatalog, 'store-cost-inputs'),
    cleanForFirestore(costCatalog),
    { merge: true },
  );
  costBatch.set(
    doc(db, SEPARATED_COLLECTIONS.operationalSettings, 'store'),
    cleanForFirestore(projectOperationalStoreSettings(settingsWithCurrentBottles)),
  );
  costBatch.set(
    doc(db, SEPARATED_COLLECTIONS.financialAdmin, 'store'),
    cleanForFirestore({
      schemaVersion: 1,
      settings: projectFinancialAdminSettings(settingsWithCurrentBottles),
      bottleSizeMargins: bottleSizes.map(projectBottleSizeFinancials),
    }),
  );
  await costBatch.commit();
  return {
    products: products.length,
    bottleSizes: bottleSizes.length,
    saleProducts: products.length,
    saleBottleSizes: bottleSizes.length,
  };
}
