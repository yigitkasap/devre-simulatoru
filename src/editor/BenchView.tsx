// Şema | 3B geçişi ve 3B tezgâh görünümünün çerçevesi (tembel yüklenir).

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { BenchCallbacks } from '../bench3d/scene';
import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';
import type { SimFrame } from './useSimulation';

const Bench3D = lazy(() => import('../bench3d/Bench3D'));

export type ViewMode = 'schematic' | 'bench';

const VIEW_KEY = 'devre-simulatoru:gorunum';

/** Son seçilen görünüm (yalnızca bu tarayıcıda; devre dosyasına girmez). */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'bench' ? 'bench' : 'schematic';
    } catch {
      return 'schematic';
    }
  });
  return [
    mode,
    (next) => {
      setMode(next);
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        /* özel pencere: hatırlanmaz */
      }
    },
  ];
}

export function ViewToggle({ mode, onChange, touch }: { mode: ViewMode; onChange: (mode: ViewMode) => void; touch: boolean }) {
  const size = touch ? 'h-11 min-w-14 px-3.5 text-sm' : 'h-9 min-w-12 px-3 text-small';
  return (
    <div
      role="group"
      aria-label={tr.bench.viewGroup}
      className="pointer-events-auto absolute top-3 left-3 z-10 flex rounded-lg border border-line-2 bg-panel p-0.5 shadow-sm"
    >
      {(['schematic', 'bench'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={`${size} rounded-md font-semibold ${mode === m ? 'bg-accent text-white' : 'text-ink-2 hover:bg-panel-2'}`}
        >
          {m === 'schematic' ? tr.bench.schematic : tr.bench.bench}
        </button>
      ))}
    </div>
  );
}

export interface BenchViewProps {
  readonly doc: CircuitDoc;
  readonly frame: SimFrame | null;
  readonly active: boolean;
  readonly selection: readonly string[];
  readonly overlayOpen: boolean;
  readonly touch: boolean;
  readonly callbacks: BenchCallbacks;
}

export function BenchView(props: BenchViewProps) {
  const [fit, setFit] = useState({ n: 0, top: false });
  const button = props.touch ? 'h-11 px-3.5 text-sm' : 'h-9 px-3 text-small';
  // Alan kısaysa (cihaz rafı açık, telefon) ipucu sahneyi örtmesin.
  const host = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(true);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoomy(el.clientHeight >= 480 && el.clientWidth >= 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={host} className="absolute inset-0 overflow-hidden bg-[#dfe3e8]">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-small text-muted" role="status">
            {tr.bench.loading}
          </div>
        }
      >
        <Bench3D
          doc={props.doc}
          frame={props.frame}
          active={props.active}
          selection={props.selection}
          overlayOpen={props.overlayOpen}
          fitRequest={fit}
          callbacks={props.callbacks}
        />
      </Suspense>
      <div className="pointer-events-none absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          type="button"
          onClick={() => setFit((f) => ({ n: f.n + 1, top: false }))}
          className={`pointer-events-auto rounded-md border border-line-2 bg-panel font-medium text-ink shadow-sm hover:bg-panel-2 ${button}`}
        >
          {tr.bench.fit}
        </button>
        <button
          type="button"
          onClick={() => setFit((f) => ({ n: f.n + 1, top: true }))}
          className={`pointer-events-auto rounded-md border border-line-2 bg-panel font-medium text-ink shadow-sm hover:bg-panel-2 ${button}`}
        >
          {tr.bench.top}
        </button>
      </div>
      {roomy && (
        <p className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 text-center text-label text-ink-2 [text-shadow:0_1px_0_#fff]">
          {props.touch ? tr.bench.hintTouch : tr.bench.hintMouse}
        </p>
      )}
    </div>
  );
}
