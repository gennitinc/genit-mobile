import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

type Prefs = { useBrand: boolean; modelId: string | null };

const KEY = 'genit.chatPrefs';
let prefs: Prefs = { useBrand: true, modelId: null };
const listeners = new Set<() => void>();

// Load once; until then the web's default applies (brand on).
SecureStore.getItemAsync(KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    prefs = { ...prefs, ...saved };
    listeners.forEach((listener) => listener());
  })
  .catch(() => undefined);

export function setChatPrefs(change: Partial<Prefs>) {
  prefs = { ...prefs, ...change };
  listeners.forEach((listener) => listener());
  SecureStore.setItemAsync(KEY, JSON.stringify(prefs)).catch(() => undefined);
}

/** Chat settings remembered on this device: brand identity and agent model. */
export function useChatPrefs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs
  );
}
