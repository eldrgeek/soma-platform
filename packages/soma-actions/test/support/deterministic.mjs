const FIXED_ISO = "2026-06-01T12:00:00.000Z";

/**
 * Pin Date and crypto.randomUUID so registry fixtures are stable.
 * @returns {() => void} restore
 */
export function installDeterministicHarness() {
  let seq = 0;
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED_ISO);
      else super(...args);
    }

    static now() {
      return new RealDate(FIXED_ISO).getTime();
    }
  };
  const priorUuid = globalThis.crypto.randomUUID.bind(globalThis.crypto);
  globalThis.crypto.randomUUID = () => {
    const suffix = String(seq++).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  };
  return () => {
    globalThis.Date = RealDate;
    globalThis.crypto.randomUUID = priorUuid;
  };
}
