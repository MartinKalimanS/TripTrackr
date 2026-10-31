/**
 * The purchases layer (spec 014, S-12; research D14-08).
 *
 * One rule decides the shape of this file: the buyer RevenueCat knows MUST be our user id. The
 * server's webhook only grants for a known traveller, so a purchase made under an anonymous or a
 * stale id is paid for and never granted. The layer therefore binds the SDK to the signed-in
 * traveller, checks that the SDK agrees, and refuses to sell, or restore, until it does. Sign-out
 * logs the SDK out (never from an anonymous id: the SDK throws there).
 *
 * The store SDK sits behind `PurchasesSdk`, so everything above it is tested with a double and the
 * native module is only touched by `reactNativePurchasesSdk`.
 */
import { Platform } from 'react-native';

export type PurchaseOutcome = { outcome: 'purchased' } | { outcome: 'cancelled' };

/** A product as the paywall draws it. The store, not us, supplies the price and its currency. */
export interface StoreProduct {
  readonly id: string;
  readonly title: string;
  readonly priceString: string;
  readonly kind: 'credit' | 'subscription';
}

/** The slice of the store SDK this app uses. */
export interface PurchasesSdk {
  configure(apiKey: string): void;
  logIn(userId: string): Promise<void>;
  logOut(): Promise<void>;
  isAnonymous(): Promise<boolean>;
  getAppUserId(): Promise<string>;
  getProducts(ids: readonly string[]): Promise<readonly StoreProduct[]>;
  purchaseProduct(id: string): Promise<PurchaseOutcome>;
  restore(): Promise<void>;
}

export class PurchasesIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchasesIdentityError';
  }
}

export interface PurchasesConfig {
  readonly platform: 'ios' | 'android';
  readonly keys: { readonly ios: string | undefined; readonly android: string | undefined };
}

export interface Purchases {
  /** Whether a public key exists for this platform. */
  isConfigured(): boolean;
  bindIdentity(userId: string): Promise<void>;
  unbindIdentity(): Promise<void>;
  loadProducts(ids: readonly string[]): Promise<Record<string, StoreProduct>>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<void>;
}

export function createPurchases(sdk: PurchasesSdk, config: PurchasesConfig): Purchases {
  const key = config.keys[config.platform];
  let configured = false;
  let boundUserId: string | null = null;

  const requireBuyer = (): void => {
    if (boundUserId === null) {
      throw new PurchasesIdentityError('No signed-in traveller is bound to the store.');
    }
  };

  return {
    isConfigured: () => key !== undefined && key !== '',

    async bindIdentity(userId) {
      if (key === undefined || key === '') {
        throw new PurchasesIdentityError('No store key is set for this platform.');
      }
      if (!configured) {
        sdk.configure(key);
        configured = true;
      }
      boundUserId = null;
      await sdk.logIn(userId);
      if ((await sdk.isAnonymous()) || (await sdk.getAppUserId()) !== userId) {
        throw new PurchasesIdentityError(
          'The store does not know this traveller; purchases are disabled.',
        );
      }
      boundUserId = userId;
    },

    async unbindIdentity() {
      boundUserId = null;
      if (!configured || (await sdk.isAnonymous())) return;
      await sdk.logOut();
    },

    async loadProducts(ids) {
      requireBuyer();
      const products = await sdk.getProducts(ids);
      return Object.fromEntries(products.map((product) => [product.id, product]));
    },

    async purchase(productId) {
      requireBuyer();
      return sdk.purchaseProduct(productId);
    },

    async restore() {
      requireBuyer();
      await sdk.restore();
    },
  };
}

/**
 * The real SDK, loaded on first use so Jest and Expo Go never evaluate the native module. This app
 * needs a dev client anyway (AGENTS.md), and the test store keys work in one.
 */
export function reactNativePurchasesSdk(): PurchasesSdk {
  // Loaded here, not at the top, so Jest never evaluates the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require('react-native-purchases') as typeof import('react-native-purchases');
  const { default: Purchases, PRODUCT_CATEGORY } = sdk;
  const CREDIT_IDS = new Set(['credit_single']);

  const toProduct = (product: {
    identifier: string;
    title: string;
    priceString: string;
  }): StoreProduct => ({
    id: product.identifier,
    title: product.title,
    priceString: product.priceString,
    kind: CREDIT_IDS.has(product.identifier) ? 'credit' : 'subscription',
  });

  return {
    configure: (apiKey) => Purchases.configure({ apiKey }),
    logIn: async (userId) => {
      await Purchases.logIn(userId);
    },
    logOut: async () => {
      await Purchases.logOut();
    },
    isAnonymous: () => Purchases.isAnonymous(),
    getAppUserId: () => Purchases.getAppUserID(),
    getProducts: async (ids) => {
      const credits = ids.filter((id) => CREDIT_IDS.has(id));
      const subscriptions = ids.filter((id) => !CREDIT_IDS.has(id));
      const [one, many] = await Promise.all([
        credits.length > 0
          ? Purchases.getProducts(credits, PRODUCT_CATEGORY.NON_SUBSCRIPTION)
          : Promise.resolve([]),
        subscriptions.length > 0
          ? Purchases.getProducts(subscriptions, PRODUCT_CATEGORY.SUBSCRIPTION)
          : Promise.resolve([]),
      ]);
      return [...one, ...many].map(toProduct);
    },
    purchaseProduct: async (id) => {
      const [product] = await Purchases.getProducts(
        [id],
        CREDIT_IDS.has(id) ? PRODUCT_CATEGORY.NON_SUBSCRIPTION : PRODUCT_CATEGORY.SUBSCRIPTION,
      );
      if (!product) throw new PurchasesIdentityError(`The store has no product ${id}.`);
      try {
        await Purchases.purchaseStoreProduct(product);
        return { outcome: 'purchased' };
      } catch (error) {
        if ((error as { userCancelled?: boolean | null }).userCancelled === true) {
          return { outcome: 'cancelled' };
        }
        throw error;
      }
    },
    restore: async () => {
      await Purchases.restorePurchases();
    },
  };
}

let shared: Purchases | undefined;

/** The app's one purchases layer, with the public keys inlined by Expo at build time. */
export function appPurchases(): Purchases {
  shared ??= createPurchases(reactNativePurchasesSdk(), {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    keys: {
      ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
      android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    },
  });
  return shared;
}
