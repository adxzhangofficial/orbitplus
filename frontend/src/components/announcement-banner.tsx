import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { api } from "@/lib/api";

/**
 * The customer end of announcements.
 *
 * Shows the newest published message the workspace qualifies for, once. The
 * view is recorded when it is actually rendered rather than when the list is
 * fetched, so "unique views" counts people who saw the message, not people
 * whose browser asked whether there was one.
 *
 * A dismissal is stored server-side, not in local storage: the same person on
 * a second machine should not be shown a notice they already closed.
 */

interface Announcement {
  id: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionUrl: string | null;
  publishedAt: string;
  viewedAt: string | null;
  dismissedAt: string | null;
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement>();

  useEffect(() => {
    let current = true;
    api.get<Announcement[]>("/announcements")
      .then((rows) => {
        const next = rows.find((row) => !row.dismissedAt);
        if (!current || !next) return;
        setAnnouncement(next);
        // Recorded at most once per person by the primary key on the receipt,
        // so this is safe to call on every mount.
        void api.post(`/announcements/${next.id}/view`, {}).catch(() => undefined);
      })
      // A failure here must not interrupt the workspace: an announcement is
      // the least important thing on the page.
      .catch(() => undefined);
    return () => { current = false; };
  }, []);

  if (!announcement) return null;

  function dismiss() {
    setAnnouncement(undefined);
    void api.post(`/announcements/${announcement!.id}/dismiss`, {}).catch(() => undefined);
  }

  return (
    <div className="mx-auto flex max-w-[1500px] items-start gap-3 px-4 pt-5 sm:px-6 md:px-8">
      <div className="flex w-full items-start gap-3 rounded-lg border border-sky-400/15 bg-sky-400/[0.04] p-3">
        <Megaphone className="mt-0.5 size-3.5 shrink-0 text-sky-300/80" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-zinc-200">{announcement.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-zinc-400">{announcement.body}</p>
          {announcement.actionLabel && announcement.actionUrl && (
            <a
              href={announcement.actionUrl}
              target="_blank"
              // The link is operator-authored and leaves the app, so the opened
              // page gets no handle back to this one.
              rel="noreferrer noopener"
              className="mt-2 inline-block text-[10px] font-medium text-sky-300 hover:underline"
              onClick={() => void api.post(`/announcements/${announcement.id}/click`, {}).catch(() => undefined)}
            >
              {announcement.actionLabel}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="rounded p-1 text-zinc-600 transition-colors hover:text-zinc-300"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
