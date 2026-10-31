/**
 * The paywall's words (spec 014; FR-005 to FR-008; Apple 3.1.2). Subscription terms are stated where
 * the price is: what it is, how long, what it costs for that period, that it renews, and how to
 * stop it. Prices are never written here: the store supplies every price and its currency.
 */
export const PAYWALL_COPY = {
  title: 'Add another trip',
  lead: (held: number, allowance: number) =>
    `You have ${held} of your ${allowance} free trips. Pick how to add this one.`,
  option: {
    credit: { name: 'This trip only', detail: 'One trip. Never expires.' },
    tier1: { name: 'Yearly: 10 trips', detail: '10 new trips each year.' },
    unlimited: { name: 'Yearly: unlimited', detail: 'As many trips as you like.' },
  },
  renewal:
    'Yearly plans renew automatically until you cancel. Cancel any time in your store account settings; you keep the plan until the end of the year you paid for.',
  keepsTrips:
    'Trips you already made always stay yours to read, edit and export, whatever you choose.',
  deleteRoute: 'Or delete a trip you no longer need to make room.',
  restore: 'Restore purchases',
  notNow: 'Not now',
  pending:
    'Thanks. Your purchase is confirmed by the store and is on its way to your account. This can take a minute.',
  failed: 'The purchase did not go through. You have not been charged.',
  unavailable: 'Purchases are not available right now. Please try again later.',
  restored: 'Purchases restored.',
} as const;
