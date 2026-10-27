// 3B tezgâh görünümü (tembel yüklenir: three yalnızca bu görünüm açılınca indirilir).

import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';
import type { SimFrame } from '../editor/useSimulation';
import { BenchScene, type BenchCallbacks } from './scene';

export interface Bench3DProps {
  readonly doc: CircuitDoc;
  readonly frame: SimFrame | null;
  readonly active: boolean;
  readonly selection: readonly string[];
  /** Üstünde bir çekmece/pencere açık: dokunuşlar ona gitsin. */
  readonly overlayOpen: boolean;
  /** Arttıkça kamera devreyi yeniden sığdırır; `top`: üstten bakış. */
  readonly fitRequest: { readonly n: number; readonly top: boolean };
  readonly callbacks: BenchCallbacks;
}

export default function Bench3D({ doc, frame, active, selection, overlayOpen, fitRequest, callbacks }: Bench3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BenchScene | null>(null);
  const cb = useRef(callbacks);
  cb.current = callbacks;

  useEffect(() => {
    const s = new BenchScene(host.current!, {
      onSelect: (id) => cb.current.onSelect(id),
      onToggle: (id) => cb.current.onToggle(id),
      onKnob: (id, position, done) => cb.current.onKnob(id, position, done),
    });
    scene.current = s;
    (window as unknown as { __tezgah?: BenchScene }).__tezgah = s;
    return () => {
      s.dispose();
      scene.current = null;
      delete (window as unknown as { __tezgah?: BenchScene }).__tezgah;
    };
  }, []);

  useEffect(() => scene.current?.setDoc(doc), [doc]);
  useEffect(() => scene.current?.setFrame(frame, active), [frame, active]);
  useEffect(() => scene.current?.setSelection(selection), [selection]);
  useEffect(() => scene.current?.setInteractive(!overlayOpen), [overlayOpen]);
  useEffect(() => {
    if (fitRequest.n > 0) scene.current?.fit(fitRequest.top);
  }, [fitRequest]);

  return <div ref={host} className="absolute inset-0 overflow-hidden" role="img" aria-label={tr.bench.label} />;
}
