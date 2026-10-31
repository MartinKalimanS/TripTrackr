import { chooseCover, ORDINARY, type Standing } from '@/modules/billing/cover-order';

const none: Standing = {
  ordinaryHeld: 0,
  unlimitedPeriodId: null,
  yearPeriodId: null,
  yearUsesLeft: 0,
  credits: 0,
  oldestCreditId: null,
};
const withYear = { yearPeriodId: 'y1', yearUsesLeft: 4 };
const withCredit = { credits: 2, oldestCreditId: 'c1' };

describe('chooseCover: free slot, then year, then credit; Unlimited first', () => {
  test('a free slot is ordinary', () => {
    expect(chooseCover({ ...none, ...withYear, ...withCredit, ordinaryHeld: 2 }, 3)).toBe(
      ORDINARY,
    );
  });

  test('at the limit a year use is spent before a credit', () => {
    expect(chooseCover({ ...none, ...withYear, ...withCredit, ordinaryHeld: 3 }, 3)).toEqual({
      kind: 'covered',
      source: 'year',
      periodId: 'y1',
      creditId: null,
    });
  });

  test('at the limit with only credits, the oldest credit is spent', () => {
    expect(chooseCover({ ...none, ...withCredit, ordinaryHeld: 3 }, 3)).toEqual({
      kind: 'covered',
      source: 'credit',
      periodId: null,
      creditId: 'c1',
    });
  });

  test('Unlimited wins even with free slots left, so the trip is covered for good', () => {
    expect(
      chooseCover({ ...none, ...withYear, unlimitedPeriodId: 'u1', ordinaryHeld: 0 }, 3),
    ).toEqual({ kind: 'covered', source: 'unlimited', periodId: 'u1', creditId: null });
  });

  test('nothing to pay with is null', () => {
    expect(chooseCover({ ...none, ordinaryHeld: 3 }, 3)).toBeNull();
  });

  test('a free number of zero offers no free slot', () => {
    expect(chooseCover({ ...none, ...withCredit }, 0)).toMatchObject({ source: 'credit' });
  });
});
