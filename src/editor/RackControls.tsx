// Cihaz ön panellerinin ortak öğeleri (tasarım: DS-Cihaz). Gerçek cihazlara işlevce benzer, hiçbir
// markanın panelini kopyalamaz. Türkçe ad önde; laboratuvarda görülecek panel yazısı yanında küçük
// mono (VOLTS/DIV). Döner düğme çizilmez: kademeli ayar (− değer +), tekerlek ve ↑/↓ tuşları.

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { tr } from '../i18n/tr';

/** Ön panel yazısı: Türkçe ad ve yanında küçük panel yazısı. */
export function PanelLabel({ children, panel, muted = false }: { children: ReactNode; panel?: string; muted?: boolean }) {
  return (
    <span className={`flex items-baseline gap-1.5 text-[11.5px] font-semibold ${muted ? 'text-stopped' : 'text-ink'}`}>
      {children}
      {panel && <small className="font-mono text-[10px] font-medium tracking-wide text-muted">{panel}</small>}
    </span>
  );
}

/**
 * Kademeli ayar: − değer +. Değerin üstünde tekerlek ve ↑/↓ tuşları da adım atar. `onType` verilirse
 * değere tıklayınca yazılabilir alan olur (Enter ya da odak çıkınca uygulanır; geçersizse eski değer).
 */
export function Stepper({
  label,
  text,
  onStep,
  canDown = true,
  canUp = true,
  disabled = false,
  downLabel,
  upLabel,
  downGlyph = '−',
  upGlyph = '+',
  editText,
  onType,
  touch = false,
  outer,
}: {
  /** Erişilebilir ad (ör. "A volt/bölme"). */
  label: string;
  text: string;
  onStep: (direction: 1 | -1) => void;
  canDown?: boolean;
  canUp?: boolean;
  disabled?: boolean;
  downLabel?: string;
  upLabel?: string;
  downGlyph?: string;
  upGlyph?: string;
  /** Yazılabilir alanın başlangıç metni (birimsiz, düzenlenebilir biçim). */
  editText?: string;
  /** Yazılan metni uygular; geçersizse false döner. */
  onType?: (text: string) => boolean;
  /** Telefon: 44 px düğmeler. */
  touch?: boolean;
  /** Dış uçlarda ek düğmeler (frekansta ÷10 ve ×10). */
  outer?: {
    readonly down: { readonly glyph: string; readonly label: string; readonly disabled?: boolean; readonly onClick: () => void };
    readonly up: { readonly glyph: string; readonly label: string; readonly disabled?: boolean; readonly onClick: () => void };
  };
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const valueRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tekerlekle adım (pasif olmayan dinleyici: sayfa kaymasın).
  useEffect(() => {
    const el = valueRef.current;
    if (!el || disabled) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0 && canUp) onStep(1);
      if (e.deltaY > 0 && canDown) onStep(-1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onStep, canUp, canDown, disabled, editing]);

  useEffect(() => {
    if (editing !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing !== null]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (canUp) onStep(1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (canDown) onStep(-1);
    } else if ((e.key === 'Enter' || e.key === ' ') && onType) {
      e.preventDefault();
      setEditing(editText ?? text);
    }
  };

  const commit = () => {
    if (editing === null || !onType) return;
    if (onType(editing)) {
      setEditing(null);
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  const button = (direction: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled || (direction > 0 ? !canUp : !canDown)}
      onClick={() => onStep(direction)}
      aria-label={direction > 0 ? (upLabel ?? tr.rack.increase(label)) : (downLabel ?? tr.rack.decrease(label))}
      className={`flex h-full shrink-0 items-center justify-center bg-step font-semibold text-ink enabled:hover:bg-panel-2 disabled:text-stopped ${
        touch ? 'w-11 text-lg' : 'w-[34px] text-base'
      }`}
    >
      {direction > 0 ? upGlyph : downGlyph}
    </button>
  );
  const outerButton = (side: 'down' | 'up') => {
    const o = outer?.[side];
    if (!o) return null;
    return (
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled || o.disabled}
        onClick={o.onClick}
        aria-label={o.label}
        className={`flex h-full w-11 shrink-0 items-center justify-center bg-face-head font-mono text-small font-semibold text-ink disabled:text-stopped ${
          side === 'down' ? 'border-r border-line' : 'border-l border-line'
        }`}
      >
        {o.glyph}
      </button>
    );
  };

  return (
    <div
      className={`flex items-stretch overflow-hidden border bg-panel ${touch ? 'h-[46px] rounded-[10px]' : 'h-9 rounded-md'} ${
        invalid ? 'border-danger' : 'border-rack-line'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {outerButton('down')}
      {button(-1)}
      {editing !== null ? (
        <input
          ref={inputRef}
          value={editing}
          aria-label={label}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setEditing(e.target.value);
            setInvalid(false);
          }}
          onBlur={() => {
            commit();
            setEditing(null);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setEditing(null);
              setInvalid(false);
            }
          }}
          className={`min-w-0 flex-1 border-x border-line text-center font-mono font-semibold outline-none ${touch ? 'text-base' : 'text-small'}`}
        />
      ) : (
        <span
          ref={valueRef}
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onClick={() => onType && !disabled && setEditing(editText ?? text)}
          title={onType ? tr.rack.typeHint : undefined}
          className={`flex min-w-0 flex-1 items-center justify-center border-x border-line px-1 font-mono font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${touch ? 'text-sm' : 'text-small'} ${
            onType && !disabled ? 'cursor-text' : ''
          }`}
        >
          {text}
        </span>
      )}
      {button(1)}
      {outerButton('up')}
    </div>
  );
}

/** Konum seçici (kuplaj, kip, tetik): seçili konum beyaz ve kabarık. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  touch = false,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; text: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  /** Telefon: 44 px yüksek seçenekler. */
  touch?: boolean;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || disabled) return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + step + options.length) % options.length]!;
    onChange(next.value);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[options.indexOf(next)]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={`flex gap-0.5 bg-seg p-0.5 ${touch ? 'rounded-[10px]' : 'rounded-md'} ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => !checked && onChange(option.value)}
            className={`min-w-0 flex-1 px-1.5 font-semibold whitespace-nowrap ${touch ? 'h-11 rounded-lg text-[13px]' : 'h-8 rounded-[6px] text-label'} ${
              checked ? 'bg-panel text-ink shadow-sm' : 'text-seg-ink hover:bg-panel/40'
            }`}
          >
            {option.text}
          </button>
        );
      })}
    </div>
  );
}

/** Durum lambası (CV, CC): sönükken gri ve soluk yazılı, yanınca parlak ve kalın. */
export function StatusLamp({ on, tone, children }: { on: boolean; tone: 'green' | 'red'; children: ReactNode }) {
  const color = tone === 'green' ? 'var(--color-lamp-on)' : 'var(--color-lamp-cc)';
  return (
    <span
      className={`flex items-center gap-1 font-mono text-[11px] font-semibold ${
        on ? (tone === 'green' ? 'text-ok' : 'text-danger') : 'text-stopped'
      }`}
    >
      <i
        className="block h-[9px] w-[9px] rounded-full"
        style={on ? { background: color, boxShadow: `0 0 6px ${color}` } : { background: 'var(--color-lamp-off)' }}
        aria-hidden="true"
      />
      {children}
      <span className="sr-only">{on ? tr.rack.lampOn : tr.rack.lampOff}</span>
    </span>
  );
}

/** Koyu yeşil sayısal gösterge. */
export function Lcd({ value, unit, size = 'md', label }: { value: string; unit: string; size?: 'lg' | 'md'; label?: string }) {
  return (
    <div
      className={`flex items-baseline justify-end gap-1.5 rounded-md bg-lcd-bg shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)] ${
        size === 'lg' ? 'px-3 py-1.5' : 'px-2 py-1'
      }`}
      role="img"
      aria-label={label ?? `${value} ${unit}`}
    >
      <span className={`font-mono text-lcd-fg tabular ${size === 'lg' ? 'text-[24px] leading-8' : 'text-[18px] leading-6'}`}>{value}</span>
      <span className={`font-mono ${size === 'lg' ? 'text-small text-lcd-fg' : 'text-[11px] text-lcd-dim'}`}>{unit}</span>
    </div>
  );
}

/** Uç jakı: dokununca tuvalde bağlı olduğu uç ve kablolar yanıp söner. */
export function Jack({
  color,
  ring = false,
  name,
  label,
  earthed = false,
  onClick,
}: {
  color: string;
  ring?: boolean;
  name: string;
  label: string;
  earthed?: boolean;
  onClick: () => void;
}) {
  const id = useId();
  return (
    <button type="button" onClick={onClick} aria-labelledby={id} title={label} className="flex flex-col items-center gap-0.5 rounded-md p-0.5 hover:bg-panel/50">
      <svg width="30" height="30" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill={color} stroke={ring ? 'var(--color-earth)' : 'none'} strokeWidth={ring ? 2.5 : 0} />
        <circle cx="22" cy="22" r="8" fill="#0f1713" />
        <circle cx="22" cy="22" r="4" fill="#9aa3ad" />
      </svg>
      <span id={id} className={`font-mono text-[10px] font-semibold ${earthed ? 'text-earth' : 'text-ink'}`}>
        <span className="sr-only">{label}: </span>
        {name}
        {earthed && ' ⏚'}
      </span>
    </button>
  );
}

/** Kanal harfi kutusu (renk her yerde harfle birlikte). */
export function ChannelBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-xs font-mono text-[11px] font-bold text-ink"
      style={{ background: color }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/** 1-2-5 dizisinde bir sonraki/önceki değer (frekans, akım sınırı). */
export function step125(value: number, direction: 1 | -1, min: number, max: number): number {
  const exp = Math.floor(Math.log10(value) + 1e-9);
  const candidates: number[] = [];
  for (let e = exp - 1; e <= exp + 1; e++) for (const m of [1, 2, 5]) candidates.push(m * 10 ** e);
  const sorted = candidates.map((c) => Number(c.toPrecision(6))).sort((a, b) => a - b);
  const next =
    direction > 0 ? sorted.find((c) => c > value * (1 + 1e-9)) : [...sorted].reverse().find((c) => c < value * (1 - 1e-9));
  return Math.min(max, Math.max(min, next ?? value));
}

/** Doğrusal adım (yuvarlanmış), sınırlar içinde. */
export function stepLinear(value: number, direction: 1 | -1, step: number, min: number, max: number): number {
  const next = Math.round((value + direction * step) / step) * step;
  return Math.min(max, Math.max(min, Number(next.toFixed(6))));
}
