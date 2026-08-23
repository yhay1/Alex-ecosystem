import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const configuration = await readFile("wrangler.jsonc", "utf8");
const missing = [];

if (!process.env.CLOUDFLARE_ACCOUNT_ID) missing.push("CLOUDFLARE_ACCOUNT_ID");
if (!process.env.CLOUDFLARE_API_TOKEN) missing.push("CLOUDFLARE_API_TOKEN");
if (configuration.includes("REPLACE_WITH_") || configuration.includes("-placeholder")) {
  missing.push("resolved resource identifiers in wrangler.jsonc");
}

if (missing.length > 0) {
  console.error("Deployment refused. Missing required configuration:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["wrangler", "deploy", "--account-id", process.env.CLOUDFLARE_ACCOUNT_ID],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);