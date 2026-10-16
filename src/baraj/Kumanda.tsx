// Kumanda şeridi: Su akışı (Boşalt / Durdur / Doldur), su seviyesi göstergesi (yüzde ve yön),
// kaydırıcı (1-2-3 prob işaretleriyle; yalnızca masaüstünde), Kuru / Seviye 1–3 düğmeleri, Başa al ve
// Ayarlar. Masaüstünde düğmelerde klavye ipuçları (projeksiyonda gizli). Telefonda iki satır, yatay
// telefonda tek satır; Ayarlar telefonda ⋯ menüsündedir.

import { forwardRef, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from '../editor/icons';
import { TANK_PROBE_HEIGHTS, type TankMode } from '../sim/devices/tank';
import { type LevelNo, type Stop } from './seviye';
import { FlowIcon, LevelBadge, ResetIcon } from './simgeler';

export type KumandaVariant = 'desktop' | 'tablet' | 'phone' | 'landscape';

const WATER = '#2f7fc4';
const FLOWS: ReadonlyArray<{ readonly mode: TankMode; readonly icon: 'drain' | 'stop' | 'fill'; readonly key: 'drain' | 'stop' | 'fill' }> = [
  { mode: 'drain', icon: 'drain', key: 'drain' },
  { mode: 'stop', icon: 'stop', key: 'stop' },
  { mode: 'fill', icon: 'fill', key: 'fill' },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="rounded-[4px] border border-current px-1 font-mono text-[11px] leading-4 font-medium opacity-65">
      {children}
    </span>
  );
}

/** Su akışı seçimi: radyo grubu, oklarla da seçilir. */
function FlowGroup({
  mode,
  onFlow,
  variant,
  big,
  keys,
}: {
  mode: TankMode;
  onFlow: (mode: TankMode) => void;
  variant: KumandaVariant;
  big: boolean;
  keys: boolean;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const index = FLOWS.findIndex((f) => f.mode === mode);
    const next = FLOWS[(index + step + FLOWS.length) % FLOWS.length]!;
    onFlow(next.mode);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[FLOWS.indexOf(next)]?.focus();
  };
  const size =
    variant === 'desktop'
      ? big
        ? 'h-[52px] min-w-[124px] px-3.5 text-[17px]'
        : 'h-[52px] min-w-[118px] px-3 text-[15px]'
      : variant === 'tablet'
        ? 'h-[52px] w-24 text-[15px]'
        : variant === 'phone'
          ? 'h-[52px] min-w-0 flex-1 text-[15px]'
          : 'h-11 min-w-0 flex-1 text-[15px]';
  return (
    <div role="radiogroup" aria-label={tr.baraj.kumanda.flow} onKeyDown={onKeyDown} className={`flex gap-1.5 ${variant === 'phone' || variant === 'landscape' ? 'min-w-0 flex-1' : ''}`}>
      {FLOWS.map((f) => {
        const on = f.mode === mode;
        return (
          <button
            key={f.mode}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onFlow(f.mode)}
            className={`inline-flex items-center justify-center gap-2 rounded-[10px] border px-2.5 font-semibold whitespace-nowrap ${size} ${
              on ? 'border-[#2f7fc4] bg-[#2f7fc4] text-white' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
            }`}
          >
            <FlowIcon kind={f.icon} size={big ? 15 : 14} />
            {tr.baraj.kumanda[f.key]}
            {keys && <Kbd>{tr.baraj.kumanda.keys[f.key]}</Kbd>}
          </button>
        );
      })}
    </div>
  );
}

/** Su seviyesi: yüzde ve yön (yükseliyor / iniyor / sabit). */
function LevelReadout({ level, direction, variant, big }: { level: number; direction: 'rising' | 'falling' | 'steady'; variant: KumandaVariant; big: boolean }) {
  return (
    <div className={`flex shrink-0 flex-col gap-0.5 ${variant === 'tablet' ? 'w-[94px]' : 'w-[108px]'}`}>
      <span className={`font-semibold text-muted ${big ? 'text-[16px]' : 'text-label'}`}>{tr.baraj.kumanda.level}</span>
      <span className={`font-mono leading-none font-semibold tabular ${big ? 'text-[34px]' : variant === 'tablet' ? 'text-[26px]' : 'text-[30px]'}`}>
        {`%${Math.round(level)}`}
      </span>
      <span className={`inline-flex items-center gap-1.5 font-medium text-accent-ink ${big ? 'text-[16px]' : variant === 'tablet' ? 'text-label' : 'text-body'}`}>
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
          {direction === 'rising' && <path d="M7 2.5L12.5 11H1.5Z" fill="currentColor" />}
          {direction === 'falling' && <path d="M7 11.5L12.5 3H1.5Z" fill="currentColor" />}
          {direction === 'steady' && <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" />}
        </svg>
        {tr.baraj.kumanda[direction]}
      </span>
    </div>
  );
}

/** Seviye kaydırıcısı: iz, dolu kısım, prob işaretleri (numaralı), tutamak. Sürüklerken önizleme. */
function LevelSlider({ level, onPreview, onCommit }: { level: number; onPreview: (v: number | null) => void; onCommit: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const valueAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return level;
    return Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
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
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={tr.baraj.handle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level)}
      aria-valuetext={tr.baraj.handleText(Math.round(level))}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      className="group relative h-[42px] w-full shrink-0 cursor-pointer touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div ref={trackRef} className="absolute inset-x-3 top-0 bottom-0">
        <div className="absolute inset-x-0 top-6 h-3 rounded-full bg-face shadow-[inset_0_0_0_1px_var(--color-line-2)]" />
        <div className="absolute top-6 left-0 h-3 rounded-full" style={{ width: `${pct}%`, background: WATER }} />
        {([1, 2, 3] as const).map((k) => (
          <div key={k} className="absolute top-0" style={{ left: `${TANK_PROBE_HEIGHTS[k]}%` }}>
            <span className="absolute top-0 -translate-x-1/2">
              <LevelBadge level={k as LevelNo} size={16} />
            </span>
            <span className="absolute top-[21px] h-[18px] w-0.5 -translate-x-1/2 rounded-[1px] bg-ink" />
          </div>
        ))}
        <div
          className="absolute top-[18px] h-6 w-6 -translate-x-1/2 rounded-full border-[2.5px] bg-panel shadow-[0_1px_4px_rgba(29,39,51,.3)]"
          style={{ left: `${pct}%`, borderColor: WATER }}
        />
      </div>
    </div>
  );
}

/** Kuru / Seviye 1–3: suyun bulunduğu bant basılı görünür. */
function StopButtons({ band, onGoTo, variant, big }: { band: Stop; onGoTo: (stop: Stop) => void; variant: KumandaVariant; big: boolean }) {
  const h = variant === 'desktop' ? (big ? 'h-11' : 'h-9') : variant === 'tablet' ? 'h-11' : 'h-11';
  const text = big ? 'text-[16px]' : variant === 'phone' ? 'text-[13px]' : 'text-body';
  return (
    <div role="group" aria-label={tr.baraj.kumanda.goTo} className={`flex gap-1.5 ${variant === 'desktop' ? 'w-full' : 'min-w-0 flex-1'}`}>
      {([0, 1, 2, 3] as const).map((stop) => {
        const cur = stop === band;
        return (
          <button
            key={stop}
            type="button"
            aria-pressed={cur}
            onClick={() => onGoTo(stop)}
            className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-1.5 whitespace-nowrap ${h} ${text} ${
              cur ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 bg-panel font-medium text-ink hover:bg-panel-2'
            }`}
          >
            {stop > 0 && <LevelBadge level={stop as LevelNo} size={variant === 'phone' ? 15 : 16} />}
            {stop === 0 ? tr.baraj.dry : tr.baraj.level(stop)}
          </button>
        );
      })}
    </div>
  );
}

export interface KumandaProps {
  readonly variant: KumandaVariant;
  /** Projeksiyon: yazılar büyük, klavye ipuçları yok. */
  readonly big: boolean;
  /** Klavye ipuçları gösterilsin mi (tek tuş kısayolları açık, masaüstü). */
  readonly keys: boolean;
  readonly mode: TankMode;
  readonly level: number;
  readonly direction: 'rising' | 'falling' | 'steady';
  readonly band: Stop;
  readonly onFlow: (mode: TankMode) => void;
  readonly onGoTo: (stop: Stop) => void;
  readonly onPreview: (level: number | null) => void;
  readonly onCommit: (level: number) => void;
  readonly onReset: () => void;
  /** Masaüstü ve tablette Ayarlar düğmesi. */
  readonly settings?: { readonly open: boolean; readonly onToggle: () => void; readonly buttonRef: Ref<HTMLButtonElement> };
}

export const Kumanda = forwardRef<HTMLDivElement, KumandaProps>(function Kumanda(
  { variant, big, keys, mode, level, direction, band, onFlow, onGoTo, onPreview, onCommit, onReset, settings },
  ref,
) {
  const showKeys = keys && variant === 'desktop' && !big;
  const reset =
    variant === 'desktop' ? (
      <button
        type="button"
        onClick={onReset}
        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-line-2 bg-panel px-3.5 font-medium hover:bg-panel-2 ${big ? 'text-[16px]' : 'text-body'}`}
      >
        <ResetIcon />
        {tr.baraj.kumanda.reset}
        {showKeys && <Kbd>{tr.baraj.kumanda.keys.reset}</Kbd>}
      </button>
    ) : (
      <button
        type="button"
        onClick={onReset}
        aria-label={tr.baraj.kumanda.reset}
        title={tr.baraj.kumanda.reset}
        className={`inline-flex shrink-0 items-center justify-center rounded-[10px] border border-line-2 bg-panel hover:bg-panel-2 ${variant === 'landscape' ? 'h-11 w-[52px]' : 'h-[52px] w-[52px]'}`}
      >
        <ResetIcon size={20} />
      </button>
    );
  const settingsButton = settings && (
    <button
      ref={settings.buttonRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={settings.open}
      onClick={settings.onToggle}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3.5 ${variant === 'tablet' ? 'h-[52px]' : 'h-11'} ${big ? 'text-[16px]' : 'text-body'} ${
        settings.open ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 bg-panel font-medium hover:bg-panel-2'
      }`}
    >
      <Icon name="settings" className="h-[18px] w-[18px]" />
      {tr.baraj.kumanda.settings}
    </button>
  );

  if (variant === 'phone') {
    return (
      <div
        ref={ref}
        id="kumanda"
        tabIndex={-1}
        role="group"
        aria-label={tr.baraj.kumanda.label}
        className="flex shrink-0 flex-col gap-2 border-t border-line-2 bg-panel px-3 pt-2 outline-none"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      >
        <StopButtons band={band} onGoTo={onGoTo} variant={variant} big={false} />
        <div className="flex gap-2">
          <FlowGroup mode={mode} onFlow={onFlow} variant={variant} big={false} keys={false} />
          {reset}
        </div>
      </div>
    );
  }
  if (variant === 'landscape') {
    return (
      <div
        ref={ref}
        id="kumanda"
        tabIndex={-1}
        role="group"
        aria-label={tr.baraj.kumanda.label}
        className="flex h-14 shrink-0 items-center gap-3 border-t border-line-2 bg-panel outline-none"
        style={{ paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }}
      >
        <StopButtons band={band} onGoTo={onGoTo} variant={variant} big={false} />
        <FlowGroup mode={mode} onFlow={onFlow} variant={variant} big={false} keys={false} />
        {reset}
      </div>
    );
  }
  if (variant === 'tablet') {
    return (
      <div
        ref={ref}
        id="kumanda"
        tabIndex={-1}
        role="group"
        aria-label={tr.baraj.kumanda.label}
        className="flex h-[84px] shrink-0 items-center gap-3.5 border-t border-line bg-panel px-3.5 outline-none"
      >
        <FlowGroup mode={mode} onFlow={onFlow} variant={variant} big={big} keys={false} />
        <LevelReadout level={level} direction={direction} variant={variant} big={big} />
        <StopButtons band={band} onGoTo={onGoTo} variant={variant} big={big} />
        {reset}
        {settingsButton}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      id="kumanda"
      tabIndex={-1}
      role="group"
      aria-label={tr.baraj.kumanda.label}
      className={`flex shrink-0 items-center border-t border-line bg-panel px-5 outline-none ${big ? 'h-24 gap-[18px]' : 'h-[104px] gap-6'}`}
    >
      <div className="flex shrink-0 flex-col gap-1.5">
        {!big && <span className="text-label font-semibold text-muted">{tr.baraj.kumanda.flow}</span>}
        <FlowGroup mode={mode} onFlow={onFlow} variant={variant} big={big} keys={showKeys} />
      </div>
      <div className="h-16 w-px shrink-0 bg-line" />
      <LevelReadout level={level} direction={direction} variant={variant} big={big} />
      <div className="flex w-[560px] min-w-[360px] shrink flex-col gap-1.5">
        <LevelSlider level={level} onPreview={onPreview} onCommit={onCommit} />
        <StopButtons band={band} onGoTo={onGoTo} variant={variant} big={big} />
      </div>
      <span className="min-w-0 flex-1" />
      {reset}
      {settingsButton}
    </div>
  );
});
