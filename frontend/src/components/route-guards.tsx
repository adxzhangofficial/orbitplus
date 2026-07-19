import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RouteLoading } from "@/components/route-loading";
import { useAuth } from "@/contexts/auth-context";

export function RequireWorkspaceAccess() {
  const { user, loading, demoEnabled, enterDemo } = useAuth();
  const location = useLocation();
  const needsDemoIdentity = demoEnabled && (!user || user.role === "platform_admin");

  useEffect(() => {
    if (!loading && needsDemoIdentity) enterDemo("customer");
  }, [enterDemo, loading, needsDemoIdentity]);

  if (loading || needsDemoIdentity) return <RouteLoading />;
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (user.role === "platform_admin") return <Navigate to="/admin" replace />;
  return <Outlet />;
}

export function RequirePlatformAdmin() {
  const { user, loading, isPlatformAdmin, demoEnabled, enterDemo } = useAuth();
  const location = useLocation();
  const needsDemoIdentity = demoEnabled && !isPlatformAdmin;

  useEffect(() => {
    if (!loading && needsDemoIdentity) enterDemo("admin");
  }, [enterDemo, loading, needsDemoIdentity]);

  if (loading || needsDemoIdentity) return <RouteLoading />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!isPlatformAdmin) return <Navigate to="/workspace" replace />;
  return <Outlet />;
}
