// Defterin (v3) parça kartlarında kullanılan alanlar ve bölümler: özellik alanları (değer Enter'da ya
// da alan odaktan çıkınca uygulanır; geçersizse uygulanmaz ve hata alanın altında kalır), ad alanı,
// kablo ve çoklu seçim. Değer, ad ve anahtar değişiklikleri simülasyonu durdurmaz.

import { useEffect, useId, useState, type ReactNode, type Ref } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, type NumberPropDef, type PropDef } from '../model/catalog';
import type { CircuitDoc, Part } from '../model/types';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import type { PropValue } from '../sim/netlist';
import { formatEditable, formatSI } from '../sim/units';
import { Icon } from './icons';
import { presetLabel, validateLabel, validateNumber, valuePresets } from './propertyForm';
import { PropSlider } from './PropSlider';
import type { Settings } from './settings';
import type { Selection } from './state';
import { useThrottledText } from './a11y';
import { useTouchUi } from './touchUi';
import type { SimFrame, SimStatus } from './useSimulation';

export interface PartPatch {
  readonly label?: string;
  readonly props?: Record<string, PropValue>;
}

export interface InspectTabProps {
  readonly doc: CircuitDoc;
  readonly selection: Selection;
  readonly frame: SimFrame | null;
  readonly status: SimStatus;
  readonly settings: Settings;
  /** Bu sayı artınca seçili parçanın ilk değer alanına odaklanılır (çift tık, Enter). */
  readonly focusRequest: number;
  readonly onUpdatePart: (partId: string, patch: PartPatch) => void;
  /** Kaydırıcı: sürüklerken canlı (geçmişe yazmadan), bırakınca tek geri alma adımı. */
  readonly onSlidePart?: (partId: string, patch: PartPatch, done: boolean) => void;
  readonly onRotate: (partIds: readonly string[]) => void;
  readonly onFlip: (partIds: readonly string[]) => void;
  readonly onDelete: () => void;
  readonly onRepair: (partId: string) => void;
  readonly onSelectPart: (partId: string) => void;
}

/** Ayarları cihaz rafındaki ön panelinde olan parçalar. */
export const RACK_DEVICES: ReadonlySet<string> = new Set(['oscilloscope', 'funcgen', 'dcsupply', 'tank']);

export function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-label font-semibold text-muted">{children}</span>;
}

/** "3,180 V" → ["3,180", "V"]; birimsiz değerlerde ikinci parça boş. */
export function splitUnit(value: string): [string, string] {
  const m = /^([−+-]?[\d.,]+)\s+(\S+)$/.exec(value);
  return m ? [m[1]!, m[2]!] : [value, ''];
}

function BigValue({ value, size }: { value: string; size: 'lg' | 'md' }) {
  const [number, unit] = splitUnit(value);
  return (
    <span className={`font-mono font-medium tabular ${size === 'lg' ? 'text-[22px] leading-7' : 'text-[17px] leading-6'}`}>
      {number}
      {unit && <span className={`ml-1 text-muted ${size === 'lg' ? 'text-sm' : 'text-small'}`}>{unit}</span>}
    </span>
  );
}

// --- Alanlar ------------------------------------------------------------------------------

const FIELD_BOX = 'flex h-10 items-center overflow-hidden rounded-md border bg-panel transition-shadow';
/** Çerçeve: hatalıyken kırmızı (odakta da), değilse odakta mavi. */
export function fieldTone(error: boolean): string {
  return error ? 'border-danger ring-3 ring-danger-soft' : 'border-line-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft';
}

export function FieldError({ id, error, kept }: { id: string; error: string; kept?: string }) {
  return (
    <>
      <span id={id} role="alert" className="flex gap-1.5 text-small text-danger">
        <Icon name="info" className="mt-px h-4 w-4 shrink-0" />
        <span>{error}</span>
      </span>
      {kept && <span className="text-label text-muted">{kept}</span>}
    </>
  );
}

/** Metni Enter'da ya da odak çıkınca doğrulayıp uygulayan alanların ortak davranışı. */
export function useCommitField<T>(
  external: string,
  validate: (text: string) => { value: T } | { error: string },
  apply: (value: T) => string | null,
) {
  const [text, setText] = useState(external);
  const [error, setError] = useState<string | null>(null);
  // Değer dışarıdan değişince (geri al, çip, başka alan) yazı da güncellensin.
  useEffect(() => {
    setText(external);
    setError(null);
  }, [external]);
  const commit = () => {
    if (text === external) {
      setError(null);
      return;
    }
    const result = validate(text);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    const shown = apply(result.value);
    if (shown !== null) setText(shown);
  };
  const revert = () => {
    setText(external);
    setError(null);
  };
  return { text, setText, error, commit, revert };
}

export function LabelField({
  label,
  otherLabels,
  inputRef,
  onCommit,
}: {
  label: string;
  otherLabels: ReadonlySet<string>;
  inputRef: Ref<HTMLInputElement> | undefined;
  onCommit: (label: string) => void;
}) {
  const id = useId();
  const field = useCommitField(
    label,
    (text) => validateLabel(text, otherLabels),
    (value) => {
      if (value !== label) onCommit(value);
      return value;
    },
  );
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium">
        {tr.properties.name}
      </label>
      <div className={`${FIELD_BOX} ${fieldTone(Boolean(field.error))}`}>
        <input
          id={id}
          ref={inputRef}
          value={field.text}
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={field.error ? `${id}-e` : undefined}
          onChange={(e) => field.setText(e.target.value)}
          onBlur={field.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') field.commit();
            if (e.key === 'Escape') field.revert();
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[15px] font-medium outline-none"
        />
      </div>
      {field.error && <FieldError id={`${id}-e`} error={field.error} />}
    </div>
  );
}

export function PropField({
  part,
  prop,
  values,
  live,
  inputRef,
  onCommit,
  onSlide,
}: {
  part: Part;
  prop: PropDef;
  values: Readonly<Record<string, PropValue>>;
  /** Simülasyon çalışıyor: alanın altında "Canlı uygulanır" yazar. */
  live: boolean;
  inputRef: Ref<HTMLInputElement> | undefined;
  onCommit: (value: PropValue) => void;
  onSlide: (value: number, done: boolean) => void;
}) {
  const label = tr.properties.fieldLabel(part.type, prop.key);
  const value = values[prop.key];
  if (prop.kind === 'number') {
    const disabled = Boolean(prop.disabledWhen && values[prop.disabledWhen] === true);
    return (
      <NumberField
        label={label}
        def={prop}
        value={typeof value === 'number' ? value : 0}
        disabled={disabled}
        live={live}
        presets={valuePresets(part.type, prop.key)}
        inputRef={inputRef}
        onCommit={onCommit}
        onSlide={onSlide}
      />
    );
  }
  if (prop.kind === 'boolean') {
    return (
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onCommit(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-accent"
        />
        <span>{label}</span>
      </label>
    );
  }
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-small font-medium">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {prop.options.map((option) => {
          const checked = value === option;
          const swatch = part.type === 'led' ? LED_MODELS[option as LedColor]?.lightColor : undefined;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => !checked && onCommit(option)}
              className={`flex h-8 items-center gap-2 rounded-sm border px-2.5 text-small font-medium ${
                checked ? 'border-ink bg-ink text-on-ink' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
              }`}
            >
              {swatch && <span className="h-3 w-3 rounded-full border border-white/60" style={{ background: swatch }} aria-hidden="true" />}
              {tr.properties.optionLabel(prop.key, option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  def,
  value,
  disabled,
  live,
  presets,
  inputRef,
  onCommit,
  onSlide,
}: {
  label: string;
  def: NumberPropDef;
  value: number;
  disabled: boolean;
  live: boolean;
  presets: readonly number[];
  inputRef: Ref<HTMLInputElement> | undefined;
  onCommit: (value: number) => void;
  onSlide: (value: number, done: boolean) => void;
}) {
  const id = useId();
  const field = useCommitField(
    formatEditable(value),
    (text) => validateNumber(def, text),
    (next) => {
      if (next !== value) onCommit(next);
      return formatEditable(next);
    },
  );
  const error = disabled ? null : field.error;
  const kept = tr.inspector.invalidKept(formatSI(value, def.unit, { trim: true, digits: 4 }));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <div
        className={`${FIELD_BOX} ${fieldTone(Boolean(error))} ${disabled ? 'bg-panel-2' : ''}`}
      >
        <input
          id={id}
          ref={inputRef}
          value={field.text}
          disabled={disabled}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : undefined}
          onChange={(e) => field.setText(e.target.value)}
          onBlur={field.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') field.commit();
            if (e.key === 'Escape') field.revert();
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[15px] font-medium tabular outline-none disabled:text-muted"
        />
        {def.unit && (
          <span className="flex h-full items-center border-l border-line bg-panel-2 px-3 font-mono text-sm font-medium text-muted">
            {def.unit}
          </span>
        )}
      </div>
      {def.slider && !disabled && <PropSlider def={def} value={value} label={label} touch={false} onSlide={onSlide} />}
      {error && <FieldError id={`${id}-e`} error={error} kept={kept} />}
      {live && !error && (
        <span className="flex items-center gap-1.5 text-label text-ok">
          <i className="block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
          {tr.inspector.liveApplied}
        </span>
      )}
      {presets.length > 0 && !disabled && (
        <div className="flex flex-wrap gap-1.5 pt-0.5" role="group" aria-label={tr.inspector.presets}>
          {presets.map((preset) => {
            const selected = Math.abs(preset - value) <= Math.abs(value) * 1e-9;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => !selected && onCommit(preset)}
                className={`h-8 rounded-sm border px-2.5 font-mono text-small font-medium ${
                  selected ? 'border-ink bg-ink text-on-ink' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
                }`}
              >
                {presetLabel(preset)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Kablo ve çoklu seçim -------------------------------------------------------------------

export function WireDetails({ wireId, frame, onDelete }: InspectTabProps & { wireId: string }) {
  // Telefonda silme alt çubukta (Ölç kipinde yapı kilitli).
  const touch = useTouchUi();
  const voltage = frame?.wireVoltages.get(wireId);
  const spoken = useThrottledText(voltage === undefined ? '' : `${tr.inspector.wireVoltage} ${formatSI(voltage, 'V')}`);
  return (
    <>
      <header className="flex items-center gap-2.5">
        <span className="flex h-10 w-12 shrink-0 items-center justify-center text-ink">
          <Icon name="wire" className="h-6 w-6" />
        </span>
        <h2 className="flex-1 text-title font-semibold">{tr.inspector.wire}</h2>
        {!touch && (
        <button
          type="button"
          onClick={onDelete}
          title={tr.toolbar.remove}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-2.5 text-small font-medium text-danger hover:bg-panel-2"
        >
          <Icon name="trash" />
          {tr.toolbar.remove}
        </button>
        )}
      </header>
      <section className="flex flex-col gap-2">
        <p className="sr-only" aria-live="polite">
          {spoken}
        </p>
        <SectionTitle>{tr.inspector.live}</SectionTitle>
        <div className="flex flex-col gap-0.5 rounded-[10px] border border-line px-3 py-2.5">
          <span className="text-label text-muted">{tr.inspector.wireVoltage}</span>
          {voltage === undefined ? (
            <span className="font-mono text-[22px] leading-7 text-stopped">– – – V</span>
          ) : (
            <BigValue value={formatSI(voltage, 'V')} size="lg" />
          )}
        </div>
        <p className="text-small text-muted">{tr.inspector.wireHint}</p>
      </section>
    </>
  );
}

export function MultiSelection({ count, parts, onRotate, onFlip, onDelete }: InspectTabProps & { count: number; parts: readonly Part[] }) {
  // Telefonda eylemler alt çubukta.
  const touch = useTouchUi();
  const canFlip = parts.some((p) => CATALOG[p.type].polarized);
  const ids = parts.map((p) => p.id);
  return (
    <>
      <div className="flex flex-col gap-1 pt-1.5">
        <h2 className="text-title font-semibold">{tr.inspector.selectedItems(count)}</h2>
        <span className="text-small text-muted">{tr.inspector.selectedHint}</span>
      </div>
      <div className={`flex flex-wrap gap-1.5 ${touch ? 'hidden' : ''}`}>
        {ids.length > 0 && (
          <button
            type="button"
            onClick={() => onRotate(ids)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-2.5 text-small font-medium hover:bg-panel-2"
          >
            <Icon name="rotate" />
            {tr.toolbar.rotate}
          </button>
        )}
        {canFlip && (
          <button
            type="button"
            onClick={() => onFlip(ids)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-2.5 text-small font-medium hover:bg-panel-2"
          >
            <Icon name="flip" />
            {tr.toolbar.flip}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-2.5 text-small font-medium text-danger hover:bg-panel-2"
        >
          <Icon name="trash" />
          {tr.toolbar.remove}
        </button>
      </div>
    </>
  );
}
