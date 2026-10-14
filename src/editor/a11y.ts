// Erişilebilirlik yardımcıları (N02): canlı ölçümler ekran okuyucuya en çok saniyede bir okunur.

import { useEffect, useRef, useState } from 'react';

/** Metni en çok `interval` ms'de bir günceller (aria-live bölgeleri için; son değer kaçırılmaz). */
export function useThrottledText(text: string, interval = 1000): string {
  const [shown, setShown] = useState(text);
  const last = useRef(0);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    const wait = interval - (performance.now() - last.current);
    if (wait <= 0) {
      last.current = performance.now();
      setShown(text);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      last.current = performance.now();
      setShown(latest.current);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [text, interval]);
  return shown;
}
