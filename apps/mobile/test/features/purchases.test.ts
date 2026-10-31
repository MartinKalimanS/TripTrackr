/**
 * Spec 014 (S-12) - the purchases layer. The store SDK is a double; what is pinned is who the store
 * thinks the buyer is. RevenueCat's user id MUST be our user id: the webhook only acts on that, so a
 * purchase made as an anonymous id would be paid for and never granted. The layer therefore refuses
 * to sell while the SDK is anonymous or holds another traveller's id.
 */
import {
  PurchasesIdentityError,
  createPurchases,
  type PurchasesSdk,
} from '@/features/billing/purchases';

const USER = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';
const OTHER = '11111111-2222-4333-8444-555555555555';

function fakeSdk(overrides: Partial<PurchasesSdk> = {}): jest.Mocked<PurchasesSdk> {
  return {
    configure: jest.fn(),
    logIn: jest.fn().mockResolvedValue(undefined),
    logOut: jest.fn().mockResolvedValue(undefined),
    isAnonymous: jest.fn().mockResolvedValue(false),
    getAppUserId: jest.fn().mockResolvedValue(USER),
    getProducts: jest.fn().mockResolvedValue([]),
    purchaseProduct: jest.fn().mockResolvedValue({ outcome: 'purchased' }),
    restore: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<PurchasesSdk>;
}

const KEYS = { ios: 'ios-key', android: 'android-key' };

describe('identity', () => {
  test('configures once with the platform key and logs in with our user id', async () => {
    const sdk = fakeSdk();
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });

    await purchases.bindIdentity(USER);
    await purchases.bindIdentity(USER);

    expect(sdk.configure).toHaveBeenCalledTimes(1);
    expect(sdk.configure).toHaveBeenCalledWith('ios-key');
    expect(sdk.logIn).toHaveBeenCalledWith(USER);
  });

  test('uses the Android key on Android', async () => {
    const sdk = fakeSdk();
    await createPurchases(sdk, { platform: 'android', keys: KEYS }).bindIdentity(USER);

    expect(sdk.configure).toHaveBeenCalledWith('android-key');
  });

  test('fails closed when the SDK still reports an anonymous id after logIn', async () => {
    const sdk = fakeSdk({ isAnonymous: jest.fn().mockResolvedValue(true) });
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });

    await expect(purchases.bindIdentity(USER)).rejects.toBeInstanceOf(
      PurchasesIdentityError,
    );
    await expect(purchases.purchase('credit_single')).rejects.toBeInstanceOf(
      PurchasesIdentityError,
    );
  });

  test('fails closed when the SDK holds another traveller id', async () => {
    const sdk = fakeSdk({ getAppUserId: jest.fn().mockResolvedValue(OTHER) });
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });

    await expect(purchases.bindIdentity(USER)).rejects.toBeInstanceOf(
      PurchasesIdentityError,
    );
  });

  test('without a key for the platform it cannot be bound', async () => {
    const purchases = createPurchases(fakeSdk(), {
      platform: 'ios',
      keys: { ios: undefined, android: 'a' },
    });

    expect(purchases.isConfigured()).toBe(false);
    await expect(purchases.bindIdentity(USER)).rejects.toBeInstanceOf(
      PurchasesIdentityError,
    );
  });

  test('sign-out logs the SDK out, but never from an anonymous id (the SDK throws)', async () => {
    const sdk = fakeSdk();
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });
    await purchases.bindIdentity(USER);

    await purchases.unbindIdentity();
    expect(sdk.logOut).toHaveBeenCalledTimes(1);

    sdk.isAnonymous.mockResolvedValue(true);
    await purchases.unbindIdentity();
    expect(sdk.logOut).toHaveBeenCalledTimes(1);
  });

  test('after sign-out nothing can be bought', async () => {
    const sdk = fakeSdk();
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });
    await purchases.bindIdentity(USER);
    await purchases.unbindIdentity();

    await expect(purchases.purchase('credit_single')).rejects.toBeInstanceOf(
      PurchasesIdentityError,
    );
  });
});

describe('buying', () => {
  async function bound(sdk = fakeSdk()) {
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });
    await purchases.bindIdentity(USER);
    return { sdk, purchases };
  }

  test('lists the products it was asked for, keyed by id', async () => {
    const { sdk, purchases } = await bound();
    sdk.getProducts.mockResolvedValue([
      { id: 'credit_single', title: 'One trip', priceString: '$3.99', kind: 'credit' },
    ]);

    const products = await purchases.loadProducts(['credit_single']);

    expect(products.credit_single?.priceString).toBe('$3.99');
    expect(sdk.getProducts).toHaveBeenCalledWith(['credit_single']);
  });

  test('a purchase passes the id through and reports it as purchased', async () => {
    const { sdk, purchases } = await bound();

    await expect(purchases.purchase('tier1_y1')).resolves.toEqual({
      outcome: 'purchased',
    });
    expect(sdk.purchaseProduct).toHaveBeenCalledWith('tier1_y1');
  });

  test('a cancelled purchase is not an error', async () => {
    const { sdk, purchases } = await bound();
    sdk.purchaseProduct.mockResolvedValue({ outcome: 'cancelled' });

    await expect(purchases.purchase('tier1_y1')).resolves.toEqual({
      outcome: 'cancelled',
    });
  });

  test('restore needs an identified buyer too', async () => {
    const sdk = fakeSdk();
    const purchases = createPurchases(sdk, { platform: 'ios', keys: KEYS });

    await expect(purchases.restore()).rejects.toBeInstanceOf(PurchasesIdentityError);

    await purchases.bindIdentity(USER);
    await purchases.restore();
    expect(sdk.restore).toHaveBeenCalledTimes(1);
  });
});
