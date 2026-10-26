import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { btnClass } from '@/redesign/lib/button-styles';
import { useQrDataUrl } from './useQrDataUrl';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Абсолютный канонический адрес страницы */
  url: string;
  fileName: string;
  title?: string;
};

const ExpertQrDialog = ({ open, onOpenChange, url, fileName, title = 'QR-код страницы' }: Props) => {
  const dataUrl = useQrDataUrl(url, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] rounded-sheet">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Для визитки, ролика или презентации. Ведёт на постоянный адрес страницы.</DialogDescription>
        </DialogHeader>
        <div className="mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-card border border-border bg-white p-2">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR-код: ${url}`} className="h-full w-full" />
          ) : (
            <div className="h-full w-full animate-pulse rounded-lg bg-muted" />
          )}
        </div>
        <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
        <a
          href={dataUrl ?? undefined}
          download={fileName}
          aria-disabled={!dataUrl}
          className={btnClass('primary', { className: 'w-full' + (dataUrl ? '' : ' pointer-events-none opacity-50') })}
        >
          <Download />
          Скачать PNG
        </a>
      </DialogContent>
    </Dialog>
  );
};

export default ExpertQrDialog;
