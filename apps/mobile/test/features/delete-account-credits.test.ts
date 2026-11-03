import { DELETE_ACCOUNT_COPY } from '@/features/auth/delete-account-copy';

describe('delete account: unused credits are lost (spec 014, FR-010)', () => {
  test('says so for one credit, in the singular', () => {
    expect(DELETE_ACCOUNT_COPY.credits(1)).toMatch(/1 unused single-trip credit\./);
    expect(DELETE_ACCOUNT_COPY.credits(1)).toMatch(/lost with your account/);
  });

  test('says so for several, in the plural', () => {
    expect(DELETE_ACCOUNT_COPY.credits(3)).toMatch(/3 unused single-trip credits\./);
  });
});
