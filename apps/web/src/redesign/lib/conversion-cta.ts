import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  Heart,
  MessageCircle,
  Phone,
  Share2,
  Tag,
} from 'lucide-react';

/** Unified CTA labels — single source across catalog, map, complex, apartment, chessboard. */
export const CONVERSION_CTA = {
  consultation: 'Получить консультацию',
  price: 'Узнать цену',
  phone: 'Позвонить',
  callback: 'Обратный звонок',
  save: 'Сохранить',
  share: 'Поделиться',
  mortgage: 'Ипотека',
  viewing: 'Записаться на просмотр',
  /** Короткая подпись для узких горизонтальных CTA */
  viewingShort: 'На просмотр',
  details: 'Подробнее',
  submit: 'Отправить заявку',
  submitting: 'Отправка…',
} as const;

export type ConversionCTAKey = keyof typeof CONVERSION_CTA;

export const CONVERSION_CTA_ICON: Record<
  'consultation' | 'price' | 'phone' | 'callback' | 'save' | 'share' | 'mortgage' | 'viewing' | 'details',
  LucideIcon
> = {
  consultation: MessageCircle,
  price: Tag,
  phone: Phone,
  callback: Phone,
  save: Heart,
  share: Share2,
  mortgage: Calculator,
  viewing: MessageCircle,
  details: MessageCircle,
};

export type ConversionSurface =
  | 'home'
  | 'catalog'
  | 'complex'
  | 'apartment'
  | 'listing'
  | 'map_complex'
  | 'map_listing'
  | 'chessboard'
  | 'contacts'
  | 'expert';

export type ConversionRequestType =
  | 'CONSULTATION'
  | 'MORTGAGE'
  | 'CALLBACK'
  | 'SELECTION'
  | 'CONTACT';

export type ConsultationContext = {
  surface: ConversionSurface;
  /** LeadForm source tag (page/scenario). */
  source: string;
  title?: string;
  requestType?: ConversionRequestType;
  blockId?: number;
  listingId?: number;
  contextFooter?: string;
  sold?: boolean;
};

export function consultationTitle(ctx: ConsultationContext): string {
  if (ctx.title) return ctx.title;
  if (ctx.requestType === 'CALLBACK') return CONVERSION_CTA.callback;
  if (ctx.requestType === 'MORTGAGE') return CONVERSION_CTA.mortgage;
  if (ctx.sold) return CONVERSION_CTA.consultation;
  return CONVERSION_CTA.consultation;
}

export function phoneUnavailableMessage(): string {
  return 'Телефон временно недоступен. Оставьте заявку, и мы перезвоним.';
}
