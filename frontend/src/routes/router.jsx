import { lazy, Suspense } from 'react';
import { createBrowserRouter, useLocation } from 'react-router';
import { RouteError } from '@/components/common/RouteError';
import { Loader } from '@/components/ui';
import { ADMIN_ROUTES, PERMISSIONS } from '@/constants/admin';
import { ROLES } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { CampusLayout } from '@/layouts/CampusLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import NotFoundPage from '@/pages/NotFoundPage';
import { GuestRoute } from './GuestRoute';
import { OnboardingGuard } from './OnboardingGuard';
import { ProtectedRoute } from './ProtectedRoute';
import { RedirectTo } from './RedirectTo';

// Each page is its own chunk, so later features don't bloat the first load.
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const PostPage = lazy(() => import('@/pages/PostPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const EditProfilePage = lazy(() => import('@/pages/EditProfilePage'));
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'));
const SemesterRoadmapPage = lazy(() => import('@/pages/roadmap/SemesterRoadmapPage'));
const ResumeBuilderPage = lazy(() => import('@/pages/resume/ResumeBuilderPage'));
const ResumeEditorPage = lazy(() => import('@/pages/resume/ResumeEditorPage'));
const CommunitiesPage = lazy(() => import('@/pages/CommunitiesPage'));
const CommunityDetailsPage = lazy(() => import('@/pages/CommunityDetailsPage'));
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'));
const ProjectDetailsPage = lazy(() => import('@/pages/projects/ProjectDetailsPage'));
const CreateProjectPage = lazy(() => import('@/pages/projects/CreateProjectPage'));
const EditProjectPage = lazy(() => import('@/pages/projects/EditProjectPage'));
const AchievementsPage = lazy(() => import('@/pages/achievements/AchievementsPage'));
const AchievementDetailsPage = lazy(() => import('@/pages/achievements/AchievementDetailsPage'));
const CreateAchievementPage = lazy(() => import('@/pages/achievements/CreateAchievementPage'));
const EditAchievementPage = lazy(() => import('@/pages/achievements/EditAchievementPage'));
const Opportunities = lazy(() => import('@/pages/opportunities/Opportunities'));
const OpportunityDetails = lazy(() => import('@/pages/opportunities/OpportunityDetails'));
const MyOpportunities = lazy(() => import('@/pages/opportunities/MyOpportunities'));
const SavedOpportunities = lazy(() => import('@/pages/opportunities/SavedOpportunities'));
const OpportunityEditor = lazy(() => import('@/pages/admin/opportunities/OpportunityEditor'));
const RankingPage = lazy(() => import('@/pages/rankings/RankingPage'));
const HallOfFamePage = lazy(() => import('@/pages/rankings/HallOfFamePage'));
const BadgesPage = lazy(() => import('@/pages/gamification/BadgesPage'));
const PointActivityPage = lazy(() => import('@/pages/gamification/PointActivityPage'));
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'));
const MessagesPage = lazy(() => import('@/pages/messages/MessagesPage'));
const SearchPage = lazy(() => import('@/pages/search/SearchPage'));
const DiscoverPage = lazy(() => import('@/pages/DiscoverPage'));
const SafetyPage = lazy(() => import('@/pages/SafetyPage'));
const ThemeStudioPage = lazy(() => import('@/pages/ThemeStudioPage'));
const AnonymousZone = lazy(() => import('@/pages/anonymous/AnonymousZone'));
const AnonymousPostDetails = lazy(() => import('@/pages/anonymous/AnonymousPostDetails'));
const CreateAnonymousPost = lazy(() => import('@/pages/anonymous/CreateAnonymousPost'));
const EditAnonymousPost = lazy(() => import('@/pages/anonymous/EditAnonymousPost'));
const MyAnonymousPosts = lazy(() => import('@/pages/anonymous/MyAnonymousPosts'));

// Admin control center: the shell, guards and pages are separate chunks, so students never download them.
const AdminLayout = lazy(() => import('@/layouts/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const AdminRoute = lazy(() => import('./AdminRoute').then((module) => ({ default: module.AdminRoute })));
const AdminNotFound = lazy(() => import('@/components/admin/AdminNotFound').then((module) => ({ default: module.AdminNotFound })));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminModeration = lazy(() => import('@/pages/admin/AdminModeration'));
const AdminReports = lazy(() => import('@/pages/admin/AdminReports'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail'));
const AdminContent = lazy(() => import('@/pages/admin/AdminContent'));
const AdminCommunities = lazy(() => import('@/pages/admin/AdminCommunities'));
const AdminOpportunities = lazy(() => import('@/pages/admin/AdminOpportunities'));
const AdminAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'));
const AdminAuditLogs = lazy(() => import('@/pages/admin/AdminAuditLogs'));
const AdminSecurity = lazy(() => import('@/pages/admin/AdminSecurity'));

const ADMIN_PAGES = [
  { path: ADMIN_ROUTES.DASHBOARD, permission: PERMISSIONS.VIEW_DASHBOARD, Page: AdminDashboard },
  { path: ADMIN_ROUTES.MODERATION, permission: PERMISSIONS.REVIEW_MODERATION, Page: AdminModeration },
  { path: ADMIN_ROUTES.CASE, permission: PERMISSIONS.REVIEW_MODERATION, Page: AdminModeration },
  { path: ADMIN_ROUTES.REPORTS, permission: PERMISSIONS.VIEW_REPORTS, Page: AdminReports },
  { path: ADMIN_ROUTES.REPORT, permission: PERMISSIONS.VIEW_REPORTS, Page: AdminReports },
  { path: ADMIN_ROUTES.USERS, permission: PERMISSIONS.MANAGE_USERS, Page: AdminUsers },
  { path: ADMIN_ROUTES.USER, permission: PERMISSIONS.MANAGE_USERS, Page: AdminUserDetail },
  { path: ADMIN_ROUTES.CONTENT, permission: PERMISSIONS.MANAGE_CONTENT, Page: AdminContent },
  { path: ADMIN_ROUTES.COMMUNITIES, permission: PERMISSIONS.MANAGE_COMMUNITIES, Page: AdminCommunities },
  { path: ADMIN_ROUTES.OPPORTUNITIES, permission: PERMISSIONS.MANAGE_OPPORTUNITIES, Page: AdminOpportunities },
  { path: ADMIN_ROUTES.OPPORTUNITY_CREATE, permission: PERMISSIONS.MANAGE_OPPORTUNITIES, Page: OpportunityEditor },
  { path: ADMIN_ROUTES.OPPORTUNITY_EDIT, permission: PERMISSIONS.MANAGE_OPPORTUNITIES, Page: OpportunityEditor },
  { path: ADMIN_ROUTES.ANALYTICS, permission: PERMISSIONS.VIEW_ANALYTICS, Page: AdminAnalytics },
  { path: ADMIN_ROUTES.AUDIT_LOGS, permission: PERMISSIONS.VIEW_AUDIT_LOGS, Page: AdminAuditLogs },
  { path: ADMIN_ROUTES.SECURITY, permission: PERMISSIONS.VIEW_SECURITY, Page: AdminSecurity },
];

// Dev-only tools (design system gallery, backend status); dropped from production builds.
// They sit outside ProtectedRoute so the backend status page works while signed out.
const devRoutes = import.meta.env.DEV
  ? [
      { path: ROUTES.DEV_UI, Page: lazy(() => import('@/pages/dev/UiPlaygroundPage')) },
      { path: ROUTES.DEV_STATUS, Page: lazy(() => import('@/pages/dev/DevStatusPage')) },
    ].map(({ path, Page }) => ({ path, element: <Page /> }))
  : [];

/** /feed is another name for the campus feed at /home (the filter in the query string is kept). */
function FeedAlias() {
  const { search } = useLocation();
  return <RedirectTo to={`${ROUTES.HOME}${search}`} fullScreen={false} />;
}

// The onboarding page has its own full-screen layout, so it needs its own lazy-load fallback.
const fullScreenFallback = (
  <div className="grid min-h-dvh place-items-center">
    <Loader size="lg" label="Loading" />
  </div>
);

/*
 * Route guards improve the experience only. The API enforces authentication, roles and
 * ownership on every request.
 *
 *   signed out                 → /login
 *   signed in, not onboarded   → /onboarding (campus pages bounce here)
 *   signed in, onboarded       → campus pages (/onboarding bounces to /home)
 */
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { path: ROUTES.LANDING, element: <LandingPage /> },
      {
        element: <GuestRoute />,
        children: [
          { path: ROUTES.LOGIN, element: <LoginPage /> },
          { path: ROUTES.REGISTER, element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <OnboardingGuard requireComplete={false} />,
        children: [
          {
            path: ROUTES.ONBOARDING,
            element: (
              <Suspense fallback={fullScreenFallback}>
                <OnboardingPage />
              </Suspense>
            ),
          },
        ],
      },
      {
        element: <OnboardingGuard requireComplete />,
        children: [
          {
            element: <CampusLayout />,
            children: [
              { path: ROUTES.HOME, element: <HomePage /> },
              { path: ROUTES.FEED, element: <FeedAlias /> },
              { path: ROUTES.POST, element: <PostPage /> },
              { path: ROUTES.PROFILE, element: <ProfilePage /> },
              { path: ROUTES.PROFILE_EDIT, element: <EditProfilePage /> },
              { path: ROUTES.ROADMAP, element: <SemesterRoadmapPage /> },
              { path: ROUTES.RESUME_BUILDER, element: <ResumeBuilderPage /> },
              { path: ROUTES.RESUME_EDITOR, element: <ResumeEditorPage /> },
              { path: `${ROUTES.PROFILE}/:userId`, element: <PublicProfilePage /> },
              { path: ROUTES.COMMUNITIES, element: <CommunitiesPage /> },
              { path: ROUTES.COMMUNITY, element: <CommunityDetailsPage /> },
              { path: ROUTES.PROJECTS, element: <ProjectsPage /> },
              { path: ROUTES.PROJECT_CREATE, element: <CreateProjectPage /> },
              { path: ROUTES.PROJECT, element: <ProjectDetailsPage /> },
              { path: ROUTES.PROJECT_EDIT, element: <EditProjectPage /> },
              { path: ROUTES.ACHIEVEMENTS, element: <AchievementsPage /> },
              { path: ROUTES.ACHIEVEMENT_CREATE, element: <CreateAchievementPage /> },
              { path: ROUTES.ACHIEVEMENT, element: <AchievementDetailsPage /> },
              { path: ROUTES.ACHIEVEMENT_EDIT, element: <EditAchievementPage /> },
              { path: ROUTES.OPPORTUNITIES, element: <Opportunities /> },
              { path: ROUTES.OPPORTUNITIES_SAVED, element: <SavedOpportunities /> },
              { path: ROUTES.OPPORTUNITIES_MY, element: <MyOpportunities /> },
              { path: ROUTES.OPPORTUNITY, element: <OpportunityDetails /> },
              { path: ROUTES.RANKINGS, element: <RankingPage /> },
              { path: ROUTES.HALL_OF_FAME, element: <HallOfFamePage /> },
              { path: ROUTES.BADGES, element: <BadgesPage /> },
              { path: ROUTES.POINT_ACTIVITY, element: <PointActivityPage /> },
              { path: ROUTES.NOTIFICATIONS, element: <NotificationsPage /> },
              { path: ROUTES.MESSAGES, element: <MessagesPage /> },
              { path: ROUTES.CONVERSATION, element: <MessagesPage /> },
              { path: ROUTES.SEARCH, element: <SearchPage /> },
              { path: ROUTES.DISCOVER, element: <DiscoverPage /> },
              { path: ROUTES.SAFETY, element: <SafetyPage /> },
              { path: ROUTES.THEME_STUDIO, element: <ThemeStudioPage /> },
              { path: ROUTES.COMMUNITY_GUIDELINES, element: <RedirectTo to={ROUTES.SAFETY} fullScreen={false} /> },
              { path: ROUTES.ANONYMOUS, element: <AnonymousZone /> },
              { path: ROUTES.ANONYMOUS_NEW, element: <CreateAnonymousPost /> },
              { path: ROUTES.ANONYMOUS_MINE, element: <MyAnonymousPosts /> },
              { path: ROUTES.ANONYMOUS_POST, element: <AnonymousPostDetails /> },
              { path: ROUTES.ANONYMOUS_POST_EDIT, element: <EditAnonymousPost /> },
            ],
          },
        ],
      },
      {
        // Admin control center: its own shell and look, for moderators and admins (students see
        // AccessDenied; the API answers 403). Staff accounts don't need a campus profile to use it.
        element: <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MODERATOR]} />,
        children: [
          {
            element: (
              <Suspense fallback={fullScreenFallback}>
                <AdminLayout />
              </Suspense>
            ),
            children: [
              { path: ADMIN_ROUTES.ROOT, element: <RedirectTo to={ADMIN_ROUTES.DASHBOARD} fullScreen={false} /> },
              ...ADMIN_PAGES.map(({ path, permission, Page }) => ({
                path,
                element: (
                  <AdminRoute permission={permission}>
                    <Page />
                  </AdminRoute>
                ),
              })),
              { path: `${ADMIN_ROUTES.ROOT}/*`, element: <AdminNotFound /> },
            ],
          },
        ],
      },
    ],
  },
  ...(devRoutes.length > 0 ? [{ element: <CampusLayout />, errorElement: <RouteError />, children: devRoutes }] : []),
  { path: '*', element: <NotFoundPage /> },
]);
