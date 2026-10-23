import { CapError } from "../../src/index.js";

const err = new CapError(12.5, 100, 0.25);
if (err.payload.estimated_usd !== 0.25) {
  throw new Error("unexpected CapError payload");
}
