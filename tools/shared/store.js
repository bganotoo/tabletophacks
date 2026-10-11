/** Versioned localStorage wrapper. Corrupt or missing values fall back safely,
 *  and failed writes are reported rather than swallowed. */

const VERSION = 'v1';

/** The only namespace this module will write. */
export const KEY_PREFIX = 'th:';

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
const QUOTA_CODES = new Set([22, 1014]);

const MESSAGES = {
  quota:
    'Browser storage is full, so that change was not saved. Export your work ' +
    'to a file, then delete something you no longer need.',
  unavailable:
    'This browser is blocking storage, so nothing can be saved. Your work will ' +
    'be lost when you close the tab — export it first.',
  unknown: 'That change could not be saved. Export your work to a file so it is not lost.',
};

/**
 * Classify a thrown storage error into a reason and a message worth showing.
 * Pure, so every branch is testable with a synthetic error.
 * @param {unknown} err
 * @returns {{ reason: 'quota'|'unavailable'|'unknown', message: string }}
 */
export function describeWriteError(err) {
  const name = err && typeof err === 'object' ? err.name : undefined;
  const code = err && typeof err === 'object' ? err.code : undefined;
  const reason = QUOTA_NAMES.has(name) || QUOTA_CODES.has(code)
    ? 'quota'
    : name === 'SecurityError'
      ? 'unavailable'
      : 'unknown';
  return { reason, message: MESSAGES[reason] };
}

/** Map-backed stand-in used when localStorage is unreachable, so a tool still
 *  works for the session instead of white-screening. */
function memoryBacking() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/** Reading `globalThis.localStorage` itself throws when a browser blocks site
 *  data, so even the property access has to be guarded. */
function resolveBacking() {
  try {
    const store = globalThis.localStorage;
    if (store) {
      store.getItem(`${KEY_PREFIX}probe`);
      return { backing: store, persistent: true };
    }
  } catch {
    // fall through to memory
  }
  return { backing: memoryBacking(), persistent: false };
}

/**
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void,
 *           removeItem(k: string): void }} [backing] defaults to localStorage,
 *   falling back to in-memory storage when the browser blocks it
 * @param {{ onError?: (info: { name: string, reason: string, message: string }) => void }} [options]
 * @returns {{ get(name: string, fallback: unknown): unknown,
 *             set(name: string, value: unknown): boolean,
 *             setRaw(fullKey: string, value: string): boolean,
 *             remove(name: string): void,
 *             keyFor(name: string): string,
 *             persistent: boolean }}
 */
export function createStore(backing, { onError } = {}) {
  let persistent = true;
  if (!backing) {
    const resolved = resolveBacking();
    backing = resolved.backing;
    persistent = resolved.persistent;
  }

  const keyFor = (name) => `${KEY_PREFIX}${name}:${VERSION}`;

  const fail = (name, err) => {
    const info = { name, ...describeWriteError(err) };
    try {
      onError?.(info);
    } catch {
      // a broken handler must not break the save path
    }
    return false;
  };

  const write = (name, fullKey, raw) => {
    try {
      backing.setItem(fullKey, raw);
      return true;
    } catch (err) {
      return fail(name, err);
    }
  };

  return {
    persistent,
    keyFor,

    get(name, fallback) {
      let raw;
      try {
        raw = backing.getItem(keyFor(name));
      } catch {
        return fallback;
      }
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(name, value) {
      return write(name, keyFor(name), JSON.stringify(value));
    },

    /** Write an already-namespaced key. Used only to restore a backup file;
     *  anything outside the `th:` namespace is refused. */
    setRaw(fullKey, value) {
      if (typeof fullKey !== 'string' || !fullKey.startsWith(KEY_PREFIX)) {
        return fail(fullKey, new Error(`refusing to write outside ${KEY_PREFIX}`));
      }
      return write(fullKey, fullKey, String(value));
    },

    remove(name) {
      try {
        backing.removeItem(keyFor(name));
      } catch {
        // nothing useful to do; the value is unreachable either way
      }
    },
  };
}
