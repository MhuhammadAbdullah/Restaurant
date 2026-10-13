import fs from "node:fs";
import path from "node:path";

/**
 * Safety: the automated tests must NEVER touch real data. They run against an isolated Postgres schema called
 * "inv_test" (created by `node packages/database/_testdb.js create`). This file points the database URLs at that schema
 * and refuses to continue if it cannot.
 */
const TEST_SCHEMA = process.env.TEST_DB_SCHEMA || "inv_test";

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}
loadEnv(path.resolve(__dirname, "../.env"));

const withSchema = (url: string | undefined) => {
  if (!url) throw new Error("DATABASE_URL is not set. The tests need the project .env.");
  const clean = url.replace(/([?&])schema=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return clean + (clean.includes("?") ? "&" : "?") + "schema=" + TEST_SCHEMA;
};
process.env.DATABASE_URL = withSchema(process.env.DATABASE_URL);
process.env.DIRECT_URL = withSchema(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

if (!process.env.DATABASE_URL.includes(`schema=${TEST_SCHEMA}`) || TEST_SCHEMA === "public") {
  throw new Error("Refusing to run: the tests must use the isolated test schema, never public.");
}
