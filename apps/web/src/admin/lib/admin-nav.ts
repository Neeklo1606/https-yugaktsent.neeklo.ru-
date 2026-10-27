import {
  BellRing,
  Building,
  Building2,
  ClipboardList,
  Database,
  GalleryHorizontal,
  HardHat,
  History,
  Home,
  Image,
  LayoutDashboard,
  Newspaper,
  Palette,
  Settings,
  Sparkles,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminRole = 'admin' | 'editor' | 'manager' | 'agent';

export type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AdminRole[];
  end?: boolean;
};

export type AdminNavGroup = { title: string; items: AdminNavItem[] };

/**
 * Компактная структура админки агентства (ТЗ v3, 6.1).
 * Разделы LiveGrid (Ops, Trust, Billing, Ecosystem, модерация агентов, TrendAgent,
 * пустышки «Токены» и «Страницы» в localStorage) в меню не попадают; маршруты
 * остаются зарегистрированы, чтобы старые ссылки не падали.
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: 'Обзор',
    items: [{ to: '/admin', label: 'Обзор', icon: LayoutDashboard, roles: ['admin', 'editor', 'manager'], end: true }],
  },
  {
    title: 'Объекты и ЖК',
    items: [
      { to: '/admin/blocks', label: 'Жилые комплексы', icon: Building2, roles: ['admin', 'editor'] },
      { to: '/admin/listings', label: 'Объекты', icon: Home, roles: ['admin', 'editor', 'manager', 'agent'] },
      { to: '/admin/builders', label: 'Застройщики', icon: HardHat, roles: ['admin', 'editor'] },
      { to: '/admin/media', label: 'Медиа', icon: Image, roles: ['admin', 'editor'] },
    ],
  },
  {
    title: 'Источники данных',
    items: [{ to: '/admin/data-sources', label: 'Фиды и источники', icon: Database, roles: ['admin', 'editor'] }],
  },
  {
    title: 'Заявки',
    items: [{ to: '/admin/requests', label: 'Заявки', icon: ClipboardList, roles: ['admin', 'editor', 'manager'] }],
  },
  {
    title: 'Контент',
    items: [
      { to: '/admin/news', label: 'Новости', icon: Newspaper, roles: ['admin', 'editor'] },
      { to: '/admin/experts', label: 'Эксперты, видео, гайды', icon: UserCircle, roles: ['admin', 'editor'] },
      { to: '/admin/banners', label: 'Баннеры главной', icon: GalleryHorizontal, roles: ['admin', 'editor'] },
    ],
  },
  {
    title: 'Внешний вид',
    items: [{ to: '/admin/theme', label: 'Тема сайта', icon: Palette, roles: ['admin', 'editor'] }],
  },
  {
    title: 'Интеграции',
    items: [
      { to: '/admin/telegram-notify', label: 'Telegram-уведомления', icon: BellRing, roles: ['admin'] },
      { to: '/admin/settings/ai', label: 'Нейросети', icon: Sparkles, roles: ['admin'] },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { to: '/admin/settings', label: 'Настройки сайта', icon: Settings, roles: ['admin'] },
      { to: '/admin/users', label: 'Пользователи', icon: Users, roles: ['admin'] },
      { to: '/admin/audit', label: 'Журнал действий', icon: History, roles: ['admin'] },
    ],
  },
];

/** Агент видит только свои объявления — отдельный короткий список */
export const AGENT_NAV_GROUPS: AdminNavGroup[] = [
  { title: 'Объекты', items: [{ to: '/admin/my-listings', label: 'Мои объявления', icon: Building, roles: ['agent', 'manager'] }] },
];

export function adminNavForRole(role: string | undefined): AdminNavGroup[] {
  if (!role) return [];
  const source = role === 'agent' ? AGENT_NAV_GROUPS : ADMIN_NAV_GROUPS;
  return source
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role as AdminRole)) }))
    .filter((g) => g.items.length > 0);
}
