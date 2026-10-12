// Parça kataloğu: her bileşen türünün pinleri, kapladığı alan, varsayılan değerleri ve
// özellik penceresindeki alanları. Türkçe adlar ve açıklamalar i18n/tr.ts içindedir.

import {
  AMMETER_DEFAULTS,
  BATTERY_DEFAULTS,
  CAPACITOR_DEFAULTS,
  LED_COLORS,
  LED_DEFAULTS,
  RESISTOR_DEFAULTS,
  SWITCH_DEFAULTS,
  VOLTMETER_DEFAULTS,
} from '../sim/devices';
import type { DeviceType, PropValue } from '../sim/netlist';
import type { UnitSymbol } from '../sim/units';
import type { Point } from './types';

export type Category = 'sources' | 'passive' | 'semiconductors' | 'switches' | 'meters';

export interface NumberPropDef {
  readonly kind: 'number';
  readonly key: string;
  readonly unit: UnitSymbol;
  /** En küçük değer; `exclusive` ise bu değer de kabul edilmez (ör. direnç > 0). */
  readonly min?: { readonly value: number; readonly exclusive: boolean };
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
}

const TWO_PINS: readonly Point[] = [
  { x: -4, y: 0 },
  { x: 4, y: 0 },
];

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
      { kind: 'boolean', key: 'ideal' },
      { kind: 'number', key: 'resistance', unit: 'Ω', min: { value: 0, exclusive: true }, disabledWhen: 'ideal' },
    ],
    showLabel: true,
    polarized: true,
  },
};

/** Kütüphane panelindeki sıra. */
export const CATEGORIES: ReadonlyArray<{ readonly id: Category; readonly types: readonly DeviceType[] }> = [
  { id: 'sources', types: ['battery', 'ground'] },
  { id: 'passive', types: ['resistor', 'capacitor'] },
  { id: 'semiconductors', types: ['diode', 'led'] },
  { id: 'switches', types: ['switch'] },
  { id: 'meters', types: ['voltmeter', 'ammeter'] },
];

export function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, value);
}
