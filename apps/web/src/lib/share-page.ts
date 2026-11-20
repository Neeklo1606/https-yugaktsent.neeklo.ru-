import { toast } from '@/components/ui/sonner';
import { conversionObsShare } from '@/redesign/lib/conversion-observability';
import { SHARE_EVENT } from '@/lib/share-event';

/** Web Share API или копирование ссылки в буфер. */
export async function shareCurrentPage(opts?: { title?: string }) {
  conversionObsShare();
  const url = window.location.href;
  const title = opts?.title?.trim() || document.title;
  // Телефон: системное меню (там уже Telegram, WhatsApp и т.д.).
  // Компьютер: своё окно с мессенджерами — системное меню Mac/Windows неудобное, а без него была только тихая копия ссылки.
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  try {
    if (touch && typeof navigator.share === 'function') {
      await navigator.share({ title, url });
      return;
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError') return;
  }
  if (!touch) {
    window.dispatchEvent(new CustomEvent(SHARE_EVENT, { detail: { title, url } }));
    return;
  }
  await copyShareLink(url);
}

export async function copyShareLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  } catch {
    toast.error('Не удалось скопировать ссылку');
  }
}
