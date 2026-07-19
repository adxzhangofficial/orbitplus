import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "@/components/admin-shell";
import { PublicShell } from "@/components/public-shell";
import { RouteLoading } from "@/components/route-loading";
import { RequirePlatformAdmin, RequireWorkspaceAccess } from "@/components/route-guards";
import { WorkspaceShell } from "@/components/workspace-shell";

const HomePage = lazy(() => import("@/pages/public/home-page"));
const ProductPage = lazy(() => import("@/pages/public/product-page"));
const FeaturesPage = lazy(() => import("@/pages/public/features-page"));
const PricingPage = lazy(() => import("@/pages/public/pricing-page"));
const EnterprisePage = lazy(() => import("@/pages/public/enterprise-page"));
const PublicSecurityPage = lazy(() => import("@/pages/public/security-page"));
const PublicIntegrationsPage = lazy(() => import("@/pages/public/integrations-page"));
const DocsPage = lazy(() => import("@/pages/public/docs-page"));
const ApiPage = lazy(() => import("@/pages/public/api-page"));
const ChangelogPage = lazy(() => import("@/pages/public/changelog-page"));
const StatusPage = lazy(() => import("@/pages/public/status-page"));
const RoadmapPage = lazy(() => import("@/pages/public/roadmap-page"));
const AboutPage = lazy(() => import("@/pages/public/about-page"));
const ContactPage = lazy(() => import("@/pages/public/contact-page"));
const CustomersPage = lazy(() => import("@/pages/public/customers-page"));
const PrivacyPage = lazy(() => import("@/pages/public/privacy-page"));
const TermsPage = lazy(() => import("@/pages/public/terms-page"));
const AcceptableUsePage = lazy(() => import("@/pages/public/acceptable-use-page"));
const NotFoundPage = lazy(() => import("@/pages/public/not-found-page"));

const SignInPage = lazy(() => import("@/pages/auth/sign-in-page"));
const RegisterPage = lazy(() => import("@/pages/auth/register-page"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/forgot-password-page"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/reset-password-page"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/verify-email-page"));

const OverviewPage = lazy(() => import("@/pages/workspace/overview-page"));
const ServersPage = lazy(() => import("@/pages/workspace/servers-page"));
const ServerDetailPage = lazy(() => import("@/pages/workspace/server-detail-page"));
const FileExplorerPage = lazy(() => import("@/pages/workspace/file-explorer-page"));
const TransfersPage = lazy(() => import("@/pages/workspace/TransfersPage"));
const BackupsPage = lazy(() => import("@/pages/workspace/BackupsPage"));
const DeploymentsPage = lazy(() => import("@/pages/workspace/DeploymentsPage"));
const AutomationsPage = lazy(() => import("@/pages/workspace/AutomationsPage"));
const MonitoringPage = lazy(() => import("@/pages/workspace/MonitoringPage"));
const WorkspaceActivityPage = lazy(() => import("@/pages/workspace/ActivityPage"));
const TeamPage = lazy(() => import("@/pages/workspace/TeamPage"));
const NotificationsPage = lazy(() => import("@/pages/workspace/NotificationsPage"));
const TerminalPage = lazy(() => import("@/pages/workspace/TerminalPage"));
const RunbooksPage = lazy(() => import("@/pages/workspace/RunbooksPage"));
const IntegrationsPage = lazy(() => import("@/pages/workspace/IntegrationsPage"));
const ApiKeysPage = lazy(() => import("@/pages/workspace/ApiKeysPage"));
const UsagePage = lazy(() => import("@/pages/workspace/UsagePage"));
const BillingPage = lazy(() => import("@/pages/workspace/BillingPage"));
const ProfileSettingsPage = lazy(() => import("@/pages/workspace/ProfileSettingsPage"));
const SecuritySettingsPage = lazy(() => import("@/pages/workspace/SecuritySettingsPage"));
const WorkspaceSettingsPage = lazy(() => import("@/pages/workspace/WorkspaceSettingsPage"));

const OverviewAdminPage = lazy(() => import("@/pages/admin/overview"));
const OrganizationsAdminPage = lazy(() => import("@/pages/admin/organizations"));
const UsersAdminPage = lazy(() => import("@/pages/admin/users"));
const ServerFleetAdminPage = lazy(() => import("@/pages/admin/servers"));
const JobsAdminPage = lazy(() => import("@/pages/admin/jobs"));
const BackupsAdminPage = lazy(() => import("@/pages/admin/backups"));
const PlansAdminPage = lazy(() => import("@/pages/admin/plans"));
const RevenueAdminPage = lazy(() => import("@/pages/admin/revenue"));
const SecurityAdminPage = lazy(() => import("@/pages/admin/security"));
const AuditAdminPage = lazy(() => import("@/pages/admin/audit"));
const SupportAdminPage = lazy(() => import("@/pages/admin/support"));
const FeatureFlagsAdminPage = lazy(() => import("@/pages/admin/features"));
const AnnouncementsAdminPage = lazy(() => import("@/pages/admin/announcements"));
const SystemAdminPage = lazy(() => import("@/pages/admin/system"));

export function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<PublicShell />}>
          <Route index element={<HomePage />} />
          <Route path="product" element={<ProductPage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="enterprise" element={<EnterprisePage />} />
          <Route path="security" element={<PublicSecurityPage />} />
          <Route path="integrations" element={<PublicIntegrationsPage />} />
          <Route path="docs/*" element={<DocsPage />} />
          <Route path="api" element={<ApiPage />} />
          <Route path="changelog" element={<ChangelogPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="acceptable-use" element={<AcceptableUsePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="sign-in" element={<SignInPage />} />
        <Route path="login" element={<Navigate to="/sign-in" replace />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />

        <Route element={<RequireWorkspaceAccess />}>
          <Route path="workspace" element={<WorkspaceShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="servers" element={<ServersPage />} />
            <Route path="servers/:serverId" element={<ServerDetailPage />} />
            <Route path="servers/:serverId/files" element={<FileExplorerPage />} />
            <Route path="transfers" element={<TransfersPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="activity" element={<WorkspaceActivityPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="terminal" element={<TerminalPage />} />
            <Route path="runbooks" element={<RunbooksPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings/profile" element={<ProfileSettingsPage />} />
            <Route path="settings/security" element={<SecuritySettingsPage />} />
            <Route path="settings/workspace" element={<WorkspaceSettingsPage />} />
            <Route path="*" element={<Navigate to="/workspace" replace />} />
          </Route>
        </Route>

        <Route element={<RequirePlatformAdmin />}>
          <Route path="admin" element={<AdminShell />}>
            <Route index element={<OverviewAdminPage />} />
            <Route path="organizations" element={<OrganizationsAdminPage />} />
            <Route path="users" element={<UsersAdminPage />} />
            <Route path="servers" element={<ServerFleetAdminPage />} />
            <Route path="jobs" element={<JobsAdminPage />} />
            <Route path="backups" element={<BackupsAdminPage />} />
            <Route path="plans" element={<PlansAdminPage />} />
            <Route path="revenue" element={<RevenueAdminPage />} />
            <Route path="security" element={<SecurityAdminPage />} />
            <Route path="audit" element={<AuditAdminPage />} />
            <Route path="support" element={<SupportAdminPage />} />
            <Route path="features" element={<FeatureFlagsAdminPage />} />
            <Route path="announcements" element={<AnnouncementsAdminPage />} />
            <Route path="system" element={<SystemAdminPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>

        <Route path="dashboard" element={<Navigate to="/workspace" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
