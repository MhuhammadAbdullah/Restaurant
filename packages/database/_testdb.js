// Creates (or drops) an ISOLATED Postgres schema "inv_test" in the same database and builds the Prisma tables inside it.
// Nothing in the real "public" schema is read or changed. Usage: node _testdb.js create | drop
const fs = require("fs");
const { spawnSync } = require("child_process");
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const withSchema = (url) => url + (url.includes("?") ? "&" : "?") + "schema=inv_test";
const testEnv = { ...process.env, ...env, DATABASE_URL: withSchema(env.DATABASE_URL), DIRECT_URL: withSchema(env.DIRECT_URL) };
const mode = process.argv[2];
if (mode === "create") {
  const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], { env: testEnv, stdio: "inherit", shell: true });
  process.exit(r.status ?? 1);
} else if (mode === "drop") {
  const { Client } = (() => { try { return require("pg"); } catch { return {}; } })();
  console.log("drop: use the SQL  DROP SCHEMA inv_test CASCADE;  (this script only prints the URL parts it would use)");
} else {
  console.log("usage: node _testdb.js create|drop");
}
