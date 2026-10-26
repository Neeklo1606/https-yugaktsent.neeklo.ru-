import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ResidentialComplex } from '@/redesign/data/types';
import { formatPriceFrom, isPriceHidden, PRICE_ON_REQUEST } from '@/redesign/lib/display-price';
import { buildComplexMarkerDescriptors } from '@/redesign/lib/map-marker-cache';
import type { MarkerZoomMode } from '@/redesign/lib/map-marker-layout';
import { panMapToCoords, useMapClusterLayer } from '@/redesign/hooks/useMapClusterLayer';
import { MapPin, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import MapUnavailableNotice from '@/redesign/components/MapUnavailableNotice';
import MapDevOverlay from '@/redesign/components/MapDevOverlay';
import MapPopupActions from '@/redesign/components/MapPopupActions';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import { parseApiBlockId } from '@/shared/hooks/useFavorites';
import type { ConsultationContext } from '@/redesign/lib/conversion-cta';
import { useMapBbox } from '@/redesign/hooks/useMapBbox';
import { useProductionViewportMap } from '@/redesign/hooks/useProductionViewportMap';
import { useShadowViewportRender } from '@/redesign/hooks/useShadowViewportRender';
import { useViewportBlocksExperimental } from '@/redesign/hooks/useViewportBlocksExperimental';
import { filterByBbox } from '@/redesign/lib/bbox-serialization';
import { viewportMarkersToResidentialComplexes } from '@/redesign/lib/viewport-blocks-source';
import {
  isMapViewportProductionEnabled,
  isViewportExperimentalEnabled,
  isViewportShadowRenderEnabled,
} from '@/redesign/lib/viewport-feature-flag';

declare global {
  interface Window { ymaps: any; }
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;

interface Props {
  complexes: ResidentialComplex[];
  regionId?: number | null;
  regionCenter?: [number, number] | null;
  activeSlug?: string | null;
  onSelect?: (slug: string | null) => void;
  height?: string;
  compact?: boolean;
  filterSearchParams?: URLSearchParams;
}

function getAptCount(c: ResidentialComplex) {
  if (c.listingCount != null) return c.listingCount;
  return c.buildings.reduce((s, b) => s + b.apartments.filter(a => a.status === 'available').length, 0);
}

const MapSearch = ({ complexes, activeSlug, onSelect, height = '70vh', compact, regionCenter, regionId, filterSearchParams }: Props) => {
  const fillParent = Boolean(compact) || height === '100%';
  const mapRef = useRef<HTMLDivElement>(null);
  const { ready, failure } = useYandexMapsReady();
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultContext, setConsultContext] = useState<ConsultationContext | null>(null);

  const viewportProduction = isMapViewportProductionEnabled();
  const viewportExperimental = isViewportExperimentalEnabled();
  const shadowRender = isViewportShadowRenderEnabled();

  const [effectiveComplexes, setEffectiveComplexes] = useState(complexes);

  useEffect(() => {
    if (!viewportProduction) setEffectiveComplexes(complexes);
  }, [viewportProduction, complexes]);

  const buildDescriptors = useCallback(
    (mode: MarkerZoomMode) => buildComplexMarkerDescriptors(effectiveComplexes, mode),
    [effectiveComplexes],
  );

  /** Сколько ЖК реально можно поставить на карту */
  const plottableCount = useMemo(
    () => effectiveComplexes.filter((c) => c.hasCoords !== false).length,
    [effectiveComplexes],
  );

  const clusterExtra = useMemo(() => ({ clusterOpenBalloonOnClick: false }), []);

  const { mapInstance } = useMapClusterLayer({
    layerKind: 'blocks',
    buildDescriptors,
    activeId: activeSlug,
    ready,
    mapRef,
    onSelect,
    clusterPreset: 'islands#invertedBlueClusterIcons',
    clusterExtra,
    defaultCenter: DEFAULT_CENTER,
    defaultZoom: DEFAULT_ZOOM,
    regionCenter,
    clickMode: 'select',
  });

  const mapBbox = useMapBbox(mapInstance, ready);

  const productionViewport = useProductionViewportMap({
    kind: 'blocks',
    enabled: viewportProduction,
    regionId: regionId ?? undefined,
    bbox: mapBbox,
    filterSearchParams,
  });

  useEffect(() => {
    if (!viewportProduction) return;
    if (productionViewport.status === 'ready' && productionViewport.markers.length > 0) {
      setEffectiveComplexes(
        viewportMarkersToResidentialComplexes(
          productionViewport.markers as import('@/redesign/lib/viewport-map-types').ViewportBlockMarker[],
        ),
      );
    } else if (productionViewport.status === 'fallback') {
      setEffectiveComplexes(complexes);
    }
  }, [viewportProduction, productionViewport.status, productionViewport.markers, complexes]);

  const { result: viewportResult } = useViewportBlocksExperimental({
    enabled: viewportExperimental && !viewportProduction,
    regionId: regionId ?? undefined,
    bbox: mapBbox,
    legacyComplexes: complexes,
    filterSearchParams,
  });

  const legacyInBboxIds = useMemo(() => {
    if (!mapBbox) return [];
    const points = complexes.map((c) => ({
      id: c.slug,
      lat: c.coords[0],
      lng: c.coords[1],
    }));
    return filterByBbox(points, mapBbox).map((p) => p.id);
  }, [complexes, mapBbox]);

  const shadowViewportPoints = useMemo(
    () =>
      viewportResult?.data.map((m) => ({
        id: m.slug,
        coords: [m.lat, m.lng] as [number, number],
      })) ?? [],
    [viewportResult],
  );

  useShadowViewportRender({
    enabled: shadowRender && viewportExperimental && viewportResult != null,
    mapInstance,
    ready,
    layerKind: 'blocks',
    viewportPoints: shadowViewportPoints,
    legacyInBboxIds,
  });

  const activeComplex = useMemo(
    () => (activeSlug ? effectiveComplexes.find((c) => c.slug === activeSlug) ?? complexes.find((c) => c.slug === activeSlug) : undefined),
    [activeSlug, effectiveComplexes, complexes],
  );

  useEffect(() => {
    if (!activeSlug || !mapInstance.current) return;
    const c = effectiveComplexes.find((x) => x.slug === activeSlug) ?? complexes.find((x) => x.slug === activeSlug);
    if (c) panMapToCoords(mapInstance, c.coords, 14);
  }, [activeSlug, effectiveComplexes, complexes, mapInstance]);

  return (
    <div
      className={cn('relative', fillParent ? 'h-full min-h-0' : '')}
      style={fillParent ? undefined : { height }}
    >
      <MapDevOverlay />
      <div
        ref={mapRef}
        className={cn(
          'h-full w-full rounded-xl border border-border bg-muted',
          fillParent ? 'min-h-0 overflow-hidden' : 'min-h-[300px] overflow-hidden',
        )}
      />
      {!ready && failure ? <MapUnavailableNotice failure={failure} /> : null}
      {ready && complexes.length > 0 && plottableCount === 0 ? (
        <div
          className="pointer-events-none absolute inset-x-4 top-4 z-[6] rounded-xl border border-warning/20 bg-warning-soft/95 px-3 py-2 text-xs text-warning shadow-sm"
          role="status"
        >
          У найденных ЖК не заполнены координаты, поэтому на карте их пока нет. Список справа работает.
        </div>
      ) : null}
      {!ready && !failure ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-muted/80 backdrop-blur-[1px] z-[5]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Загрузка карты…</span>
        </div>
      ) : null}

      {activeComplex && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[320px] z-10 animate-in slide-in-from-bottom-2 duration-200">
          <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <button
              type="button"
              onClick={() => onSelect?.(null)}
              className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <StableMediaFrame
              src={activeComplex.images[0]}
              altContext={activeComplex.name}
              decorative={false}
              aspect="16/9"
              fallback="placeholder"
              loading="eager"
            />
            <div className="p-3 space-y-2">
              <div>
                <h3 className="font-semibold text-sm leading-snug line-clamp-2 pr-6">{activeComplex.name}</h3>
                <p
                  className="text-sm font-bold text-primary mt-1"
                  aria-label={isPriceHidden(activeComplex.priceFrom) ? PRICE_ON_REQUEST : undefined}
                >
                  {formatPriceFrom(activeComplex.priceFrom)}
                </p>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{activeComplex.district} · м. {activeComplex.subway}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{getAptCount(activeComplex)} квартир в продаже</p>
              <MapPopupActions
                detailsHref={`/complex/${activeComplex.slug}`}
                consultationContext={{
                  surface: 'map_complex',
                  source: `map:complex:${activeComplex.slug}`,
                  blockId: parseApiBlockId(activeComplex.id) ?? undefined,
                  contextFooter: `ЖК «${activeComplex.name}» · карта`,
                }}
                onConsultation={(ctx) => {
                  setConsultContext(ctx);
                  setConsultOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <ConsultationFlow open={consultOpen} onOpenChange={setConsultOpen} context={consultContext} />
    </div>
  );
};

export default MapSearch;
