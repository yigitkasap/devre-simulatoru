// Telefondaki alt sayfaların içerikleri (tasarım: P02, P04, P05, P07, P11): Parça ekle (zincirle ekle,
// basılı tutup sürükle), seçili parçanın değeri ve özellikleri (Kur), Ölç kipinde ölçümler ve canlı
// değer, sayfa sekmeleri, "Simülasyon başlamadı" kutusu ve hız. Alanlar dokunmatik boyutta: düğmeler
// en az 44 px, yazı alanları 16 px (iOS yakınlaştırmasın); − / + bir adım değiştirir.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, CATEGORIES, withProp, type Category, type NumberPropDef, type PropDef } from '../model/catalog';
import type { CircuitDoc, Part } from '../model/types';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import type { DeviceType, PropValue } from '../sim/netlist';
import { formatEditable, formatSI } from '../sim/units';
import { HintText } from './HintStrip';
import { FieldError, fieldTone, splitUnit, useCommitField, type PartPatch } from './InspectTab';
import { Icon } from './icons';
import { partValueText } from './PartView';
import { currentProp, partNote, presetLabel, stepKind, stepValue, validateLabel, validateNumber, valuePresets } from './propertyForm';
import { partReadout } from './readouts';
import { useThrottledText } from './a11y';
import { plainText, Rich } from './Rich';
import type { Settings } from './settings';
import { SymbolIcon } from './symbols';
import type { SimFrame, SimStatus } from './useSimulation';

/** Ayarları Cihazlar sayfasında olan parçalar. */
const DEVICE_TYPES: ReadonlySet<DeviceType> = new Set<DeviceType>(['oscilloscope', 'funcgen', 'dcsupply', 'tank']);

/** Türkçe karakterleri sadeleştirerek arar ("kondansator" → "Kondansatör"). */
function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

// --- Sekmeler ------------------------------------------------------------------------------

export interface SheetTab<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Sekmedeki sayı rozeti (Mesajlar). */
  readonly count?: number;
  readonly tone?: 'error' | 'warn';
}

/** Sayfanın üstündeki sekmeler (kademeli seçici görünümünde; ← → ile gezilir). */
export function SheetTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly SheetTab<T>[]; value: T; onChange: (id: T) => void }) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const index = tabs.findIndex((t) => t.id === value);
    const next = tabs[(index + step + tabs.length) % tabs.length]!;
    onChange(next.id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')[tabs.indexOf(next)]?.focus();
  };
  return (
    <div role="tablist" aria-label={tr.phone.tabsLabel} onKeyDown={onKeyDown} className="mx-4 mb-2 flex shrink-0 gap-0.5 rounded-[10px] bg-app p-0.5">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold whitespace-nowrap ${
              selected ? 'bg-panel text-ink shadow-sm' : 'text-ink-2'
            }`}
          >
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] text-white ${
                  tab.tone === 'error' ? 'bg-danger' : 'bg-warn'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Parça ekle (P02) ----------------------------------------------------------------------

type PartsCategory = 'favorites' | Category;

/** Sık kullanılanlar: son eklenenler, ardından laboratuvarda en çok kullanılanlar. */
const FAVORITES: readonly DeviceType[] = ['resistor', 'led', 'capacitor', 'ground', 'voltmeter', 'diode', 'battery', 'ammeter', 'switch'];
const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE_PX = 10;

export interface PartsSheetProps {
  readonly settings: Settings;
  readonly recent: readonly DeviceType[];
  /** "Zincirle ekle" açıksa yeni parçanın bağlanacağı uç ("B1’in + ucu"); kapalıysa null. */
  readonly chainTo: string | null;
  readonly onChainOff: () => void;
  readonly onAdd: (type: DeviceType) => void;
  /** Basılı tutup sürüklenen parça bırakıldı (ekran koordinatı). */
  readonly onDrop: (type: DeviceType, clientX: number, clientY: number) => void;
  /** Sürükleme sürerken sayfa saydamlaşır (devre görünsün). */
  readonly onDragging: (dragging: boolean) => void;
  /** Tablet (T02): kategori çipleri yerine başlıklı gruplar, hepsi alt alta. */
  readonly grouped?: boolean;
}

export function PartsSheetBody({ settings, recent, chainTo, onChainOff, onAdd, onDrop, onDragging, grouped = false }: PartsSheetProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PartsCategory>('favorites');
  const [ghost, setGhost] = useState<{ type: DeviceType; x: number; y: number } | null>(null);
  const press = useRef<{ type: DeviceType; id: number; x: number; y: number; timer: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const favorites = useMemo(() => [...new Set([...recent, ...FAVORITES])].slice(0, 9), [recent]);
  const q = normalize(query.trim());
  const sections = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        id: c.id,
        types: c.types.filter(
          (type) =>
            q === '' ||
            normalize(tr.devices.names[type]).includes(q) ||
            normalize(tr.devices.descriptions[type]).includes(q) ||
            normalize(tr.library.categories[c.id]).includes(q),
        ),
      })).filter((c) => c.types.length > 0),
    [q],
  );
  const types = useMemo(() => {
    if (q) {
      return CATEGORIES.flatMap((c) =>
        c.types.filter(
          (type) =>
            normalize(tr.devices.names[type]).includes(q) ||
            normalize(tr.devices.descriptions[type]).includes(q) ||
            normalize(tr.library.categories[c.id]).includes(q),
        ),
      );
    }
    if (category === 'favorites') return favorites;
    return CATEGORIES.find((c) => c.id === category)?.types ?? [];
  }, [q, category, favorites]);

  // Sürüklerken liste kaymasın (iOS: ilk touchmove'da varsayılanı engelle).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    const block = (e: TouchEvent) => {
      if (press.current?.active && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  useEffect(() => () => window.clearTimeout(press.current?.timer), []);

  const endPress = (drop: { x: number; y: number } | null) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (!p.active) return;
    suppressClick.current = true;
    setGhost(null);
    onDragging(false);
    if (drop) onDrop(p.type, drop.x, drop.y);
  };

  const categories: Array<{ id: PartsCategory; label: string }> = [
    { id: 'favorites', label: tr.phone.favorites },
    ...CATEGORIES.map((c) => ({ id: c.id as PartsCategory, label: tr.library.categories[c.id] })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4">
      {chainTo && (
        <div className="flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] bg-accent-soft py-0.5 pr-0.5 pl-3 text-sm text-accent-ink">
          <Icon name="wire" className="h-[18px] w-[18px] shrink-0" />
          <span className="min-w-0 flex-1">
            <HintText text={tr.phone.chain(chainTo)} />
          </span>
          <button
            type="button"
            onClick={onChainOff}
            aria-label={tr.phone.chainOff}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-panel/60"
          >
            <Icon name="close" className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
      <label className="flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-line-2 px-3 text-muted focus-within:border-accent">
        <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
        <span className="sr-only">{tr.library.searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr.library.search}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
      </label>
      {!query.trim() && !grouped && (
        <div role="tablist" aria-label={tr.library.title} className="no-scrollbar fade-right -mr-4 flex shrink-0 gap-1.5 overflow-x-auto overscroll-contain pr-4">
          {categories.map((c) => {
            const selected = c.id === category;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCategory(c.id)}
                className={`h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap ${
                  selected ? 'border-ink bg-ink text-white' : 'border-line-2 bg-panel text-ink'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      <div ref={gridRef} className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
        {(grouped ? sections.length === 0 : types.length === 0) ? (
          <p className="py-3 text-sm text-muted">{tr.library.noResults}</p>
        ) : (
          (grouped ? sections : [{ id: null, types }]).map((section) => (
          <section key={section.id ?? 'all'} aria-label={section.id ? tr.library.categories[section.id] : undefined}>
          {section.id && <h3 className="pt-1 pb-1.5 text-label font-semibold text-muted">{tr.library.categories[section.id]}</h3>}
          <ul className="grid grid-cols-3 gap-2 pb-2">
            {section.types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  aria-label={tr.library.add(tr.devices.names[type])}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onAdd(type);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    suppressClick.current = false;
                    const el = e.currentTarget;
                    const pointerId = e.pointerId;
                    const start = { type, id: pointerId, x: e.clientX, y: e.clientY, active: false, timer: 0 };
                    start.timer = window.setTimeout(() => {
                      if (press.current !== start) return;
                      start.active = true;
                      try {
                        el.setPointerCapture(pointerId);
                      } catch {
                        // Dokunmatikte işaretçi zaten örtük olarak yakalanır.
                      }
                      navigator.vibrate?.(10);
                      setGhost({ type, x: start.x, y: start.y });
                      onDragging(true);
                    }, LONG_PRESS_MS);
                    press.current = start;
                  }}
                  onPointerMove={(e) => {
                    const p = press.current;
                    if (!p || p.id !== e.pointerId) return;
                    if (p.active) setGhost({ type: p.type, x: e.clientX, y: e.clientY });
                    else if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) {
                      window.clearTimeout(p.timer);
                      press.current = null;
                    }
                  }}
                  onPointerUp={(e) => endPress({ x: e.clientX, y: e.clientY })}
                  onPointerCancel={() => endPress(null)}
                  className="no-callout flex h-[84px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-1 text-[13.5px] font-medium text-ink active:border-accent active:bg-accent-soft/50"
                >
                  <SymbolIcon type={type} resistorStyle={settings.resistorStyle} className="h-[26px] w-11" />
                  <span className="max-w-full truncate">{tr.devices.names[type]}</span>
                </button>
              </li>
            ))}
          </ul>
          </section>
          ))
        )}
      </div>
      <p className="-mx-4 shrink-0 border-t border-app px-4 pt-2 pb-2.5 text-[12.5px] text-muted">{tr.phone.addFooter}</p>
      {ghost && (
        <div
          className="pointer-events-none fixed z-[70] flex flex-col items-center gap-1 rounded-xl border-2 border-accent bg-panel/95 px-3 py-2 text-label font-semibold shadow-lg"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, calc(-100% - 24px))' }}
          aria-hidden="true"
        >
          <SymbolIcon type={ghost.type} resistorStyle={settings.resistorStyle} className="h-[26px] w-11" />
          {tr.devices.names[ghost.type]}
        </div>
      )}
    </div>
  );
}

// --- Dokunmatik alanlar --------------------------------------------------------------------

const STEP_BUTTON =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-line-2 bg-panel-2 text-[20px] font-semibold text-ink enabled:active:bg-app disabled:text-stopped';

/** Sayı alanı: − [değer birim] + ; altında hata, canlı notu ve sık kullanılan değerler. */
export function TouchNumberField({
  label,
  def,
  value,
  disabled = false,
  live = false,
  presets,
  inputRef,
  onCommit,
}: {
  label: string;
  def: NumberPropDef;
  value: number;
  disabled?: boolean;
  live?: boolean;
  presets: readonly number[];
  inputRef?: Ref<HTMLInputElement>;
  onCommit: (value: number) => void;
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
  const down = disabled ? null : stepValue(def, value, -1);
  const up = disabled ? null : stepValue(def, value, 1);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className={STEP_BUTTON} disabled={down === null} aria-label={tr.phone.stepDownOf(label)} onClick={() => down !== null && onCommit(down)}>
          −
        </button>
        <div className={`flex h-12 min-w-0 flex-1 items-center overflow-hidden rounded-[10px] border-[1.5px] bg-panel ${fieldTone(Boolean(error))} ${disabled ? 'bg-panel-2' : ''}`}>
          <input
            id={id}
            ref={inputRef}
            value={field.text}
            disabled={disabled}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-e` : undefined}
            onChange={(e) => field.setText(e.target.value)}
            onBlur={field.commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                field.commit();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') field.revert();
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[18px] font-medium tabular outline-none disabled:text-muted"
          />
          {def.unit && (
            <span className="flex h-full items-center border-l border-line bg-panel-2 px-3.5 font-mono text-base font-medium text-muted">{def.unit}</span>
          )}
        </div>
        <button type="button" className={STEP_BUTTON} disabled={up === null} aria-label={tr.phone.stepUpOf(label)} onClick={() => up !== null && onCommit(up)}>
          +
        </button>
      </div>
      {error && <FieldError id={`${id}-e`} error={error} kept={tr.inspector.invalidKept(formatSI(value, def.unit, { trim: true, digits: 4 }))} />}
      {live && !error && (
        <span className="flex items-center gap-1.5 text-label text-ok">
          <i className="block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
          {tr.inspector.liveApplied}
        </span>
      )}
      {presets.length > 0 && !disabled && (
        <div className="-mr-4 flex gap-1.5 overflow-x-auto overscroll-contain pr-4" role="group" aria-label={tr.inspector.presets}>
          {presets.map((preset) => {
            const selected = Math.abs(preset - value) <= Math.abs(value) * 1e-9;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => !selected && onCommit(preset)}
                className={`h-11 shrink-0 rounded-full border px-3.5 font-mono text-sm font-medium ${
                  selected ? 'border-ink bg-ink text-white' : 'border-line-2 bg-panel text-ink'
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

function TouchLabelField({ label, otherLabels, onCommit }: { label: string; otherLabels: ReadonlySet<string>; onCommit: (label: string) => void }) {
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
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {tr.properties.name}
      </label>
      <div className={`flex h-12 items-center overflow-hidden rounded-[10px] border-[1.5px] bg-panel ${fieldTone(Boolean(field.error))}`}>
        <input
          id={id}
          value={field.text}
          maxLength={12}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={field.error ? `${id}-e` : undefined}
          onChange={(e) => field.setText(e.target.value)}
          onBlur={field.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              field.commit();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') field.revert();
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-base font-medium outline-none"
        />
      </div>
      {field.error && <FieldError id={`${id}-e`} error={field.error} />}
    </div>
  );
}

function TouchPropField({
  part,
  prop,
  values,
  live,
  inputRef,
  onCommit,
}: {
  part: Part;
  prop: PropDef;
  values: Readonly<Record<string, PropValue>>;
  live: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onCommit: (value: PropValue) => void;
}) {
  const label = tr.properties.fieldLabel(part.type, prop.key);
  const value = values[prop.key];
  if (prop.kind === 'number') {
    return (
      <TouchNumberField
        label={label}
        def={prop}
        value={typeof value === 'number' ? value : 0}
        disabled={Boolean(prop.disabledWhen && values[prop.disabledWhen] === true)}
        live={live}
        presets={valuePresets(part.type, prop.key)}
        inputRef={inputRef}
        onCommit={onCommit}
      />
    );
  }
  if (prop.kind === 'boolean') {
    return (
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px]">
        <span>{label}</span>
        <input type="checkbox" checked={value === true} onChange={(e) => onCommit(e.target.checked)} className="h-6 w-6 shrink-0 accent-accent" />
      </label>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
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
              className={`flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium ${
                checked ? 'border-ink bg-ink text-white' : 'border-line-2 bg-panel text-ink'
              }`}
            >
              {swatch && <span className="h-3.5 w-3.5 rounded-full border border-white/60" style={{ background: swatch }} aria-hidden="true" />}
              {tr.properties.optionLabel(prop.key, option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function partValues(part: Part): Record<string, PropValue> {
  const def = CATALOG[part.type];
  const values: Record<string, PropValue> = {};
  for (const prop of def.propDefs) {
    const value = currentProp(part, prop.key);
    if (value !== undefined) values[prop.key] = value;
  }
  return values;
}

/** Sayfa başlığı: sembol, ad, tür ve Tümü / Daha az. */
function PartHeader({
  part,
  settings,
  subtitle,
  expanded,
  canExpand,
  onExpand,
  compact = false,
}: {
  part: Part;
  settings: Settings;
  subtitle: ReactNode;
  expanded: boolean;
  canExpand: boolean;
  onExpand: (expanded: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex shrink-0 items-center gap-2.5 pr-2 pl-4 ${compact ? '' : 'pb-2'}`}>
      {!compact && (
        <span className="flex h-10 w-12 shrink-0 items-center justify-center">
          <SymbolIcon type={part.type} resistorStyle={settings.resistorStyle} className="max-h-8 w-12" />
        </span>
      )}
      <h2 className={`flex min-w-0 flex-1 ${compact ? 'items-baseline gap-2' : 'flex-col leading-tight'}`}>
        <b className={`truncate font-semibold ${compact ? 'text-base' : 'text-[18px]'}`}>{part.label}</b>
        <span className="truncate text-[13px] font-normal text-muted">{subtitle}</span>
      </h2>
      {canExpand && (
        <button
          type="button"
          onClick={() => onExpand(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? tr.phone.showLessLabel : tr.phone.showAllLabel}
          className="h-11 shrink-0 rounded-[10px] px-2.5 text-sm font-medium text-accent-ink active:bg-app"
        >
          {expanded ? tr.phone.showLess : tr.phone.showAll}
        </button>
      )}
    </div>
  );
}

// --- Seçili parça, Kur (P04) ---------------------------------------------------------------

export interface PartSheetProps {
  readonly part: Part;
  readonly doc: CircuitDoc;
  readonly settings: Settings;
  readonly expanded: boolean;
  readonly onExpand: (expanded: boolean) => void;
  /** Artınca ilk değer alanına odaklanılır (alt çubuktaki Değer). */
  readonly focusRequest: number;
  readonly onUpdatePart: (partId: string, patch: PartPatch) => void;
  readonly onOpenDevices: (partId: string) => void;
  /** Tablet: bütün özellikler hep açık (Tümü / Daha az yok). */
  readonly alwaysExpanded?: boolean;
}

export function PartSheetBody({ part, doc, settings, expanded: expandedState, onExpand, focusRequest, onUpdatePart, onOpenDevices, alwaysExpanded = false }: PartSheetProps) {
  const expanded = alwaysExpanded || expandedState;
  const def = CATALOG[part.type];
  const firstRef = useRef<HTMLInputElement>(null);
  const values = partValues(part);
  const device = DEVICE_TYPES.has(part.type);
  const primary = device ? undefined : (def.propDefs.find((p) => p.kind === 'number') ?? def.propDefs[0]);
  const otherLabels = new Set(doc.parts.filter((p) => p.id !== part.id).map((p) => p.label));
  const note = device ? undefined : partNote(part.type, values);
  const canExpand = !alwaysExpanded && !device && (def.propDefs.length > 1 || primary !== undefined);

  useEffect(() => {
    if (focusRequest === 0) return;
    firstRef.current?.focus();
    firstRef.current?.select();
  }, [focusRequest]);

  const commit = (key: string) => (value: PropValue) => onUpdatePart(part.id, { props: withProp(part.type, part.props, key, value) });
  const primaryHint =
    primary?.kind === 'number'
      ? `${stepKind(primary) === 'e12' ? tr.phone.e12Hint : tr.phone.stepHint} ${tr.properties.unitHint}`
      : null;

  return (
    <>
      <PartHeader
        part={part}
        settings={settings}
        subtitle={tr.devices.names[part.type]}
        expanded={expanded}
        canExpand={canExpand}
        onExpand={onExpand}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
        {device ? (
          <div className="flex flex-col items-start gap-2.5 rounded-xl bg-panel-2 p-3">
            <span className="text-sm text-ink-2">{tr.phone.instrumentHint}</span>
            <button
              type="button"
              onClick={() => onOpenDevices(part.id)}
              className="flex h-11 items-center gap-2 rounded-[10px] border border-line-2 bg-panel px-3.5 text-sm font-medium"
            >
              <Icon name="devices" />
              {tr.phone.openDevices}
            </button>
          </div>
        ) : expanded ? (
          <>
            <TouchLabelField label={part.label} otherLabels={otherLabels} onCommit={(label) => onUpdatePart(part.id, { label })} />
            {def.propDefs.map((prop) => (
              <TouchPropField
                key={prop.key}
                part={part}
                prop={prop}
                values={values}
                live={false}
                inputRef={prop === primary ? firstRef : undefined}
                onCommit={commit(prop.key)}
              />
            ))}
            {primaryHint && <span className="text-[12.5px] leading-[1.45] text-muted">{primaryHint}</span>}
            {note && (
              <p className="rounded-[10px] bg-panel-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
                <Rich text={note} />
              </p>
            )}
            <p className="text-[13px] leading-normal text-ink-2">
              <Rich text={tr.devices.descriptions[part.type]} />
            </p>
          </>
        ) : (
          <>
            {primary && (
              <TouchPropField part={part} prop={primary} values={values} live={false} inputRef={firstRef} onCommit={commit(primary.key)} />
            )}
            {primaryHint && <span className="text-[12.5px] leading-[1.45] text-muted">{primaryHint}</span>}
            <button
              type="button"
              onClick={() => onExpand(true)}
              className="flex min-h-11 items-center justify-between border-t border-app pt-2 text-left"
            >
              <span className="text-sm">{tr.properties.name}</span>
              <span className="font-mono text-[15px]">
                {part.label} <span aria-hidden="true">›</span>
              </span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

// --- Ölç kipinde seçili parça (P05) --------------------------------------------------------

export interface MeasureSheetProps {
  readonly part: Part;
  readonly doc: CircuitDoc;
  readonly frame: SimFrame | null;
  readonly status: SimStatus;
  readonly settings: Settings;
  readonly expanded: boolean;
  readonly onExpand: (expanded: boolean) => void;
  readonly onUpdatePart: (partId: string, patch: PartPatch) => void;
  readonly onOpenDevices: (partId: string) => void;
  /** Tablet: bütün ölçümler ve alanlar hep açık. */
  readonly alwaysExpanded?: boolean;
}

const ZERO = { voltage: 0, current: 0, power: 0 };

export function MeasureSheetBody({ part, doc, frame, status, settings, expanded: expandedState, onExpand, onUpdatePart, onOpenDevices, alwaysExpanded = false }: MeasureSheetProps) {
  const expanded = alwaysExpanded || expandedState;
  const def = CATALOG[part.type];
  const values = partValues(part);
  const device = DEVICE_TYPES.has(part.type);
  const primary = device ? undefined : def.propDefs.find((p): p is NumberPropDef => p.kind === 'number');
  const m = frame?.measurements.get(part.id);
  const readout = m && frame ? partReadout(part, m, frame.statuses.get(part.id)) : partReadout(part, ZERO);
  const rows = readout?.rows ?? [];
  const running = status === 'running';
  const otherLabels = new Set(doc.parts.filter((p) => p.id !== part.id).map((p) => p.label));
  const commit = (key: string) => (value: PropValue) => onUpdatePart(part.id, { props: withProp(part.type, part.props, key, value) });
  const primaryValue = primary && typeof values[primary.key] === 'number' ? (values[primary.key] as number) : null;
  const down = primary && primaryValue !== null ? stepValue(primary, primaryValue, -1) : null;
  const up = primary && primaryValue !== null ? stepValue(primary, primaryValue, 1) : null;
  const primaryLabel = primary ? tr.properties.fieldLabel(part.type, primary.key) : '';
  const spoken = useThrottledText(m ? rows.map((r) => `${plainText(r.label)} ${r.value}`).join(', ') : '');

  return (
    <>
      <PartHeader
        part={part}
        settings={settings}
        compact
        subtitle={`${tr.devices.names[part.type]} · ${running ? tr.phone.live : tr.phone.paused}`}
        expanded={expanded}
        canExpand={!device && !alwaysExpanded}
        onExpand={onExpand}
      />
      {/* Dar yan panelde (yatay telefon, L01) ölçümler satır satır; genişte üç kutu yan yana. */}
      <div className="@container flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
        <p className="sr-only" aria-live="polite">
          {spoken}
        </p>
        <div className="grid grid-cols-1 @[330px]:grid-cols-3 @[330px]:gap-2.5">
          {(expanded ? rows : rows.slice(0, 3)).map((row) => {
            const [number, unit] = splitUnit(m ? row.value : '');
            return (
              <div
                key={row.label}
                className="flex min-w-0 items-baseline justify-between gap-2 border-b border-app py-1.5 @[330px]:flex-col @[330px]:items-start @[330px]:justify-start @[330px]:rounded-[10px] @[330px]:border-0 @[330px]:bg-panel-2 @[330px]:px-2.5 @[330px]:py-2"
              >
                <span className="truncate text-label text-muted">
                  <Rich text={row.label} />
                </span>
                <b className={`truncate font-mono text-[17px] leading-6 font-medium tabular ${m ? 'text-ink' : 'text-stopped'}`}>
                  {m ? number : '– – –'}
                  {unit && <span className="ml-1 text-small text-muted">{unit}</span>}
                </b>
              </div>
            );
          })}
        </div>
        {device && (
          <button
            type="button"
            onClick={() => onOpenDevices(part.id)}
            className="flex h-11 items-center gap-2 self-start rounded-[10px] border border-line-2 bg-panel px-3.5 text-sm font-medium"
          >
            <Icon name="devices" />
            {tr.phone.openDevices}
          </button>
        )}
        {!expanded && primary && primaryValue !== null && (
          <div className="flex items-center gap-2">
            <button type="button" className={STEP_BUTTON.replace('h-12 w-12', 'h-11 w-11')} disabled={down === null} aria-label={tr.phone.stepDownOf(primaryLabel)} onClick={() => down !== null && commit(primary.key)(down)}>
              −
            </button>
            <button
              type="button"
              onClick={() => onExpand(true)}
              aria-label={tr.phone.editValue(primaryLabel, formatSI(primaryValue, primary.unit, { trim: true, digits: 4 }))}
              className="h-11 min-w-0 flex-1 truncate rounded-[10px] border border-line-2 bg-panel font-mono text-[17px] font-medium"
            >
              {partValueText(part) || formatSI(primaryValue, primary.unit, { trim: true, digits: 4 })}
            </button>
            <button type="button" className={STEP_BUTTON.replace('h-12 w-12', 'h-11 w-11')} disabled={up === null} aria-label={tr.phone.stepUpOf(primaryLabel)} onClick={() => up !== null && commit(primary.key)(up)}>
              +
            </button>
            <span className="w-[74px] shrink-0 text-[11.5px] leading-tight text-ok">{tr.phone.liveApplied}</span>
          </div>
        )}
        {expanded && (
          <>
            {readout?.note && m && (
              <div className="flex flex-col gap-1 rounded-[10px] border border-info-line bg-info-soft px-3 py-2.5">
                <span className="text-label font-semibold text-info-ink">{tr.inspector.why}</span>
                <span className="text-[13.5px] leading-normal text-ink">
                  <Rich text={readout.note} />
                </span>
              </div>
            )}
            {def.propDefs.map((prop) => (
              <TouchPropField key={prop.key} part={part} prop={prop} values={values} live={prop === primary} onCommit={commit(prop.key)} />
            ))}
            <TouchLabelField label={part.label} otherLabels={otherLabels} onCommit={(label) => onUpdatePart(part.id, { label })} />
            <p className="text-label leading-normal text-muted">{tr.inspector.liveApplyNote}</p>
          </>
        )}
      </div>
    </>
  );
}

// --- Simülasyon başlamadı (P11) ------------------------------------------------------------

export function BlockedNotice({ lead, text, fixLabel, onFix }: { lead: string; text: string; fixLabel: string | null; onFix: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 pb-1">
      <div className="flex items-start gap-2.5">
        <svg width="22" height="22" viewBox="0 0 20 20" className="mt-0.5 shrink-0" aria-hidden="true">
          <circle cx="10" cy="10" r="9" fill="var(--color-danger)" />
          <path d="M10 5.5v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="14.2" r="1.2" fill="white" />
        </svg>
        <div className="flex flex-col gap-0.5">
          <b className="text-[17px] font-semibold">{tr.phone.blockedTitle}</b>
          <span className="text-[14.5px] leading-normal text-ink-2">
            <b className="font-semibold text-ink">{lead}</b> {text}
          </span>
        </div>
      </div>
      {fixLabel && (
        <button type="button" onClick={onFix} className="h-[52px] rounded-xl bg-accent px-3 text-[15.5px] font-semibold text-white active:brightness-110">
          {fixLabel}
        </button>
      )}
    </div>
  );
}
