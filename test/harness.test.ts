/**
 * Proves the mobile test harness itself works — the transform chain, the path
 * alias, and the native-module stubs. If this fails, no other mobile suite's
 * result can be trusted.
 */
import * as SecureStore from 'expo-secure-store';

import { Colors } from '@/constants/theme';

describe('mobile test harness', () => {
  it('resolves the @/ path alias to src/', () => {
    expect(Colors).toBeDefined();
  });

  it('stubs expo-secure-store as a working in-memory store', async () => {
    await SecureStore.setItemAsync('refresh_token', 'abc123');
    await expect(SecureStore.getItemAsync('refresh_token')).resolves.toBe('abc123');

    await SecureStore.deleteItemAsync('refresh_token');
    await expect(SecureStore.getItemAsync('refresh_token')).resolves.toBeNull();
  });
});
