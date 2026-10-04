export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SOMA_KNOWN_DEVICE_STORAGE_KEY: string;

export interface SomaKnownDevice {
  storageKey: string;
  read(): boolean;
  readMarker(): string | null;
  mark(): void;
  clear(): void;
}

export function createSomaKnownDevice(options?: {
  storageKey?: string;
  storage?: StorageLike | null;
}): SomaKnownDevice;

export function readSomaKnownDevice(): boolean;
export function readSomaKnownDeviceMarker(): string | null;
export function markSomaKnownDevice(): void;
export function clearSomaKnownDevice(): void;
