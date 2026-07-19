// Also copies the agent install script, which is served verbatim at runtime.
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(backendRoot, "src", "database", "migrations");
const outputDirectory = path.join(backendRoot, "dist", "database", "migrations");
const migrations = (await readdir(sourceDirectory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();

if (migrations.length === 0) throw new Error("No SQL migrations were found to package");
await mkdir(outputDirectory, { recursive: true });
await Promise.all(migrations.map((file) => copyFile(path.join(sourceDirectory, file), path.join(outputDirectory, file))));
console.log(`Packaged ${migrations.length} database migrations`);

import { cp as _cp, mkdir as _mkdir } from "node:fs/promises";
import { fileURLToPath as _f } from "node:url";
const _src = _f(new URL("../src/agent", import.meta.url));
const _dst = _f(new URL("../dist/agent", import.meta.url));
await _mkdir(_dst, { recursive: true });
await _cp(_src, _dst, { recursive: true });
console.log("Packaged agent install script");
