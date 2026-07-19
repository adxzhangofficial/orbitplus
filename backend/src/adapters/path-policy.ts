import path from "node:path";
import { badRequest } from "../lib/errors.js";

export function normalizeRemotePath(input: string): string {
  if (input.includes("\0") || input.includes("\\")) throw badRequest("Invalid remote path");
  const normalized = path.posix.normalize(`/${input}`).replace(/\/{2,}/g, "/");
  if (normalized === "/.." || normalized.startsWith("/../")) throw badRequest("Path escapes the server root");
  return normalized;
}

export function joinRemoteRoot(root: string, input: string): string {
  const safeRoot = normalizeRemotePath(root);
  const safeInput = normalizeRemotePath(input);
  return safeRoot === "/" ? safeInput : path.posix.join(safeRoot, safeInput.slice(1));
}
