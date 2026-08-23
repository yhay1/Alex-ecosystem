import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["ls", "--depth=0"], { stdio: "inherit" });
process.exit(result.status ?? 1);