import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RouteLoading } from "@/components/route-loading";
import { useAuth } from "@/contexts/auth-context";

/**
 * Access is decided solely by whether a real session exists.
 *
 * These guards previously called enterDemo() when no session was present, so
 * visiting the workspace silently fabricated a signed-in user. Every write then
 * failed against the real API while the interface looked authenticated, which
 * is what produced "demo preview sessions cannot reach or store server
 * credentials" for people who had genuinely registered.
 */

export function RequireWorkspaceAccess() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <RouteLoading />;
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (user.role === "platform_admin") return <Navigate to="/admin" replace />;
  return <Outlet />;
}

export function RequirePlatformAdmin() {
  const { user, loading, isPlatformAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <RouteLoading />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!isPlatformAdmin) return <Navigate to="/workspace" replace />;
  return <Outlet />;
}
