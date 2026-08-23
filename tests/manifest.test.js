import test from "node:test";
import assert from "node:assert/strict";

import manifest from "../products/example-product/manifest.js";
import { validateManifest } from "../Alex/manifest/validate.js";

test("example product manifest is valid", () => {
  assert.deepEqual(validateManifest(manifest), { valid: true, errors: [] });
});

test("validator reports missing generic metadata", () => {
  const result = validateManifest({ enabled: "yes", seo: {} });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 8);
});