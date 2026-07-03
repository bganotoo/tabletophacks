/** Versioned localStorage wrapper. Corrupt or missing values fall back safely. */

const VERSION = 'v1';

/**
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void,
 *           removeItem(k: string): void }} [backing] defaults to localStorage
 * @returns {{ get(name: string, fallback: unknown): unknown,
 *             set(name: string, value: unknown): boolean,
 *             remove(name: string): void }}
 */
export function createStore(backing = globalThis.localStorage) {
  const key = (name) => `th:${name}:${VERSION}`;
  return {
    get(name, fallback) {
      const raw = backing.getItem(key(name));
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(name, value) {
      try {
        backing.setItem(key(name), JSON.stringify(value));
        return true;
      } catch {
        return false; // quota exceeded or storage unavailable
      }
    },
    remove(name) {
      backing.removeItem(key(name));
    },
  };
}
