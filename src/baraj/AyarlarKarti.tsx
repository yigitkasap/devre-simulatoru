// Ayarlar kartı: su ön ayarı (Musluk suyu 5 kΩ / Saf su 1 MΩ), su direnci ve dolma süresi
// adımlayıcıları, Varsayılanlara dön; masaüstünde "Tek tuş kısayolları" anahtarı. Masaüstü ve
// tablette kumandanın Ayarlar düğmesinden yukarı açılır; telefonda alt sayfadır. Dışarı dokununca ya da
// Esc ile kapanır; odak açılınca karta, kapanınca düğmeye döner.

import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from '../editor/icons';
import { Stepper, step125 } from '../editor/RackControls';
import { TANK_DEFAULTS, TANK_LIMITS } from '../sim/devices/tank';
import type { PropValue } from '../sim/netlist';
import { formatSI } from '../sim/units';

export const WATER_PRESETS = { tap: 5e3, pure: 1e6 } as const;

export interface AyarlarKartiProps {
  readonly waterResistance: number;
  readonly fillTime: number;
  readonly onChange: (patch: Record<string, PropValue>) => void;
  readonly onClose: () => void;
  /** Masaüstü: tek tuş kısayolları anahtarı. */
  readonly shortcuts?: { readonly on: boolean; readonly onToggle: () => void };
  readonly variant: 'popover' | 'sheet';
  /** Kartın dışına sayılmayan öğe (Ayarlar düğmesi: ona basmak kartı açıp kapatır). */
  readonly anchor?: HTMLElement | null;
}

export function AyarlarKarti({ waterResistance, fillTime, onChange, onClose, shortcuts, variant, anchor }: AyarlarKartiProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchor]);

  const preset = waterResistance === WATER_PRESETS.tap ? 'tap' : waterResistance === WATER_PRESETS.pure ? 'pure' : null;
  const presets = [
    { key: 'tap' as const, label: tr.baraj.ayarlar.tap, value: formatSI(WATER_PRESETS.tap, 'Ω', { trim: true, digits: 3 }) },
    { key: 'pure' as const, label: tr.baraj.ayarlar.pure, value: formatSI(WATER_PRESETS.pure, 'Ω', { trim: true, digits: 3 }) },
  ];
  const label = 'text-small font-semibold text-muted';
  const note = 'text-[12.5px] text-muted';

  const body = (
    <>
      <div className="flex h-10 items-center">
        <span className="text-[17px] font-semibold">{tr.baraj.ayarlar.title}</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} aria-label={tr.baraj.ayarlar.close} title={tr.baraj.ayarlar.close} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md hover:bg-panel-2">
          <Icon name="close" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="baraj-su" className={label}>
          {tr.baraj.ayarlar.water}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="baraj-su"
          className="flex h-[52px] gap-[3px] rounded-[10px] bg-face p-[3px]"
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            const next = preset === 'tap' ? 'pure' : 'tap';
            onChange({ waterResistance: WATER_PRESETS[next] });
            e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[next === 'tap' ? 0 : 1]?.focus();
          }}
        >
          {presets.map((p) => {
            const on = preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (preset === null && p.key === 'tap') ? 0 : -1}
                onClick={() => onChange({ waterResistance: WATER_PRESETS[p.key] })}
                className={`flex flex-1 flex-col items-center justify-center rounded-[7px] text-body leading-tight font-semibold ${
                  on ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(29,39,51,.18),0_0_0_1px_rgba(29,39,51,.06)]' : 'text-ink-2'
                }`}
              >
                {p.label}
                <span className="font-mono text-label font-normal text-muted">{p.value}</span>
              </button>
            );
          })}
        </div>
        <span className={note}>{tr.baraj.ayarlar.waterNote}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={label}>{tr.baraj.ayarlar.waterResistance}</span>
          <Stepper
            label={tr.baraj.ayarlar.waterResistance}
            text={formatSI(waterResistance, 'Ω', { trim: true, digits: 3 })}
            downLabel={tr.baraj.ayarlar.waterDown}
            upLabel={tr.baraj.ayarlar.waterUp}
            canDown={waterResistance > TANK_LIMITS.minWaterResistance}
            canUp={waterResistance < TANK_LIMITS.maxWaterResistance}
            onStep={(d) => onChange({ waterResistance: step125(waterResistance, d, TANK_LIMITS.minWaterResistance, TANK_LIMITS.maxWaterResistance) })}
            touch
          />
          <span className={note}>{tr.baraj.ayarlar.waterResistanceNote}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={label}>{tr.baraj.ayarlar.fillTime}</span>
          <Stepper
            label={tr.baraj.ayarlar.fillTime}
            text={formatSI(fillTime, 's', { trim: true, digits: 3 })}
            downLabel={tr.baraj.ayarlar.fillDown}
            upLabel={tr.baraj.ayarlar.fillUp}
            canDown={fillTime > TANK_LIMITS.minFillTime}
            canUp={fillTime < TANK_LIMITS.maxFillTime}
            onStep={(d) => onChange({ fillTime: step125(fillTime, d, TANK_LIMITS.minFillTime, TANK_LIMITS.maxFillTime) })}
            touch
          />
          <span className={note}>{tr.baraj.ayarlar.fillTimeNote}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-[#eef0f3] pt-2.5">
        <button
          type="button"
          onClick={() => onChange({ waterResistance: TANK_DEFAULTS.waterResistance, fillTime: TANK_DEFAULTS.fillTime })}
          className="-ml-2 inline-flex h-11 items-center self-start rounded-md px-2 text-body font-medium text-accent-ink hover:bg-accent-soft"
        >
          {tr.baraj.ayarlar.defaults}
        </button>
        {shortcuts && (
          <button
            type="button"
            role="switch"
            aria-checked={shortcuts.on}
            onClick={shortcuts.onToggle}
            className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 text-left hover:bg-panel-2"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body font-medium">{tr.baraj.ayarlar.shortcuts}</span>
              <span className="font-mono text-label text-muted">{tr.baraj.ayarlar.shortcutsNote}</span>
            </span>
            <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${shortcuts.on ? 'bg-accent' : 'bg-line-2'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${shortcuts.on ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </button>
        )}
      </div>
    </>
  );

  if (variant === 'sheet') {
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={tr.baraj.ayarlar.title}
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-full flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line-2 bg-panel px-4 pt-2 pb-3.5 shadow-[0_-6px_24px_rgba(29,39,51,.18)]"
      >
        {body}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={tr.baraj.ayarlar.title}
      className="absolute right-3 z-30 flex w-[372px] flex-col gap-3.5 rounded-[14px] border border-line-2 bg-panel px-4 pt-2.5 pb-3.5 shadow-[0_14px_36px_rgba(29,39,51,.24)]"
      style={{ bottom: 'calc(100% + 10px)' }}
    >
      {body}
      <span aria-hidden="true" className="absolute right-[52px] -bottom-2 h-3.5 w-3.5 rotate-45 border-r border-b border-line-2 bg-panel" />
    </div>
  );
}
