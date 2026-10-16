import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import {
  PRESET_PROMOTIONS,
  PACKAGING,
  approvedPrice,
  calculateCommission,
  derivedSingleCost,
  mixUnitCostAndSuggestedPrice,
} from '../src/lamsaSaleWorker.mjs';

async function loadAppTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const [appMath, appPromotions, appPresets, appTarekSafePosPolicy] = await Promise.all([
  loadAppTypeScript('../../types.ts'),
  loadAppTypeScript('../../services/promotionPolicy.ts'),
  loadAppTypeScript('../../services/tarekSalePresets.ts'),
  loadAppTypeScript('../../services/tarekSafePosPolicy.ts'),
]);

const settings = {
  priceEssenceNormal: 10,
  priceEssenceNiche: 15,
  priceEssenceSpecial: 20,
  coloredBottleExtraCost: 35,
  commissionRate: 0.05,
  tieredCommissionRate: 0.07,
  tieredCommissionBottleThreshold: 10,
};

const bottle = {
  id: 'b50',
  sizeMl: 50,
  essenceGrams: 15,
  officialCost: 180,
  normalPrice: 300,
  specialPrice: 420,
  coloredNormalPrice: 350,
  coloredSpecialPrice: 480,
  isRollOn: false,
};

test("Worker sale math matches the application's authoritative pricing, mix, commission, and preset promotion rules", () => {
  // Employee sales use owner-approved list pricing and standard single-product cost policy.
  for (const type of ['عادي', 'نيش', 'عود', 'مسك']) {
    for (const colored of [false, true]) {
      const expectedPrice = appMath.getApprovedSellingPrice({ bottle, perfumeType: type, isColoredBottle: colored });
      assert.equal(approvedPrice(bottle, type, colored), expectedPrice.price, `approved price ${type}, colored=${colored}`);
      for (const grams of [15, 18]) {
        const expectedCost = appMath.calculateDerivedProductCost({
          bottle,
          perfumeType: type,
          customEssenceGrams: grams,
          isColoredBottle: colored,
          settings,
        });
        assert.equal(derivedSingleCost(bottle, type, grams, colored, settings), expectedCost, `single cost ${type}, ${grams}g, colored=${colored}`);
      }
    }
  }

  // The product-specific gram-cost override used by the application mix builder is server-read from the product.
  const products = new Map([
    ['p-normal', { id: 'p-normal', name: 'عطر عادي', brand: 'A', type: 'عادي', stock_grams: 40, isActive: true }],
    ['p-niche', { id: 'p-niche', name: 'عطر نيش', brand: 'B', type: 'نيش', stock_grams: 30, customGramCostEgp: 18, isActive: true }],
  ]);
  const workerComponents = [
    { productId: 'p-normal', gramsPerBottle: 7 },
    { productId: 'p-niche', gramsPerBottle: 8 },
  ];
  const appComponents = [
    { productId: 'p-normal', productName: 'عطر عادي', brand: 'A', productType: 'عادي', grams: 7, availableStockGrams: 40 },
    { productId: 'p-niche', productName: 'عطر نيش', brand: 'B', productType: 'نيش', grams: 8, customOilGramCost: 18, availableStockGrams: 30 },
  ];
  const workerMix = mixUnitCostAndSuggestedPrice(bottle, workerComponents, products, settings, false);
  const appMix = appMath.calculateMixBottleAccounting({ bottle, components: appComponents, settings });
  assert.equal(workerMix.totalGrams, appMix.totalEssenceGrams);
  assert.equal(workerMix.unitCost, appMix.unitBottleCostEgp);
  assert.equal(workerMix.suggestedPrice, appMix.suggestedSellingPriceEgp);

  const commissionLines = [
    { unitPrice: 320, quantity: 2, isRollOn: false },
    { unitPrice: 95, quantity: 1, isRollOn: true },
    { unitPrice: 240, quantity: 2, isRollOn: false },
  ];
  const netRatio = 0.87;
  const priorSprays = 9;
  const workerCommission = calculateCommission(commissionLines, netRatio, priorSprays, settings);
  const appCommission = appMath.calculateNonRetroactiveTieredCommission({
    items: commissionLines.map((line) => ({
      netUnitSellingPrice: Math.round(line.unitPrice * netRatio),
      quantity: line.quantity,
      isRollOn: line.isRollOn,
    })),
    priorSprayBottlesSoldToday: priorSprays,
    baseRate: settings.commissionRate,
    tieredRate: settings.tieredCommissionRate,
    tierThreshold: settings.tieredCommissionBottleThreshold,
  });
  assert.equal(workerCommission.total, appCommission.totalCommissionEgp);

  const packagedSubtotal = 300 + PACKAGING.luxury_box.price;
  const packagedDiscountRatio = (packagedSubtotal - 17) / packagedSubtotal;
  const workerPackagedCommission = calculateCommission(
    [{ unitPrice: 300, quantity: 1, isRollOn: false }], packagedDiscountRatio, priorSprays, settings,
  );
  const appPackagedCommission = appMath.calculateNonRetroactiveTieredCommission({
    items: [{ netUnitSellingPrice: Math.round(300 * packagedDiscountRatio), quantity: 1, isRollOn: false }],
    priorSprayBottlesSoldToday: priorSprays,
    baseRate: settings.commissionRate,
    tieredRate: settings.tieredCommissionRate,
    tierThreshold: settings.tieredCommissionBottleThreshold,
  });
  assert.equal(workerPackagedCommission.total, appPackagedCommission.totalCommissionEgp, 'packaging revenue participates in discount allocation consistently');

  const appPresetMap = new Map(appPresets.TAREK_SALE_PRESET_OFFERS.map((offer) => [offer.id, offer]));
  assert.deepEqual([...appPresetMap.keys()].sort(), Object.keys(PRESET_PROMOTIONS).sort());
  for (const [id, workerOffer] of Object.entries(PRESET_PROMOTIONS)) {
    const appOffer = appPresetMap.get(id);
    assert.equal(appOffer.sizeMl, workerOffer.sizeMl, `${id}: bottle size`);
    assert.equal(appOffer.quantity, workerOffer.quantity, `${id}: quantity`);
    assert.equal(appOffer.discountType, workerOffer.type, `${id}: discount type`);
    assert.equal(appOffer.discountValue, workerOffer.value, `${id}: discount value`);
    const appTotals = appPromotions.calculatePromotionTotals(1375, appOffer.discountType, appOffer.discountValue);
    const workerDiscount = workerOffer.type === 'percent'
      ? Math.round((1375 * workerOffer.value) / 100)
      : Math.min(1375, workerOffer.value);
    assert.equal(appTotals.savedAmount, workerDiscount, `${id}: discount rounding`);
  }

  // Tarek's browser receives only the label and customer-facing price; authoritative packaging costs stay in the Worker.
  const uiPackaging = new Map(appTarekSafePosPolicy.TAREK_SAFE_PACKAGING_OPTIONS.map((option) => [option.id, option]));
  assert.deepEqual([...uiPackaging.keys()].sort(), appMath.DEFAULT_PACKAGING_OPTIONS.map((option) => option.id).sort());
  for (const appOption of appMath.DEFAULT_PACKAGING_OPTIONS) {
    const uiOption = uiPackaging.get(appOption.id);
    const workerOption = PACKAGING[appOption.id];
    const accounting = appMath.calculatePackagingAccounting({
      packagingId: appOption.id,
      isPaidByCustomer: true,
      hasCartItems: true,
    });
    assert.equal(uiOption.customerPriceEgp, appOption.price, `${appOption.id}: customer-facing price`);
    assert.equal(workerOption.price, appOption.price, `${appOption.id}: Worker customer price`);
    assert.equal(workerOption.cost, accounting.extraStoreCostEgp, `${appOption.id}: server-only extra cost`);
    assert.equal(workerOption.replacesBasicBag, Boolean(appOption.replacesBasicBag), `${appOption.id}: replacement rule`);
    assert.equal('cost' in uiOption, false, `${appOption.id}: client packaging table must not include cost`);
  }
});
