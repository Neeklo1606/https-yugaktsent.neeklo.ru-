import AdminFeedLinks from '@/admin/pages/AdminFeedLinks';
import DataQualityPanel from '@/admin/components/DataQualityPanel';

/**
 * «Фиды и источники»: список фидов хранится в базе (feed_links) и именно его читает
 * служба синхронизации. Раньше здесь был демонстрационный список в localStorage браузера.
 */
export default function AdminDataSources() {
  return (
    <div>
      <AdminFeedLinks />
      <div id="quality" className="max-w-6xl px-6 pb-8">
        <DataQualityPanel />
      </div>
    </div>
  );
}
