import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectTarekSavedMix,
  projectTarekSavedMixDTO,
} from '../services/separatedDataModel.ts';

function formula(overrides = {}) {
  return {
    id: 'mix-approved-1',
    name: 'خلطة اختبار معتمدة',
    bottleSizeMl: 30,
    totalEssenceGrams: 10,
    components: [
      { productId: 101, productName: 'زيت أول', grams: 6, oilGramCost: 17, componentOilCost: 102 },
      { productId: 'oil-2', productName: 'زيت ثانٍ', grams: 4, oilGramCost: 23, componentOilCost: 92 },
    ],
    isOwnerApproved: true,
    isRollOn: false,
    isColoredBottle: false,
    updatedAt: '2026-10-16T12:00:00.000Z',
    totalCost: 240,
    sellingPrice: 500,
    suggestedPrice: 550,
    customerRating: 5,
    timesSold: 20,
    repurchaseRatePercent: 40,
    notes: 'ملاحظات خاصة بالمالك',
    ...overrides,
  };
}

test('approved saved mix projects only identity, bottle, product ids, and grams', () => {
  const result = projectTarekSavedMix(formula());
  assert.deepEqual(result, {
    schemaVersion: 1,
    id: 'mix-approved-1',
    name: 'خلطة اختبار معتمدة',
    bottleSizeMl: 30,
    totalEssenceGrams: 10,
    components: [
      { productId: '101', grams: 6 },
      { productId: 'oil-2', grams: 4 },
    ],
    isOwnerApproved: true,
    updatedAt: '2026-10-16T12:00:00.000Z',
    isRollOn: false,
    isColoredBottle: false,
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['cost', 'sellingPrice', 'suggestedPrice', 'rating', 'timesSold', 'repurchase', 'notes']) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, `unexpected ${forbidden} field`);
  }
});

test('unapproved, malformed, duplicated, or over-three-component formulas are not projected', () => {
  assert.equal(projectTarekSavedMix(formula({ isOwnerApproved: false })), null);
  assert.equal(projectTarekSavedMix(formula({ totalEssenceGrams: 11 })), null);
  assert.equal(projectTarekSavedMix(formula({ components: [
    { productId: 'same', grams: 5 },
    { productId: 'same', grams: 5 },
  ] })), null);
  assert.equal(projectTarekSavedMix(formula({ components: [
    { productId: 'one', grams: 3 },
    { productId: 'two', grams: 3 },
    { productId: 'three', grams: 2 },
    { productId: 'four', grams: 2 },
  ] })), null);
  assert.equal(projectTarekSavedMix(formula({ components: [
    { productId: 'one', grams: 0 },
    { productId: 'two', grams: 10 },
  ] })), null);
});

test('Firestore DTO is validated against its document id and re-projected to the safe allowlist', () => {
  const source = {
    schemaVersion: 1,
    ...formula(),
    commissionEgp: 99,
    totalProfitEgp: 123,
    components: formula().components.map((component) => ({ ...component, oilGramCostEgp: 1000 })),
  };
  const result = projectTarekSavedMixDTO(source, 'mix-approved-1');
  assert.ok(result);
  assert.equal('totalProfitEgp' in result, false);
  assert.equal('commissionEgp' in result, false);
  assert.equal('sellingPrice' in result, false);
  assert.deepEqual(result.components, [
    { productId: '101', grams: 6 },
    { productId: 'oil-2', grams: 4 },
  ]);
  assert.equal(projectTarekSavedMixDTO(source, 'different-document-id'), null);
  assert.equal(projectTarekSavedMixDTO({ ...source, schemaVersion: 2 }, 'mix-approved-1'), null);
});
