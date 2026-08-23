import { access, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { ProductRegistry } from "./index.js";

async function findManifestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await findManifestFiles(entryPath)));
    else if (entry.isFile() && entry.name === "manifest.js") files.push(entryPath);
  }

  return files;
}

export async function discoverProducts(productsDirectory) {
  const products = [];

  for (const manifestFile of await findManifestFiles(productsDirectory)) {
    const manifest = (await import(pathToFileURL(manifestFile))).default;
    let handler;
    const handlerFile = manifestFile.replace(/manifest\.js$/, "handler.js");

    try {
      await access(handlerFile);
      handler = (await import(pathToFileURL(handlerFile))).default;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    products.push({ manifest, handler });
  }

  return ProductRegistry.fromManifests(products);
}