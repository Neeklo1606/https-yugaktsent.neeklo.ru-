import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Image, Users, Settings, ChevronLeft,
  ChevronRight, Palette, BookOpen, ClipboardList, ClipboardCheck, Crown, Building2, Building, Download, Newspaper, Home, History, HardHat,
  Globe, LayoutTemplate, GalleryHorizontal, BellRing, ExternalLink, LogOut, Contact, Radar, Menu, X, MessageSquare, ListTodo, Shield, Activity, CreditCard, Sparkles, UserCircle, Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/shared/hooks/useAuth';
import CrmNotificationBell from '@/admin/components/CrmNotificationBell';
import CrmDebugOverlay from '@/admin/components/CrmDebugOverlay';
import CrmCommunicationMetricsProbe from '@/admin/components/CrmCommunicationMetricsProbe';
import CrmAutomationMetricsProbe from '@/admin/components/CrmAutomationMetricsProbe';
import ReliabilityMetricsProbe from '@/admin/components/ReliabilityMetricsProbe';
import NetworkStatusBanner from '@/admin/components/NetworkStatusBanner';
import ListingDebugOverlay from '@/admin/components/ListingDebugOverlay';
import RouteErrorBoundary from '@/shared/components/RouteErrorBoundary';
import { CrmRefreshProvider } from '@/admin/context/CrmRefreshContext';
import { useCrmRouteFocusRefresh } from '@/admin/hooks/useCrmRouteFocusRefresh';
import { useCrmRuntimeMetrics } from '@/admin/hooks/useCrmRuntimeMetrics';
import { isAdminNavVisible } from '@/admin/lib/admin-governance-nav';
import { isDemoAdminNavRoute } from '@/admin/lib/admin-demo-nav';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Дашборд', end: true, roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/pages', icon: FileText, label: 'Страницы', roles: ['admin', 'editor'] },
  { to: '/admin/ops', icon: Radar, label: 'Ops Center', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/requests', icon: ClipboardList, label: 'Заявки', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/tasks', icon: ListTodo, label: 'Задачи', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/conversations', icon: MessageSquare, label: 'Переписки', roles: ['admin', 'editor', 'manager', 'agent'] },
  { to: '/admin/moderation/listings', icon: ClipboardCheck, label: 'Модерация', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/trust', icon: Shield, label: 'Trust', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/system', icon: Activity, label: 'System', roles: ['admin', 'editor'] },
  { to: '/admin/billing', icon: CreditCard, label: 'Billing', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/ecosystem', icon: Building2, label: 'Ecosystem', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/listings/promotions', icon: Crown, label: 'Продвижение', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/my-listings', icon: Home, label: 'Мои объявления', roles: ['agent', 'manager'] },
  { to: '/admin/telegram-notify', icon: BellRing, label: 'Telegram уведомления команды', roles: ['admin'] },
  { to: '/admin/audit', icon: History, label: 'Журнал действий', roles: ['admin'] },
  { to: '/admin/blocks', icon: Building2, label: 'ЖК', roles: ['admin', 'editor'] },
  { to: '/admin/builders', icon: HardHat, label: 'Застройщики', roles: ['admin', 'editor'] },
  { to: '/admin/buildings', icon: Building, label: 'Корпуса', roles: ['admin', 'editor'] },
  { to: '/admin/listings', icon: Home, label: 'Объявления', roles: ['admin', 'editor', 'manager', 'agent'] },
  { to: '/admin/sellers', icon: Contact, label: 'Продавцы', roles: ['admin', 'editor', 'manager', 'agent'] },
  { to: '/admin/feed-import', icon: Download, label: 'Импорт фидов', roles: ['admin', 'editor'] },
  { to: '/admin/feed-links', icon: Link2, label: 'Ссылки на фиды', roles: ['admin', 'editor'] },
  { to: '/admin/reference', icon: BookOpen, label: 'Справочники', roles: ['admin', 'editor'] },
  { to: '/admin/regions', icon: Globe, label: 'Регионы', roles: ['admin', 'editor'] },
  { to: '/admin/homepage', icon: LayoutTemplate, label: 'Главная: блоки API', roles: ['admin', 'editor'] },
  { to: '/admin/banners', icon: GalleryHorizontal, label: 'Главная: баннеры', roles: ['admin', 'editor'] },
  { to: '/admin/news', icon: Newspaper, label: 'Новости / парсер', roles: ['admin', 'editor'] },
  { to: '/admin/experts', icon: UserCircle, label: 'Эксперты', roles: ['admin', 'editor'] },
  { to: '/admin/media', icon: Image, label: 'Медиа', roles: ['admin', 'editor'] },
  { to: '/admin/users', icon: Users, label: 'Пользователи', roles: ['admin'] },
  { to: '/admin/agents', icon: UserCircle, label: 'Сотрудники', roles: ['admin', 'editor', 'manager'] },
  { to: '/admin/tokens', icon: Palette, label: 'Токены', roles: ['admin'] },
  { to: '/admin/docs', icon: BookOpen, label: 'Документация' },
  { to: '/admin/settings', icon: Settings, label: 'Настройки', roles: ['admin'] },
  { to: '/admin/settings/ai', icon: Sparkles, label: 'AI интеграции', roles: ['admin'] },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useCrmRouteFocusRefresh();
  useCrmRuntimeMetrics();

  const availableNavItems = navItems.filter((item) => {
    if (!isDemoAdminNavRoute(item.to)) return false;
    if (!isAdminNavVisible(item.to)) return false;
    if (!item.roles?.length) return true;
    const role = user?.role;
    if (!role) return false;
    return item.roles.includes(role);
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const userInitial = (user?.name?.trim()?.[0] ?? user?.email?.[0] ?? '?').toUpperCase();

  return (
    <CrmRefreshProvider>
    <div className="flex h-[100dvh] bg-muted/30 overflow-hidden">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[300] focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground text-sm"
        >
          К основному содержимому
        </a>
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label="Закрыть меню"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r bg-background transition-all duration-200 shrink-0 z-50',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-xl',
          collapsed ? 'w-16' : 'w-60',
          mobileNavOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-xs">LG</span>
          </div>
          {!collapsed && <span className="font-bold text-sm truncate">ЮгАкцент CMS</span>}
        </div>
        <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
          {availableNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors min-h-[44px]',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        {!collapsed ? (
          <div
            className="mx-2 mb-1 px-2 py-1 rounded-lg bg-muted/50 text-[10px] text-muted-foreground leading-tight break-all"
            title="Если дата не меняется после деплоя — на сервере старая сборка или кэш браузера (Ctrl+Shift+R)."
          >
            Сборка: {__LG_BUILD_TIME__}
          </div>
        ) : null}

        <div className="border-t px-2 py-2 space-y-1">
          {!collapsed && user ? (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/40">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                {userInitial}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{user.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{user.role}</div>
              </div>
            </div>
          ) : null}

          <Link
            to="/"
            target="_blank"
            rel="noreferrer"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
              collapsed && 'justify-center px-0',
            )}
            title="Открыть сайт в новой вкладке"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">На сайт</span>}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors',
              collapsed && 'justify-center px-0',
            )}
            title="Выйти"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">Выйти</span>}
          </button>
        </div>

        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-center h-12 border-t text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 h-14 px-4 border-b bg-background/95 backdrop-blur-sm shrink-0">
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-xl border hover:bg-muted"
            aria-label="Открыть меню"
            onClick={() => setMobileNavOpen(true)}
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1 md:hidden" />
          <CrmNotificationBell />
        </header>
        <NetworkStatusBanner />
        <main id="admin-main" className="flex-1 overflow-auto overscroll-contain">
          <RouteErrorBoundary
            scope="admin-outlet"
            fallbackTitle="Ошибка в разделе админки"
            fallbackMessage="Этот раздел админки не загрузился. Меню и другие страницы доступны."
          >
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
      <CrmDebugOverlay />
      <CrmCommunicationMetricsProbe />
      <CrmAutomationMetricsProbe />
      <ReliabilityMetricsProbe />
      <ListingDebugOverlay />
    </div>
    </CrmRefreshProvider>
  );
}
