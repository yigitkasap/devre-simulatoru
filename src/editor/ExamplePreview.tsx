// Örnekler penceresindeki kartların küçük şeması: simülasyonsuz CircuitView, kâğıt zemini. Pencereyi
// yavaşlatmasın diye kart görünür olunca çizilir (IntersectionObserver); devre ve bağlantıları bir
// kez hesaplanıp önbellekte kalır, bir kez çizilen şema pencere yeniden açılınca hemen çizilir.

import { memo, useEffect, useRef, useState } from 'react';
import { exampleDoc, type ExampleId } from '../examples';
import { buildConnectivity, type Connectivity } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import { CircuitView } from './CircuitView';
import type { Settings } from './settings';

const cache = new Map<ExampleId, { readonly doc: CircuitDoc; readonly connectivity: Connectivity } | null>();
/** Bir kez görünür olmuş şemalar (pencere yeniden açılınca beklemeden çizilir). */
const seen = new Set<ExampleId>();

function prepared(id: ExampleId) {
  if (!cache.has(id)) {
    const doc = exampleDoc(id);
    cache.set(id, doc ? { doc, connectivity: buildConnectivity(doc) } : null);
  }
  return cache.get(id)!;
}

export const ExamplePreview = memo(function ExamplePreview({
  id,
  height,
  settings,
  className = '',
}: {
  id: ExampleId;
  height: number;
  settings: Pick<Settings, 'resistorStyle' | 'wireScale'>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => seen.has(id));
  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen.add(id);
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, visible]);
  const data = visible ? prepared(id) : null;
  return (
    <div ref={ref} aria-hidden="true" data-preview={visible ? 'drawn' : 'waiting'} className={`pointer-events-none overflow-hidden bg-paper ${className}`} style={{ height }}>
      {data && <CircuitView doc={data.doc} connectivity={data.connectivity} frame={null} settings={settings} label="" className="block h-full w-full p-1.5" />}
    </div>
  );
});
