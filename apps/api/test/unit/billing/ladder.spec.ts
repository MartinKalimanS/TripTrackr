import { LADDER_FLOOR, nextProductId } from '@/modules/billing/ladder';

const products = {
  credit_single: { kind: 'credit' },
  tier1_y1: { kind: 'tier1', step: 1 },
  tier1_y2: { kind: 'tier1', step: 2 },
  tier1_y3_plus: { kind: 'tier1', step: 3 },
  unl_y1: { kind: 'unlimited', step: 1 },
  unl_y2: { kind: 'unlimited', step: 2 },
} as const;

describe('price ladder: which product comes next', () => {
  test('moves one step down each year', () => {
    expect(nextProductId(products, 'tier1', 1)).toBe('tier1_y2');
    expect(nextProductId(products, 'tier1', 2)).toBe('tier1_y3_plus');
  });

  test('stops at the floor', () => {
    expect(nextProductId(products, 'tier1', LADDER_FLOOR)).toBe('tier1_y3_plus');
    expect(nextProductId(products, 'tier1', 9)).toBe('tier1_y3_plus');
  });

  test('a tier with no product at the wanted step falls back to the highest below it', () => {
    expect(nextProductId(products, 'unlimited', 2)).toBe('unl_y2');
    expect(nextProductId(products, 'unlimited', 1)).toBe('unl_y2');
  });

  test('a step below one counts as the first year', () => {
    expect(nextProductId(products, 'tier1', 0)).toBe('tier1_y2');
  });

  test('never offers a credit product or the other tier', () => {
    expect(nextProductId({ credit_single: { kind: 'credit' } }, 'tier1', 1)).toBeNull();
    expect(nextProductId({ unl_y1: { kind: 'unlimited', step: 1 } }, 'tier1', 1)).toBeNull();
  });

  test('no products configured gives null', () => {
    expect(nextProductId({}, 'unlimited', 1)).toBeNull();
  });
});
