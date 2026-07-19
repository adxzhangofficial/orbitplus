import { Orbit } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, admin = false, to = "/" }: { compact?: boolean; admin?: boolean; to?: string }) {
  return (
    <Link to={to} className="inline-flex h-9 items-center gap-2.5" aria-label="Orbit home">
      <span className={cn("grid size-7 place-items-center rounded-md border", admin ? "border-[#d8ff4f]/30 bg-[#d8ff4f] text-black" : "border-border bg-foreground text-background")}>
        <Orbit className="size-4" strokeWidth={2.2} />
      </span>
      {!compact && <span className="font-heading text-base font-semibold tracking-tight">Orbit<span className={admin ? "text-[#d8ff4f]" : "text-blue-400"}>+</span></span>}
    </Link>
  );
}
