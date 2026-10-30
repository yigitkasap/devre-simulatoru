// Baraj sayfasının üst çubuğundaki kumanda (tasarım v3: B1, B3). Su akışı yalnızca simgedir (▼ ■ ▲;
// adları aria-label ve title ile), yanında ince seviye çubuğu: 6 px iz, dolu kısım mavi, 22 px tutamak.
// Seviye 1–3 izin üstündeki küçük renkli noktalardır (%37,5, %62,5, %87,5); tıklanınca su o seviyeye
// gider. İze tıklamak ya da tutamağı sürüklemek seviyeyi değiştirir (sürüklerken önizleme). Sahnenin
// sol üstündeki doluluk kartı ve sol alttaki "Göster" çipleri de burada.

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { tr } from '../i18n/tr';
import { TANK_PROBE_HEIGHTS, type TankMode } from '../sim/devices/tank';
import { LEVEL_COLORS, type LevelNo, type Stop } from './seviye';
import { AlertIcon, FlowIcon } from './simgeler';

const WATER = '#3a7fc0';
const FLOWS = [
  { mode: 'drain', key: 'drain' },
  { mode: 'stop', key: 'stop' },
  { mode: 'fill', key: 'fill' },
] as const;

/** Su akışı: Boşalt, Durdur, Doldur (üç parçalı tek düğme grubu, yalnızca simge). */
export function AkisDugmeleri({ mode, onFlow, touch = false }: { mode: TankMode; onFlow: (mode: TankMode) => void; touch?: boolean }) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const index = FLOWS.findIndex((f) => f.mode === mode);
    const next = FLOWS[(index + step + FLOWS.length) % FLOWS.length]!;
    onFlow(next.mode);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[FLOWS.indexOf(next)]?.focus();
  };
  return (
    <div id="kumanda" role="radiogroup" aria-label={tr.baraj.kumanda.flow} onKeyDown={onKeyDown} className="flex shrink-0 gap-0.5 rounded-[10px] bg-face p-[3px]">
      {FLOWS.map((f) => {
        const on = f.mode === mode;
        const label = tr.baraj.kumanda[f.key];
        return (
          <button
            key={f.mode}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={`${label} (${tr.baraj.kumanda.keys[f.key]})`}
            tabIndex={on ? 0 : -1}
            onClick={() => onFlow(f.mode)}
            className={`flex items-center justify-center rounded-lg ${touch ? 'h-11 w-11' : 'h-9 w-[42px]'} ${
              on ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(29,39,51,.15)]' : 'text-ink-2 hover:bg-panel/60'
            }`}
          >
            <FlowIcon kind={f.key} size={f.key === 'stop' ? 12 : 14} />
          </button>
        );
      })}
    </div>
  );
}

/** İnce seviye çubuğu: iz, dolu kısım, seviye noktaları ve tutamak (role="slider"). */
export function SeviyeCubugu({
  level,
  onPreview,
  onCommit,
  onGoTo,
  touch = false,
  className = '',
}: {
  level: number;
  onPreview: (level: number | null) => void;
  onCommit: (level: number) => void;
  onGoTo: (stop: Stop) => void;
  touch?: boolean;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const valueAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return level;
    return Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    handleRef.current?.focus({ preventScroll: true });
    drag.current = e.pointerId;
    onPreview(valueAt(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current !== e.pointerId) return;
    onPreview(valueAt(e.clientX));
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current !== e.pointerId) return;
    drag.current = null;
    onCommit(Math.round(valueAt(e.clientX)));
    onPreview(null);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    let next: number | null = null;
    if (e.key in steps) next = Math.round(level) + steps[e.key]!;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(Math.min(100, Math.max(0, next)));
  };
  const pct = Math.min(100, Math.max(0, level));
  const dot = touch ? 'h-11 w-11' : 'h-6 w-6';
  return (
    <div
      className={`relative h-11 shrink-0 cursor-pointer touch-none ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={trackRef} className="absolute inset-x-3 top-0 bottom-0">
        <div className="absolute inset-x-0 top-[19px] h-1.5 rounded-full bg-line" />
        <div className="absolute top-[19px] left-0 h-1.5 rounded-full" style={{ width: `${pct}%`, background: WATER }} />
        {([1, 2, 3] as const).map((k) => {
          const colors = LEVEL_COLORS[k as LevelNo];
          const label = tr.baraj.levelStop(k, TANK_PROBE_HEIGHTS[k]!);
          return (
            <button
              key={k}
              type="button"
              aria-label={label}
              title={label}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onGoTo(k)}
              className={`absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${dot}`}
              style={{ left: `${TANK_PROBE_HEIGHTS[k]}%` }}
            >
              <span className="block h-3 w-3 rounded-full border-2 border-white" style={{ background: colors.badge, boxShadow: `0 0 0 1px ${colors.text}` }} />
            </button>
          );
        })}
        <div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label={tr.baraj.handle}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level)}
          aria-valuetext={tr.baraj.handleText(Math.round(level))}
          onKeyDown={onKeyDown}
          className={`group absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none ${touch ? 'h-11 w-11' : 'h-[22px] w-[22px]'}`}
          style={{ left: `${pct}%` }}
        >
          {/* Dokunmatikte 44 px'lik alanın ortasında 22 px'lik tutamak. */}
          <span className="block h-[22px] w-[22px] rounded-full border-[3px] border-accent bg-panel shadow-[0_1px_4px_rgba(29,39,51,.25)] group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2" />
        </div>
      </div>
    </div>
  );
}

type AlertKind = 'danger' | 'warning' | 'normal' | 'none';

/** Doluluk kartının çerçevesi ve simgenin halesi (durum ayrıca simgenin biçiminde ve aria-label'da). */
const CARD_TONES: Record<AlertKind, { border: string; halo: string }> = {
  none: { border: 'var(--color-line-2)', halo: 'var(--color-panel-2)' },
  normal: { border: 'var(--color-ok-line)', halo: 'var(--color-ok-soft)' },
  warning: { border: 'var(--color-warn-line)', halo: 'var(--color-warn-soft)' },
  danger: { border: 'var(--color-danger-line)', halo: 'var(--color-danger-soft)' },
};

/**
 * Sahnenin sol üstünde tek büyük değer: doluluk oranı. Yanındaki işaret ve çerçeve durumun rengini taşır;
 * işaretin biçimi de durumu söyler (renk tek başına anlam taşımaz). Durum metni ekranda yazmaz, kartın
 * aria-label'ındadır.
 */
export function DolulukKarti({ level, alert, size }: { level: number; alert: AlertKind; size: 'big' | 'desk' | 'phone' }) {
  const tone = CARD_TONES[alert];
  const cls = {
    big: { box: 'top-6 left-6 gap-4 rounded-2xl py-3.5 pr-6 pl-5', icon: 26, text: 'text-[48px]', halo: 5 },
    desk: { box: 'top-6 left-6 gap-3.5 rounded-2xl py-3 pr-[22px] pl-[18px]', icon: 22, text: 'text-[40px]', halo: 5 },
    phone: { box: 'top-3 left-3 gap-2.5 rounded-xl py-2 pr-3.5 pl-2.5', icon: 18, text: 'text-[26px]', halo: 3 },
  }[size];
  return (
    <div
      role="status"
      aria-live="off"
      aria-label={tr.baraj.levelCard(Math.round(level), tr.baraj.alert[alert])}
      className={`pointer-events-none absolute z-10 flex items-center border-2 bg-panel shadow-[0_6px_20px_rgba(29,39,51,0.08)] ${cls.box}`}
      style={{ borderColor: tone.border }}
    >
      <span className="flex shrink-0 rounded-full" style={{ boxShadow: `0 0 0 ${cls.halo}px ${tone.halo}`, background: tone.halo }}>
        <AlertIcon kind={alert} size={cls.icon} />
      </span>
      <span className={`font-mono leading-none font-semibold tabular ${cls.text}`}>{tr.baraj.handleText(Math.round(level))}</span>
    </div>
  );
}

/** Sahnenin sol altında isteğe bağlı katmanlar: İyonlar, Yüzde ölçeği (açılıp kapanan çipler). */
export function GosterCipleri({ ions, scale, onIons, onScale, touch = false }: { ions: boolean; scale: boolean; onIons: () => void; onScale: () => void; touch?: boolean }) {
  const chip = (on: boolean) =>
    `rounded-full border px-3.5 text-small font-medium shadow-sm ${touch ? 'h-11' : 'h-9'} ${on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-panel/95 text-ink hover:bg-panel'}`;
  return (
    <div role="group" aria-label={tr.baraj.show} className="absolute bottom-6 left-6 z-10 flex items-center gap-2 rounded-full border border-line bg-panel/85 p-1 pl-3.5 shadow-sm backdrop-blur-sm">
      <span className="text-small font-semibold text-ink">{tr.baraj.show}:</span>
      <button type="button" aria-pressed={ions} onClick={onIons} className={chip(ions)}>
        {tr.baraj.showIons}
      </button>
      <button type="button" aria-pressed={scale} onClick={onScale} className={chip(scale)}>
        {tr.baraj.showScale}
      </button>
    </div>
  );
}
