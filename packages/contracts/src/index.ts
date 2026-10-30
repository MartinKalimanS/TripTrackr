/**
 * @triptrackr/contracts — the wire formats the mobile app and the API share.
 *
 * Everything here is a zod schema plus its inferred type. The server validates
 * inbound payloads with the schema; the client types its rows from the same
 * schema. One definition, two consumers, no drift (research D-13).
 */
export * from './scalars';
export * from './money';
export * from './sync/tables';
export * from './sync/records';
export * from './sync/envelope';
export * from './api/errors';
export * from './api/auth';
export * from './api/users';
export * from './api/exports';
export * from './api/lookups';
export * from './api/trips';
export * from './api/notes';
export * from './api/expenses';
export * from './api/fx';
export * from './api/photos';
export * from './api/documents';
export * from './api/billing';
export * from './boarding-pass';
