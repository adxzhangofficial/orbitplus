// Creates the integration-test database alongside the development one, named
// by appending _test so it satisfies the guard in src/tests/api.test.ts.
//
//   npm run db:create-test -w backend
//
// Prints only the database name. The connection string is never logged because
// it carries the password.
import "dotenv/config";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.");
  process.exit(1);
}

const source = new URL(databaseUrl);
const developmentName = decodeURIComponent(source.pathname.replace(/^\//, ""));
const testName = `${developmentName}_test`;

const administrative = new URL(source.toString());
administrative.pathname = "/postgres";

const client = new pg.Client({ connectionString: administrative.toString() });
await client.connect();
try {
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [testName]);
  if (exists.rowCount) {
    console.log(`Test database "${testName}" already exists.`);
  } else {
    // CREATE DATABASE cannot be parameterised; the name is derived from the
    // configured database rather than from user input.
    await client.query(`CREATE DATABASE "${testName}"`);
    console.log(`Created test database "${testName}".`);
  }
} finally {
  await client.end();
}

const target = new URL(source.toString());
target.pathname = `/${testName}`;
console.log("\nSet this before running tests (the value contains your password):");
console.log(`  PowerShell:  $env:TEST_DATABASE_URL = (node -e "...")`);
console.log(`  or copy from backend/.env and change the database name to: ${testName}`);
