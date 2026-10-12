// Birincil işaretçi parmak mı (telefon, tablet)? Dokunmatikte üzerine gelme (hover) yoktur;
// bazı etkileşimler buna göre değişir (ör. kütüphaneden parça doğrudan eklenir).

import { useEffect, useState } from 'react';

const QUERY = '(pointer: coarse)';

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return undefined;
    const update = () => setCoarse(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarse;
}
