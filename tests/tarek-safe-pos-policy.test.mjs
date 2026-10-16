import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTarekMixComponents,
  TAREK_SAFE_PACKAGING_OPTIONS,
} from '../services/tarekSafePosPolicy.ts';

test('accepts two- and three-component mixes only when grams exactly match the approved bottle size', () => {
  assert.deepEqual(normalizeTarekMixComponents(15, [
    { productId: 'oil-a', gramsPerBottle: 10 },
    { productId: 'oil-b', gramsPerBottle: 5 },
  ]), [
    { productId: 'oil-a', gramsPerBottle: 10 },
    { productId: 'oil-b', gramsPerBottle: 5 },
  ]);
  assert.deepEqual(normalizeTarekMixComponents(15, [
    { productId: 'oil-a', gramsPerBottle: 9 },
    { productId: 'oil-b', gramsPerBottle: 4 },
    { productId: 'oil-c', gramsPerBottle: 2 },
  ]).map((component) => component.gramsPerBottle), [9, 4, 2]);
});

test('rejects incomplete, duplicate, fractional, malformed, and over-limit mixes', () => {
  assert.throws(() => normalizeTarekMixComponents(15, [{ productId: 'oil-a', gramsPerBottle: 15 }]), /مكوّنين أو ثلاثة/);
  assert.throws(() => normalizeTarekMixComponents(15, [
    { productId: 'oil-a', gramsPerBottle: 8 }, { productId: 'oil-a', gramsPerBottle: 7 },
  ]), /تكرار المنتج/);
  assert.throws(() => normalizeTarekMixComponents(15, [
    { productId: 'oil-a', gramsPerBottle: 7.5 }, { productId: 'oil-b', gramsPerBottle: 7.5 },
  ]), /غرامات صحيحة/);
  assert.throws(() => normalizeTarekMixComponents(15, [
    { productId: 'oil-a', gramsPerBottle: 10 }, { productId: 'oil-b', gramsPerBottle: 4 },
  ]), /15 جم بالضبط/);
  assert.throws(() => normalizeTarekMixComponents(15, [
    { productId: 'oil/a', gramsPerBottle: 10 }, { productId: 'oil-b', gramsPerBottle: 5 },
  ]), /منتجاً صالحاً/);
  assert.throws(() => normalizeTarekMixComponents(15, Array.from({ length: 4 }, (_, index) => ({
    productId: `oil-${index}`, gramsPerBottle: index === 3 ? 12 : 1,
  }))), /مكوّنين أو ثلاثة/);
});

test('client packaging choices expose only customer-facing labels and prices, never cost fields', () => {
  assert.deepEqual(TAREK_SAFE_PACKAGING_OPTIONS.map(({ id, customerPriceEgp }) => [id, customerPriceEgp]), [
    ['basic_bag', 0], ['luxury_box', 10], ['luxury_bag', 10], ['luxury_both', 20],
  ]);
  const keys = TAREK_SAFE_PACKAGING_OPTIONS.flatMap((option) => Object.keys(option));
  assert.deepEqual(keys.filter((key) => /(cost|profit|margin|commission|financial)/i.test(key)), []);
});
