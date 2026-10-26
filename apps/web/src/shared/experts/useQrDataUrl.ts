import { useEffect, useState } from 'react';

/** QR для визитки, ролика, презентации. Генерируется в браузере, библиотека грузится по требованию. */
export function useQrDataUrl(url: string, enabled: boolean, width = 640): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(url, { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#20282D', light: '#FFFFFF' } }).then(
        (u) => {
          if (!cancelled) setDataUrl(u);
        },
      ),
    );
    return () => {
      cancelled = true;
    };
  }, [url, enabled, width]);
  return dataUrl;
}
