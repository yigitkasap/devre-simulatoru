// 3B tezgâh görünümü (tembel yüklenir: three yalnızca bu görünüm açılınca indirilir).

import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';
import type { SimFrame } from '../editor/useSimulation';
import { BenchScene, type BenchCallbacks, type CameraView } from './scene';

/** Kamera isteği: bir görünüme sığdır ya da bir parçaya yaklaş (n arttıkça uygulanır). */
export type CameraRequest = { readonly n: number } & ({ readonly view: CameraView } | { readonly view: 'part'; readonly partId: string });

export interface Bench3DProps {
  readonly doc: CircuitDoc;
  readonly frame: SimFrame | null;
  readonly active: boolean;
  /** Simülasyon ilerliyor (duraklatılınca akım noktaları durur). */
  readonly running: boolean;
  readonly selection: readonly string[];
  /** Üstünde bir çekmece/pencere açık: dokunuşlar ona gitsin. */
  readonly overlayOpen: boolean;
  readonly camera: CameraRequest;
  /** Yakınlaştırma isteği: factor < 1 yaklaşır (n arttıkça uygulanır). */
  readonly zoom: { readonly n: number; readonly factor: number };
  /** Akım noktaları ve yönleri (Ayarlar). */
  readonly dots: boolean;
  readonly electronFlow: boolean;
  /** Etiket katmanı: içindeki [data-anchor] öğeleri sahnece konumlanır. */
  readonly overlay: HTMLElement | null;
  /** Koyu tema: masa ve arka plan koyu. */
  readonly dark: boolean;
  readonly callbacks: BenchCallbacks;
}

export default function Bench3D(props: Bench3DProps) {
  const { doc, frame, active, running, selection, overlayOpen, camera, zoom, dots, electronFlow, overlay, dark } = props;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BenchScene | null>(null);
  const cb = useRef(props.callbacks);
  cb.current = props.callbacks;

  useEffect(() => {
    const s = new BenchScene(host.current!, {
      onSelect: (id) => cb.current.onSelect(id),
      onToggle: (id) => cb.current.onToggle(id),
      onKnob: (id, position, done) => cb.current.onKnob(id, position, done),
      onCamera: () => cb.current.onCamera?.(),
    });
    scene.current = s;
    (window as unknown as { __tezgah?: BenchScene }).__tezgah = s;
    return () => {
      s.dispose();
      scene.current = null;
      delete (window as unknown as { __tezgah?: BenchScene }).__tezgah;
    };
  }, []);

  useEffect(() => scene.current?.setTheme(dark), [dark]);
  useEffect(() => scene.current?.setOverlay(overlay), [overlay]);
  useEffect(() => scene.current?.setDoc(doc), [doc]);
  useEffect(() => scene.current?.setDots(dots, electronFlow, running), [dots, electronFlow, running]);
  useEffect(() => scene.current?.setFrame(frame, active), [frame, active]);
  useEffect(() => scene.current?.setSelection(selection), [selection]);
  useEffect(() => scene.current?.setInteractive(!overlayOpen), [overlayOpen]);
  useEffect(() => {
    if (camera.n === 0) return;
    if (camera.view === 'part') scene.current?.focus(camera.partId);
    else scene.current?.fit(camera.view);
  }, [camera]);
  useEffect(() => {
    if (zoom.n > 0) scene.current?.zoom(zoom.factor);
  }, [zoom]);

  return <div ref={host} className="absolute inset-0 overflow-hidden" role="img" aria-label={tr.bench.label} />;
}
