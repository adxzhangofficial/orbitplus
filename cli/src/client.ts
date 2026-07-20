import type { Profile } from "./config.js";

/**
 * The HTTP client.
 *
 * Errors carry the API's own message where there is one. A CLI that prints
 * "Request failed with status 403" when the server said "This API key does not
 * carry the files:write scope" has thrown away the only useful part of the
 * response.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: {
    message?: string;
    code?: string;
    /** Field-level reasons on a validation failure. */
    details?: Array<{ path?: string; message?: string }>;
  };
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Overrides the default timeout for calls known to be slow. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class OrbitClient {
  constructor(private readonly profile: Profile) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
    const url = new URL(`${this.profile.apiUrl.replace(/\/$/, "")}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    // Without a timeout a hung connection leaves the CLI waiting forever with
    // no output, which is indistinguishable from it having crashed.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          authorization: `Bearer ${this.profile.apiKey}`,
          accept: "application/json",
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError(0, `No response from ${url.host} within ${(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000} seconds`);
      }
      throw new ApiError(0, `Could not reach ${url.host}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return { data: undefined as T };

    const text = await response.text();
    let envelope: Envelope<T> | undefined;
    try { envelope = text ? (JSON.parse(text) as Envelope<T>) : undefined; } catch { /* handled below */ }

    if (!response.ok) {
      // A proxy or a wrong base URL returns HTML, and echoing a page of it into
      // the terminal helps nobody.
      let message = envelope?.error?.message
        ?? (text.trimStart().startsWith("<")
          ? `${url.host} returned an HTML page, not the Orbit API — check the API URL`
          : text.slice(0, 300) || response.statusText);

      // "Request validation failed" alone gives the user nothing to act on.
      // The API says which field and why, so that is what gets shown.
      const details = envelope?.error?.details;
      if (details?.length) {
        message += `: ${details
          .map((issue) => (issue.path ? `${issue.path} — ${issue.message}` : issue.message))
          .join("; ")}`;
      }
      throw new ApiError(response.status, message, envelope?.error?.code);
    }

    if (!envelope || !("data" in envelope)) {
      throw new ApiError(response.status, `Unexpected response from ${url.host}`);
    }
    return { data: envelope.data, meta: envelope.meta };
  }

  get<T>(path: string, query?: RequestOptions["query"]): Promise<{ data: T; meta?: Record<string, unknown> }> {
    return this.request<T>(path, { query });
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
    return this.request<T>(path, { ...options, method: "POST", body: body ?? {} });
  }

  patch<T>(path: string, body: unknown): Promise<{ data: T; meta?: Record<string, unknown> }> {
    return this.request<T>(path, { method: "PATCH", body });
  }

  delete<T>(path: string): Promise<{ data: T; meta?: Record<string, unknown> }> {
    return this.request<T>(path, { method: "DELETE" });
  }
}
