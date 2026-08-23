import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const configPath = "wrangler.jsonc";
const resources = {
  d1Name: "alex-ecosystem",
  kvName: "alex-ecosystem-kv",
  r2Name: "alex-ecosystem-r2-placeholder",
  queueName: "alex-ecosystem-jobs",
};

function run(args, { allowAlreadyExists = false } = {}) {
  const result = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`;
    if (allowAlreadyExists && /already exists|already been created/i.test(output)) return "";
    throw new Error(`Wrangler command failed: wrangler ${args.join(" ")}`);
  }
  return result.stdout;
}

function createIfPlaceholder(config, placeholder, args, label) {
  if (!config.includes(placeholder)) return { config, created: false };

  const output = run(args);
  const id = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
  if (!id) throw new Error(`Could not read the real ${label} ID from Wrangler output.`);
  return { config: config.replace(placeholder, id), created: true };
}

const auth = spawnSync("npx", ["wrangler", "whoami"], { stdio: "inherit" });
if (auth.status !== 0) {
  console.error("Cloudflare setup requires Wrangler authentication. Run: npx wrangler login");
  process.exit(1);
}

let config = await readFile(configPath, "utf8");
let result = createIfPlaceholder(
  config,
  "REPLACE_WITH_D1_DATABASE_ID",
  ["d1", "create", resources.d1Name, "--binding", "DB"],
  "D1 database",
);
config = result.config;
if (result.created) await writeFile(configPath, config);

result = createIfPlaceholder(
  config,
  "REPLACE_WITH_KV_NAMESPACE_ID",
  ["kv", "namespace", "create", resources.kvName, "--binding", "KV"],
  "KV namespace",
);
config = result.config;
if (result.created) await writeFile(configPath, config);

if (config.includes("alex-ecosystem-r2-placeholder")) {
  run(["r2", "bucket", "create", resources.r2Name], { allowAlreadyExists: true });
}

if (config.includes('"queue": "alex-ecosystem-jobs"')) {
  run(["queues", "create", resources.queueName], { allowAlreadyExists: true });
}

await writeFile(configPath, config);
run(["d1", "migrations", "apply", resources.d1Name, "--remote"]);
run(["deploy"]);
console.log("Cloudflare setup and deployment completed.");