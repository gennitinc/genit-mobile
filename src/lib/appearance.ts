import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/** The person's choice: follow the phone, or always light or dark. */
export type AppearancePreference = 'system' | 'light' | 'dark';

const KEY = 'genit.appearance';
let preference: AppearancePreference = 'system';
const listeners = new Set<() => void>();

function apply(next: AppearancePreference) {
  // Overriding the scheme app-wide also restyles native pickers and the status bar.
  Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
}

// Restored at startup; until then the phone's setting applies.
SecureStore.getItemAsync(KEY)
  .then((saved) => {
    if (saved === 'light' || saved === 'dark') {
      preference = saved;
      apply(saved);
      listeners.forEach((listener) => listener());
    }
  })
  .catch(() => undefined);

export function setAppearance(next: AppearancePreference) {
  preference = next;
  apply(next);
  listeners.forEach((listener) => listener());
  SecureStore.setItemAsync(KEY, next).catch(() => undefined);
}

export function useAppearancePreference() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference
  );
}
