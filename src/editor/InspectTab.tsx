// İnceleme paneli → İncele sekmesi (tasarım: M01, M03, M04). Seçili parçanın canlı ölçümleri, formül
// notu ve özellikleri aynı yerde. Değerler Enter'da ya da alan odaktan çıkınca uygulanır; geçersizse
// uygulanmaz ve hata alanın altında kalır. Değer, ad ve anahtar değişiklikleri simülasyonu durdurmaz.

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, withProp, type NumberPropDef, type PropDef } from '../model/catalog';
import type { CircuitDoc, Part } from '../model/types';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import type { PropValue } from '../sim/netlist';
import { formatEditable, formatSI } from '../sim/units';
import { HintText } from './HintStrip';
import { Icon, type IconName } from './icons';
import { partValueText } from './PartView';
import { currentProp, partNote, presetLabel, validateLabel, validateNumber, valuePresets } from './propertyForm';
import { PropSlider } from './PropSlider';
import { stableMeterText, stableReadout } from './liveReadout';
import { partReadout, type ReadoutRow } from './readouts';
import { plainText, Rich } from './Rich';
import type { Settings } from './settings';
import type { Selection } from './state';
import { SymbolIcon } from './symbols';
import { useThrottledText } from './a11y';
import { ArduinoSection } from './ArduinoPanel';
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
  /** Cihazın ön panelini rafta öne getirir (osiloskop, fonksiyon üreteci, DC güç kaynağı). */
  readonly onShowInRack: (partId: string) => void;
}

/** Ayarları cihaz rafındaki ön panelinde olan parçalar. */
export const RACK_DEVICES: ReadonlySet<string> = new Set(['oscilloscope', 'funcgen', 'dcsupply', 'tank']);

export function InspectTab(props: InspectTabProps) {
  const { doc, selection, frame } = props;
  const touch = useTouchUi();
  const parts = doc.parts.filter((p) => selection.parts.includes(p.id));
  const count = selection.parts.length + selection.wires.length;

  let body: ReactNode;
  if (doc.parts.length === 0 && doc.wires.length === 0) {
    body = <EmptyCircuit />;
  } else if (count === 0) {
    body = <NoSelection {...props} />;
  } else if (parts.length === 1 && selection.wires.length === 0) {
    // Ad ya da tür değişince alanlar baştan kurulsun.
    body = <PartDetails key={parts[0]!.id} part={parts[0]!} {...props} />;
  } else if (parts.length === 0 && selection.wires.length === 1) {
    body = <WireDetails wireId={selection.wires[0]!} {...props} />;
  } else {
    body = <MultiSelection count={count} parts={parts} {...props} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {frame && <MeterStrip {...props} />}
      <div className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pb-5 ${touch ? 'px-4 pt-3' : 'px-5 pt-3.5'}`}>{body}</div>
    </div>
  );
}

// --- Seçim yokken -------------------------------------------------------------------------

function EmptyCircuit() {
  return (
    <>
      <div className="flex flex-col gap-1 pt-1.5">
        <b className="text-heading font-semibold">{tr.inspector.emptyTitle}</b>
        <span className="text-small text-muted">{tr.inspector.emptyText}</span>
      </div>
      <ol className="flex flex-col gap-2.5">
        {tr.inspector.steps.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-label font-semibold text-accent-ink">
              {i + 1}
            </span>
            <span>
              <b className="font-semibold">{step.title}</b>
              <br />
              <span className="text-small text-muted">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Seçim yokken: devredeki parçaların listesi (tuvalin metin karşılığı; tıklayınca seçer). */
function NoSelection({ doc, settings, onSelectPart }: InspectTabProps) {
  const touch = useTouchUi();
  return (
    <>
      <div className="flex flex-col gap-1 pt-1.5">
        <b className="text-heading font-semibold">{tr.inspector.noSelectionTitle}</b>
        <span className="text-small text-muted">{tr.inspector.noSelectionText}</span>
      </div>
      <section className="flex flex-col gap-1" aria-label={tr.inspector.circuit}>
        <SectionTitle>{tr.inspector.circuit}</SectionTitle>
        <ul className="flex flex-col">
          {doc.parts.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                onClick={() => onSelectPart(part.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-panel-2 ${touch ? 'min-h-11 py-2' : 'py-1.5'}`}
              >
                <span className="flex h-5 w-8 shrink-0 items-center justify-center">
                  <SymbolIcon type={part.type} resistorStyle={settings.resistorStyle} className="max-h-5 w-8" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <b className="font-semibold">{part.label}</b>{' '}
                  <span className="text-small text-muted">{tr.devices.names[part.type]}</span>
                </span>
                <span className="shrink-0 font-mono text-small text-ink-2">{partValueText(part)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Simülasyon çalışırken ölçü aletlerinin göstergeleri (tıklayınca o aleti seçer). */
function MeterStrip({ doc, frame, onSelectPart }: InspectTabProps) {
  const touch = useTouchUi();
  const meters = doc.parts.filter((p) => p.type === 'voltmeter' || p.type === 'ammeter');
  if (!frame || meters.length === 0) return null;
  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-[10px] border border-line bg-panel-2 px-2.5 py-2">
      <span className="py-0.5 text-label font-semibold text-muted">{tr.inspector.meters}</span>
      <div className="flex flex-1 flex-wrap justify-end gap-x-3 gap-y-1.5">
      {meters.map((part) => {
        const m = frame.measurements.get(part.id);
        const text = m ? (stableMeterText(part, m, frame.statuses.get(part.id) ?? {}, frame.summaries.get(part.id) ?? null) ?? '') : '';
        return (
          <button
            key={part.id}
            type="button"
            onClick={() => onSelectPart(part.id)}
            className={`flex items-center gap-2 rounded-md text-small font-medium hover:underline ${touch ? 'min-h-11' : ''}`}
            aria-label={`${tr.inspector.meters}: ${part.label} ${text}`}
          >
            <span>{part.label}</span>
            <span className="rounded-xs bg-lcd-bg px-2 py-0.5 font-mono font-semibold text-lcd-fg tabular">{text}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}

// --- Tek parça ----------------------------------------------------------------------------

function PartDetails({
  part,
  doc,
  frame,
  status,
  settings,
  focusRequest,
  onUpdatePart,
  onSlidePart,
  onRotate,
  onFlip,
  onDelete,
  onRepair,
  onShowInRack,
}: InspectTabProps & { part: Part }) {
  const def = CATALOG[part.type];
  const running = status === 'running';
  const active = status !== 'stopped';
  const burned = frame?.statuses.get(part.id)?.burned === true;
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, [focusRequest]);

  const actions: Array<{ icon: IconName; label: string; onClick: () => void; danger?: boolean }> = [
    { icon: 'rotate', label: tr.toolbar.rotate, onClick: () => onRotate([part.id]) },
    ...(def.polarized ? [{ icon: 'flip' as IconName, label: tr.toolbar.flip, onClick: () => onFlip([part.id]) }] : []),
    ...(burned ? [{ icon: 'saved' as IconName, label: tr.inspector.repair, onClick: () => onRepair(part.id) }] : []),
    { icon: 'trash', label: tr.toolbar.remove, onClick: onDelete, danger: true },
  ];

  const otherLabels = new Set(doc.parts.filter((p) => p.id !== part.id).map((p) => p.label));
  const values: Record<string, PropValue> = {};
  for (const prop of def.propDefs) {
    const value = currentProp(part, prop.key);
    if (value !== undefined) values[prop.key] = value;
  }
  // Cihazların bütün ayarları rafta; burada yalnızca adı ve rafa yönlendirme.
  const inRack = RACK_DEVICES.has(part.type);
  const note = inRack ? undefined : partNote(part.type, values);
  const firstNumber = inRack ? undefined : def.propDefs.find((p): p is NumberPropDef => p.kind === 'number');

  const labelField = (
    <LabelField
      key="label"
      label={part.label}
      otherLabels={otherLabels}
      inputRef={firstNumber ? undefined : firstFieldRef}
      onCommit={(label) => onUpdatePart(part.id, { label })}
    />
  );
  const propFields = (inRack ? [] : def.propDefs).map((prop) => (
    <PropField
      key={prop.key}
      part={part}
      prop={prop}
      values={values}
      live={active && prop === firstNumber}
      inputRef={prop === firstNumber ? firstFieldRef : undefined}
      onCommit={(value) => onUpdatePart(part.id, { props: withProp(part.type, part.props, prop.key, value) })}
      onSlide={(value, done) =>
        onSlidePart
          ? onSlidePart(part.id, { props: withProp(part.type, part.props, prop.key, value) }, done)
          : done && onUpdatePart(part.id, { props: withProp(part.type, part.props, prop.key, value) })
      }
    />
  ));

  return (
    <>
      <header className={`flex gap-2.5 ${active ? 'items-center' : 'flex-col'}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-10 w-12 shrink-0 items-center justify-center">
            <SymbolIcon type={part.type} resistorStyle={settings.resistorStyle} className="max-h-8 w-12" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-title font-semibold">{part.label}</h2>
            <span className="text-small text-muted">{tr.devices.names[part.type]}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              aria-label={active ? action.label : undefined}
              title={action.label}
              className={`flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel text-small font-medium hover:bg-panel-2 ${
                active ? 'w-9 justify-center' : 'px-2.5'
              } ${action.danger ? 'text-danger' : 'text-ink'}`}
            >
              <Icon name={action.icon} />
              {!active && action.label}
            </button>
          ))}
        </div>
      </header>

      <LiveSection part={part} frame={frame} status={status} />

      {part.type === 'arduino' && <ArduinoSection part={part} frame={frame} status={status} />}

      <section className="flex flex-col gap-3" aria-label={tr.inspector.properties}>
        <SectionTitle>{tr.inspector.properties}</SectionTitle>
        {/* Çalışırken önce değerler (değiştirmek için), durmuşken önce ad (M03, M04). */}
        {active ? [...propFields, labelField] : [labelField, ...propFields]}
        {inRack && (
          <div className="flex flex-col items-start gap-2 rounded-md bg-panel-2 px-3 py-2.5">
            <span className="text-small text-ink-2">{tr.rack.settingsInRack}</span>
            <button
              type="button"
              onClick={() => onShowInRack(part.id)}
              className="h-9 rounded-md border border-line-2 bg-panel px-3 text-small font-medium hover:bg-panel-2"
            >
              {tr.rack.showInRack}
            </button>
          </div>
        )}
        {firstNumber && <span className="text-label leading-[1.45] text-muted">{tr.properties.unitHint}</span>}
        {note && (
          <p className="rounded-md bg-panel-2 px-3 py-2 text-label leading-relaxed text-ink-2">
            <Rich text={note} />
          </p>
        )}
      </section>

      {!active && (
        <section className="flex flex-col gap-1.5">
          <SectionTitle>{tr.inspector.whatItDoes}</SectionTitle>
          <p className="text-small leading-normal text-ink-2">
            <Rich text={tr.devices.descriptions[part.type]} />
          </p>
        </section>
      )}

      <p className="border-t border-app pt-2.5 text-label leading-normal text-muted">
        {running ? tr.inspector.liveApplyNote : <HintText text={tr.inspector.applyNote} />}
      </p>
    </>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-label font-semibold text-muted">{children}</span>;
}

/** "3,180 V" → ["3,180", "V"]; birimsiz değerlerde ikinci parça boş. */
export function splitUnit(value: string): [string, string] {
  const m = /^([−+-]?[\d.,]+)\s+(\S+)$/.exec(value);
  return m ? [m[1]!, m[2]!] : [value, ''];
}

/** Simülasyon durmuşken satırlar "– – – V" olarak gösterilir. */
function placeholder(row: ReadoutRow): ReadoutRow {
  const [, unit] = splitUnit(row.value);
  return { label: row.label, value: unit ? `– – – ${unit}` : '– – –' };
}

const ZERO_MEASUREMENT = { voltage: 0, current: 0, power: 0 };

function LiveSection({ part, frame, status }: { part: Part; frame: SimFrame | null; status: SimStatus }) {
  const m = frame?.measurements.get(part.id);
  const live = m && frame ? stableReadout(part, m, frame.statuses.get(part.id) ?? {}, frame.summaries.get(part.id) ?? null) : null;
  const readout = live ?? partReadout(part, ZERO_MEASUREMENT);
  // Ekran okuyucu canlı değerleri en çok saniyede bir duyar (N02).
  const spoken = useThrottledText(m && readout ? readout.rows.map((r) => `${plainText(r.label)} ${r.value}`).join(', ') : '');
  if (!readout) return null;

  if (!m) {
    // Durmuş: sade satırlar ve Oynat ipucu (M03).
    return (
      <section className="flex flex-col gap-1.5" aria-label={tr.inspector.live}>
        <SectionTitle>{tr.inspector.live}</SectionTitle>
        {readout.rows.map(placeholder).map((row) => (
          <div key={row.label} className="flex items-baseline justify-between border-b border-app py-1.5">
            <span>
              <Rich text={row.label} />
            </span>
            <span className="font-mono text-[15px] text-stopped">{row.value}</span>
          </div>
        ))}
        <p className="flex items-center gap-2 pt-1 text-small text-muted">
          <Icon name="play" className="h-4 w-4 text-ok" />
          {tr.inspector.playHint}
        </p>
      </section>
    );
  }

  const [first, second, ...rest] = readout.rows;
  const formula = readout.note?.includes('→') ?? false;
  return (
    <section className="flex flex-col gap-2.5" aria-label={tr.inspector.live}>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="flex items-center justify-between">
        <SectionTitle>{tr.inspector.live}</SectionTitle>
        <span className={`flex items-center gap-1.5 text-label font-semibold ${status === 'running' ? 'text-ok' : 'text-muted'}`}>
          <i className={`block h-2 w-2 rounded-full ${status === 'running' ? 'bg-ok' : 'bg-paused'}`} aria-hidden="true" />
          {status === 'running' ? tr.inspector.liveBadge : tr.inspector.pausedBadge}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[first, second].map(
          (row) =>
            row && (
              <div key={row.label} className={`flex flex-col gap-0.5 rounded-[10px] border border-line px-3 py-2.5 ${second ? '' : 'col-span-2'}`}>
                <span className="text-label text-muted">
                  <Rich text={row.label} />
                </span>
                <BigValue value={row.value} size="lg" />
              </div>
            ),
        )}
        {rest.map((row) => (
          <div key={row.label} className="col-span-2 flex items-baseline justify-between gap-3 rounded-[10px] border border-line px-3 py-2.5">
            <span className="text-label text-muted">
              <Rich text={row.label} />
            </span>
            <BigValue value={row.value} size="md" />
          </div>
        ))}
      </div>
      {live?.varying && (
        <p className="text-[12.5px] leading-normal text-ink-2">
          {tr.inspector.varyingNote}
        </p>
      )}
      {readout.note && (
        <div className="flex flex-col gap-1 rounded-[10px] border border-info-line bg-info-soft px-3 py-2.5">
          <span className="text-label font-semibold text-info-ink">{tr.inspector.why}</span>
          <span className={formula ? 'font-mono text-[13.5px] text-ink' : 'text-[12.5px] leading-normal text-ink-2'}>
            <Rich text={readout.note} />
          </span>
        </div>
      )}
    </section>
  );
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
                checked ? 'border-ink bg-ink text-white' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
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
                  selected ? 'border-ink bg-ink text-white' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
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
