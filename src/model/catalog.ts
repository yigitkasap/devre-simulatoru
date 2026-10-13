// Parça kataloğu: her bileşen türünün pinleri, kapladığı alan, varsayılan değerleri ve
// özellik penceresindeki alanları. Türkçe adlar ve açıklamalar i18n/tr.ts içindedir.

import { METER_MODES } from '../sim/averager';
import {
  AC_MAX_FREQUENCY,
  AC_SOURCE_DEFAULTS,
  AMMETER_DEFAULTS,
  BATTERY_DEFAULTS,
  BJT_DEFAULTS,
  JFET_DEFAULTS,
  MOSFET_DEFAULTS,
  PJFET_DEFAULTS,
  PMOSFET_DEFAULTS,
  ZENER_DEFAULTS,
  CAPACITOR_DEFAULTS,
  LED_COLORS,
  LED_DEFAULTS,
  OSCILLOSCOPE_DEFAULTS,
  RESISTOR_DEFAULTS,
  SWITCH_DEFAULTS,
  VOLTMETER_DEFAULTS,
  WAVEFORMS,
} from '../sim/devices';
import type { DeviceType, PropValue } from '../sim/netlist';
import type { UnitSymbol } from '../sim/units';
import type { Point } from './types';

export type Category = 'sources' | 'passive' | 'semiconductors' | 'transistors' | 'switches' | 'meters';

export interface NumberPropDef {
  readonly kind: 'number';
  readonly key: string;
  /** Birimsiz büyüklükte (ör. β) boş. */
  readonly unit: UnitSymbol | '';
  /** En küçük değer; `exclusive` ise bu değer de kabul edilmez (ör. direnç > 0). */
  readonly min?: { readonly value: number; readonly exclusive: boolean };
  /** En büyük değer (dahil). */
  readonly max?: number;
  /** Bu boolean özellik true iken alan devre dışıdır (ör. ideal voltmetrede iç direnç). */
  readonly disabledWhen?: string;
}

export interface BooleanPropDef {
  readonly kind: 'boolean';
  readonly key: string;
}

export interface SelectPropDef {
  readonly kind: 'select';
  readonly key: string;
  readonly options: readonly string[];
}

export type PropDef = NumberPropDef | BooleanPropDef | SelectPropDef;

/** Dikdörtgen (yerel ızgara koordinatı). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PartDef {
  readonly type: DeviceType;
  readonly category: Category;
  /** Otomatik ad öneki: R → R1, R2... */
  readonly labelPrefix: string;
  /** Pinlerin yerel konumları (ızgara birimi). Sıra çözücünün pin sırasıyla aynıdır. */
  readonly pins: readonly Point[];
  /** Seçme ve tıklama alanı (yerel ızgara birimi). */
  readonly bounds: Box;
  readonly defaultProps: Readonly<Record<string, PropValue>>;
  readonly propDefs: readonly PropDef[];
  /** Adı tuvalde gösterilsin mi? (Toprakta gösterilmez.) */
  readonly showLabel: boolean;
  /** Yönlü parça mı? (Ters çevir komutu yalnızca bunlarda çalışır.) */
  readonly polarized: boolean;
  /** Ad ve değer yazısı parçanın sağında (üç uçlu transistörlerde üst ve alt uçlar kablolu olur). */
  readonly labelRight?: boolean;
}

const TWO_PINS: readonly Point[] = [
  { x: -4, y: 0 },
  { x: 4, y: 0 },
];

/**
 * Transistörlerin uçları: BJT'de [C, B, E], FET'te [D, G, S]. Kontrol ucu (B, G) solda,
 * öbür ikisi sağda üstte ve altta.
 */
const TRANSISTOR_PINS: readonly Point[] = [
  { x: 2, y: -4 },
  { x: -4, y: 0 },
  { x: 2, y: 4 },
];
const TRANSISTOR_BOUNDS: Box = { x: -4, y: -4, w: 7, h: 8 };

function transistor(type: DeviceType, labelPrefix: string, defaultProps: Readonly<Record<string, PropValue>>, propDefs: readonly PropDef[]): PartDef {
  return {
    type,
    category: 'transistors',
    labelPrefix,
    pins: TRANSISTOR_PINS,
    bounds: TRANSISTOR_BOUNDS,
    defaultProps,
    propDefs,
    showLabel: true,
    polarized: false,
    labelRight: true,
  };
}

/** Ölçü aletlerinin DC / AC kipi. */
const METER_MODE_PROP: PropDef = { kind: 'select', key: 'mode', options: METER_MODES };

export const CATALOG: Readonly<Record<DeviceType, PartDef>> = {
  battery: {
    type: 'battery',
    category: 'sources',
    labelPrefix: 'B',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.8, w: 8, h: 3.6 },
    defaultProps: { ...BATTERY_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'voltage', unit: 'V' },
      { kind: 'number', key: 'internalResistance', unit: 'Ω', min: { value: 0, exclusive: false } },
    ],
    showLabel: true,
    polarized: true,
  },
  acsource: {
    type: 'acsource',
    category: 'sources',
    labelPrefix: 'AC',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.8, w: 8, h: 3.6 },
    defaultProps: { ...AC_SOURCE_DEFAULTS },
    propDefs: [
      { kind: 'select', key: 'waveform', options: WAVEFORMS },
      { kind: 'number', key: 'amplitude', unit: 'V', min: { value: 0, exclusive: false } },
      { kind: 'number', key: 'frequency', unit: 'Hz', min: { value: 0, exclusive: true }, max: AC_MAX_FREQUENCY },
      { kind: 'number', key: 'offset', unit: 'V' },
      { kind: 'number', key: 'internalResistance', unit: 'Ω', min: { value: 0, exclusive: false } },
    ],
    showLabel: true,
    polarized: true,
  },
  ground: {
    type: 'ground',
    category: 'sources',
    labelPrefix: 'GND',
    pins: [{ x: 0, y: 0 }],
    bounds: { x: -1.4, y: -0.4, w: 2.8, h: 2.8 },
    defaultProps: {},
    propDefs: [],
    showLabel: false,
    polarized: false,
  },
  resistor: {
    type: 'resistor',
    category: 'passive',
    labelPrefix: 'R',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.1, w: 8, h: 2.2 },
    defaultProps: { ...RESISTOR_DEFAULTS },
    propDefs: [{ kind: 'number', key: 'resistance', unit: 'Ω', min: { value: 0, exclusive: true } }],
    showLabel: true,
    polarized: false,
  },
  capacitor: {
    type: 'capacitor',
    category: 'passive',
    labelPrefix: 'C',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.6, w: 8, h: 3.2 },
    defaultProps: { ...CAPACITOR_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'capacitance', unit: 'F', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'initialVoltage', unit: 'V' },
    ],
    showLabel: true,
    polarized: false,
  },
  diode: {
    type: 'diode',
    category: 'semiconductors',
    labelPrefix: 'D',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.2, w: 8, h: 2.4 },
    defaultProps: {},
    propDefs: [],
    showLabel: true,
    polarized: true,
  },
  zener: {
    type: 'zener',
    category: 'semiconductors',
    labelPrefix: 'Z',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.4, w: 8, h: 2.8 },
    defaultProps: { ...ZENER_DEFAULTS },
    propDefs: [{ kind: 'number', key: 'zenerVoltage', unit: 'V', min: { value: 0.5, exclusive: false }, max: 200 }],
    showLabel: true,
    polarized: true,
  },
  npn: transistor('npn', 'Q', { ...BJT_DEFAULTS }, [
    { kind: 'number', key: 'beta', unit: '', min: { value: 1, exclusive: false }, max: 2000 },
  ]),
  pnp: transistor('pnp', 'Q', { ...BJT_DEFAULTS }, [
    { kind: 'number', key: 'beta', unit: '', min: { value: 1, exclusive: false }, max: 2000 },
  ]),
  njfet: transistor('njfet', 'J', { ...JFET_DEFAULTS }, [
    { kind: 'number', key: 'idss', unit: 'A', min: { value: 0, exclusive: true } },
    { kind: 'number', key: 'pinchOff', unit: 'V', max: -0.1 },
  ]),
  pjfet: transistor('pjfet', 'J', { ...PJFET_DEFAULTS }, [
    { kind: 'number', key: 'idss', unit: 'A', min: { value: 0, exclusive: true } },
    { kind: 'number', key: 'pinchOff', unit: 'V', min: { value: 0.1, exclusive: false } },
  ]),
  nmos: transistor('nmos', 'M', { ...MOSFET_DEFAULTS }, [
    { kind: 'number', key: 'threshold', unit: 'V', min: { value: 0, exclusive: true } },
    { kind: 'number', key: 'k', unit: 'A/V²', min: { value: 0, exclusive: true } },
  ]),
  pmos: transistor('pmos', 'M', { ...PMOSFET_DEFAULTS }, [
    { kind: 'number', key: 'threshold', unit: 'V', max: -0.01 },
    { kind: 'number', key: 'k', unit: 'A/V²', min: { value: 0, exclusive: true } },
  ]),
  led: {
    type: 'led',
    category: 'semiconductors',
    labelPrefix: 'LED',
    pins: TWO_PINS,
    bounds: { x: -4, y: -2.4, w: 8, h: 3.6 },
    defaultProps: { ...LED_DEFAULTS },
    propDefs: [{ kind: 'select', key: 'color', options: LED_COLORS }],
    showLabel: true,
    polarized: true,
  },
  switch: {
    type: 'switch',
    category: 'switches',
    labelPrefix: 'S',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.8, w: 8, h: 2.4 },
    defaultProps: { ...SWITCH_DEFAULTS },
    propDefs: [{ kind: 'boolean', key: 'closed' }],
    showLabel: true,
    polarized: false,
  },
  voltmeter: {
    type: 'voltmeter',
    category: 'meters',
    labelPrefix: 'V',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.7, w: 8, h: 3.4 },
    defaultProps: { ...VOLTMETER_DEFAULTS },
    propDefs: [
      METER_MODE_PROP,
      { kind: 'boolean', key: 'ideal' },
      { kind: 'number', key: 'resistance', unit: 'Ω', min: { value: 0, exclusive: true }, disabledWhen: 'ideal' },
    ],
    showLabel: true,
    polarized: true,
  },
  ammeter: {
    type: 'ammeter',
    category: 'meters',
    labelPrefix: 'A',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.7, w: 8, h: 3.4 },
    defaultProps: { ...AMMETER_DEFAULTS },
    propDefs: [
      METER_MODE_PROP,
      { kind: 'boolean', key: 'ideal' },
      { kind: 'number', key: 'resistance', unit: 'Ω', min: { value: 0, exclusive: true }, disabledWhen: 'ideal' },
    ],
    showLabel: true,
    polarized: true,
  },
  oscilloscope: {
    type: 'oscilloscope',
    category: 'meters',
    labelPrefix: 'OSC',
    // Girişler sol kenarda: A, B ve ortak uç (COM).
    pins: [
      { x: -5, y: -2 },
      { x: -5, y: 0 },
      { x: -5, y: 2 },
    ],
    bounds: { x: -5, y: -3, w: 9, h: 6 },
    // Ayarlar (bölme başına süre/gerilim, konum, tetik) osiloskop panelinden değiştirilir.
    defaultProps: { ...OSCILLOSCOPE_DEFAULTS },
    propDefs: [],
    showLabel: true,
    polarized: false,
  },
};

/** Kütüphane panelindeki sıra. */
export const CATEGORIES: ReadonlyArray<{ readonly id: Category; readonly types: readonly DeviceType[] }> = [
  { id: 'sources', types: ['battery', 'acsource', 'ground'] },
  { id: 'passive', types: ['resistor', 'capacitor'] },
  { id: 'semiconductors', types: ['diode', 'zener', 'led'] },
  { id: 'transistors', types: ['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos'] },
  { id: 'switches', types: ['switch'] },
  { id: 'meters', types: ['voltmeter', 'ammeter', 'oscilloscope'] },
];

export function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, value);
}
