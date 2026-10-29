/**
 * The complete server schema.
 *
 * Drizzle Kit reads every file in this directory (drizzle.config.ts), and the
 * query builder is constructed from this barrel so that relations resolve.
 */
export * from './_types';
export * from './geography';
export * from './accounts';
export * from './trips';
export * from './content';
export * from './money';
export * from './planner';
export * from './social';
export * from './commerce';
export * from './exports';
