/**
 * Deep immutability for token tables — contract C4-1: a screen can read a token, never
 * retune one. `Object.freeze` alone is shallow, so a nested table would stay writable.
 *
 * Pure apart from freezing its argument, which is its whole job; it returns the SAME
 * object, now frozen, typed as deeply readonly.
 */

export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

/**
 * Freeze `value` and everything reachable from it. A value that is already frozen is
 * taken to be deeply frozen and left alone (which is also what stops a cycle).
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value as DeepReadonly<T>;
}
