// Parça özelliklerinin düzenlenmesinde ortak kurallar: sayı ve ad doğrulaması, parçaya özel notlar
// ve sık kullanılan değerler. İnceleme paneli ve (telefonda) özellik penceresi bunları kullanır.

import { tr } from '../i18n/tr';
import type { NumberPropDef } from '../model/catalog';
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
  battery: { voltage: [1.5, 3, 4.5, 5, 9, 12] },
};

export function valuePresets(type: DeviceType, key: string): readonly number[] {
  return PRESETS[type]?.[key] ?? [];
}

/** Formdaki bir alanın şu anki değeri: parçadaki değer, yoksa kataloğun varsayılanı. */
export function currentProp(part: Part, key: string, defaults: Readonly<Record<string, PropValue>>): PropValue | undefined {
  return part.props[key] ?? defaults[key];
}
