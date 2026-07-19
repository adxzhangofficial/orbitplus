import { ArrowLeft, Search, Server } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";

export function NotFoundPage() {
  return <section className="marketing-glow surface-grid grid min-h-[70vh] place-items-center px-4 py-20 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-zinc-400"><Server className="size-5" /></span><p className="mt-7 font-mono text-[9px] text-blue-400">HTTP 404 · PATH_NOT_FOUND</p><h1 className="mt-3 text-5xl font-semibold">This path left orbit.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-zinc-500">The page may have moved, the link may be incomplete, or this resource is outside your allowed root.</p><div className="mt-7 flex justify-center gap-2"><Link to="/"><Button><ArrowLeft />Back home</Button></Link><Link to="/docs"><Button variant="outline"><Search />Search docs</Button></Link></div></div></section>;
}

export default NotFoundPage;
