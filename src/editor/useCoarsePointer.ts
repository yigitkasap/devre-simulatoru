// Birincil işaretçi parmak mı (telefon, tablet)? Dokunmatikte üzerine gelme (hover) yoktur;
// bazı etkileşimler buna göre değişir (ör. kütüphaneden parça doğrudan eklenir).

import { useEffect, useState } from 'react';

const QUERY = '(pointer: coarse)';

/** iOS 13 ve öncesindeki eski MediaQueryList arayüzü. */
interface LegacyMediaQueryList {
  addListener(listener: () => void): void;
  removeListener(listener: () => void): void;
}

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return undefined;
    const update = () => setCoarse(mq.matches);
    // iOS 13 ve öncesinde MediaQueryList.addEventListener yok.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    const legacy = mq as unknown as LegacyMediaQueryList;
    legacy.addListener(update);
    return () => legacy.removeListener(update);
  }, []);
  return coarse;
}
