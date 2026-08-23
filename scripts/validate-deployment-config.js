import { readFile } from "node:fs/promises";

const configuration = await readFile("wrangler.jsonc", "utf8");
const unresolved = [];

if (configuration.includes("REPLACE_WITH_D1_DATABASE_ID")) unresolved.push("D1 database_id");
if (configuration.includes("REPLACE_WITH_KV_NAMESPACE_ID")) unresolved.push("KV namespace id");
if (configuration.includes("alex-ecosystem-r2-placeholder")) unresolved.push("R2 bucket_name");
if (!/"queue"\s*:\s*"[a-z0-9-]+"/.test(configuration)) unresolved.push("Queue name");
if (!process.env.CLOUDFLARE_ACCOUNT_ID && !/"account_id"\s*:/.test(configuration)) {
  unresolved.push("Cloudflare account ID (CLOUDFLARE_ACCOUNT_ID)");
}
if (!process.env.CLOUDFLARE_API_TOKEN) unresolved.push("CLOUDFLARE_API_TOKEN");

if (unresolved.length > 0) {
  console.error("Deployment configuration is incomplete:");
  for (const item of unresolved) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log("Deployment configuration is ready.");
}