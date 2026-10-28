// Simülasyon hızı ve durumu (v3'te üst çubukta; telefonda durum satırının sayfasında): hazır hızlar,
// ince ayar, "Osiloskoba göre" ve hızın yazımı (×1, ×0,5, ×2·10⁻⁵); durum işareti.

import { useId, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { tr } from '../i18n/tr';
import { formatNumber, formatSI } from '../sim/units';
import { HintText } from './HintStrip';
import type { SimStatus } from './useSimulation';

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

/** Durum işareti: renk tek başına okunmasın diye biçimi de değişir (daire · iki çubuk · kare). */
export function StatusMark({ status }: { status: SimStatus }) {
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

/**
 * Hız seçenekleri: hazır değerler (Gerçek zaman, Yavaş, Çok yavaş, Ağır çekim, Osiloskoba göre) ve ince
 * ayar. Masaüstünde hız penceresinde, telefonda Hız sayfasında (dokunmatik boyutlar).
 */
export function SpeedOptions({
  speed,
  scopeSpeed,
  onSpeed,
  groupRef,
  touch = false,
}: {
  speed: number;
  scopeSpeed: number | null;
  onSpeed: (speed: number) => void;
  groupRef?: RefObject<HTMLDivElement | null>;
  touch?: boolean;
}) {
  const fineId = useId();
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
    <>
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
              className={`flex items-center justify-between gap-3 rounded-md px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                touch ? 'min-h-12 text-[15px]' : 'py-2'
              } ${checked ? 'bg-accent-soft font-medium text-accent-ink' : disabled ? 'text-muted' : 'text-ink hover:bg-panel-2'}`}
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
        <label htmlFor={fineId} className="text-label font-semibold text-muted">
          {tr.sim.fineSpeed}
        </label>
        <input
          id={fineId}
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
          className={`w-full accent-accent ${touch ? 'h-11' : ''}`}
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
        {/* Hız değiştikçe cümle bir ya da iki satır olabilir: iki satırlık sabit yükseklik, pencere
            sürgü sürüklenirken büyüyüp sürgüyü imlecin altından kaydırmasın. */}
        <p className="h-[2.9em] overflow-hidden text-small leading-[1.45]">
          <HintText text={tr.sim.speedSentence(speedTime(speed))} />
        </p>
      </div>
    </>
  );
}
