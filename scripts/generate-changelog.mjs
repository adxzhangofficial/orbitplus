// Builds the public changelog from real commit history.
//
// The page it replaces listed invented releases with invented dates. Deriving
// it from git means it cannot drift from what actually shipped, and nobody has
// to remember to update it.
//
//   node scripts/generate-changelog.mjs
//
// Run before a production build; the output is committed so the frontend does
// not need git at build time.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEPARATOR = "";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) });
}

const raw = git([
  "log",
  `--format=%H${SEPARATOR}%aI${SEPARATOR}%s${SEPARATOR}%b${SEPARATOR}`,
  "--no-merges",
]);

// Commits whose only effect is on the repository rather than the product.
const INTERNAL = /^(chore|ci|test|docs|style|refactor)(\(|:)/i;

const entries = raw
  .split(`${SEPARATOR}\n`)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const [hash, date, subject, body = ""] = block.split(SEPARATOR);
    return { hash: hash?.slice(0, 7), date, subject: subject?.trim(), body: body.trim() };
  })
  .filter((entry) => entry.hash && entry.subject && !INTERNAL.test(entry.subject))
  .map((entry) => ({
    hash: entry.hash,
    date: entry.date,
    title: entry.subject,
    // The first paragraph of the body explains why the change was made, which
    // is the part a reader actually wants. Later paragraphs are implementation
    // detail that belongs in the commit, not on a public page.
    summary: entry.body.split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "",
  }));

const output = fileURLToPath(new URL("../frontend/src/lib/changelog.json", import.meta.url));
writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)}\n`);
console.log(`Wrote ${entries.length} changelog entries to frontend/src/lib/changelog.json`);
