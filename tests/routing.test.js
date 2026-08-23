import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { discoverProducts } from "../Alex/registry/directory.js";
import { createRouter } from "../Alex/routing/index.js";

const manifest = (id, route, enabled = true) => ({
  id,
  name: id,
  version: "1.0.0",
  route,
  description: `${id} description`,
  enabled,
  seo: { title: id, description: `${id} SEO description` },
});

async function createProductDirectory(products) {
  const directory = await mkdtemp(`${tmpdir()}/alex-routing-`);

  for (const [folder, product] of Object.entries(products)) {
    const productDirectory = `${directory}/${folder}`;
    await mkdir(productDirectory, { recursive: true });
    await writeFile(`${productDirectory}/manifest.js`, `export default ${JSON.stringify(product.manifest)};`);
    if (product.handler) {
      await writeFile(`${productDirectory}/handler.js`, `export default ${product.handler};`);
    }
  }

  return directory;
}

async function request(path) {
  return new Request(`https://example.test${path}`);
}

test("routes a request to the registered product handler", async () => {
  const directory = await createProductDirectory({
    product: { manifest: manifest("product", "/product"), handler: "() => new Response('handled')" },
  });

  try {
    const router = createRouter(await discoverProducts(directory));
    const response = await router.fetch(await request("/product?source=test"));

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "handled");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("returns 404 for unknown and disabled routes", async () => {
  const directory = await createProductDirectory({
    disabled: { manifest: manifest("disabled", "/disabled", false), handler: "() => new Response('should not run')" },
  });

  try {
    const router = createRouter(await discoverProducts(directory));

    assert.equal((await router.fetch(await request("/unknown"))).status, 404);
    assert.equal((await router.fetch(await request("/disabled"))).status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses registry route lookup for the selected product", async () => {
  const directory = await createProductDirectory({
    product: { manifest: manifest("lookup", "/lookup"), handler: "() => new Response('lookup')" },
  });

  try {
    const registry = await discoverProducts(directory);
    const router = createRouter(registry);

    assert.equal(registry.getByRoute("/lookup").id, "lookup");
    assert.equal(await (await router.fetch(await request("/lookup"))).text(), "lookup");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});