import assert from 'node:assert/strict';
import test from 'node:test';
import { toTarekWorkerSaleIntentV3, toWorkerSaleIntent } from '../../services/workerSaleContract.ts';
import { submitSaleToLocalEmulatorWorker, submitTarekSaleToLocalEmulatorWorker } from '../../services/workerSaleClient.ts';
import { normalizeLamsaSaleIntent } from '../src/lamsaSaleContract.mjs';
import { PRESET_PROMOTIONS } from '../src/lamsaSaleWorker.mjs';
import { TAREK_SALE_PRESET_OFFERS } from '../../services/tarekSalePresets.ts';
import { countSaleSprays } from '../src/commissionDayCounter.mjs';

test('Tarek POS preset IDs, sizes and exact quantities match the Worker policy', () => {
  const ui = Object.fromEntries(TAREK_SALE_PRESET_OFFERS.map((offer) => [offer.id, offer]));
  assert.deepEqual(Object.keys(ui).sort(), Object.keys(PRESET_PROMOTIONS).sort());
  for (const [id, offer] of Object.entries(PRESET_PROMOTIONS)) {
    assert.equal(ui[id].sizeMl, offer.sizeMl, `${id} bottle size drift`);
    assert.equal(ui[id].quantity, offer.quantity, `${id} quantity drift`);
  }
});

test('owner-review sales never enter the automatic daily commission counter', () => {
  assert.equal(countSaleSprays({
    commissionTimingStatus: 'needs_owner_review',
    transactionType: 'بيع_طبيعي',
    items: [{ bottleSize: 50, quantity: 4 }],
  }), 0);
});

function saleWith(items, overrides = {}) {
  return {
    id: 'sale-contract-0002',
    transactionType: 'بيع_طبيعي',
    items,
    totalPrice: 100,
    totalCost: 20,
    totalProfit: 75,
    totalCommission: 5,
    commissionAmount: 5,
    discount: 0,
    loyaltyPointsRedeemed: 0,
    paymentMethod: 'نقدي',
    packagingOptionId: 'basic_bag',
    ...overrides,
  };
}

function mixItem(lineId, components = 4) {
  const grams = components === 4 ? [3, 4, 4, 4] : Array(components).fill(Math.floor(15 / components));
  if (components !== 4) grams[0] += 15 - grams.reduce((sum, value) => sum + value, 0);
  return {
    id: lineId,
    productId: `custom-${lineId}`,
    productName: 'ميكس محلي',
    productType: 'عادي',
    bottleSize: 50,
    bottleSizeId: 'bottle-50-spray',
    essenceGrams: 15,
    cost: 999999,
    sellingPrice: 300,
    profit: -999999,
    quantity: 1,
    isMix: true,
    customFormulaName: 'خلطة اختبار',
    mixComponents: grams.map((value, index) => ({
      productId: `component-${lineId}-${index}`,
      grams: value,
      componentOilCostEgp: 999999,
    })),
  };
}

test('Worker parser accepts actual POS intent shape and enforces max 100 lines/400 component uses', () => {
  const items = Array.from({ length: 100 }, (_, index) => {
    const item = mixItem(`mix-${index}`, 4);
    return { ...item, mixComponents: item.mixComponents.map((component, componentIndex) => ({
      ...component,
      productId: `shared-${componentIndex}`,
    })) };
  });
  const intent = toWorkerSaleIntent(saleWith(items));
  const normalized = normalizeLamsaSaleIntent(intent);
  assert.equal(normalized.intent.schema, 'lamsa.sale-intent/v2');
  assert.equal(normalized.intent.lines.length, 100);
  assert.equal(normalized.componentUses, 400);
  assert.equal(normalized.stockProductCount, 4);
  assert.deepEqual(normalized.intent.lines[0].mixComponents.map((component) => component.gramsPerBottle), [3, 4, 4, 4]);
  assert.equal(normalized.intent.lines[0].customFormulaName, 'خلطة اختبار');
  assert.equal(normalized.intent.lines[0].requestedUnitPriceEgp, 300);
});

test('Worker parser rejects more than 240 unique stock documents before Firestore transaction work', () => {
  const base = toWorkerSaleIntent(saleWith([mixItem('mix-base', 4)]));
  const oversized = {
    ...base,
    lines: Array.from({ length: 13 }, (_, lineIndex) => ({
      ...base.lines[0],
      lineId: `oversized-${lineIndex}`,
      essenceGramsPerBottle: 20,
      mixComponents: Array.from({ length: 20 }, (_, componentIndex) => ({
        productId: `unique-${lineIndex}-${componentIndex}`,
        gramsPerBottle: 1,
      })),
    })),
  };
  assert.throws(() => normalizeLamsaSaleIntent(oversized), /too-many-stock-documents/);
});

test('Worker parser rejects client totals and line-level finance as authority fields', () => {
  const intent = toWorkerSaleIntent(saleWith([mixItem('mix-1', 2)]));
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, totalProfitEgp: 500 }), /unexpected-field/);
  const alteredLine = { ...intent.lines[0], sellingPriceEgp: 0.01 };
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, lines: [alteredLine] }), /unexpected-field/);
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, date: '2026-10-17T03:00:00.000Z' }), /unexpected-field/);
  assert.equal(normalizeLamsaSaleIntent(intent).intent.lines[0].mixComponents.reduce((sum, c) => sum + c.gramsPerBottle, 0), 15);
});

test('Worker parser rejects too many component uses, invalid quantities, fractional formula grams and malformed discounts', () => {
  const items = Array.from({ length: 100 }, (_, index) => {
    const item = mixItem(`mix-${index}`, 4);
    return { ...item, mixComponents: item.mixComponents.map((component, componentIndex) => ({
      ...component,
      productId: `shared-${componentIndex}`,
    })) };
  });
  const intent = toWorkerSaleIntent(saleWith(items));
  const usesOverflow = structuredClone(intent);
  usesOverflow.lines.forEach((line) => { line.quantity = 2; });
  assert.throws(() => normalizeLamsaSaleIntent(usesOverflow), /too-many-components/);
  const tooMany = structuredClone(intent);
  tooMany.lines[0].mixComponents.push({ productId: 'overflow-component', gramsPerBottle: 1 });
  assert.throws(() => normalizeLamsaSaleIntent(tooMany), /too-many-components|mix-essence-mismatch/);
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, lines: [{ ...intent.lines[0], quantity: 0 }, ...intent.lines.slice(1)] }), /invalid-quantity/);
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, manualDiscountEgp: -1 }), /invalid-discount/);
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, lines: [{ ...intent.lines[0], mixComponents: [{ productId: 'part', gramsPerBottle: 1.5 }] }] }), /invalid-component-grams/);
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, lines: [{ ...intent.lines[0], bottleSizeId: undefined }] }), /invalid-bottle-size-id/);
});

test('Worker parser refuses loyalty redemption until a canonical customer ledger is available', () => {
  const intent = toWorkerSaleIntent(saleWith([mixItem('loyalty-ledger-1', 2)]));
  assert.throws(() => normalizeLamsaSaleIntent({ ...intent, loyaltyPointsToRedeem: 1 }), /loyalty-authority-required/);
});

test('Worker parser accepts only structurally valid stable preset references', () => {
  const sale = saleWith([{
    id: 'promo-line', productId: 'lamsa-normal', productName: 'عطر', productType: 'عادي',
    bottleSize: 50, bottleSizeId: 'bottle-50-spray', essenceGrams: 30,
    cost: 140, sellingPrice: 600, profit: 372, quantity: 2, promotionId: 'duo-50ml',
  }], {
    id: 'sale-promo-0001', totalPrice: 540, totalCost: 140, totalProfit: 372,
    totalCommission: 28, commissionAmount: 28, discount: 60,
    promotionId: 'duo-50ml', promotionalSavings: { promotionId: 'duo-50ml', savedAmount: 60 },
  });
  const intent = toWorkerSaleIntent(sale);
  const normalized = normalizeLamsaSaleIntent(intent).intent;
  assert.equal(normalized.schema, 'lamsa.sale-intent/v2');
  assert.equal(normalized.promotionId, 'duo-50ml');
  assert.equal(normalized.lines[0].promotionId, 'duo-50ml');
  assert.equal(normalized.manualDiscountEgp, 0);
});

test('current POS adapter blocks loyalty redemption and keeps custom offers as ordinary safe discounts', () => {
  assert.throws(() => toWorkerSaleIntent(saleWith([mixItem('loyalty-1', 2)], {
    loyaltyPointsRedeemed: 50, loyaltyDiscountAmount: 5, discount: 5,
  })), /loyalty-authority-required/);
  const custom = toWorkerSaleIntent(saleWith([mixItem('promo-1', 2)], {
    promotionalSavings: { offerName: 'عرض حر', savedAmount: 20 }, discount: 20,
  }));
  assert.equal(custom.promotionId, undefined);
  assert.equal(custom.manualDiscountEgp, 20);
});

test('current POS adapter carries only the fixed promotion ID and untrusted snapshot amount is comparison-only', () => {
  const item = { ...saleWith([mixItem('promo-fixed', 2)]).items[0], promotionId: 'duo-50ml' };
  const preset = toWorkerSaleIntent(saleWith([item], {
    promotionId: 'duo-50ml', promotionalSavings: { promotionId: 'duo-50ml', savedAmount: 20 }, discount: 20,
  }));
  assert.equal(preset.promotionId, 'duo-50ml');
  assert.equal(preset.lines[0].promotionId, 'duo-50ml');
  assert.equal(preset.manualDiscountEgp, 0);
});

test('current POS adapter rejects a packaging price preview inconsistent with the selected fixed option', () => {
  assert.throws(() => toWorkerSaleIntent(saleWith([mixItem('pkg-1', 2)], {
    packagingOptionId: 'luxury_box', packagingRevenueEgp: 20,
  })), /packaging-preview-mismatch/);
});

test('application client sends the strict intent only to local emulator and never accepts production hosts', async () => {
  let tokenCalls = 0;
  let sent;
  const sale = saleWith([{
    id: 'single-1', productId: 'lamsa-normal', productName: 'عطر', productType: 'عادي',
    bottleSize: 50, bottleSizeId: 'bottle-50-spray', essenceGrams: 15,
    cost: 70, sellingPrice: 300, profit: 215, quantity: 1,
  }], {
    id: 'sale-client-0001', totalPrice: 300, totalCost: 70, totalProfit: 215,
    totalCommission: 15, commissionAmount: 15,
  });
  const result = await submitSaleToLocalEmulatorWorker(
    sale, 'http://127.0.0.1:8787/api/lamsa/sales',
    async () => { tokenCalls += 1; return 'emulator-id-token'; },
    async (_url, init) => {
      sent = { body: JSON.parse(init.body), headers: init.headers };
      return new Response(JSON.stringify({ ok: true, status: 'committed', sale: { id: 'sale-client-0001' } }), { status: 200 });
    },
  );
  assert.equal(tokenCalls, 1);
  assert.equal(result.status, 'committed');
  assert.equal(sent.body.schema, 'lamsa.sale-intent/v2');
  assert.equal(sent.body.lines[0].requestedUnitPriceEgp, 300);
  assert.equal('totalProfit' in sent.body, false);
  assert.equal(sent.headers.authorization, 'Bearer emulator-id-token');

  await assert.rejects(submitSaleToLocalEmulatorWorker(
    sale, 'https://live-worker.example/api/lamsa/sales',
    async () => { throw new Error('token must not be requested for remote endpoint'); },
  ), /local-emulator-only/);
});

function tarekDraft(saleId = 'sale-tarek-v3-0001') {
  return {
    saleId,
    quoteId: `quote-${saleId}`,
    lines: [{ lineId: 'line-safe-1', productId: 'lamsa-normal', bottleSizeId: 'bottle-50-spray',
      bottleSizeMl: 50, quantity: 1, essenceGramsPerBottle: 15, isColoredBottle: false }],
    manualDiscountEgp: 10,
    paymentMethod: 'نقدي',
    packagingPaid: false,
  };
}

test('Tarek v3 contract contains no price, cost, profit, commission or client totals', () => {
  const intent = toTarekWorkerSaleIntentV3(tarekDraft());
  assert.equal(intent.schema, 'lamsa.sale-intent/v3');
  assert.equal(intent.lines[0].productId, 'lamsa-normal');
  assert.equal('requestedUnitPriceEgp' in intent.lines[0], false);
  assert.equal('previewUnitCostEgp' in intent.lines[0], false);
  for (const field of ['previewTotalPriceEgp', 'previewTotalCostEgp', 'previewTotalProfitEgp', 'previewCommissionEgp']) {
    assert.equal(field in intent, false);
    assert.throws(() => normalizeLamsaSaleIntent({ ...intent, [field]: 1 }), /unexpected-field/);
  }
  assert.throws(() => normalizeLamsaSaleIntent({
    ...intent,
    lines: [{ ...intent.lines[0], sellingPriceEgp: 1 }],
  }), /unexpected-field/);
  const parsed = normalizeLamsaSaleIntent(intent).intent;
  assert.equal(parsed.schema, 'lamsa.sale-intent/v3');
  assert.equal(parsed.loyaltyPointsToRedeem, 0);
});

test('Tarek client transmits the same no-finance v3 intent only to the local Worker', async () => {
  const draft = tarekDraft('sale-tarek-client-0001');
  let sent;
  const result = await submitTarekSaleToLocalEmulatorWorker(
    draft, 'http://127.0.0.1:8787/api/lamsa/sales', async () => 'firebase-emulator-token',
    async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, status: 'committed', sale: { id: draft.saleId, totalPrice: 290 } }), { status: 200 });
    },
  );
  assert.equal(result.status, 'committed');
  assert.equal(sent.schema, 'lamsa.sale-intent/v3');
  assert.equal('totalProfit' in sent, false);
  assert.equal('requestedUnitPriceEgp' in sent.lines[0], false);
  await assert.rejects(submitTarekSaleToLocalEmulatorWorker(
    draft, 'https://worker.example/api/lamsa/sales', async () => { throw new Error('no remote token'); },
  ), /local-emulator-only/);
});
