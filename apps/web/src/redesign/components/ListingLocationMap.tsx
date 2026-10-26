import { BRAND_PRIMARY_HEX } from '@/redesign/lib/button-styles';
import { useEffect, useRef, useState } from 'react';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { useInViewOnce } from '@/shared/hooks/useInViewOnce';
import { MapPin } from 'lucide-react';

/** Стартовый центр карты — Анапа, рабочая география агентства. */
const DEFAULT_MAP_CENTER = [44.8948, 37.3164];

declare global {
  interface Window { ymaps: any; }
}

interface Props {
  /** Full address string to geocode */
  address: string;
  /** Region / city name prepended when geocoding for better accuracy */
  regionName?: string | null;
  height?: string;
}

/**
 * Shows a Yandex Map with a marker geocoded from the listing address.
 * If geocoding fails, shows the map centered on the region without a marker.
 */
const ListingLocationMap = ({ address, regionName, height = '300px' }: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const inView = useInViewOnce(mapRef);
  const { ready } = useYandexMapsReady({ enabled: inView });
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstance.current) return;

    // Clean address: remove parenthetical district info for better geocoding
    const cleanAddress = address
      .replace(/\s*\([^)]+\)/g, '')
      .trim();
    const fullQuery = [regionName, cleanAddress].filter(Boolean).join(', ');

    // Стартовый вид до того, как геокодер вернёт точку по адресу:
    // Анапа — город, в котором работает агентство.
    const defaultCenter = DEFAULT_MAP_CENTER;

    const map = new window.ymaps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      controls: ['zoomControl', 'fullscreenControl'],
    });
    mapInstance.current = map;

    setGeocodeStatus('loading');

    window.ymaps.geocode(fullQuery, { results: 1, kind: 'house' })
      .then((result: any) => {
        const obj = result.geoObjects.get(0);
        if (!obj) {
          // Try broader geocode without 'house' kind
          return window.ymaps.geocode(fullQuery, { results: 1 });
        }
        return result;
      })
      .then((result: any) => {
        const obj = result.geoObjects.get(0);
        if (!obj) {
          setGeocodeStatus('failed');
          return;
        }
        const coords = obj.geometry.getCoordinates();
        map.setCenter(coords, 15);

        const placemark = new window.ymaps.Placemark(
          coords,
          {
            hintContent: address,
            balloonContent: `<strong>${address}</strong>`,
          },
          {
            preset: 'islands#blueDotIcon',
            iconColor: BRAND_PRIMARY_HEX,
          },
        );
        map.geoObjects.add(placemark);
        setGeocodeStatus('ok');
      })
      .catch(() => {
        setGeocodeStatus('failed');
      });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [ready, address, regionName]);

  if (!ready) {
    return (
      <div
        className="rounded-xl bg-muted/40 flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <MapPin className="w-4 h-4 mr-2 animate-pulse" />
        Загрузка карты…
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-border" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />
      {geocodeStatus === 'failed' && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/80 backdrop-blur text-xs text-muted-foreground border border-border">
          Точный адрес не найден на карте
        </div>
      )}
    </div>
  );
};

export default ListingLocationMap;
