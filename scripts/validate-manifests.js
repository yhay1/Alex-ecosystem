import { discoverProducts } from "../Alex/registry/directory.js";

try {
  const registry = await discoverProducts("products");
  const errors = registry.validationErrors();

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`${error.manifestFile}: ${error.errors.join(" ")}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Validated ${registry.list().length} enabled product manifest(s).`);
  }
} catch (error) {
  console.error(`Manifest validation failed: ${error.message}`);
  process.exitCode = 1;
}