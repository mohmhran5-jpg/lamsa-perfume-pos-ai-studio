import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, requireTarekAuth } from './firebase';
import {
  getCurrentFirebaseRoleAssignment,
  TAREK_AUTH_EMAIL,
} from './authPolicy';
import { projectTarekProductCostDTO } from './separatedDataModel';
import type {
  OperationalSaleRecord,
  ProductCostRecord,
  TarekOperationalProduct,
  TarekSaleBottleSize,
  TarekSaleProduct,
} from './separatedDataModel';

export interface TarekWorkspaceData {
  products: TarekOperationalProduct[];
  productCosts: ProductCostRecord[];
  sales: OperationalSaleRecord[];
  saleProducts: TarekSaleProduct[];
  saleBottleSizes: TarekSaleBottleSize[];
  saleCatalogReady: boolean;
  permissions: {
    canViewStock: boolean;
    canViewOperationalCosts: boolean;
    canViewOperationalSales: boolean;
    canCreateSales: boolean;
  };
}

const emptyData: TarekWorkspaceData = {
  products: [],
  productCosts: [],
  sales: [],
  saleProducts: [],
  saleBottleSizes: [],
  saleCatalogReady: false,
  permissions: { canViewStock: false, canViewOperationalCosts: false, canViewOperationalSales: false, canCreateSales: false },
};

/** Read-only subscriptions are selected from the verified role grant; Rules independently enforce each collection. */
export async function subscribeToTarekWorkspace(
  onUpdate: (data: TarekWorkspaceData) => void,
  onError: (error: Error) => void,
): Promise<Unsubscribe> {
  await requireTarekAuth();
  const assignment = getCurrentFirebaseRoleAssignment();
  const normalizedEmail = auth.currentUser?.email?.trim().toLowerCase() || '';
  const isLegacyTarek = normalizedEmail === TAREK_AUTH_EMAIL && !assignment;
  const canViewStock = Boolean(isLegacyTarek
    || (assignment?.active === true
      && (assignment.role === 'INVENTORY_VIEWER' || assignment.role === 'STORE_MANAGER')));
  const canViewOperationalSales = Boolean(isLegacyTarek
    || (assignment?.active === true && assignment.role === 'STORE_MANAGER'));
  const canViewOperationalCosts = Boolean(isLegacyTarek
    || (assignment?.active === true && assignment.role === 'STORE_MANAGER'));
  const canCreateSales = Boolean(assignment?.active === true && assignment.role === 'STORE_MANAGER');

  if (!canViewStock) throw new Error('auth/tarek-operational-stock-access-denied');

  let products = emptyData.products;
  let productCosts = emptyData.productCosts;
  let sales = emptyData.sales;
  let saleProducts = emptyData.saleProducts;
  let saleBottleSizes = emptyData.saleBottleSizes;
  let saleProductSnapshotReady = false;
  let saleBottleSnapshotReady = false;
  const publish = () => onUpdate({
    products,
    productCosts,
    sales,
    saleProducts,
    saleBottleSizes,
    saleCatalogReady: saleProductSnapshotReady && saleBottleSnapshotReady,
    permissions: { canViewStock, canViewOperationalCosts, canViewOperationalSales, canCreateSales },
  });
  const reportError = (reason: Error) => onError(reason);
  const subscriptions: Unsubscribe[] = [];

  subscriptions.push(onSnapshot(
    query(collection(db, 'tarek_products'), limit(500)),
    (snapshot) => {
      products = snapshot.docs.map((item) => ({
        ...item.data(),
        id: item.id,
      }) as TarekOperationalProduct);
      publish();
    },
    reportError,
  ));

  if (canViewOperationalCosts) {
    subscriptions.push(onSnapshot(
      query(collection(db, 'tarek_operational_costs'), limit(500)),
      (snapshot) => {
        productCosts = snapshot.docs.flatMap((item) => {
          const cost = projectTarekProductCostDTO(item.data(), item.id);
          return cost ? [cost] : [];
        });
        publish();
      },
      reportError,
    ));
  }

  if (canViewOperationalSales) {
    subscriptions.push(onSnapshot(
      query(collection(db, 'sale_operations'), orderBy('date', 'desc'), limit(50)),
      (snapshot) => {
        sales = snapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }) as OperationalSaleRecord);
        publish();
      },
      reportError,
    ));
  }

  if (canCreateSales) {
    subscriptions.push(onSnapshot(
      query(collection(db, 'tarek_sale_products'), limit(500)),
      (snapshot) => {
        saleProducts = snapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }) as TarekSaleProduct);
        saleProductSnapshotReady = true;
        publish();
      },
      reportError,
    ));
    subscriptions.push(onSnapshot(
      query(collection(db, 'tarek_sale_bottle_sizes'), limit(100)),
      (snapshot) => {
        saleBottleSizes = snapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        }) as TarekSaleBottleSize);
        saleBottleSnapshotReady = true;
        publish();
      },
      reportError,
    ));
  }

  publish();
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
