/**
 * Expanded lazy route registry for runtime import integrity tests (Iter 62).
 * Paths are vite-resolvable from src/ via @/ alias.
 */
export const LAZY_ROUTE_REGISTRY = [
  { id: 'RedesignIndex', path: '@/redesign/pages/RedesignIndex' },
  { id: 'RedesignCatalog', path: '@/redesign/pages/RedesignCatalog' },
  { id: 'RedesignMap', path: '@/redesign/pages/RedesignMap' },
  { id: 'RedesignApartment', path: '@/redesign/pages/RedesignApartment' },
  { id: 'RedesignComplex', path: '@/redesign/pages/RedesignComplex' },
  { id: 'RedesignListingDetail', path: '@/redesign/pages/RedesignListingDetail' },
  { id: 'ListingCard', path: '@/redesign/components/ListingCard' },
  { id: 'Favorites', path: '@/pages/Favorites' },
  { id: 'Login', path: '@/pages/Login' },
  { id: 'AdminLayout', path: '@/admin/layout/AdminLayout' },
  { id: 'AdminDashboard', path: '@/admin/pages/AdminDashboard' },
  { id: 'AdminModerationReview', path: '@/admin/pages/AdminModerationReview' },
  { id: 'AdminModerationListings', path: '@/admin/pages/AdminModerationListings' },
  { id: 'AdminSystemPage', path: '@/admin/pages/AdminSystemPage' },
  { id: 'AdminBillingPage', path: '@/admin/pages/AdminBillingPage' },
  { id: 'AdminEcosystemPage', path: '@/admin/pages/AdminEcosystemPage' },
  { id: 'AdminListingWizard', path: '@/admin/pages/AdminListingWizard' },
  { id: 'AdminOpsCenter', path: '@/admin/pages/AdminOpsCenter' },
  { id: 'PublicAgencyPage', path: '@/ecosystem/pages/PublicAgencyPage' },
  { id: 'AccountBillingPage', path: '@/account/pages/AccountBillingPage' },
  { id: 'ExpertPage', path: '@/pages/ExpertPage' },
  { id: 'AdminExperts', path: '@/admin/pages/AdminExperts' },
  { id: 'AdminExpertEditor', path: '@/admin/pages/AdminExpertEditor' },
  { id: 'AdminDataSources', path: '@/admin/pages/AdminDataSources' },
  { id: 'AdminThemeBuilder', path: '@/admin/pages/AdminThemeBuilder' },
  { id: 'NotFound', path: '@/pages/NotFound' },
] as const;

/** Hooks that must resolve at runtime — verified by import tests. */
export const RUNTIME_HOOK_REGISTRY = [
  { name: 'useAuth', path: '@/shared/hooks/useAuth', exports: ['useAuth', 'useAuthState', 'AuthProvider'] as const },
  { name: 'useAuth barrel', path: '@/shared/hooks', exports: ['useAuth', 'useAuthState', 'AuthProvider'] as const },
] as const;

export type LazyRouteEntry = (typeof LAZY_ROUTE_REGISTRY)[number];

export function findRouteById(id: string): LazyRouteEntry | undefined {
  return LAZY_ROUTE_REGISTRY.find((r) => r.id === id);
}
