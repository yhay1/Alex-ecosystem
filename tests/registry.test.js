import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { discoverProducts } from "../Alex/registry/directory.js";
import { ProductRegistry } from "../Alex/registry/index.js";

const validManifest = (id, route, enabled = true) => ({
  id,
  name: id,
  version: "1.0.0",
  route,
  description: `${id} description`,
  enabled,
  seo: { title: id, description: `${id} SEO description` },
});

async function createProducts(manifests) {
  const directory = await mkdtemp(`${tmpdir()}/alex-products-`);

  for (const [folder, manifest] of Object.entries(manifests)) {
    const productDirectory = `${directory}/${folder}`;
    await mkdir(productDirectory, { recursive: true });
    await writeFile(
      `${productDirectory}/manifest.js`,
      `export default ${JSON.stringify(manifest)};`,
    );
  }

  return directory;
}

test("discovers future product folders and supports ID and route lookups", async () => {
  const directory = await createProducts({
    "first-product": validManifest("first", "/first"),
    "second-product": validManifest("second", "/second"),
  });

  try {
    const registry = await discoverProducts(directory);

    assert.equal(registry.list().length, 2);
    assert.equal(registry.getById("first").route, "/first");
    assert.equal(registry.getByRoute("/second").id, "second");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not register disabled or invalid products", async () => {
  const directory = await createProducts({
    disabled: validManifest("disabled", "/disabled", false),
    invalid: { id: "invalid", enabled: true },
  });

  try {
    const registry = await discoverProducts(directory);

    assert.deepEqual(registry.list(), []);
    assert.equal(registry.validationErrors().length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects duplicate IDs and routes", () => {
  const registry = ProductRegistry.fromManifests([]);
  registry.register(validManifest("same", "/one"));

  assert.throws(() => registry.register(validManifest("same", "/two")), /Duplicate product ID/);
  assert.throws(() => registry.register(validManifest("other", "/one")), /Duplicate product route/);
});