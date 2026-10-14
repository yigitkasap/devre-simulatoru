// Simülasyon çubuğu (tasarım: C-SimCubugu): Oynat / Duraklat / Durdur, durum, simülasyon zamanı, hız
// ve akım yönü seçeneği; sağda bilgi ya da hata satırı. Telefonda (6. aşamaya kadar) satırlara taşar.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { tr, type DiagnosticContext } from '../i18n/tr';
import { formatNumber, formatSI } from '../sim/units';
import { HintText } from './HintStrip';
import { Icon, type IconName } from './icons';
import { Rich, plainText } from './Rich';
import type { SimNotice, SimStatus } from './useSimulation';

export interface SimBarProps {
  readonly status: SimStatus;
  readonly time: number;
  readonly speed: number;
  readonly notice: SimNotice;
  /** Simülasyon istenen hıza yetişemiyor. */
  readonly lagging: boolean;
  readonly electronFlow: boolean;
  readonly diagnosticContext: DiagnosticContext;
  /** "Osiloskoba göre" hızı (bir ekran taraması ≈ 0,2 s); devrede osiloskop yoksa null. */
  readonly scopeSpeed: number | null;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStop: () => void;
  readonly onSpeed: (speed: number) => void;
  readonly onElectronFlow: (on: boolean) => void;
}

/**
 * Hız logaritmiktir: ×10⁻⁶ … ×1. Yüksek frekanslı sinyaller (fonksiyon üreteci 2 MHz'e kadar)
 * yalnızca çok yavaşlatılınca izlenebilir.
 */
const MIN_SPEED_LOG = -6;
const SNAP_SPEEDS = [1, 0.5, 0.1, 0.05, 0.01, 1e-3, 1e-4, 1e-5, 1e-6];
const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Hızın yazımı: ×1, ×0,5, ×0,01; daha küçüklerde ×2·10⁻⁵ gibi. */
export function speedLabel(speed: number): string {
  if (speed >= 0.01) return `×${formatNumber(speed, speed >= 0.1 ? 2 : 3).replace(/0+$/, '').replace(/,$/, '')}`;
  const exp = Math.floor(Math.log10(speed) + 1e-9);
  const mantissa = speed / 10 ** exp;
  const power = String(exp).replace(/./g, (c) => SUPERSCRIPT[c] ?? c);
  const m = Math.abs(mantissa - 1) < 0.05 ? '' : `${formatNumber(mantissa, 1).replace(/,0$/, '')}·`;
  return `×${m}10${power}`;
}

/** Gerçek 1 saniyede geçen simülasyon zamanı: "250 ms", "25 µs". */
export function speedTime(speed: number): string {
  return formatSI(speed, 's', { digits: 2, trim: true });
}

/** Hızın açıklaması: "gerçek zaman" ya da "1 s’de 25 µs". */
export function speedNote(speed: number): string {
  return Math.abs(speed - 1) < 1e-9 ? tr.sim.realtime : tr.sim.speedNote(speedTime(speed));
}

const near = (a: number, b: number) => Math.abs(Math.log10(a / b)) < 0.013;

export function SimBar(props: SimBarProps) {
  const { status, notice } = props;
  const active = status !== 'stopped';
  const running = status === 'running';

  let message: { text: string; tone: 'error' | 'info' } | null = null;
  if (notice?.kind === 'error') {
    const { detail } = tr.diagnostics.describe(notice.diagnostic, props.diagnosticContext);
    message = { text: `${tr.sim.cannotRun} ${detail}`, tone: 'error' };
  } else if (notice?.kind === 'stopped-by-edit') {
    message = { text: tr.sim.stoppedByEdit, tone: 'info' };
  } else if (active && props.lagging) {
    message = { text: tr.sim.lagging, tone: 'error' };
  } else if (active) {
    message = { text: props.electronFlow ? tr.sim.electronNote : tr.sim.conventionalNote, tone: 'info' };
  }

  return (
    <div
      role="region"
      aria-label={tr.sim.region}
      className="flex min-h-[52px] shrink-0 items-center gap-2.5 border-t border-line bg-panel px-3 text-sm max-desk:flex-wrap max-desk:gap-x-2 max-desk:gap-y-1 max-desk:px-2 max-desk:py-1.5"
    >
      <div className="flex items-center gap-2.5 max-desk:gap-1.5">
        <button
          type="button"
          onClick={running ? undefined : props.onPlay}
          aria-pressed={running}
          className={`flex h-9 items-center gap-1.5 rounded-md border pr-3.5 pl-3 font-semibold text-white ${
            running ? 'border-ok-ink bg-ok-ink' : 'border-ok bg-ok hover:brightness-110'
          }`}
        >
          <Icon name="play" />
          {tr.sim.play}
        </button>
        <SimButton icon="pause" label={tr.sim.pause} onClick={props.onPause} disabled={!running} />
        <SimButton icon="stop" label={tr.sim.stop} title={tr.sim.stopTitle} onClick={props.onStop} disabled={!active} />
      </div>
      <span className="mx-1 h-6 w-px bg-line max-desk:hidden" aria-hidden="true" />

      <span role="status" className="flex min-w-[118px] items-center gap-2 font-semibold max-desk:min-w-0">
        <StatusMark status={status} />
        <span className="max-desk:sr-only">{tr.sim.status[status]}</span>
      </span>
      <span className="text-small whitespace-nowrap text-muted">
        {tr.sim.time}:{' '}
        <span className="font-mono font-semibold text-ink tabular">{formatSI(active ? props.time : 0, 's', { digits: 4 })}</span>
      </span>

      <SpeedControl speed={props.speed} scopeSpeed={props.scopeSpeed} onSpeed={props.onSpeed} />

      <label className="flex cursor-pointer items-center gap-2 px-1 text-small whitespace-nowrap">
        <input
          type="checkbox"
          checked={props.electronFlow}
          onChange={(e) => props.onElectronFlow(e.target.checked)}
          className="h-[18px] w-[18px] accent-accent"
        />
        {tr.sim.electronFlow}
      </label>

      {message && (
        <p
          className={`flex min-w-0 flex-1 items-center justify-end gap-2 text-small max-desk:basis-full max-desk:justify-start ${
            message.tone === 'error' ? 'text-danger' : 'text-muted'
          }`}
          role={message.tone === 'error' ? 'alert' : undefined}
          title={plainText(message.text)}
        >
          <Icon name="info" className="h-5 w-5 shrink-0" />
          <span className="truncate desk:whitespace-nowrap">
            <Rich text={message.text} />
          </span>
        </p>
      )}
    </div>
  );
}

function SimButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  title?: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 font-medium text-ink enabled:hover:bg-panel-2 disabled:text-stopped max-desk:w-10 max-desk:justify-center max-desk:px-0"
    >
      <Icon name={icon} />
      <span className="max-desk:sr-only">{label}</span>
    </button>
  );
}

/** Durum işareti: renk tek başına okunmasın diye biçimi de değişir (daire · iki çubuk · kare). */
function StatusMark({ status }: { status: SimStatus }) {
  if (status === 'running') return <i className="block h-2.5 w-2.5 rounded-full bg-ok" aria-hidden="true" />;
  if (status === 'paused')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="1" y="0" width="3" height="10" fill="var(--color-paused)" />
        <rect x="6" y="0" width="3" height="10" fill="var(--color-paused)" />
      </svg>
    );
  return <i className="block h-2.5 w-2.5 bg-stopped" aria-hidden="true" />;
}

/** Hız düğmesi ve hazır seçenekli pencere (tasarım: DS-Bilesen → Hız denetimi). */
function SpeedControl({
  speed,
  scopeSpeed,
  onSpeed,
}: {
  speed: number;
  scopeSpeed: number | null;
  onSpeed: (speed: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    // Açılınca seçili seçeneğe (yoksa ilkine) odaklan.
    const radios = groupRef.current?.querySelectorAll<HTMLElement>('[role=radio]');
    (groupRef.current?.querySelector<HTMLElement>('[aria-checked=true]') ?? radios?.[0])?.focus();
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const presets: Array<{ label: string; value: number | null; note: string }> = [
    { label: tr.sim.speedPresets.realtime, value: 1, note: tr.sim.speedNote(speedTime(1)) },
    { label: tr.sim.speedPresets.slow, value: 0.1, note: tr.sim.speedNote(speedTime(0.1)) },
    { label: tr.sim.speedPresets.verySlow, value: 1e-3, note: tr.sim.speedNote(speedTime(1e-3)) },
    { label: tr.sim.speedPresets.slowMotion, value: 1e-6, note: tr.sim.speedNote(speedTime(1e-6)) },
    { label: tr.sim.speedPresets.scope, value: scopeSpeed, note: scopeSpeed === null ? tr.sim.scopeSweepMissing : tr.sim.scopeSweep },
  ];
  // "Osiloskoba göre", başka bir hazır değerle çakışırsa o seçili görünür.
  const checkedIndex = presets.findIndex((p) => p.value !== null && near(p.value, speed));

  const onRadioKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]:not([aria-disabled=true])')];
    const index = radios.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    radios[(index + step + radios.length) % radios.length]?.click();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tr.sim.speedTitle}
        className={`flex h-9 items-center gap-2 rounded-md border border-line-2 px-2.5 font-medium whitespace-nowrap ${
          open ? 'bg-accent-soft' : 'bg-panel hover:bg-panel-2'
        }`}
      >
        <Icon name="speed" />
        {tr.sim.speed}
        <span className="font-mono text-small font-semibold">{speedLabel(speed)}</span>
        <span className="text-small font-normal text-muted max-desk:hidden">{speedNote(speed)}</span>
        <Icon name="chevronUp" className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={tr.sim.speedDialog}
          className="absolute bottom-full left-0 z-[60] mb-2 w-[300px] rounded-lg border border-line bg-panel p-1.5 shadow-md"
        >
          <div ref={groupRef} role="radiogroup" aria-label={tr.sim.speedDialog} onKeyDown={onRadioKeys} className="flex flex-col">
            {presets.map((preset, i) => {
              const checked = i === checkedIndex;
              const disabled = preset.value === null;
              return (
                <button
                  key={preset.label}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={disabled || undefined}
                  tabIndex={checked || (checkedIndex < 0 && i === 0) ? 0 : -1}
                  onClick={() => preset.value !== null && onSpeed(preset.value)}
                  className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    checked ? 'bg-accent-soft font-medium text-accent-ink' : disabled ? 'text-muted' : 'text-ink hover:bg-panel-2'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className={`text-small ${preset.value !== null && preset.label !== tr.sim.speedPresets.scope ? 'font-mono' : ''} ${checked ? '' : 'text-muted'}`}>
                    {preset.note}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex flex-col gap-2 border-t border-line px-2.5 pt-3 pb-1.5">
            <label htmlFor="speed-fine" className="text-label font-semibold text-muted">
              {tr.sim.fineSpeed}
            </label>
            <input
              id="speed-fine"
              type="range"
              min={0}
              max={-MIN_SPEED_LOG}
              step={0.01}
              value={Math.log10(speed) - MIN_SPEED_LOG}
              aria-valuetext={`${speedLabel(speed)} · ${speedNote(speed)}`}
              onChange={(e) => {
                const value = 10 ** (Number(e.target.value) + MIN_SPEED_LOG);
                // Yuvarlak değerlere yakınken tam değere yapış.
                const snapped = SNAP_SPEEDS.find((s) => Math.abs(Math.log10(value / s)) < 0.03);
                onSpeed(snapped ?? value);
              }}
              className="w-full accent-accent"
            />
            <div className="relative h-4 font-mono text-[11px] text-muted" aria-hidden="true">
              {[
                ['10⁻⁶', 0],
                ['10⁻⁴', 2],
                ['10⁻³', 3],
                ['0,01', 4],
                ['×1', 6],
              ].map(([label, pos]) => (
                <span
                  key={label}
                  className="absolute top-0"
                  style={{ left: `${(Number(pos) / 6) * 100}%`, transform: `translateX(-${(Number(pos) / 6) * 100}%)` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="text-small">
              <HintText text={tr.sim.speedSentence(speedTime(speed))} />
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
