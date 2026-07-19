import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/types";

interface AuthContextValue {
  user?: User;
  loading: boolean;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; organizationName: string }) => Promise<User>;
  signOut: () => Promise<void>;
  updateUser: (changes: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = "orbit.sessionUser";

/**
 * A session exists only when a real access token does.
 *
 * There was previously a demo mode that was unconditionally enabled in
 * development and could place a fabricated user in local storage with no token.
 * That produced a signed-in-looking workspace whose every write failed with
 * "demo preview sessions cannot reach or store server credentials", including
 * for people who had genuinely just registered.
 */
function storedUser(): User | undefined {
  if (!localStorage.getItem("orbit.accessToken")) return undefined;
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as User : undefined;
  } catch {
    return undefined;
  }
}

function clearStoredSession() {
  api.setAccessToken();
  localStorage.removeItem("orbit.organizationId");
  localStorage.removeItem(SESSION_KEY);
  // Left behind by the removed demo mode; cleared so an old browser does not
  // resurrect a fabricated session after upgrading.
  localStorage.removeItem("orbit.demoUser");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | undefined>(() => storedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!localStorage.getItem("orbit.accessToken")) {
      clearStoredSession();
      setUser(undefined);
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
        clearStoredSession();
        setUser(undefined);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login(email, password);
    api.setAccessToken(result.accessToken);
    localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string; organizationName: string }) => {
    const result = await api.auth.register(input);
    api.setAccessToken(result.accessToken);
    localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.logout();
    clearStoredSession();
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
    signIn,
    register,
    signOut,
    updateUser,
  }), [user, loading, signIn, register, signOut, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
