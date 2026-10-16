import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAuthorizedSalePrice,
  toTarekWorkerSaleIntentV3,
  toWorkerSaleIntent,
} from '../services/workerSaleContract.ts';
import {
  bootstrapCommissionCounterOnConfiguredWorker,
  bootstrapCommissionCounterOnLocalEmulatorWorker,
  getConfiguredCommissionCounterBootstrapEndpoint,
  getConfiguredTarekSaleWorkerEndpoint,
  quoteTarekSaleToWorker,
  quoteTarekSaleToLocalEmulatorWorker,
  resolveTarekSaleWorkerEndpoint,
  submitTarekSaleToWorker,
  submitTarekSaleToLocalEmulatorWorker,
} from '../services/workerSaleClient.ts';
import {
  assertFreshStartDateHasNoSales,
  LAMSA_FRESH_START_DATE_KEY,
} from '../worker-sale-prototype/src/lamsaSaleWorker.mjs';

function sampleSale(overrides = {}) {
  return {
    id: 'sale-contract-0001',
    date: '2026-10-15T12:00:00.000Z',
    transactionType: 'بيع_طبيعي',
    items: [{
      id: 'line-1',
      productId: 'perfume-1',
      productName: 'عطر تجريبي',
      productType: 'عادي',
      bottleSize: 50,
      bottleSizeId: 'bottle-50-spray',
      essenceGrams: 15,
      cost: 75,
      sellingPrice: 300,
      profit: 210,
      quantity: 1,
      isColoredBottle: false,
      isRollOn: false,
    }],
    totalPrice: 300,
    totalCost: 85,
    totalProfit: 200,
    commissionAmount: 15,
    totalCommission: 15,
    discount: 10,
    loyaltyDiscountAmount: 0,
    loyaltyPointsRedeemed: 0,
    loyaltyPointsEarned: 0,
    customerLoyaltyBalanceAfter: 0,
    customerName: 'عميل تجريبي',
    customerPhone: '01012345678',
    paymentMethod: 'نقدي',
    packagingOptionId: 'luxury_box',
    packagingRevenueEgp: 10,
    packagingCostEgp: 10,
    ...overrides,
  };
}

function allKeys(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    prefix ? `${prefix}.${key}` : key,
    ...allKeys(child, prefix ? `${prefix}.${key}` : key),
  ]);
}

test('maps the real POS sale into a versioned intent without client financial results', () => {
  const intent = toWorkerSaleIntent(sampleSale());
  assert.equal(intent.schema, 'lamsa.sale-intent/v2');
  assert.equal(intent.saleId, 'sale-contract-0001');
  assert.equal(intent.lines[0].productId, 'perfume-1');
  assert.equal(intent.lines[0].bottleSizeId, 'bottle-50-spray');
  assert.equal(intent.lines[0].essenceGramsPerBottle, 15);
  assert.equal(intent.manualDiscountEgp, 10);
  assert.equal(intent.loyaltyPointsToRedeem, 0);
  assert.equal(intent.packagingPaid, true);
  assert.equal(intent.paymentMethod, 'نقدي');
  const forbidden = new Set([
    'sellingPrice', 'cost', 'profit', 'totalPrice', 'totalCost', 'totalProfit',
    'commissionAmount', 'totalCommission', 'loyaltyDiscountAmount',
    'loyaltyPointsEarned', 'customerLoyaltyBalanceAfter', 'date', 'recordedBy',
  ]);
  assert.deepEqual(allKeys(intent).filter((key) => forbidden.has(key)), []);
});

test('financial claims remain comparison-only while the requested selling price is carried for server validation', () => {
  const altered = sampleSale({
    totalPrice: 1,
    totalCost: 999999,
    totalProfit: 999999,
    commissionAmount: 999999,
    totalCommission: 999999,
    items: [{
      ...sampleSale().items[0],
      sellingPrice: 0.01,
      cost: 999999,
      profit: -999999,
    }],
  });
  const intent = toWorkerSaleIntent(altered);
  assert.equal(intent.lines[0].requestedUnitPriceEgp, 0.01);
  assert.equal(intent.lines[0].previewUnitCostEgp, 999999);
  assert.equal(intent.previewTotalPriceEgp, 1);
  assert.equal(intent.previewTotalCostEgp, 999999);
  assert.equal(intent.previewTotalProfitEgp, 999999);
  assert.equal(intent.previewCommissionEgp, 999999);
  assert.equal('totalProfitEgp' in intent, false);
  assert.equal('totalCostEgp' in intent, false);
});

test('custom promotion labels are not trusted; only a stable preset reference crosses the boundary', () => {
  const custom = toWorkerSaleIntent(sampleSale({
    discount: 30,
    promotionalSavings: { offerName: 'عرض حر', originalTotal: 300, finalTotal: 270, savedAmount: 30, savingsPercent: 10 },
  }));
  assert.equal(custom.promotionId, undefined);
  assert.equal(custom.manualDiscountEgp, 30);
  assert.equal('promotionalSavings' in custom, false);

  const preset = toWorkerSaleIntent(sampleSale({
    items: [{ ...sampleSale().items[0], promotionId: 'duo-50ml', quantity: 2, essenceGrams: 30, sellingPrice: 600, cost: 140 }],
    promotionId: 'duo-50ml', discount: 60,
    promotionalSavings: { promotionId: 'duo-50ml', savedAmount: 60 },
  }));
  assert.equal(preset.promotionId, 'duo-50ml');
  assert.equal(preset.lines[0].promotionId, 'duo-50ml');
  assert.equal(preset.manualDiscountEgp, 0);
});

test('loyalty redemption is rejected until a canonical reversal-aware customer ledger is integrated', () => {
  assert.throws(() => toWorkerSaleIntent(sampleSale({ loyaltyPointsRedeemed: 1, loyaltyDiscountAmount: 1 })), /loyalty-authority-required/);
});

test('supports 100 POS lines and 400 mix-component uses when stock references remain bounded', () => {
  const items = Array.from({ length: 100 }, (_, lineIndex) => ({
    id: `mix-line-${lineIndex}`,
    productId: `mix-${lineIndex}`,
    productName: `ميكس ${lineIndex}`,
    productType: 'عادي',
    bottleSize: 50,
    bottleSizeId: 'bottle-50-spray',
    essenceGrams: 15,
    cost: 5,
    sellingPrice: 300,
    profit: 280,
    quantity: 1,
    isMix: true,
    compositionType: 'mix',
    mixComponents: Array.from({ length: 4 }, (_, componentIndex) => ({
      productId: `shared-product-${componentIndex}`,
      productName: `مكوّن ${componentIndex}`,
      productType: 'عادي',
      grams: [3, 4, 4, 4][componentIndex],
    })),
  }));
  const intent = toWorkerSaleIntent(sampleSale({ items }));
  assert.equal(intent.lines.length, 100);
  assert.equal(intent.lines.reduce((sum, line) => sum + (line.mixComponents?.length || 0), 0), 400);
  assert.equal(intent.lines[99].mixComponents[3].gramsPerBottle, 4);
});

test('rejects sale intents that would exceed the Firestore atomic stock-write budget', () => {
  const items = Array.from({ length: 13 }, (_, lineIndex) => ({
    ...sampleSale().items[0],
    id: `mix-overflow-${lineIndex}`,
    bottleSize: 50,
    essenceGrams: 20,
    isMix: true,
    compositionType: 'mix',
    mixComponents: Array.from({ length: 20 }, (_, componentIndex) => ({
      productId: `unique-${lineIndex}-${componentIndex}`,
      grams: 1,
    })),
  }));
  assert.throws(() => toWorkerSaleIntent(sampleSale({ items })), /too-many-stock-documents/);

  const lines = Array.from({ length: 13 }, (_, lineIndex) => ({
    lineId: `tarek-mix-${lineIndex}`,
    bottleSizeId: 'bottle-50-spray',
    bottleSizeMl: 50,
    quantity: 1,
    essenceGramsPerBottle: 20,
    isColoredBottle: false,
    mixComponents: Array.from({ length: 20 }, (_, componentIndex) => ({
      productId: `unique-${lineIndex}-${componentIndex}`,
      gramsPerBottle: 1,
    })),
  }));
  assert.throws(() => toTarekWorkerSaleIntentV3(tarekDraft({ lines })), /too-many-stock-documents/);
});

test('denies owner exceptions, backdating, reversed sales, malformed ids, and over-limit inputs', () => {
  assert.throws(() => toWorkerSaleIntent(sampleSale({ transactionType: 'هدية' })), /owner-approval-required/);
  assert.throws(() => toWorkerSaleIntent(sampleSale({ isBackdated: true })), /unsupported-sale-state/);
  assert.throws(() => toWorkerSaleIntent(sampleSale({ isReversed: true })), /unsupported-sale-state/);
  assert.throws(() => toWorkerSaleIntent(sampleSale({ id: 'bad/id' })), /invalid-sale-id/);
  assert.throws(() => toWorkerSaleIntent(sampleSale({ items: Array.from({ length: 101 }, (_, i) => ({ ...sampleSale().items[0], id: `line-${i}` })) })), /invalid-line-count/);
  assert.throws(() => toWorkerSaleIntent(sampleSale({ items: [{ ...sampleSale().items[0], quantity: 0 }] })), /invalid-quantity/);
  const tooManyComponents = Array.from({ length: 101 }, (_, lineIndex) => ({
    ...sampleSale().items[0],
    id: `mix-${lineIndex}`,
    isMix: true,
    mixComponents: Array.from({ length: 4 }, (_, componentIndex) => ({
      productId: `product-${lineIndex}-${componentIndex}`,
      grams: 1,
    })),
  }));
  assert.throws(() => toWorkerSaleIntent(sampleSale({ items: tooManyComponents })), /invalid-line-count/);
});

test('only owner identity may apply a custom selling price', () => {
  assert.equal(getAuthorizedSalePrice(false, 250, 999), 250);
  assert.equal(getAuthorizedSalePrice(false, 250, 1), 250);
  assert.equal(getAuthorizedSalePrice(false, 250, ''), 250);
  assert.equal(getAuthorizedSalePrice(true, 250, 275), 275);
  assert.equal(getAuthorizedSalePrice(true, 250, ''), 250);
});

function tarekDraft(overrides = {}) {
  return {
    saleId: 'tarek-safe-sale-0001',
    quoteId: 'quote-safe-sale-0001',
    lines: [{
      lineId: 'tarek-line-1',
      productId: 'perfume-1',
      bottleSizeId: 'bottle-50-spray',
      bottleSizeMl: 50,
      quantity: 1,
      essenceGramsPerBottle: 15,
      isColoredBottle: false,
    }],
    manualDiscountEgp: 10,
    paymentMethod: 'نقدي',
    packagingPaid: false,
    ...overrides,
  };
}

test('Tarek v3 intent contains operational inputs only and rejects accidental finance fields', () => {
  const intent = toTarekWorkerSaleIntentV3(tarekDraft());
  assert.equal(intent.schema, 'lamsa.sale-intent/v3');
  assert.equal(intent.saleId, 'tarek-safe-sale-0001');
  assert.equal(intent.manualDiscountEgp, 10);
  const forbidden = new Set(['sellingPrice', 'requestedUnitPriceEgp', 'cost', 'previewUnitCostEgp', 'profit',
    'totalPrice', 'totalCost', 'totalProfit', 'commission', 'commissionAmount', 'totalCommission',
    'loyaltyPointsToRedeem', 'customerLoyaltyBalanceAfter']);
  assert.deepEqual(allKeys(intent).filter((key) => forbidden.has(key)), []);
  assert.throws(() => toTarekWorkerSaleIntentV3(tarekDraft({ totalProfit: 123 })), /unexpected-financial-input/);
  assert.throws(() => toTarekWorkerSaleIntentV3(tarekDraft({
    lines: [{ ...tarekDraft().lines[0], sellingPrice: 1 }],
  })), /unexpected-financial-input/);
});

test('Tarek v3 client posts only to the local Worker and refuses financial fields in its response', async () => {
  let sent;
  const draft = tarekDraft();
  const accepted = await submitTarekSaleToLocalEmulatorWorker(
    draft,
    'http://127.0.0.1:8787/api/lamsa/sales',
    async () => 'emulator-id-token',
    async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, status: 'committed', sale: { id: draft.saleId, totalPrice: 290 } }), { status: 200 });
    },
  );
  assert.equal(accepted.status, 'committed');
  assert.equal(sent.schema, 'lamsa.sale-intent/v3');
  assert.equal('previewTotalProfitEgp' in sent, false);
  assert.equal('requestedUnitPriceEgp' in sent.lines[0], false);

  await assert.rejects(submitTarekSaleToLocalEmulatorWorker(
    draft,
    'https://live-worker.example/api/lamsa/sales',
    async () => { throw new Error('token must not be requested for remote endpoint'); },
  ), /local-emulator-only/);

  await assert.rejects(submitTarekSaleToLocalEmulatorWorker(
    draft,
    'http://localhost:8787/api/lamsa/sales',
    async () => 'emulator-id-token',
    async () => new Response(JSON.stringify({ ok: true, status: 'committed', sale: {
      id: draft.saleId, totalPrice: 290, totalProfit: 200,
    } }), { status: 200 }),
  ), /unsafe-operator-response/);
  for (const leakedKey of ['commissionCounterGeneration', 'budget', 'financialAdmin', 'costCatalog', 'vaultBalance']) {
    await assert.rejects(submitTarekSaleToLocalEmulatorWorker(
      draft,
      'http://127.0.0.1:8787/api/lamsa/sales',
      async () => 'emulator-id-token',
      async () => new Response(JSON.stringify({ ok: true, status: 'committed', sale: {
        id: draft.saleId, totalPrice: 290, metadata: { [leakedKey]: 1 },
      } }), { status: 200 }),
    ), /unsafe-operator-response/);
  }
});

test('quote client posts only to local /quote and accepts selling price but rejects cost/profit fields', async () => {
  const draft = tarekDraft({ quoteId: 'quote-safe-sale-0002' });
  let sentUrl;
  let sent;
  const quote = await quoteTarekSaleToLocalEmulatorWorker(
    draft,
    'http://127.0.0.1:8787/api/lamsa/sales',
    async () => 'emulator-id-token',
    async (url, init) => {
      sentUrl = String(url);
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        status: 'quoted',
        quoteId: draft.quoteId,
        expiresAt: Date.now() + 60_000,
        sale: {
          id: draft.saleId,
          totalPrice: 290,
          discount: 10,
          paymentMethod: 'نقدي',
          items: [{ id: 'tarek-line-1', productId: 'perfume-1', productName: 'عطر',
            productType: 'عادي', bottleSize: 50, quantity: 1, sellingPrice: 300, isMix: false }],
        },
      }), { status: 200 });
    },
  );
  assert.equal(sentUrl, 'http://127.0.0.1:8787/api/lamsa/sales/quote');
  assert.equal(sent.quoteId, draft.quoteId);
  assert.equal(quote.sale.totalPrice, 290);
  assert.equal(quote.sale.items[0].sellingPrice, 300);
  assert.equal('totalProfit' in quote.sale, false);

  await assert.rejects(quoteTarekSaleToLocalEmulatorWorker(
    draft,
    'https://live-worker.example/api/lamsa/sales',
    async () => { throw new Error('token must not be requested for remote endpoint'); },
  ), /local-emulator-only/);
});

test('daily counter bootstrap client is owner-driven and rejects every non-local Worker URL', async () => {
  let sentUrl;
  let sentBody;
  const result = await bootstrapCommissionCounterOnLocalEmulatorWorker(
    'http://127.0.0.1:8787/api/lamsa/commission-counter/bootstrap',
    async () => 'owner-emulator-id-token',
    async (url, init) => {
      sentUrl = String(url);
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        status: 'ready',
        dateKey: '2026-10-17',
        sprayBottlesSold: 0,
        generation: 0,
        historyScanned: true,
        historicalSaleIdsScanned: 0,
      }), { status: 200 });
    },
  );
  assert.equal(sentUrl, 'http://127.0.0.1:8787/api/lamsa/commission-counter/bootstrap');
  assert.deepEqual(sentBody, {});
  assert.equal(result.dateKey, '2026-10-17');
  assert.equal(result.sprayBottlesSold, 0);
  assert.equal(result.historyScanned, true);

  await assert.rejects(bootstrapCommissionCounterOnLocalEmulatorWorker(
    'https://live-worker.example/api/lamsa/commission-counter/bootstrap',
    async () => { throw new Error('token must not be requested for remote endpoint'); },
  ), /local-emulator-only/);
});

test('configured Worker bootstrap uses only the explicit HTTPS production origin and sends an empty body', async () => {
  const config = {
    mode: 'production',
    enabled: true,
    workerUrl: 'https://lamsa-sales-worker.example.workers.dev',
  };
  assert.equal(getConfiguredCommissionCounterBootstrapEndpoint(config),
    'https://lamsa-sales-worker.example.workers.dev/api/lamsa/commission-counter/bootstrap');
  let sentUrl;
  let sentBody;
  let sentAuthorization;
  const result = await bootstrapCommissionCounterOnConfiguredWorker(
    async () => 'owner-google-id-token',
    async (url, init) => {
      sentUrl = String(url);
      sentBody = JSON.parse(String(init?.body));
      sentAuthorization = new Headers(init?.headers).get('authorization');
      return new Response(JSON.stringify({
        ok: true,
        status: 'ready',
        dateKey: '2026-10-17',
        sprayBottlesSold: 0,
        generation: 0,
        historyScanned: true,
        historicalSaleIdsScanned: 0,
      }), { status: 200 });
    },
    config,
  );
  assert.equal(sentUrl, 'https://lamsa-sales-worker.example.workers.dev/api/lamsa/commission-counter/bootstrap');
  assert.deepEqual(sentBody, {});
  assert.equal(sentAuthorization, 'Bearer owner-google-id-token');
  assert.equal(result.dateKey, '2026-10-17');
  assert.equal(result.sprayBottlesSold, 0);
  assert.deepEqual(Object.keys(result).sort(), [
    'dateKey', 'generation', 'historicalSaleIdsScanned', 'historyScanned', 'ok', 'sprayBottlesSold', 'status',
  ]);

  let networkCalls = 0;
  await assert.rejects(bootstrapCommissionCounterOnConfiguredWorker(
    async () => { throw new Error('token must not be requested when disabled'); },
    async () => { networkCalls += 1; throw new Error('network must not be used'); },
    { mode: 'production', enabled: false, workerUrl: 'https://lamsa-sales-worker.example.workers.dev' },
  ), /worker-sale\/not-enabled/);
  assert.equal(networkCalls, 0);
});

test('the approved registration cutover is 2026-10-17 03:00 Cairo / 00:00 UTC', () => {
  const cairoCutover = new Date('2026-10-17T03:00:00+03:00');
  const utcCutover = new Date('2026-10-17T00:00:00.000Z');
  assert.equal(cairoCutover.toISOString(), utcCutover.toISOString());
  assert.equal(utcCutover.toISOString().slice(0, 10), '2026-10-17');
  assert.equal(LAMSA_FRESH_START_DATE_KEY, '2026-10-17');
  assert.doesNotThrow(() => assertFreshStartDateHasNoSales('2026-10-17', { uniqueSaleCount: 0, sprayBottlesSold: 0 }));
  assert.throws(
    () => assertFreshStartDateHasNoSales('2026-10-17', { uniqueSaleCount: 1, sprayBottlesSold: 0 }),
    (error) => error.code === 'sale/fresh-start-date-not-empty',
  );
  assert.throws(
    () => assertFreshStartDateHasNoSales('2026-10-17', { uniqueSaleCount: 0, sprayBottlesSold: 1 }),
    (error) => error.code === 'sale/fresh-start-date-not-empty',
  );
  assert.doesNotThrow(() => assertFreshStartDateHasNoSales('2026-10-18', { uniqueSaleCount: 1 }));
});

test('Tarek Worker build URL is disabled by default, HTTPS-only in production, and local-only in development', () => {
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'production', enabled: false, workerUrl: 'https://sale-worker.example.workers.dev' }), null);
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'production', enabled: true }), null);
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'production', enabled: true, workerUrl: 'http://sale-worker.example.workers.dev' }), null);
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'production', enabled: true, workerUrl: 'https://sale-worker.example.workers.dev/path' }), null);
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'production', enabled: true, workerUrl: 'https://mohmhran5-jpg.github.io' }), null);
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'production', enabled: true, workerUrl: 'https://sale-worker.example.workers.dev' }), 'https://sale-worker.example.workers.dev/api/lamsa/sales');
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'development', enabled: true }), 'http://127.0.0.1:8787/api/lamsa/sales');
  assert.equal(resolveTarekSaleWorkerEndpoint({ mode: 'development', enabled: true, workerUrl: 'https://sale-worker.example.workers.dev' }), null);
  assert.equal(getConfiguredTarekSaleWorkerEndpoint(), null, 'outside a configured Vite build, the client is disabled');
});

test('configured Tarek quote and commit attach the Firebase ID token and reject any unconfigured destination before requesting a token', async () => {
  const config = { mode: 'production', enabled: true, workerUrl: 'https://sale-worker.example.workers.dev' };
  const endpoint = resolveTarekSaleWorkerEndpoint(config);
  const draft = tarekDraft();
  let tokenCalls = 0;
  let quoteUrl;
  const quote = await quoteTarekSaleToWorker(
    draft,
    endpoint,
    async () => { tokenCalls += 1; return 'firebase-id-token-mock'; },
    async (url, init) => {
      quoteUrl = String(url);
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer firebase-id-token-mock');
      return new Response(JSON.stringify({
        ok: true, status: 'quoted', quoteId: draft.quoteId, expiresAt: Date.now() + 60_000,
        sale: { id: draft.saleId, totalPrice: 290, discount: 10, paymentMethod: 'نقدي', items: [] },
      }), { status: 200 });
    },
    config,
  );
  assert.equal(quoteUrl, `${endpoint}/quote`);
  assert.equal(quote.sale.id, draft.saleId);

  let commitUrl;
  const committed = await submitTarekSaleToWorker(
    draft,
    endpoint,
    async () => { tokenCalls += 1; return 'firebase-id-token-mock'; },
    async (url, init) => {
      commitUrl = String(url);
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer firebase-id-token-mock');
      const intent = JSON.parse(String(init.body));
      assert.equal(intent.schema, 'lamsa.sale-intent/v3');
      assert.equal('totalProfit' in intent, false);
      return new Response(JSON.stringify({ ok: true, status: 'committed', sale: { id: draft.saleId, totalPrice: 290 } }), { status: 200 });
    },
    config,
  );
  assert.equal(commitUrl, endpoint);
  assert.equal(committed.status, 'committed');
  assert.equal(tokenCalls, 2);

  await assert.rejects(submitTarekSaleToWorker(
    draft,
    'https://other-worker.example/api/lamsa/sales',
    async () => { tokenCalls += 1; return 'must-not-be-requested'; },
    async () => { throw new Error('fetch must not run'); },
    config,
  ), /worker-sale\/unconfigured-endpoint/);
  assert.equal(tokenCalls, 2, 'a mismatched destination is rejected before reading a Firebase ID token');
});
