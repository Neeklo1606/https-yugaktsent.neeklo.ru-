import { useMemo, useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { RegionRow } from '@/redesign/hooks/useDefaultRegionId';
import RegionPickerPanel from '@/redesign/components/RegionPickerPanel';
import {
  sortRegionsByName,
  regionLabel,
} from '@/redesign/lib/region-picker-utils';

type Props = {
  regions?: RegionRow[];
  selectedRegionId?: number | null;
  onSelect: (regionId: number) => void;
  className?: string;
};

const RegionSelector = ({ regions, selectedRegionId, onSelect, className }: Props) => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const ordered = useMemo(() => sortRegionsByName(regions ?? []), [regions]);
  const selected = ordered.find((r) => r.id === selectedRegionId);

  if (!ordered.length) return null;

  if (ordered.length === 1) {
    return (
      <div className={cn('flex flex-wrap items-center justify-center gap-2 min-w-0 max-w-full', className)}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-medium shadow-sm shrink-0">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
          {regionLabel(ordered[0])}
        </span>
      </div>
    );
  }

  const handleSelect = (id: number) => {
    onSelect(id);
    setOpen(false);
  };

  // Городов присутствия немного — показываем их сразу кнопками, без окна с поиском
  if (ordered.length <= 4) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2 min-w-0 max-w-full', className)} role="group" aria-label="Город">
        {ordered.map((r) => {
          const active = r.id === selectedRegionId;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(r.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors shrink-0',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/40 hover:text-primary',
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {regionLabel(r)}
            </button>
          );
        })}
      </div>
    );
  }

  const picker = (
    <RegionPickerPanel
      regions={ordered}
      selectedRegionId={selectedRegionId}
      onSelect={handleSelect}
      className={isMobile ? 'h-[min(70vh,520px)]' : 'h-[min(60vh,480px)]'}
    />
  );

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2 min-w-0 max-w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors shrink-0 max-w-[min(100%,280px)]',
          'border-border bg-background shadow-sm hover:border-primary/30 hover:bg-muted/40',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
        <span className="truncate">{selected ? regionLabel(selected) : 'Выберите регион'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
      </button>

      {open && isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-4 max-h-[92vh] flex flex-col">
            <SheetHeader className="text-left shrink-0 mb-2">
              <SheetTitle>Регион поиска</SheetTitle>
            </SheetHeader>
            {picker}
          </SheetContent>
        </Sheet>
      ) : null}

      {open && !isMobile ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle>Регион поиска</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6">{picker}</div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
};

export default RegionSelector;
