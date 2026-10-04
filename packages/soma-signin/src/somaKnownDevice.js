/** @typedef {{ getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void }} StorageLike */

export const DEFAULT_SOMA_KNOWN_DEVICE_STORAGE_KEY = 'soma.known.device';

const MARKER_VALUE = '1';

/**
 * @returns {StorageLike | null}
 */
function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.storageKey]
 * @param {StorageLike | null} [options.storage]
 */
export function createSomaKnownDevice(options = {}) {
  const storageKey = options.storageKey ?? DEFAULT_SOMA_KNOWN_DEVICE_STORAGE_KEY;
  const storage = options.storage !== undefined ? options.storage : defaultStorage();

  return {
    storageKey,
    read() {
      if (!storage) return false;
      try {
        return storage.getItem(storageKey) === MARKER_VALUE;
      } catch {
        return false;
      }
    },
    readMarker() {
      if (!storage) return null;
      try {
        return storage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    mark() {
      if (!storage) return;
      try {
        storage.setItem(storageKey, MARKER_VALUE);
      } catch {
        /* best-effort */
      }
    },
    clear() {
      if (!storage) return;
      try {
        storage.removeItem(storageKey);
      } catch {
        /* best-effort */
      }
    },
  };
}

const defaultKnownDevice = createSomaKnownDevice();

/** @returns {boolean} */
export function readSomaKnownDevice() {
  return defaultKnownDevice.read();
}

/** @returns {string | null} */
export function readSomaKnownDeviceMarker() {
  return defaultKnownDevice.readMarker();
}

export function markSomaKnownDevice() {
  defaultKnownDevice.mark();
}

export function clearSomaKnownDevice() {
  defaultKnownDevice.clear();
}
