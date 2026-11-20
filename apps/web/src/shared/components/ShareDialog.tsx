import { Copy, Link2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { copyShareLink } from '@/lib/share-page';

type Props = { open: boolean; onOpenChange: (v: boolean) => void; title: string; url: string };

/** «Поделиться» на компьютере: мессенджеры и копирование ссылки (как у Аякса). */
export default function ShareDialog({ open, onOpenChange, title, url }: Props) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}`, icon: Send },
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, icon: Link2 },
    { label: 'ВКонтакте', href: `https://vk.com/share.php?url=${u}&title=${t}`, icon: Link2 },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Поделиться</DialogTitle>
          <DialogDescription className="line-clamp-2">{title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {links.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenChange(false)}
              className="flex h-11 items-center gap-3 rounded-lg border border-border px-4 text-[15px] font-medium transition-colors hover:border-primary/40 hover:bg-muted"
            >
              <Icon className="h-4 w-4 text-primary" aria-hidden />
              {label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => {
              void copyShareLink(url);
              onOpenChange(false);
            }}
            className="flex h-11 items-center gap-3 rounded-lg border border-border px-4 text-left text-[15px] font-medium transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <Copy className="h-4 w-4 text-primary" aria-hidden />
            Скопировать ссылку
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
