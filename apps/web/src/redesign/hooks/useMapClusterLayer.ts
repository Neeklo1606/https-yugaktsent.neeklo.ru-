import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { markerIconShape, zoomToMarkerMode, type MarkerZoomMode } from '@/redesign/lib/map-marker-layout';
import {
  getCachedMarkerLayoutClass,
  getMarkerLayoutCacheSize,
  markerLayerSignature,
  type MapMarkerDescriptor,
} from '@/redesign/lib/map-marker-cache';
import {
  isMapDebugEnabled,
  recordClusterRebuild,
  recordLayoutCacheSize,
  recordSelectionUpdate,
  resetMapRenderStats,
  setMapRenderMode,
  type MapLayerKind,
} from '@/redesign/lib/map-render-observability';

declare global {
  interface Window { ymaps: any; }
}

type Options = {
  layerKind: MapLayerKind;
  buildDescriptors: (mode: MarkerZoomMode) => MapMarkerDescriptor[];
  activeId: string | null | undefined;
  ready: boolean;
  mapRef: React.RefObject<HTMLDivElement | null>;
  onSelect?: (id: string | null) => void;
  clusterPreset: string;
  clusterExtra?: Record<string, unknown>;
  defaultCenter: [number, number];
  defaultZoom?: number;
  regionCenter?: [number, number] | null;
  clickMode?: 'select' | 'toggle';
  /**
   * Подогнать масштаб под метки (bounds), когда они впервые появились и после смены региона.
   * Дальше карту двигает только пользователь — иначе подгрузка меток по видимой области спорила бы с ним.
   */
  fitToMarkers?: boolean;
};

/** Ближе этого масштаба при подгонке не подходим (одна метка — не до уровня подъезда) */
const FIT_MAX_ZOOM = 15;

const DEFAULT_ZOOM = 11;

/**
 * Shared Yandex cluster lifecycle: signature-gated full rebuilds + isolated selection updates.
 */
export function useMapClusterLayer({
  layerKind,
  buildDescriptors,
  activeId,
  ready,
  mapRef,
  onSelect,
  clusterPreset,
  clusterExtra,
  defaultCenter,
  defaultZoom = DEFAULT_ZOOM,
  regionCenter,
  clickMode = 'select',
  fitToMarkers = false,
}: Options) {
  const fitDoneRef = useRef(false);
  const mapInstance = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const placemarksRef = useRef<Map<string, any>>(new Map());
  const descriptorsByIdRef = useRef<Map<string, MapMarkerDescriptor>>(new Map());
  const prevSignatureRef = useRef<string>('');
  const prevActiveRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const clickModeRef = useRef(clickMode);
  const [markerMode, setMarkerMode] = useState<MarkerZoomMode>(() => zoomToMarkerMode(defaultZoom));
  const markerModeRef = useRef(markerMode);

  onSelectRef.current = onSelect;
  clickModeRef.current = clickMode;
  markerModeRef.current = markerMode;

  const descriptors = useMemo(
    () => buildDescriptors(markerMode),
    [buildDescriptors, markerMode],
  );
  const layerSignature = useMemo(
    () => markerLayerSignature(markerMode, descriptors),
    [markerMode, descriptors],
  );

  const applyPlacemarkActive = useCallback((id: string, isActive: boolean) => {
    const pm = placemarksRef.current.get(id);
    const desc = descriptorsByIdRef.current.get(id);
    if (!pm || !desc || !window.ymaps) return;
    pm.options.set(
      'iconLayout',
      getCachedMarkerLayoutClass(window.ymaps, markerModeRef.current, desc.label, isActive),
    );
  }, []);

  useEffect(() => {
    resetMapRenderStats(layerKind);
  }, [layerKind]);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstance.current) return;
    mapInstance.current = new window.ymaps.Map(mapRef.current, {
      center: regionCenter ?? defaultCenter,
      zoom: defaultZoom,
      controls: ['zoomControl'],
    });
    mapInstance.current.events.add('boundschange', () => {
      const nextZoom = mapInstance.current?.getZoom?.();
      if (typeof nextZoom !== 'number') return;
      const prevMode = markerModeRef.current;
      const nextMode = zoomToMarkerMode(nextZoom);
      setMarkerMode((prev) => {
        if (prev === nextMode) return prev;
        setMapRenderMode(nextMode, prevMode);
        return nextMode;
      });
    });
  }, [ready, regionCenter, defaultCenter, defaultZoom, mapRef]);

  useEffect(() => {
    // Новый регион — метки другого города: подгоняем масштаб заново
    fitDoneRef.current = false;
    if (!mapInstance.current || !regionCenter) return;
    // Метки уже стоят (центр региона пришёл позже) — масштаб по ним, а не по центру
    if (fitToMarkers && clustererRef.current && placemarksRef.current.size > 0) {
      fitDoneRef.current = fitMapToClusterer(mapInstance.current, clustererRef.current, placemarksRef.current.size);
      return;
    }
    mapInstance.current.setCenter(regionCenter);
  }, [regionCenter?.[0], regionCenter?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMapRenderMode(markerMode);
  }, [markerMode]);

  useEffect(() => {
    if (!mapInstance.current || !ready) return;
    if (layerSignature === prevSignatureRef.current && clustererRef.current) return;

    const t0 = isMapDebugEnabled() ? performance.now() : 0;
    const map = mapInstance.current;
    const prevActive = activeId ?? null;

    if (clustererRef.current) {
      map.geoObjects.remove(clustererRef.current);
      clustererRef.current = null;
    }
    placemarksRef.current.clear();
    descriptorsByIdRef.current.clear();

    if (descriptors.length === 0) {
      prevSignatureRef.current = layerSignature;
      prevActiveRef.current = prevActive;
      if (isMapDebugEnabled()) {
        recordClusterRebuild(layerKind, 0, performance.now() - t0, 'empty');
      }
      return;
    }

    const clusterer = new window.ymaps.Clusterer({
      preset: clusterPreset,
      groupByCoordinates: false,
      clusterDisableClickZoom: false,
      ...clusterExtra,
    });

    const placemarks: any[] = [];

    descriptors.forEach((d) => {
      const isActive = d.id === prevActive;
      descriptorsByIdRef.current.set(d.id, d);
      const layout = getCachedMarkerLayoutClass(window.ymaps, markerMode, d.label, isActive);
      const pm = new window.ymaps.Placemark(d.coords, {}, {
        iconLayout: layout,
        iconShape: markerIconShape(markerMode),
      });
      pm.events.add('click', () => {
        const currentlyActive = d.id === prevActiveRef.current;
        if (clickModeRef.current === 'toggle') {
          onSelectRef.current?.(currentlyActive ? null : d.id);
        } else {
          onSelectRef.current?.(d.id);
        }
      });
      placemarksRef.current.set(d.id, pm);
      placemarks.push(pm);
    });

    clusterer.add(placemarks);
    map.geoObjects.add(clusterer);
    clustererRef.current = clusterer;

    if (fitToMarkers && !fitDoneRef.current) {
      fitDoneRef.current = fitMapToClusterer(map, clusterer, descriptors.length);
    }
    prevSignatureRef.current = layerSignature;
    prevActiveRef.current = prevActive;

    if (isMapDebugEnabled()) {
      recordClusterRebuild(
        layerKind,
        descriptors.length,
        performance.now() - t0,
        'signature',
        1,
      );
      recordLayoutCacheSize(getMarkerLayoutCacheSize());
    }
  }, [layerSignature, descriptors, ready, markerMode, layerKind, clusterPreset, clusterExtra, fitToMarkers]);

  useEffect(() => {
    if (!ready || !clustererRef.current) return;
    const next = activeId ?? null;
    const prev = prevActiveRef.current;
    if (next === prev) return;

    const t0 = isMapDebugEnabled() ? performance.now() : 0;
    let swaps = 0;
    if (prev) {
      applyPlacemarkActive(prev, false);
      swaps += 1;
    }
    if (next) {
      applyPlacemarkActive(next, true);
      swaps += 1;
    }
    prevActiveRef.current = next;

    if (isMapDebugEnabled()) {
      recordSelectionUpdate(performance.now() - t0, swaps);
    }
  }, [activeId, ready, applyPlacemarkActive]);

  return { mapInstance, markerMode };
}

/** Подгонка масштаба под метки кластера; true — подогнали */
function fitMapToClusterer(map: any, clusterer: any, count: number): boolean {
  try {
    if (count === 1) {
      const pm = clusterer.getGeoObjects?.()[0];
      const coords = pm?.geometry?.getCoordinates?.();
      if (!coords) return false;
      map.setCenter(coords, 14);
      return true;
    }
    const bounds = clusterer.getBounds?.();
    if (!bounds) return false;
    void Promise.resolve(map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 48 })).then(() => {
      const z = map.getZoom?.();
      if (typeof z === 'number' && z > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM);
    });
    return true;
  } catch {
    // Карта ещё не готова — останется центр региона
    return false;
  }
}

export function panMapToCoords(
  mapInstance: React.RefObject<any>,
  coords: [number, number],
  zoom: number,
): void {
  if (!mapInstance.current) return;
  mapInstance.current.setCenter(coords, zoom, { duration: 300 });
}
