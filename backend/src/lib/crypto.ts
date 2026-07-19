import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

const key = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "hex");

function encrypt(value: Buffer, associatedData?: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (associatedData) cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decrypt(value: string, associatedData: Buffer | undefined, code: string, label: string): Buffer {
  const [version, ivText, tagText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || ciphertextText === undefined) {
    throw new AppError(500, code, `Stored ${label} are invalid`);
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    if (associatedData) decipher.setAAD(associatedData);
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]);
  } catch {
    throw new AppError(500, code, `Stored ${label} could not be decrypted`);
  }
}

export function encryptJson(value: unknown): string {
  return encrypt(Buffer.from(JSON.stringify(value), "utf8"));
}

export function decryptJson<T>(value: string): T {
  try {
    const plaintext = decrypt(value, undefined, "CREDENTIAL_DECRYPTION_FAILED", "server credentials");
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, "CREDENTIAL_DECRYPTION_FAILED", "Stored server credentials could not be decrypted");
  }
}

/** Encrypts an opaque file-version payload and authenticates its immutable metadata. */
export function encryptBytes(value: Buffer, associatedData: string): string {
  return encrypt(value, Buffer.from(associatedData, "utf8"));
}

/** Decrypts a file version; authentication fails if either bytes or metadata changed. */
export function decryptBytes(value: string, associatedData: string): Buffer {
  return decrypt(value, Buffer.from(associatedData, "utf8"), "FILE_VERSION_DECRYPTION_FAILED", "file version contents");
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Authenticates database rows whose integrity is no longer covered by an
 * encryption AAD. Content-addressed blobs are shared across paths, so the
 * association between a version row and its path is signed here instead.
 */
export function hmac(value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function hmacMatches(value: string, expected: string | null | undefined): boolean {
  if (!expected) return false;
  const actual = Buffer.from(hmac(value), "hex");
  const candidate = Buffer.from(expected, "hex");
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}
