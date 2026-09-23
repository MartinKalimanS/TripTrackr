/**
 * `.sql` files are imported as strings by Drizzle's generated
 * `migrations/migrations.js` (babel `inline-import`, see babel.config.js).
 * This declaration is what lets `tsc` — which checks that JS file because
 * `allowJs` is on — accept the import.
 */
declare module '*.sql' {
  const content: string;
  export default content;
}
