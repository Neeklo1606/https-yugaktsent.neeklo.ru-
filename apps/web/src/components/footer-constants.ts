/**
 * Контакты подвала берутся только из настроек сайта (админка → Настройки).
 * Заглушек с чужими адресами и телефонами здесь нет: чего нет в CMS —
 * того нет и на сайте.
 */

export const FOOTER_CATALOG_LINKS = [
  { label: 'Новостройки Анапы', to: '/catalog?type=apartments&market=new' },
  { label: 'Каталог недвижимости', to: '/catalog' },
  { label: 'Поиск на карте', to: '/map' },
  { label: 'Избранное', to: '/favorites' },
] as const;

export const FOOTER_COMPANY_LINKS = [
  { label: 'О компании', to: '/about' },
  { label: 'Новости', to: '/news' },
  { label: 'Контакты', to: '/contacts' },
] as const;

export const FOOTER_LEGAL_LINKS = [
  { label: 'Политика конфиденциальности', to: '/privacy' },
  { label: 'Пользовательское соглашение', to: '/terms' },
  { label: 'Cookie', to: '/cookies' },
] as const;
