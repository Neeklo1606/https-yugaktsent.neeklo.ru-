import { Globe, MessageCircle, PlayCircle, Send, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExpertLinkType } from './expert-profile';

/**
 * Монохромные значки каналов. Фирменные цвета сознательно не используем:
 * в ТЗ ряд разноцветных кнопок соцсетей назван как то, чего делать нельзя.
 */
const ExpertLinkIcon = ({ type, className }: { type: ExpertLinkType; className?: string }) => {
  const cls = cn('h-5 w-5 shrink-0', className);
  switch (type) {
    case 'telegram':
    case 'telegram_channel':
      return <Send className={cls} aria-hidden />;
    case 'youtube':
      return <Youtube className={cls} aria-hidden />;
    case 'rutube':
      return <PlayCircle className={cls} aria-hidden />;
    case 'max':
      return <MessageCircle className={cls} aria-hidden />;
    case 'vk':
      return (
        <span aria-hidden className={cn('inline-flex items-center justify-center text-[11px] font-bold tracking-tight', cls)}>
          VK
        </span>
      );
    case 'dzen':
      return (
        <span aria-hidden className={cn('inline-flex items-center justify-center text-[11px] font-bold', cls)}>
          Дз
        </span>
      );
    default:
      return <Globe className={cls} aria-hidden />;
  }
};

export default ExpertLinkIcon;
