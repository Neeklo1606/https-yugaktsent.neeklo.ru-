import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { MapPin, X } from 'lucide-react';
import { formatDisplayPrice, priceAriaLabel } from '@/redesign/lib/display-price';
import { buildListingMarkerDescriptors } from '@/redesign/lib/map-marker-cache';
import type { MarkerZoomMode } from '@/redesign/lib/map-marker-layout';
import { panMapToCoords, useMapClusterLayer } from '@/redesign/hooks/useMapClusterLayer';
import { Button } from '@/components/ui/button';
import StableMediaFrame from '@/redesign/components/StableMediaFrame';
import MapUnavailableNotice from '@/redesign/components/MapUnavailableNotice';
import MapDevOverlay from '@/redesign/components/MapDevOverlay';
import MapPopupActions from '@/redesign/components/MapPopupActions';
import ConsultationFlow from '@/redesign/components/ConsultationFlow';
import type { ConsultationContext } from '@/redesign/lib/conversion-cta';
import { useMapBbox } from '@/redesign/hooks/useMapBbox';
import { useMapFpsTracker } from '@/redesign/hooks/useMapFpsTracker';
import { useShadowViewportRender } from '@/redesign/hooks/useShadowViewportRender';
import { useProductionViewportMap } from '@/redesign/hooks/useProductionViewportMap';
import { useViewportListingsExperimental } from '@/redesign/hooks/useViewportListingsExperimental';
import { filterByBbox } from '@/redesign/lib/bbox-serialization';
import {
  isMapViewportProductionEnabled,
  isViewportListingsSourceEnabled,
  isViewportListingsTrackingEnabled,
  isViewportShadowRenderEnabled,
} from '@/redesign/lib/viewport-feature-flag';
import { viewportMarkersToListingMapItems } from '@/redesign/lib/viewport-listings-source';
import {
  isMapDebugEnabled,
  recordMarkerClickLatency,
  recordPopupOpenLatency,
  setViewportListingsSourceActive,
} from '@/redesign/lib/map-render-observability';

declare global {
  interface Window { ymaps: any; }
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;

export interface ListingMapItem {
  id: number;
  lat: number | string;
  lng: number | string;
  price: string | number | null;
  title: string | null;
  kind: string;
  address: string | null;
  photoUrl?: string | null;
  slug?: string;
  /** Для карточки в списке: комнатность, площадь, ЖК и срок сдачи */
  rooms?: number | null;
  area?: number | null;
  complexName?: string | null;
  deadline?: string | null;
}

interface Props {
  listings: ListingMapItem[];
  regionId?: number | null;
  regionCenter?: [number, number] | null;
  activeId?: number | null;
  onSelect?: (id: number | null) => void;
  height?: string;
  compact?: boolean;
  filterSearchParams?: URLSearchParams;
}

const ListingsMapSearch = ({
  listings,
  regionId,
  regionCenter,
  activeId,
  onSelect,
  height = '70vh',
  compact,
  filterSearchParams,
}: Props) => {
  const fillParent = Boolean(compact) || height === '100%';
  const mapRef = useRef<HTMLDivElement>(null);
  const { ready, failure } = useYandexMapsReady();

  const viewportProduction = isMapViewportProductionEnabled();
  const viewportListingsSource = isViewportListingsSourceEnabled() || viewportProduction;
  const viewportTracking = isViewportListingsTrackingEnabled() && !viewportProduction;
  const shadowRender = isViewportShadowRenderEnabled();

  const [effectiveMapListings, setEffectiveMapListings] = useState(listings);
  const [selectionBurst, setSelectionBurst] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultContext, setConsultContext] = useState<ConsultationContext | null>(null);

  useEffect(() => {
    setViewportListingsSourceActive(viewportListingsSource);
    return () => setViewportListingsSourceActive(false);
  }, [viewportListingsSource]);

  useEffect(() => {
    if (!viewportListingsSource) {
      setEffectiveMapListings(listings);
    }
  }, [viewportListingsSource, listings]);

  const buildDescriptors = useCallback(
    (mode: MarkerZoomMode) => buildListingMarkerDescriptors(effectiveMapListings, mode),
    [effectiveMapListings],
  );

  const clusterExtra = useMemo(
    () => ({ clusterIconLayout: 'default#pieChart' }),
    [],
  );

  const onSelectSlug = useCallback(
    (id: string | null) => {
      const t0 = isMapDebugEnabled() ? performance.now() : 0;
      onSelect?.(id == null ? null : Number(id));
      if (isMapDebugEnabled()) {
        recordMarkerClickLatency(performance.now() - t0);
      }
    },
    [onSelect],
  );

  const { mapInstance } = useMapClusterLayer({
    layerKind: 'listings',
    buildDescriptors,
    activeId: activeId != null ? String(activeId) : null,
    ready,
    mapRef,
    onSelect: onSelectSlug,
    clusterPreset: 'islands#blueCircleClusterIcons',
    clusterExtra,
    defaultCenter: DEFAULT_CENTER,
    defaultZoom: DEFAULT_ZOOM,
    regionCenter,
    clickMode: 'toggle',
    // Масштаб по меткам (≥1), а не фиксированный зум вокруг центра региона
    fitToMarkers: true,
  });

  const mapBbox = useMapBbox(mapInstance, ready);
  useMapFpsTracker(mapInstance, ready, selectionBurst);

  const productionViewport = useProductionViewportMap({
    kind: 'listings',
    enabled: viewportProduction,
    regionId: regionId ?? undefined,
    bbox: mapBbox,
    filterSearchParams,
  });

  useEffect(() => {
    if (!viewportProduction) return;
    if (productionViewport.status === 'ready' && productionViewport.markers.length > 0) {
      setEffectiveMapListings(
        viewportMarkersToListingMapItems(
          productionViewport.markers as import('@/redesign/lib/viewport-map-types').ViewportListingMarker[],
        ),
      );
    } else if (productionViewport.status === 'fallback') {
      setEffectiveMapListings(listings);
    }
  }, [viewportProduction, productionViewport.status, productionViewport.markers, listings]);

  const { result: viewportResult } = useViewportListingsExperimental({
    enabled: viewportTracking,
    regionId: regionId ?? undefined,
    bbox: mapBbox,
    legacyListings: listings,
    filterSearchParams,
  });

  useEffect(() => {
    if (!viewportListingsSource) return;
    if (viewportResult?.source === 'prototype-api') {
      setEffectiveMapListings(viewportMarkersToListingMapItems(viewportResult.data));
      return;
    }
    setEffectiveMapListings(listings);
  }, [viewportListingsSource, viewportResult, listings]);

  const legacyInBboxIds = useMemo(() => {
    if (!mapBbox) return [];
    const points = listings
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        id: String(l.id),
        lat: parseFloat(String(l.lat)),
        lng: parseFloat(String(l.lng)),
      }));
    return filterByBbox(points, mapBbox).map((p) => p.id);
  }, [listings, mapBbox]);

  const shadowViewportPoints = useMemo(
    () =>
      viewportResult?.data.map((m) => ({
        id: String(m.id),
        coords: [m.lat, m.lng] as [number, number],
      })) ?? [],
    [viewportResult],
  );

  useShadowViewportRender({
    enabled: shadowRender && viewportTracking && viewportResult != null,
    mapInstance,
    ready,
    layerKind: 'listings',
    viewportPoints: shadowViewportPoints,
    legacyInBboxIds,
  });

  const active = useMemo(() => {
    if (activeId == null) return undefined;
    return (
      listings.find((l) => l.id === activeId) ??
      effectiveMapListings.find((l) => l.id === activeId)
    );
  }, [activeId, listings, effectiveMapListings]);

  useEffect(() => {
    if (activeId == null) return;
    setSelectionBurst(true);
    const burstTimer = setTimeout(() => setSelectionBurst(false), 400);
    const t0 = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isMapDebugEnabled()) {
          recordPopupOpenLatency(performance.now() - t0);
        }
      });
    });
    return () => clearTimeout(burstTimer);
  }, [activeId]);

  useEffect(() => {
    if (activeId == null || !mapInstance.current) return;
    const l =
      effectiveMapListings.find((x) => x.id === activeId) ??
      listings.find((x) => x.id === activeId);
    if (l && l.lat && l.lng) {
      panMapToCoords(
        mapInstance,
        [parseFloat(String(l.lat)), parseFloat(String(l.lng))],
        15,
      );
    }
  }, [activeId, listings, effectiveMapListings, mapInstance]);

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

      {active && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[300px] z-10 animate-in slide-in-from-bottom-2 duration-200">
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
              src={active.photoUrl}
              altContext={active.title ?? active.address ?? `Объект #${active.id}`}
              decorative={false}
              aspect="16/9"
              fallback="logo"
              loading="eager"
            />
            <div className="p-3 space-y-2">
              <div>
                <p className="font-semibold text-sm leading-snug line-clamp-2 pr-6">
                  {active.title ?? active.address ?? `Объект #${active.id}`}
                </p>
                <p
                  className="text-sm font-bold text-primary mt-1"
                  aria-label={priceAriaLabel(formatDisplayPrice(active.price))}
                >
                  {formatDisplayPrice(active.price)}
                </p>
              </div>
              {active.address && active.title ? (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{active.address}</span>
                </div>
              ) : null}
              <MapPopupActions
                detailsHref={`/listing/${active.id}`}
                consultationContext={{
                  surface: 'map_listing',
                  source: `map:listing:${active.id}`,
                  listingId: active.id,
                  contextFooter: active.title ?? active.address ?? undefined,
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

export default ListingsMapSearch;
