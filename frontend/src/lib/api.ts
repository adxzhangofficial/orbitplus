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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const organizationId = localStorage.getItem("orbit.organizationId");
  if (organizationId) headers.set("x-organization-id", organizationId);
  headers.set("x-orbit-client", "web/1.0");
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "The Orbit API is unreachable", 0, "NETWORK_ERROR");
  }
  if (response.status === 401) setAccessToken();
  return parseResponse<T>(response);
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "POST", body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "PUT", body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
  setAccessToken,
  auth: {
    login: async (email: string, password: string) => normalizeAuth(await request<BackendAuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } })),
    register: async (input: { name: string; email: string; password: string; organizationName: string }) => normalizeAuth(await request<BackendAuthPayload>("/auth/register", { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json" } })),
    me: async () => normalizeAuth(await request<BackendAuthPayload>("/auth/me")).user,
    logout: () => request<void>("/auth/logout", { method: "POST" }).finally(() => setAccessToken()),
  },
};

interface BackendOrganization {
  id: string;
  name: string;
  plan?: string;
  role?: string;
}

interface BackendAuthPayload {
  token?: string;
  accessToken?: string;
  user: {
    id: string;
    name: string;
    email: string;
    platformRole?: string;
    platform_role?: string;
  };
  organizations?: BackendOrganization[];
}

function normalizeAuth(payload: BackendAuthPayload): { accessToken: string; user: User } {
  const organization = payload.organizations?.[0];
  const platformRole = payload.user.platformRole ?? payload.user.platform_role;
  if (organization?.id) localStorage.setItem("orbit.organizationId", organization.id);
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
