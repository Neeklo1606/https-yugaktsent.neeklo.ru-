/** Метка демо-режима: dev-сервер читает боевой API, но ничего в него не пишет (staging-guard.ts) */
export const IS_STAGING_READONLY = import.meta.env.VITE_STAGING_READONLY === '1';

const StagingBadge = () => {
  if (!IS_STAGING_READONLY) return null;
  return (
    <div
      role="status"
      title="Демо-режим: данные боевого сайта только для чтения, заявки и правки никуда не отправляются"
      className="pointer-events-none fixed left-2 bottom-mobile-nav mb-2 z-[100] rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning shadow-sm"
    >
      Демо
    </div>
  );
};

export default StagingBadge;
