import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import { lazy, Suspense } from "react";
import { lazyWithReload } from "@/shared/lib/lazy-route";
import RouteErrorBoundary from "@/shared/components/RouteErrorBoundary";
import { AuthProvider, useAuth, useAuthState } from "@/shared/hooks/useAuth";
import AuthSessionSync from "@/shared/components/AuthSessionSync";
import { RequireAuth } from "@/shared/components/RequireAuth";
import SeoRouteMeta from "@/shared/components/SeoRouteMeta";
import SeoJsonLd from "@/shared/components/SeoJsonLd";
import StagingBadge from "@/shared/components/StagingBadge";
import CookieBanner from "@/shared/components/CookieBanner";
import ThemeBootstrap from "@/shared/theme/ThemeBootstrap";

// Main pages
const RedesignIndex = lazyWithReload(() => import("./redesign/pages/RedesignIndex"));
const RedesignCatalog = lazyWithReload(() => import("./redesign/pages/RedesignCatalog"));
const RedesignComplex = lazyWithReload(() => import("./redesign/pages/RedesignComplex"));
const RedesignApartment = lazyWithReload(() => import("./redesign/pages/RedesignApartment"));
const RedesignListingDetail = lazyWithReload(() => import("./redesign/pages/RedesignListingDetail"));
const RedesignMap = lazyWithReload(() => import("./redesign/pages/RedesignMap"));

// Catalog sub-pages

// Detail / utility pages
const Presentation = lazyWithReload(() => import("./pages/Presentation"));
const ListingPresentation = lazyWithReload(() => import("./pages/ListingPresentation"));
const Favorites = lazyWithReload(() => import("./pages/Favorites"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Cookies = lazy(() => import("./pages/Cookies"));
const AboutCompany = lazy(() => import("./pages/AboutCompany"));
const ExpertPage = lazyWithReload(() => import("./pages/ExpertPage"));

// Вход: сайт — лендинг без личных кабинетов, форма нужна только для админки
const Login = lazy(() => import("./pages/Login"));

// News
const News = lazy(() => import("./pages/News"));
const NewsDetail = lazy(() => import("./pages/NewsDetail"));

// Admin
const AdminLayout = lazyWithReload('AdminLayout', () => import("./admin/layout/AdminLayout"));
const AdminDashboard = lazyWithReload('AdminDashboard', () => import("./admin/pages/AdminDashboard"));
const AdminPages = lazyWithReload('AdminPages', () => import("./admin/pages/AdminPages"));
const AdminPageEditor = lazyWithReload('AdminPageEditor', () => import("./admin/pages/AdminPageEditor"));
const AdminMedia = lazyWithReload('AdminMedia', () => import("./admin/pages/AdminMedia"));
const AdminUsers = lazyWithReload('AdminUsers', () => import("./admin/pages/AdminUsers"));
const AdminAgentsListPage = lazyWithReload('AdminAgentsListPage', () => import("./admin/pages/AdminAgentsListPage"));
const AdminAgentEditPage = lazyWithReload('AdminAgentEditPage', () => import("./admin/pages/AdminAgentEditPage"));
const AdminSettings = lazyWithReload('AdminSettings', () => import("./admin/pages/AdminSettings"));
const AdminAiSettings = lazyWithReload('AdminAiSettings', () => import("./admin/pages/AdminAiSettings"));
const AdminDocs = lazyWithReload('AdminDocs', () => import("./admin/pages/AdminDocs"));
const AdminAudit = lazyWithReload('AdminAudit', () => import("./admin/pages/AdminAudit"));
const AdminRequests = lazyWithReload('AdminRequests', () => import("./admin/pages/AdminRequests"));
const AdminOpsCenter = lazyWithReload('AdminOpsCenter', () => import("./admin/pages/AdminOpsCenter"));
const AdminRequestDetail = lazyWithReload('AdminRequestDetail', () => import("./admin/pages/AdminRequestDetail"));
const AdminConversationsPage = lazyWithReload('AdminConversationsPage', () => import("./admin/pages/AdminConversationsPage"));
const AdminTasksPage = lazyWithReload('AdminTasksPage', () => import("./admin/pages/AdminTasksPage"));
const AdminTrustPage = lazyWithReload('AdminTrustPage', () => import("./admin/pages/AdminTrustPage"));
const AdminSystemPage = lazyWithReload('AdminSystemPage', () => import("./admin/pages/AdminSystemPage"));
const AdminBillingPage = lazyWithReload('AdminBillingPage', () => import("./admin/pages/AdminBillingPage"));
const AdminEcosystemPage = lazyWithReload('AdminEcosystemPage', () => import("./admin/pages/AdminEcosystemPage"));
const AdminTelegramNotify = lazyWithReload('AdminTelegramNotify', () => import("./admin/pages/AdminTelegramNotify"));
const AdminBlocks = lazyWithReload('AdminBlocks', () => import("./admin/pages/AdminBlocks"));
const AdminBlockEditor = lazyWithReload('AdminBlockEditor', () => import("./admin/pages/AdminBlockEditor"));
const AdminBuilders = lazyWithReload('AdminBuilders', () => import("./admin/pages/AdminBuilders"));
const AdminBuildings = lazyWithReload('AdminBuildings', () => import("./admin/pages/AdminBuildings"));
const AdminMyListings = lazyWithReload('AdminMyListings', () => import("./admin/pages/AdminMyListings"));
const AdminListings = lazyWithReload('AdminListings', () => import("./admin/pages/AdminListings"));
const AdminSellers = lazyWithReload('AdminSellers', () => import("./admin/pages/AdminSellers"));
const AdminManualListing = lazyWithReload('AdminManualListing', () => import("./admin/pages/AdminManualListing"));
const AdminListingWizard = lazyWithReload('AdminListingWizard', () => import("./admin/pages/AdminListingWizard"));
const AdminModerationListings = lazyWithReload('AdminModerationListings', () => import("./admin/pages/AdminModerationListings"));
const AdminModerationReview = lazyWithReload('AdminModerationReview', () => import("./admin/pages/AdminModerationReview"));
const AdminListingsPromotions = lazyWithReload('AdminListingsPromotions', () => import("./admin/pages/AdminListingsPromotions"));
const AdminManualHouse = lazyWithReload('AdminManualHouse', () => import("./admin/pages/AdminManualHouse"));
const AdminManualLand = lazyWithReload('AdminManualLand', () => import("./admin/pages/AdminManualLand"));
const AdminManualCommercial = lazyWithReload('AdminManualCommercial', () => import("./admin/pages/AdminManualCommercial"));
const AdminManualParking = lazyWithReload('AdminManualParking', () => import("./admin/pages/AdminManualParking"));
const AdminFeedImport = lazyWithReload('AdminFeedImport', () => import("./admin/pages/AdminFeedImport"));
const AdminFeedLinks = lazyWithReload('AdminFeedLinks', () => import("./admin/pages/AdminFeedLinks"));
const AdminNews = lazyWithReload('AdminNews', () => import("./admin/pages/AdminNews"));
const AdminRegions = lazyWithReload('AdminRegions', () => import("./admin/pages/AdminRegions"));
const AdminHomepage = lazyWithReload('AdminHomepage', () => import("./admin/pages/AdminHomepage"));
const AdminBanners = lazyWithReload('AdminBanners', () => import("./admin/pages/AdminBanners"));
const AdminReference = lazyWithReload('AdminReference', () => import("./admin/pages/AdminReference"));
const AdminDataSources = lazyWithReload('AdminDataSources', () => import("./admin/pages/AdminDataSources"));
const AdminThemeBuilder = lazyWithReload('AdminThemeBuilder', () => import("./admin/pages/AdminThemeBuilder"));
const AdminExperts = lazyWithReload('AdminExperts', () => import("./admin/pages/AdminExperts"));
const AdminExpertEditor = lazyWithReload('AdminExpertEditor', () => import("./admin/pages/AdminExpertEditor"));
const EditorPage = lazyWithReload('EditorPage', () => import("./admin/components/editor/EditorPage"));

const NotFound = lazyWithReload(() => import("./pages/NotFound"));

import { CRM_QUERY_DEFAULTS } from "@/admin/lib/crm-query-options";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: CRM_QUERY_DEFAULTS,
  },
});

/** Только для самой первой загрузки: тонкая полоса сверху вместо спиннера на весь экран */
const Loading = () => (
  <div role="progressbar" aria-label="Загрузка" className="fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden bg-primary/15">
    <div className="h-full w-1/3 animate-[loading-bar_1.1s_ease-in-out_infinite] bg-primary" />
  </div>
);

const AdminIndexRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'agent') return <Navigate to="/admin/my-listings" replace />;
  if (user?.role === 'manager') return <Navigate to="/admin/requests" replace />;
  return <AdminDashboard />;
};

const AppRoutes = () => (
  <RouteErrorBoundary scope="app-routes">
    <Routes>
    {/* Main */}
    <Route path="/" element={<RedesignIndex />} />
    <Route path="/catalog" element={<RedesignCatalog />} />
    <Route path="/catalog/apartments" element={<Navigate to="/catalog?type=apartments" replace />} />
    <Route path="/catalog/houses" element={<Navigate to="/catalog?type=houses" replace />} />
    <Route path="/catalog/land" element={<Navigate to="/catalog?type=land" replace />} />
    <Route path="/catalog/commercial" element={<Navigate to="/catalog?type=commercial" replace />} />
    <Route path="/complex/:slug" element={<RedesignComplex />} />
    <Route path="/apartment/:id" element={<RedesignApartment />} />
    <Route path="/listing/:id" element={<RedesignListingDetail />} />
    <Route path="/presentation/listing/:listingId" element={<ListingPresentation />} />
    <Route path="/presentation/:slug" element={<Presentation />} />
    <Route path="/map" element={<RedesignMap />} />
    <Route path="/mortgage" element={<Navigate to="/catalog" replace />} />
    {/* Сравнение, подборки и профили агентств LiveGrid сняты с публичной части (план сдачи, D9) */}
    <Route path="/compare" element={<Navigate to="/favorites" replace />} />
    {/* Избранное живёт в localStorage — регистрация для него не нужна */}
    <Route path="/favorites" element={<Favorites />} />
    <Route path="/account/*" element={<Navigate to="/favorites" replace />} />
    <Route path="/contacts" element={<Contacts />} />
    <Route path="/about" element={<AboutCompany />} />
    {/* Постоянный адрес визитки эксперта: на него ведут QR-коды, slug не менять */}
    <Route path="/experts/:slug" element={<ExpertPage />} />
    <Route path="/selection" element={<Navigate to="/catalog" replace />} />
    <Route path="/selections/:token" element={<Navigate to="/catalog" replace />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/cookies" element={<Cookies />} />

    <Route path="/agency/*" element={<Navigate to="/about" replace />} />

    {/* Вход только в админку: публичной регистрации на лендинге нет */}
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Navigate to="/login" replace />} />
    <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
    <Route path="/reset-password" element={<Navigate to="/login" replace />} />
    <Route path="/profile" element={<Navigate to="/login" replace />} />

    {/* News */}
    <Route path="/news" element={<News />} />
    <Route path="/news/:slug" element={<NewsDetail />} />

    {/* Admin — protected, requires editor+ role */}
    <Route path="/admin" element={<RequireAuth roles={['admin', 'editor', 'manager', 'agent']}><AdminLayout /></RequireAuth>}>
      <Route index element={<RequireAuth roles={['admin', 'editor', 'manager', 'agent']}><AdminIndexRedirect /></RequireAuth>} />
      <Route path="pages" element={<RequireAuth roles={['admin', 'editor']}><AdminPages /></RequireAuth>} />
      <Route path="page-editor/:slug" element={<RequireAuth roles={['admin', 'editor']}><AdminPageEditor /></RequireAuth>} />
      <Route path="ops" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminOpsCenter /></RequireAuth>} />
      <Route path="requests" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminRequests /></RequireAuth>} />
      <Route path="requests/:id" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminRequestDetail /></RequireAuth>} />
      <Route path="tasks" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminTasksPage /></RequireAuth>} />
      <Route path="trust" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminTrustPage /></RequireAuth>} />
      <Route path="system" element={<RequireAuth roles={['admin', 'editor']}><AdminSystemPage /></RequireAuth>} />
      <Route path="billing" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminBillingPage /></RequireAuth>} />
      <Route path="ecosystem" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminEcosystemPage /></RequireAuth>} />
      <Route path="conversations" element={<RequireAuth roles={['admin', 'editor', 'manager', 'agent']}><AdminConversationsPage /></RequireAuth>} />
      <Route path="telegram-notify" element={<RequireAuth roles={['admin']}><AdminTelegramNotify /></RequireAuth>} />
      <Route path="audit" element={<RequireAuth roles={['admin']}><AdminAudit /></RequireAuth>} />
      <Route path="blocks" element={<RequireAuth roles={['admin', 'editor']}><AdminBlocks /></RequireAuth>} />
      <Route path="blocks/:id" element={<RequireAuth roles={['admin', 'editor']}><AdminBlockEditor /></RequireAuth>} />
      <Route path="builders" element={<RequireAuth roles={['admin', 'editor']}><AdminBuilders /></RequireAuth>} />
      <Route path="buildings" element={<RequireAuth roles={['admin', 'editor']}><AdminBuildings /></RequireAuth>} />
      <Route path="my-listings" element={<RequireAuth roles={['agent', 'manager', 'admin', 'editor']}><AdminMyListings /></RequireAuth>} />
      <Route path="listings" element={<AdminListings />} />
      <Route path="sellers" element={<RequireAuth roles={['admin', 'editor', 'manager', 'agent']}><AdminSellers /></RequireAuth>} />
      <Route path="listings/wizard/new" element={<RequireAuth roles={['admin', 'editor', 'manager', 'agent']}><AdminListingWizard /></RequireAuth>} />
      <Route path="listings/wizard/:listingId/edit" element={<RequireAuth roles={['admin', 'editor', 'manager', 'agent']}><AdminListingWizard /></RequireAuth>} />
      <Route path="moderation/listings" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminModerationListings /></RequireAuth>} />
      <Route path="moderation/listings/:listingId" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminModerationReview /></RequireAuth>} />
      <Route path="listings/promotions" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminListingsPromotions /></RequireAuth>} />
      <Route path="listings/manual/new" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualListing /></RequireAuth>} />
      <Route path="listings/manual/:listingId/edit" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualListing /></RequireAuth>} />
      <Route path="listings/manual-house/new" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualHouse /></RequireAuth>} />
      <Route path="listings/manual-house/:listingId/edit" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualHouse /></RequireAuth>} />
      <Route path="listings/manual-land/new" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualLand /></RequireAuth>} />
      <Route path="listings/manual-land/:listingId/edit" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualLand /></RequireAuth>} />
      <Route path="listings/manual-commercial/new" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualCommercial /></RequireAuth>} />
      <Route path="listings/manual-commercial/:listingId/edit" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualCommercial /></RequireAuth>} />
      <Route path="listings/manual-parking/new" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualParking /></RequireAuth>} />
      <Route path="listings/manual-parking/:listingId/edit" element={<RequireAuth roles={['admin', 'editor', 'agent']}><AdminManualParking /></RequireAuth>} />
      <Route path="feed-import" element={<RequireAuth roles={['admin', 'editor']}><AdminFeedImport /></RequireAuth>} />
      <Route path="feed-links" element={<RequireAuth roles={['admin', 'editor']}><AdminFeedLinks /></RequireAuth>} />
      <Route path="news" element={<RequireAuth roles={['admin', 'editor']}><AdminNews /></RequireAuth>} />
      <Route path="regions" element={<RequireAuth roles={['admin', 'editor']}><AdminRegions /></RequireAuth>} />
      <Route path="reference" element={<RequireAuth roles={['admin', 'editor']}><AdminReference /></RequireAuth>} />
      <Route path="homepage" element={<RequireAuth roles={['admin', 'editor']}><AdminHomepage /></RequireAuth>} />
      <Route path="banners" element={<RequireAuth roles={['admin', 'editor']}><AdminBanners /></RequireAuth>} />
      <Route path="data-sources" element={<RequireAuth roles={['admin', 'editor']}><AdminDataSources /></RequireAuth>} />
      <Route path="theme" element={<RequireAuth roles={['admin', 'editor']}><AdminThemeBuilder /></RequireAuth>} />
      <Route path="experts" element={<RequireAuth roles={['admin', 'editor']}><AdminExperts /></RequireAuth>} />
      <Route path="experts/:slug" element={<RequireAuth roles={['admin', 'editor']}><AdminExpertEditor /></RequireAuth>} />
      <Route path="media" element={<RequireAuth roles={['admin', 'editor']}><AdminMedia /></RequireAuth>} />
      <Route path="users" element={<RequireAuth roles={['admin']}><AdminUsers /></RequireAuth>} />
      <Route path="agents" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminAgentsListPage /></RequireAuth>} />
      <Route path="agents/:userId" element={<RequireAuth roles={['admin', 'editor', 'manager']}><AdminAgentEditPage /></RequireAuth>} />
      <Route path="settings" element={<RequireAuth roles={['admin', 'editor']}><AdminSettings /></RequireAuth>} />
      <Route path="settings/ai" element={<RequireAuth roles={['admin']}><AdminAiSettings /></RequireAuth>} />
      {/* «Токены» не сохраняли даже черновик — раздел заменён темой сайта */}
      <Route path="tokens" element={<Navigate to="/admin/theme" replace />} />
      <Route path="docs" element={<AdminDocs />} />
    </Route>
    <Route path="/admin/editor/:pageId" element={<RequireAuth roles={['admin', 'editor']}><EditorPage /></RequireAuth>} />

    <Route path="*" element={<NotFound />} />
  </Routes>
  </RouteErrorBoundary>
);

const AppWithAuth = () => {
  const authState = useAuthState();
  return (
    <AuthProvider value={authState}>
      <AppRoutes />
    </AuthProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthSessionSync />
    <ThemeBootstrap />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* startTransition: при переходе остаётся текущий экран, пока грузится следующий — без спиннера на весь экран */}
      <BrowserRouter future={{ v7_startTransition: true }}>
        <ScrollToTop />
        <SeoRouteMeta />
        <SeoJsonLd />
        <StagingBadge />
        <CookieBanner />
        <Suspense fallback={<Loading />}>
          <RouteErrorBoundary
            scope="auth-boot"
            fallbackTitle="Ошибка инициализации"
            fallbackMessage="Не удалось загрузить модуль авторизации. Обновите страницу или очистите кэш."
          >
            <AppWithAuth />
          </RouteErrorBoundary>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
