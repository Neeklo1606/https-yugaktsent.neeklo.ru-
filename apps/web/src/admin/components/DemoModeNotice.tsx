import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isExpertDemoEditingEnabled } from '@/shared/experts/expert-profile';

/**
 * Честная плашка для экранов без backend: что сохраняется, где и что не произойдёт.
 * В ТЗ v3 отдельно требуется не изображать работающую синхронизацию или публикацию.
 */
const DemoModeNotice = ({ className, children }: { className?: string; children?: React.ReactNode }) => {
  const editable = isExpertDemoEditingEnabled();
  return (
    <div className={cn('flex gap-3 rounded-card border border-warning/25 bg-warning-soft p-4 text-sm text-foreground', className)} role="note">
      <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      <div>
        <p className="font-semibold">Демо · ожидает подключения backend</p>
        <p className="mt-1 text-muted-foreground">
          {editable
            ? 'Изменения сохраняются только в этом браузере и видны на публичной странице только вам. На сервер ничего не отправляется.'
            : 'На этом сервере редактирование выключено: сохранять пока некуда. Изменения появятся после подключения API.'}
        </p>
        {children}
      </div>
    </div>
  );
};

export default DemoModeNotice;
