import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { cn } from '@/lib/utils';
import MissingPhotoPlaceholder from '@/redesign/components/MissingPhotoPlaceholder';
import {
  IMAGE_LOGO_SRC,
  IMAGE_PLACEHOLDER,
  getSafeImageUrl,
  imageAltText,
  shouldUseFallbackImage,
} from '@/redesign/lib/image-media';

export type MediaAspect = '16/9' | '4/3' | 'none';
export type MediaFallback = 'branded' | 'logo' | 'placeholder';

type Props = {
  src?: string | null;
  /** Used when decorative=false */
  altContext?: string | null;
  decorative?: boolean;
  aspect?: MediaAspect;
  /** Fixed height utility (popup). When set, aspect ratio class is not applied. */
  fixedHeightClass?: string;
  fallback?: MediaFallback;
  loading?: 'lazy' | 'eager';
  /** Приоритет загрузки обложки: 'high' для первого экрана */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** cover — фото ЖК; contain — планировки квартир целиком */
  fit?: 'cover' | 'contain';
  className?: string;
  imgClassName?: string;
  imgStyle?: CSSProperties;
  onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  /** Фото не загрузилось (битый URL у источника) — родитель может убрать карточку из подборки */
  onImageError?: () => void;
};

function aspectClass(aspect: MediaAspect): string {
  if (aspect === '16/9') return 'aspect-video w-full';
  if (aspect === '4/3') return 'aspect-[4/3] w-full';
  return 'h-full w-full';
}

function FallbackView({ mode, className }: { mode: MediaFallback; className?: string }) {
  if (mode === 'logo') {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-muted', className)}>
        <img
          src={IMAGE_LOGO_SRC}
          alt=""
          className="max-h-[70%] max-w-[70%] object-contain opacity-45"
          aria-hidden="true"
        />
      </div>
    );
  }
  if (mode === 'placeholder') {
    return (
      <img
        src={IMAGE_PLACEHOLDER}
        alt=""
        className={cn('h-full w-full object-cover', className)}
        aria-hidden="true"
      />
    );
  }
  return <MissingPhotoPlaceholder className={cn('h-full w-full', className)} />;
}

const StableMediaFrame = ({
  src,
  altContext,
  decorative = true,
  aspect = '16/9',
  fixedHeightClass,
  fallback = 'branded',
  loading = 'lazy',
  fetchPriority,
  fit = 'cover',
  className,
  imgClassName,
  imgStyle,
  onImageLoad,
  onImageError,
}: Props) => {
  const [useFallback, setUseFallback] = useState(() => shouldUseFallbackImage(src));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setUseFallback(shouldUseFallbackImage(src));
    setLoaded(false);
  }, [src]);

  const containerClass = fixedHeightClass ?? aspectClass(aspect);

  const isContain = fit === 'contain';
  // React 18 не типизирует fetchpriority, но пробрасывает атрибут в DOM как есть.
  const priorityAttrs: Record<string, string> = fetchPriority ? { fetchpriority: fetchPriority } : {};

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden bg-muted',
        containerClass,
        className,
      )}
      aria-busy={!useFallback && !loaded}
    >
      {!useFallback ? (
        <>
          {!loaded ? (
            <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />
          ) : null}
          {isContain ? (
            <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
              <img
                src={getSafeImageUrl(src)}
                alt={imageAltText(altContext, decorative)}
                loading={loading}
                decoding="async"
                onLoad={(e) => {
                  setLoaded(true);
                  onImageLoad?.(e);
                }}
                onError={() => {
                  setUseFallback(true);
                  onImageError?.();
                }}
                style={imgStyle}
                className={cn(
                  'max-h-full max-w-full object-contain transition-opacity duration-200',
                  loaded ? 'opacity-100' : 'opacity-0',
                  imgClassName,
                )}
              />
            </div>
          ) : (
            <img
              src={getSafeImageUrl(src)}
              alt={imageAltText(altContext, decorative)}
              loading={loading}
              decoding="async"
              {...priorityAttrs}
              onLoad={(e) => {
                setLoaded(true);
                onImageLoad?.(e);
              }}
              onError={() => {
                  setUseFallback(true);
                  onImageError?.();
                }}
              style={imgStyle}
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-opacity duration-200',
                loaded ? 'opacity-100' : 'opacity-0',
                imgClassName,
              )}
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0">
          <FallbackView mode={fallback} />
        </div>
      )}
    </div>
  );
};

export default StableMediaFrame;
