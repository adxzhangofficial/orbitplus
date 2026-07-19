import { useMemo, useState } from "react";
import { GitCommit, Search } from "lucide-react";
import { Input } from "@/components/ui";
import { MarketingCTA } from "@/components/marketing";
import changelog from "@/lib/changelog.json";

/**
 * Public changelog.
 *
 * This page previously listed invented releases with invented dates and
 * feature names for work that did not exist. It is now generated from real
 * commit history by scripts/generate-changelog.mjs, so it cannot claim
 * something shipped that did not, and nobody has to remember to update it.
 */

interface Entry {
  hash: string;
  date: string;
  title: string;
  summary: string;
}

const entries = (changelog.entries ?? []) as Entry[];

function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function ChangelogPage() {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const matched = entries.filter((entry) =>
      `${entry.title} ${entry.summary}`.toLowerCase().includes(query.toLowerCase()),
    );
    // Grouped by month rather than by an invented version number. Nothing here
    // is released under a version yet, and inventing one would be the same
    // problem in a different form.
    const months = new Map<string, Entry[]>();
    for (const entry of matched) {
      const key = monthOf(entry.date);
      months.set(key, [...(months.get(key) ?? []), entry]);
    }
    return [...months.entries()];
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Changelog</p>
        <h1 className="mt-3 font-heading text-3xl tracking-tight text-foreground">What has shipped</h1>
        <p className="mt-3 max-w-2xl text-[11px] leading-5 text-muted-foreground">
          Generated from the commit history, so every entry corresponds to a change that is actually
          in the product.
        </p>
      </header>

      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search changes"
          className="w-full pl-9"
        />
      </div>

      {grouped.length === 0 ? (
        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          {entries.length === 0 ? "No entries have been generated yet." : "No changes match that search."}
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {grouped.map(([month, monthEntries]) => (
            <section key={month}>
              <h2 className="text-xs font-medium text-foreground">{month}</h2>
              <ol className="mt-4 space-y-4 border-l border-border pl-5">
                {monthEntries.map((entry) => (
                  <li key={entry.hash} className="relative">
                    <span className="absolute -left-[23px] top-1.5 grid size-3 place-items-center rounded-full border border-border bg-background">
                      <GitCommit className="size-2 text-muted-foreground" />
                    </span>
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-xs text-foreground">{entry.title}</h3>
                      <time className="shrink-0 font-mono text-[9px] text-muted-foreground" dateTime={entry.date}>
                        {new Date(entry.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      </time>
                    </div>
                    {entry.summary && (
                      <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{entry.summary}</p>
                    )}
                    <code className="mt-1.5 block font-mono text-[9px] text-muted-foreground/70">{entry.hash}</code>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div className="mt-16">
        <MarketingCTA />
      </div>
    </div>
  );
}

export default ChangelogPage;
