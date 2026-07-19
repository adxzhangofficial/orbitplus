import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { demoAdmin, demoCustomer } from "@/lib/mock-data";
import type { User } from "@/types";

interface AuthContextValue {
  user?: User;
  loading: boolean;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  demoEnabled: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; organizationName: string }) => Promise<User>;
  signOut: () => Promise<void>;
  enterDemo: (kind?: "customer" | "admin") => void;
  updateUser: (changes: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = "orbit.sessionUser";
const LEGACY_DEMO_KEY = "orbit.demoUser";
const DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";

function storedUser(): User | undefined {
  if (!localStorage.getItem("orbit.accessToken") && !DEMO_ENABLED) return undefined;
  try {
    const value = localStorage.getItem(SESSION_KEY) ?? (DEMO_ENABLED ? localStorage.getItem(LEGACY_DEMO_KEY) : null);
    return value ? JSON.parse(value) as User : undefined;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | undefined>(() => storedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!localStorage.getItem("orbit.accessToken")) {
      setLoading(false);
      return;
    }
    api.auth.me()
      .then((current) => {
        if (!active) return;
        setUser(current);
        localStorage.setItem(SESSION_KEY, JSON.stringify(current));
      })
      .catch(() => {
        if (!active) return;
        api.setAccessToken();
        localStorage.removeItem("orbit.organizationId");
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_DEMO_KEY);
        setUser(undefined);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const enterDemo = useCallback((kind: "customer" | "admin" = "customer") => {
    if (!DEMO_ENABLED) return;
    const next = kind === "admin" ? demoAdmin : demoCustomer;
    setUser(next);
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await api.auth.login(email, password);
      api.setAccessToken(result.accessToken);
      setUser(result.user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
      return result.user;
    } catch (error) {
      if (DEMO_ENABLED) {
        const next = email.toLowerCase().includes("admin") ? demoAdmin : demoCustomer;
        setUser(next);
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
      }
      throw error;
    }
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string; organizationName: string }) => {
    try {
      const result = await api.auth.register(input);
      api.setAccessToken(result.accessToken);
      setUser(result.user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
      return result.user;
    } catch (error) {
      if (DEMO_ENABLED) {
        const next = { ...demoCustomer, name: input.name, email: input.email, organizationName: input.organizationName };
        setUser(next);
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
      }
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_DEMO_KEY);
    localStorage.removeItem("orbit.organizationId");
    setUser(undefined);
  }, []);

  const updateUser = useCallback((changes: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...changes };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    isPlatformAdmin: user?.role === "platform_admin",
    demoEnabled: DEMO_ENABLED,
    signIn,
    register,
    signOut,
    enterDemo,
    updateUser,
  }), [user, loading, signIn, register, signOut, enterDemo, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
