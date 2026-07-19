import type { User } from "@/types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

function getAccessToken() {
  return localStorage.getItem("orbit.accessToken");
}

function setAccessToken(token?: string) {
  if (token) localStorage.setItem("orbit.accessToken", token);
  else localStorage.removeItem("orbit.accessToken");
}

function getRefreshToken() {
  return localStorage.getItem("orbit.refreshToken");
}

function setRefreshToken(token?: string) {
  if (token) localStorage.setItem("orbit.refreshToken", token);
  else localStorage.removeItem("orbit.refreshToken");
}

function clearSession() {
  setAccessToken();
  setRefreshToken();
  localStorage.removeItem("orbit.organizationId");
}

/**
 * Shared across concurrent callers on purpose. Each rotation invalidates the
 * previous refresh token, so several parallel refreshes would replay a retired
 * token and trip the server's reuse detection, revoking the whole session.
 */
let refreshInFlight: Promise<string | undefined> | undefined;

async function refreshAccessToken(): Promise<string | undefined> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return undefined;
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        clearSession();
        return undefined;
      }
      const payload = await response.json() as ApiEnvelope<{ token: string; refreshToken: string }>;
      setAccessToken(payload.data.token);
      setRefreshToken(payload.data.refreshToken);
      return payload.data.token;
    } catch {
      return undefined;
    } finally {
      refreshInFlight = undefined;
    }
  })();
  return refreshInFlight;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const payload = typeof body === "object" && body ? body as Record<string, unknown> : {};
    const nested = typeof payload.error === "object" && payload.error ? payload.error as Record<string, unknown> : payload;
    throw new ApiError(
      String(nested.message ?? `Request failed with status ${response.status}`),
      response.status,
      nested.code ? String(nested.code) : undefined,
      nested.details,
    );
  }
  if (typeof body === "object" && body && "data" in body) return (body as ApiEnvelope<T>).data;
  return body as T;
}

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const organizationId = localStorage.getItem("orbit.organizationId");
  if (organizationId) headers.set("x-organization-id", organizationId);
  headers.set("x-orbit-client", "web/1.0");
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "The Orbit API is unreachable", 0, "NETWORK_ERROR");
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init, getAccessToken());

  // Access tokens are short-lived, so a 401 is usually just expiry. Retry once
  // behind a refresh. Auth endpoints are excluded to avoid recursion.
  if (response.status === 401 && !path.startsWith("/auth/refresh") && !path.startsWith("/auth/login")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send(path, init, refreshed);
    else clearSession();
  }
  return parseResponse<T>(response);
}

/**
 * Returns the whole envelope rather than just `data`.
 *
 * Some endpoints carry information alongside the payload that the caller needs,
 * such as directory listings prefetched in the same round trip. Unwrapping to
 * `data` would discard it.
 */
async function requestEnvelope<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  let response = await send(path, init, getAccessToken());
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send(path, init, refreshed);
    else clearSession();
  }
  if (response.status === 204) return { data: undefined as T };
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = body as Record<string, unknown>;
    const nested = typeof payload.error === "object" && payload.error ? payload.error as Record<string, unknown> : payload;
    throw new ApiError(
      String(nested.message ?? `Request failed with status ${response.status}`),
      response.status,
      nested.code ? String(nested.code) : undefined,
      nested.details,
    );
  }
  return body as ApiEnvelope<T>;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  getEnvelope: <T>(path: string, init?: RequestInit) => requestEnvelope<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "POST", body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "PUT", body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
  /**
   * Multipart upload. The content-type header is deliberately not set: the
   * browser has to generate it so it carries the multipart boundary.
   */
  upload: <T>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),

  /**
   * Streams a file to disk. This goes through fetch rather than a plain anchor
   * because the endpoint needs the Authorization and organization headers,
   * which a browser navigation cannot carry.
   */
  download: async (path: string, filename: string): Promise<void> => {
    let response = await send(path, { method: "GET" }, getAccessToken());
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) response = await send(path, { method: "GET" }, refreshed);
    }
    if (!response.ok) {
      await parseResponse<unknown>(response);
      throw new ApiError(`Download failed with status ${response.status}`, response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on the next tick so the click has already been handled.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
  setAccessToken,
  clearSession,
  auth: {
    login: async (email: string, password: string) => normalizeAuth(await request<BackendAuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } })),
    register: async (input: { name: string; email: string; password: string; organizationName: string }) => normalizeAuth(await request<BackendAuthPayload>("/auth/register", { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json" } })),
    me: async () => normalizeAuth(await request<BackendAuthPayload>("/auth/me")).user,
    logout: () =>
      request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: getRefreshToken() }), headers: { "content-type": "application/json" } })
        .catch(() => undefined)
        .finally(clearSession),

    forgotPassword: (email: string) =>
      request<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }), headers: { "content-type": "application/json" } }),
    resetPassword: (token: string, password: string) =>
      request<{ message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }), headers: { "content-type": "application/json" } }),
    verifyEmail: (token: string) =>
      request<{ message: string; emailVerified: boolean }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }), headers: { "content-type": "application/json" } }),
    resendVerification: () => request<{ message: string }>("/auth/resend-verification", { method: "POST" }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ message: string }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, refreshToken: getRefreshToken() }), headers: { "content-type": "application/json" } }),

    sessions: () => request<SessionSummary[]>("/auth/sessions"),
    revokeSession: (id: string) => request<void>(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
};

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

interface BackendOrganization {
  id: string;
  name: string;
  plan?: string;
  role?: string;
}

interface BackendAuthPayload {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  user: {
    id: string;
    name: string;
    email: string;
    platformRole?: string;
    platform_role?: string;
    emailVerified?: boolean;
  };
  organizations?: BackendOrganization[];
}

function normalizeAuth(payload: BackendAuthPayload): { accessToken: string; user: User } {
  const organization = payload.organizations?.[0];
  const platformRole = payload.user.platformRole ?? payload.user.platform_role;
  if (organization?.id) localStorage.setItem("orbit.organizationId", organization.id);
  // /auth/me does not reissue a refresh token, so only persist when present.
  if (payload.refreshToken) setRefreshToken(payload.refreshToken);
  const planName = organization?.plan ? `${organization.plan[0]?.toUpperCase()}${organization.plan.slice(1)}` : "Free";
  return {
    accessToken: payload.token ?? payload.accessToken ?? getAccessToken() ?? "",
    user: {
      id: payload.user.id,
      name: payload.user.name,
      email: payload.user.email,
      role: platformRole === "admin" ? "platform_admin" : (organization?.role as User["role"] | undefined) ?? "viewer",
      organizationId: organization?.id ?? "platform",
      organizationName: organization?.name ?? "Orbit Platform",
      plan: (["Free", "Pro", "Enterprise"].includes(planName) ? planName : "Free") as User["plan"],
    },
  };
}
