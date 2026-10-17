// Parça özelliklerinin düzenlenmesinde ortak kurallar: sayı ve ad doğrulaması, parçaya özel notlar
// ve sık kullanılan değerler. İnceleme paneli ve (telefonda) özellik penceresi bunları kullanır.

import { tr } from '../i18n/tr';
import { partProp, type NumberPropDef } from '../model/catalog';
import type { Part } from '../model/types';
import { acRms, WAVEFORMS, type Waveform } from '../sim/devices/acsource';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import type { DeviceType, PropValue } from '../sim/netlist';
import { formatSI, parseValue } from '../sim/units';

export { formatEditable as presetLabel } from '../sim/units';

export function validateNumber(def: NumberPropDef, text: string): { value: number } | { error: string } {
  const parsed = parseValue(text, def.unit || undefined);
  if (!parsed.ok) {
    if (parsed.error === 'empty') return { error: tr.properties.errors.empty };
    if (parsed.error === 'wrong-unit') return { error: tr.properties.errors.wrongUnit(def.unit) };
    return { error: tr.properties.errors.invalid };
  }
  if (def.min) {
    if (def.min.exclusive && parsed.value <= def.min.value) return { error: tr.properties.errors.positive };
    if (!def.min.exclusive && parsed.value < def.min.value) return { error: tr.properties.errors.nonNegative };
  }
  if (def.max !== undefined && parsed.value > def.max) {
    return { error: tr.properties.errors.max(formatSI(def.max, def.unit, { trim: true })) };
  }
  return { value: parsed.value };
}

/** Parçanın adı: boş olamaz, başka bir parçada kullanılamaz. */
export function validateLabel(text: string, otherLabels: ReadonlySet<string>): { value: string } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { error: tr.properties.errors.labelEmpty };
  if (otherLabels.has(trimmed)) return { error: tr.properties.errors.labelTaken };
  return { value: trimmed };
}

export function ledNote(color: PropValue | undefined): string {
  const model = LED_MODELS[(typeof color === 'string' && color in LED_MODELS ? color : 'red') as LedColor];
  return tr.properties.ledSpec(
    formatSI(model.forwardVoltage, 'V', { trim: true }),
    formatSI(model.maxCurrent, 'A', { trim: true }),
  );
}

/** AC kaynağın etkin değeri ve periyodu; değerler metin (yazılırken) ya da sayı olabilir. */
export function acNote(values: Readonly<Record<string, PropValue>>): string | undefined {
  const read = (key: string) => {
    const raw = values[key];
    if (typeof raw === 'number') return raw;
    const parsed = parseValue(String(raw ?? ''));
    return parsed.ok ? parsed.value : null;
  };
  const amplitude = read('amplitude');
  const frequency = read('frequency');
  const offset = read('offset') ?? 0;
  const waveform = (WAVEFORMS as readonly PropValue[]).includes(values.waveform ?? '') ? (values.waveform as Waveform) : 'sine';
  if (amplitude === null || frequency === null || frequency <= 0) return undefined;
  return tr.properties.acSpec(
    formatSI(acRms(waveform, Math.abs(amplitude), offset), 'V'),
    formatSI(1 / frequency, 's', { trim: true, digits: 4 }),
  );
}

/** Parçaya özel bilgi notu (özellik alanlarının altında). */
export function partNote(type: DeviceType, values: Readonly<Record<string, PropValue>>): string | undefined {
  if (typeof values.model === 'string' && tr.properties.modelNotes[values.model]) return tr.properties.modelNotes[values.model];
  if (type === 'led') return ledNote(values.color);
  if (type === 'acsource') return acNote(values);
  if (type === 'voltmeter' || type === 'ammeter') return `${tr.properties.notes[type] ?? ''} ${tr.properties.meterModeNote}`;
  return tr.properties.notes[type];
}

/**
 * Sık kullanılan değerler (alanın altındaki çipler; tasarım: M03). Laboratuvar föyündeki
 * parçalar: dirençler 100 Ω … 100 kΩ, kondansatörler 1 / 2,2 / 10 / 22 / 470 µF.
 */
const PRESETS: Partial<Record<DeviceType, Record<string, readonly number[]>>> = {
  resistor: { resistance: [100, 220, 330, 470, 1e3, 4.7e3, 10e3, 100e3] },
  capacitor: { capacitance: [1e-6, 2.2e-6, 10e-6, 22e-6, 100e-6, 470e-6] },
  inductor: { inductance: [1e-3, 2.2e-3, 4.7e-3, 10e-3, 22e-3, 100e-3] },
  transformer: { turnsRatio: [0.5, 1, 2, 5, 10, 16] },
  battery: { voltage: [1.5, 3, 4.5, 5, 9, 12] },
};

export function valuePresets(type: DeviceType, key: string): readonly number[] {
  return PRESETS[type]?.[key] ?? [];
}

/** Formdaki bir alanın şu anki değeri: parçadaki değer, yoksa eski kayıtlardaki anlamı ya da varsayılan. */
export function currentProp(part: Part, key: string): PropValue | undefined {
  return partProp(part.type, part.props, key);
}

// --- − / + düğmelerinin adımı (telefon: P04, P05) ------------------------------------------

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const SERIES_125 = [1, 2, 5];

export type StepKind = 'e12' | 'linear' | 'step125';

/** Direnç ve sığa E12 dizisinde, gerilim ve yüzde doğrusal, diğerleri (frekans, akım, β) 1-2-5 dizisinde. */
export function stepKind(def: NumberPropDef): StepKind {
  if (def.unit === 'Ω' || def.unit === 'F') return 'e12';
  if (def.unit === 'V' || def.unit === '%') return 'linear';
  return 'step125';
}

/** Değerden büyük (ya da küçük) ilk dizi elemanı. */
function stepSeries(mantissas: readonly number[], value: number, direction: 1 | -1): number {
  if (!(value > 0)) return 1;
  const exp = Math.floor(Math.log10(value) + 1e-9);
  const candidates: number[] = [];
  for (let e = exp - 1; e <= exp + 1; e++) for (const m of mantissas) candidates.push(Number((m * 10 ** e).toPrecision(6)));
  candidates.sort((a, b) => a - b);
  const found =
    direction > 0
      ? candidates.find((c) => c > value * (1 + 1e-9))
      : [...candidates].reverse().find((c) => c < value * (1 - 1e-9));
  return found ?? value;
}

/** Bir adım sonraki değer; sınırın ötesine geçiyorsa ya da değişmiyorsa null. */
export function stepValue(def: NumberPropDef, value: number, direction: 1 | -1): number | null {
  let next: number;
  const kind = stepKind(def);
  if (kind === 'e12') {
    next = value <= 0 ? (direction > 0 ? 1 : value) : stepSeries(E12, value, direction);
  } else if (kind === 'step125') {
    next = value <= 0 ? (direction > 0 ? 1 : value) : stepSeries(SERIES_125, value, direction);
  } else {
    const step = def.unit === '%' ? 5 : Math.abs(value + direction * 0.05) >= 2 ? 0.5 : 0.1;
    next = Number((Math.round((value + direction * step) / step) * step).toFixed(6));
  }
  if (def.min) {
    if (def.min.exclusive ? next <= def.min.value : next < def.min.value) return null;
  }
  if (def.max !== undefined && next > def.max) next = def.max;
  return Math.abs(next - value) <= Math.abs(value) * 1e-12 ? null : next;
}
