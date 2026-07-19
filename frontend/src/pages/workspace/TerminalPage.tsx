import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, PlugZap, ShieldAlert, TerminalSquare, Unplug } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, PageHeader, Panel, primaryButtonClass } from "./_shared";

/**
 * A real SSH shell.
 *
 * This page used to be a hardcoded map of command strings that never touched a
 * server. It now opens a PTY over a WebSocket, so interactive programs,
 * editors, colours, and resizing all behave as they do in a native terminal,
 * and every session is recorded server-side.
 */

interface ServerOption { id: string; name: string; host: string; username: string; adapterMode: string; }
interface SessionRow {
  id: string; serverName: string; status: string; startedAt: string; endedAt?: string;
  userName?: string; errorMessage?: string;
}

type Phase = "idle" | "connecting" | "connected" | "closed" | "error";

export function TerminalPage() {
  const [searchParams] = useSearchParams();
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState(searchParams.get("server") ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>();
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const holderRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const loadSessions = useCallback(async () => {
    try { setSessions(await api.get<SessionRow[]>("/terminal/sessions")); }
    catch { /* history is incidental to using the terminal */ }
  }, []);

  useEffect(() => {
    api.get<ServerOption[]>("/servers?limit=100")
      .then((rows) => {
        setServers(rows);
        setServerId((current) => current || rows.find((row) => row.adapterMode === "sftp")?.id || rows[0]?.id || "");
      })
      .catch(() => undefined);
    void loadSessions();
  }, [loadSessions]);

  // Created once and reused, because tearing the terminal down between
  // connections would discard scrollback the user may still want.
  useEffect(() => {
    if (!holderRef.current || termRef.current) return;
    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      cursorBlink: true,
      convertEol: true,
      theme: { background: "#08090d", foreground: "#d4d4d8", cursor: "#4ade80", selectionBackground: "#27272a" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holderRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    const onResize = () => {
      fit.fit();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }));
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      socketRef.current?.close();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  async function connect() {
    const term = termRef.current;
    if (!term || !serverId) return;
    setPhase("connecting");
    setMessage(undefined);
    term.clear();
    term.writeln("[90mRequesting a session…[0m");

    let ticket: string;
    try {
      ({ ticket } = await api.post<{ ticket: string }>("/terminal/tickets", { serverId }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not start a session";
      setPhase("error");
      setMessage(reason);
      term.writeln(`[31m${reason}[0m`);
      return;
    }

    fitRef.current?.fit();
    // Same origin and port as the API, so the dev proxy and any production
    // reverse proxy carry it without extra configuration.
    const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/^http/, "ws")
      ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1`;
    const socket = new WebSocket(`${base}/terminal/ws?ticket=${encodeURIComponent(ticket)}&rows=${term.rows}&cols=${term.cols}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as { type: string; data?: string; message?: string; command?: string; reason?: string };
      if (payload.type === "output" && payload.data) { term.write(payload.data); return; }
      if (payload.type === "ready") { setPhase("connected"); term.focus(); return; }
      if (payload.type === "status") {
        term.writeln(`[90m${payload.message ?? ""}[0m`);
        return;
      }
      if (payload.type === "blocked") {
        // Written into the stream so the refusal appears exactly where the
        // command was typed, not in a toast that is easy to miss.
        term.writeln(`\r\n[33m⚠ Refused: ${payload.reason}. This command was not sent.[0m`);
        toast.warning("Command refused", { description: `${payload.reason}: ${payload.command}` });
        return;
      }
      if (payload.type === "error") {
        setPhase("error");
        setMessage(payload.message);
        term.writeln(`\r\n[31m${payload.message ?? "Terminal error"}[0m`);
      }
    };

    socket.onclose = () => {
      setPhase((current) => (current === "error" ? current : "closed"));
      term.writeln("\r\n[90mSession ended.[0m");
      void loadSessions();
    };
    socket.onerror = () => {
      setPhase("error");
      setMessage("The terminal connection failed");
    };
  }

  function disconnect() {
    socketRef.current?.close();
    setPhase("closed");
  }

  const server = servers.find((item) => item.id === serverId);
  const busy = phase === "connecting";
  const live = phase === "connected";

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Remote access"
      title="Web terminal"
      description="An audited SSH shell. Every session is recorded and attributed."
      actions={<>
        <select value={serverId} onChange={(event) => { setServerId(event.target.value); disconnect(); }} className={controlClass} disabled={live || busy}>
          {servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button className={live ? buttonClass : primaryButtonClass} disabled={busy || !serverId} onClick={() => (live ? disconnect() : void connect())}>
          {live ? <><Unplug className="size-3.5" />Disconnect</> : <><PlugZap className="size-3.5" />{busy ? "Connecting…" : "Connect"}</>}
        </button>
      </>}
    />

    <div className="grid min-h-[560px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#08090d] shadow-2xl shadow-black/30 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="flex min-w-0 flex-col">
        <header className="flex h-11 items-center justify-between border-b border-white/[0.07] bg-[#101218] px-3">
          <div className="flex items-center gap-2">
            <span className="flex gap-1.5">
              <i className="size-2.5 rounded-full bg-rose-400/70" />
              <i className="size-2.5 rounded-full bg-amber-400/70" />
              <i className="size-2.5 rounded-full bg-emerald-400/70" />
            </span>
            <span className="ml-2 font-mono text-[10px] text-zinc-500">
              {server ? `${server.username}@${server.host}` : "no server selected"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] ${live ? "text-emerald-300" : phase === "error" ? "text-rose-300" : "text-zinc-500"}`}>
              <Circle className={`size-1.5 fill-current ${busy ? "animate-pulse" : ""}`} />
              {live ? "Connected" : busy ? "Connecting" : phase === "error" ? "Failed" : "Disconnected"}
            </span>
          </div>
        </header>
        <div ref={holderRef} className="min-h-0 flex-1 p-2" />
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <TerminalSquare className="mx-auto size-8 text-zinc-700" />
              <p className="mt-3 text-[10px] text-zinc-500">Select a server and connect</p>
            </div>
          </div>
        )}
      </section>

      <aside className="border-t border-white/[0.07] bg-[#0d0f14] p-4 lg:border-l lg:border-t-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Session</p>
        <div className="mt-3 space-y-3 text-[10px]">
          <div><p className="text-zinc-600">Server</p><p className="mt-1 text-zinc-300">{server?.name ?? "—"}</p></div>
          <div><p className="text-zinc-600">Identity</p><p className="mt-1 break-all font-mono text-zinc-300">{server ? `${server.username}@${server.host}` : "—"}</p></div>
          <div>
            <p className="text-zinc-600">Recording</p>
            <p className={`mt-1 inline-flex items-center gap-1.5 ${live ? "text-emerald-300" : "text-zinc-500"}`}>
              <Circle className="size-2 fill-current" />{live ? "Recording this session" : "Inactive"}
            </p>
          </div>
        </div>

        {message && (
          <p className="mt-4 rounded-md border border-rose-400/15 bg-rose-400/[0.04] p-2.5 text-[9px] leading-4 text-rose-200/90">{message}</p>
        )}

        <div className="my-5 border-t border-white/[0.07]" />
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-3.5 text-zinc-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Recent sessions</p>
        </div>
        <div className="mt-2 space-y-1">
          {sessions.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-500">
              <p className="truncate text-zinc-400">{item.serverName}</p>
              <p className="mt-0.5 text-zinc-600">{item.userName ?? "Unknown"} · {relativeTime(item.startedAt)} · {item.status}</p>
            </div>
          ))}
          {sessions.length === 0 && <p className="px-2 py-1.5 text-[9px] text-zinc-700">No sessions yet</p>}
        </div>
      </aside>
    </div>

    <Panel title="How this works" description="What happens when you connect">
      <ul className="space-y-2 text-[10px] leading-5 text-zinc-500">
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />A real PTY over SSH, so editors, colours, and resizing behave as they do locally.</li>
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />Input and output are recorded with timing and attributed to your account.</li>
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />A short list of unambiguously destructive commands is refused before it reaches the shell.</li>
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />Sessions close after 30 minutes idle, and after four hours regardless.</li>
      </ul>
    </Panel>
  </div>;
}

export default TerminalPage;
