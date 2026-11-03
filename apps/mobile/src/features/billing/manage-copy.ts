/**
 * The words of the Plan and credits sheet (spec 014). Subscription terms are stated where they
 * matter: how to stop a plan (in the store, not here) and that trips are never touched.
 */
export const MANAGE_COPY = {
  title: 'Plan and credits',
  store: 'Manage in store',
  close: 'Close',
  seePlans: 'See plans',
  loading: 'Loading your plan',
  empty: 'You have no plan and no trip credits. Your free trips are always yours.',
  cancelHow:
    'Plans are cancelled or changed in your store account settings. A plan you cancel stays active until the end of the year you paid for.',
  keepsTrips:
    'Trips you already made always stay yours to read, edit and export, whatever happens to a plan.',
  row: {
    title: 'Plan and credits',
    description: 'See what you hold and when it renews',
  },
} as const;
