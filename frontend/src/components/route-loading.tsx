import { LoaderCircle } from "lucide-react";

export function RouteLoading() {
  return <div className="grid min-h-[50vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-4 animate-spin text-zinc-500" /><p className="mt-3 text-[9px] text-zinc-700">Loading workspace…</p></div></div>;
}
