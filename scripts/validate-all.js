import { spawnSync } from "node:child_process";

const checks = [
  "validate:dependencies",
  "validate:manifests",
  "test",
  "check",
  "validate:build",
  "validate:wrangler",
];
const failures = [];

for (const check of checks) {
  console.log(`\n=== ${check} ===`);
  const result = spawnSync("npm", ["run", check], { stdio: "inherit" });
  if (result.status !== 0) failures.push(check);
}

if (failures.length > 0) {
  console.error(`\nValidation failures: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll validation checks passed.");
}