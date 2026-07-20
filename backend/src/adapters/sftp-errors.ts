import { AppError } from "../lib/errors.js";

/**
 * Turns a remote filesystem failure into the status it actually is.
 *
 * Every SFTP error arrived as a 500 INTERNAL_ERROR, so asking for a path that
 * does not exist was reported as the server being broken. That is wrong in
 * three ways: it is a client mistake rather than a fault, it fills error
 * tracking with things nobody can fix, and any retry policy will keep retrying
 * a request that can never succeed.
 *
 * Matched on the SFTP status code where the library provides one, falling back
 * to the message text. The codes are from RFC 4253's SSH_FX_* set, which is
 * what sshd sends; the text fallback covers clients that surface only a string.
 */

const SSH_FX_NO_SUCH_FILE = 2;
const SSH_FX_PERMISSION_DENIED = 3;
const SSH_FX_FAILURE = 4;

export function translateSftpError(error: unknown, action: string): AppError {
  if (error instanceof AppError) return error;

  const raw = error as { code?: number | string; message?: string } | undefined;
  const message = raw?.message ?? String(error);
  const code = raw?.code;
  const text = message.toLowerCase();

  if (code === SSH_FX_NO_SUCH_FILE || code === "ENOENT" || text.includes("no such file")) {
    return new AppError(404, "REMOTE_PATH_NOT_FOUND", `${action}: no such file or directory`);
  }
  if (code === SSH_FX_PERMISSION_DENIED || code === "EACCES" || text.includes("permission denied")) {
    // The credential is valid; this path is not readable by that account.
    return new AppError(403, "REMOTE_PERMISSION_DENIED", `${action}: permission denied by the remote host`);
  }
  if (code === "EEXIST" || text.includes("file already exists")) {
    return new AppError(409, "REMOTE_PATH_EXISTS", `${action}: that path already exists`);
  }
  if (text.includes("not a directory")) {
    return new AppError(400, "REMOTE_NOT_A_DIRECTORY", `${action}: that path is not a directory`);
  }
  if (text.includes("directory not empty")) {
    return new AppError(409, "REMOTE_DIRECTORY_NOT_EMPTY", `${action}: the directory is not empty — use recursive`);
  }
  // SSH_FX_FAILURE is the catch-all sshd sends for "the operation failed", most
  // often a directory that is not empty or a filesystem that is read-only.
  if (code === SSH_FX_FAILURE) {
    return new AppError(400, "REMOTE_OPERATION_REFUSED", `${action}: the remote host refused the operation`);
  }

  // Anything unrecognised stays a fault, because it might be one.
  return new AppError(502, "SFTP_OPERATION_FAILED", `${action}: ${message}`);
}
