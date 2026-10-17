// Parça kataloğu: her bileşen türünün pinleri, kapladığı alan, varsayılan değerleri ve
// özellik penceresindeki alanları. Türkçe adlar ve açıklamalar i18n/tr.ts içindedir.

import { METER_MODES } from '../sim/averager';
import {
  AC_MAX_FREQUENCY,
  AC_SOURCE_DEFAULTS,
  AMMETER_DEFAULTS,
  BATTERY_DEFAULTS,
  BJT_DEFAULTS,
  DCSUPPLY_DEFAULTS,
  DIODE_DEFAULTS,
  DIODE_LEGACY_MODEL,
  DIODE_MODELS,
  NJFET_DEFAULTS,
  NJFET_LEGACY_MODEL,
  NJFET_MODELS,
  NJFET_PRESETS,
  NMOS_DEFAULTS,
  NMOS_LEGACY_MODEL,
  NMOS_MODELS,
  NMOS_PRESETS,
  NPN_DEFAULTS,
  NPN_LEGACY_MODEL,
  NPN_MODELS,
  DCSUPPLY_MAX_VOLTAGE,
  FUNCGEN_DEFAULTS,
  FUNCGEN_LIMITS,
  SCOPE_INPUTS,
  PJFET_DEFAULTS,
  PMOSFET_DEFAULTS,
  ZENER_DEFAULTS,
  CAPACITOR_DEFAULTS,
  CAPACITOR_KINDS,
  CAPACITOR_LEGACY_KIND,
  INDUCTOR_DEFAULTS,
  FUSE_DEFAULTS,
  LAMP_DEFAULTS,
  LDR_DEFAULTS,
  NTC_DEFAULTS,
  POT_DEFAULTS,
  MOTOR_DEFAULTS,
  RELAY_DEFAULTS,
  TRANSFORMER_DEFAULTS,
  TRANSFORMER_MAX_COUPLING,
  LED_COLORS,
  LED_DEFAULTS,
  OSCILLOSCOPE_DEFAULTS,
  RESISTOR_DEFAULTS,
  SWITCH_DEFAULTS,
  TANK_DEFAULTS,
  TANK_LIMITS,
  TANK_MODES,
  VOLTMETER_DEFAULTS,
  WAVEFORMS,
} from '../sim/devices';
import { RESISTOR_POWER_RATINGS } from '../sim/ratings';
import type { DeviceType, PropValue } from '../sim/netlist';
import type { UnitSymbol } from '../sim/units';
import type { Point } from './types';

export type Category = 'sources' | 'passive' | 'semiconductors' | 'transistors' | 'switches' | 'outputs' | 'sensors' | 'meters' | 'instruments';

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
  /** Alanın altında kaydırıcı (potansiyometre, aydınlık, sıcaklık); `log`: logaritmik ölçek. */
  readonly slider?: { readonly min: number; readonly max: number; readonly step?: number; readonly log?: boolean };
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
  /**
   * Belgede bulunmayan özelliklerin eski anlamı: bu özellik eklenmeden önce kaydedilmiş devreler
   * (ör. "model" seçimi olmayan diyot genel modeldir). Yeni parçalar defaultProps'u alır.
   */
  readonly legacyProps?: Readonly<Record<string, PropValue>>;
  /** Model seçilince değişen özellikler (ör. BF245A seçilince I_DSS ve V_P). */
  readonly modelPresets?: Readonly<Record<string, Readonly<Record<string, PropValue>>>>;
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

function transistor(
  type: DeviceType,
  labelPrefix: string,
  defaultProps: Readonly<Record<string, PropValue>>,
  propDefs: readonly PropDef[],
  models?: Pick<PartDef, 'legacyProps' | 'modelPresets'>,
): PartDef {
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
    ...models,
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
  funcgen: {
    type: 'funcgen',
    category: 'instruments',
    labelPrefix: 'FG',
    // Çıkışlar sağ kenarda: OUT, TTL, COM.
    pins: [
      { x: 5, y: -2 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
    ],
    bounds: { x: -4, y: -3, w: 9, h: 6 },
    defaultProps: { ...FUNCGEN_DEFAULTS },
    propDefs: [
      { kind: 'select', key: 'waveform', options: WAVEFORMS },
      {
        kind: 'number',
        key: 'frequency',
        unit: 'Hz',
        min: { value: FUNCGEN_LIMITS.minFrequency, exclusive: false },
        max: FUNCGEN_LIMITS.maxFrequency,
      },
      { kind: 'number', key: 'amplitude', unit: 'V', min: { value: 0, exclusive: false }, max: FUNCGEN_LIMITS.maxAmplitude },
      { kind: 'number', key: 'offset', unit: 'V', min: { value: -FUNCGEN_LIMITS.maxOffset, exclusive: false }, max: FUNCGEN_LIMITS.maxOffset },
      { kind: 'number', key: 'duty', unit: '%', min: { value: FUNCGEN_LIMITS.minDuty, exclusive: false }, max: FUNCGEN_LIMITS.maxDuty },
      { kind: 'boolean', key: 'attenuate' },
      { kind: 'boolean', key: 'earthed' },
    ],
    showLabel: true,
    polarized: false,
  },
  dcsupply: {
    type: 'dcsupply',
    category: 'instruments',
    labelPrefix: 'PS',
    // Çıkışlar sağ kenarda: 1+, 1−, 2+, 2−.
    pins: [
      { x: 5, y: -3 },
      { x: 5, y: -1 },
      { x: 5, y: 1 },
      { x: 5, y: 3 },
    ],
    bounds: { x: -4, y: -4, w: 9, h: 8 },
    defaultProps: { ...DCSUPPLY_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'voltage1', unit: 'V', min: { value: 0, exclusive: false }, max: DCSUPPLY_MAX_VOLTAGE },
      { kind: 'number', key: 'currentLimit1', unit: 'A', min: { value: 0, exclusive: true }, max: 5 },
      { kind: 'number', key: 'voltage2', unit: 'V', min: { value: 0, exclusive: false }, max: DCSUPPLY_MAX_VOLTAGE },
      { kind: 'number', key: 'currentLimit2', unit: 'A', min: { value: 0, exclusive: true }, max: 5 },
    ],
    showLabel: true,
    polarized: false,
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
    propDefs: [
      { kind: 'number', key: 'resistance', unit: 'Ω', min: { value: 0, exclusive: true } },
      { kind: 'select', key: 'powerRating', options: RESISTOR_POWER_RATINGS },
    ],
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
      { kind: 'select', key: 'kind', options: CAPACITOR_KINDS },
      { kind: 'number', key: 'initialVoltage', unit: 'V' },
    ],
    showLabel: true,
    // Elektrolitik kondansatörün + ucu vardır: ters çevrilebilir (kutupsuzda çevirmek bir şey değiştirmez).
    polarized: true,
    legacyProps: { kind: CAPACITOR_LEGACY_KIND },
  },
  inductor: {
    type: 'inductor',
    category: 'passive',
    labelPrefix: 'L',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.1, w: 8, h: 2.2 },
    defaultProps: { ...INDUCTOR_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'inductance', unit: 'H', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'dcResistance', unit: 'Ω', min: { value: 0, exclusive: false } },
    ],
    showLabel: true,
    polarized: false,
  },
  potentiometer: {
    type: 'potentiometer',
    category: 'passive',
    labelPrefix: 'P',
    // Uçlar: 1. uç solda, sürgü üstte, 3. uç sağda.
    pins: [
      { x: -4, y: 0 },
      { x: 0, y: -3 },
      { x: 4, y: 0 },
    ],
    bounds: { x: -4, y: -3, w: 8, h: 4.1 },
    defaultProps: { ...POT_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'position', unit: '%', min: { value: 0, exclusive: false }, max: 100, slider: { min: 0, max: 100, step: 1 } },
      { kind: 'number', key: 'resistance', unit: 'Ω', min: { value: 0, exclusive: true } },
    ],
    showLabel: true,
    polarized: false,
  },
  transformer: {
    type: 'transformer',
    category: 'passive',
    labelPrefix: 'T',
    // Birincil solda (noktalı uç üstte), ikincil sağda.
    pins: [
      { x: -4, y: -3 },
      { x: -4, y: 3 },
      { x: 4, y: -3 },
      { x: 4, y: 3 },
    ],
    bounds: { x: -4, y: -4, w: 8, h: 8 },
    defaultProps: { ...TRANSFORMER_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'turnsRatio', unit: '', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'primaryInductance', unit: 'H', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'coupling', unit: '', min: { value: 0, exclusive: false }, max: TRANSFORMER_MAX_COUPLING },
      { kind: 'number', key: 'primaryResistance', unit: 'Ω', min: { value: 0, exclusive: false } },
      { kind: 'number', key: 'secondaryResistance', unit: 'Ω', min: { value: 0, exclusive: false } },
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
    defaultProps: { ...DIODE_DEFAULTS },
    propDefs: [{ kind: 'select', key: 'model', options: DIODE_MODELS }],
    showLabel: true,
    polarized: true,
    legacyProps: { model: DIODE_LEGACY_MODEL },
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
  npn: transistor(
    'npn',
    'Q',
    { ...NPN_DEFAULTS },
    [
      { kind: 'select', key: 'model', options: NPN_MODELS },
      { kind: 'number', key: 'beta', unit: '', min: { value: 1, exclusive: false }, max: 2000 },
    ],
    { legacyProps: { model: NPN_LEGACY_MODEL } },
  ),
  pnp: transistor('pnp', 'Q', { ...BJT_DEFAULTS }, [
    { kind: 'number', key: 'beta', unit: '', min: { value: 1, exclusive: false }, max: 2000 },
  ]),
  njfet: transistor(
    'njfet',
    'J',
    { ...NJFET_DEFAULTS },
    [
      { kind: 'select', key: 'model', options: NJFET_MODELS },
      { kind: 'number', key: 'idss', unit: 'A', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'pinchOff', unit: 'V', max: -0.1 },
    ],
    { legacyProps: { model: NJFET_LEGACY_MODEL }, modelPresets: NJFET_PRESETS },
  ),
  pjfet: transistor('pjfet', 'J', { ...PJFET_DEFAULTS }, [
    { kind: 'number', key: 'idss', unit: 'A', min: { value: 0, exclusive: true } },
    { kind: 'number', key: 'pinchOff', unit: 'V', min: { value: 0.1, exclusive: false } },
  ]),
  nmos: transistor(
    'nmos',
    'M',
    { ...NMOS_DEFAULTS },
    [
      { kind: 'select', key: 'model', options: NMOS_MODELS },
      { kind: 'number', key: 'threshold', unit: 'V', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'k', unit: 'A/V²', min: { value: 0, exclusive: true } },
    ],
    { legacyProps: { model: NMOS_LEGACY_MODEL }, modelPresets: NMOS_PRESETS },
  ),
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
  motor: {
    type: 'motor',
    category: 'outputs',
    labelPrefix: 'M',
    pins: TWO_PINS,
    bounds: { x: -4, y: -2, w: 8, h: 4 },
    defaultProps: { ...MOTOR_DEFAULTS },
    // Tork mN·m, tork sabiti mN·m/A, atalet g·cm² cinsinden (veri sayfalarındaki gibi).
    propDefs: [
      { kind: 'number', key: 'loadTorque', unit: '', min: { value: 0, exclusive: false } },
      { kind: 'number', key: 'armatureResistance', unit: 'Ω', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'armatureInductance', unit: 'H', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'torqueConstant', unit: '', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'inertia', unit: '', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'frictionTorque', unit: '', min: { value: 0, exclusive: false } },
    ],
    showLabel: true,
    polarized: true,
  },
  relay: {
    type: 'relay',
    category: 'switches',
    labelPrefix: 'K',
    // Sargı solda (iki ucu), kontak sağda: NK ve NA üstte, ortak uç C altta. Bu sırayla sargı ve
    // kontak devreleri (kendini tutma, transistörlü sürücü) kablo kesişmeden çizilebilir.
    pins: [
      { x: -4, y: -2 },
      { x: -4, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: -2 },
      { x: 4, y: -3 },
    ],
    bounds: { x: -4, y: -4, w: 8, h: 6.4 },
    defaultProps: { ...RELAY_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'coilResistance', unit: 'Ω', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'inductance', unit: 'H', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'pullInVoltage', unit: 'V', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'dropOutVoltage', unit: 'V', min: { value: 0, exclusive: false } },
    ],
    showLabel: true,
    polarized: false,
  },
  ldr: {
    type: 'ldr',
    category: 'sensors',
    labelPrefix: 'LDR',
    pins: TWO_PINS,
    bounds: { x: -4, y: -2.8, w: 8, h: 3.9 },
    defaultProps: { ...LDR_DEFAULTS },
    // Aydınlık lüks (lx) cinsinden.
    propDefs: [
      { kind: 'number', key: 'illuminance', unit: '', min: { value: 0, exclusive: false }, slider: { min: 0.1, max: 100000, log: true } },
      { kind: 'number', key: 'lightResistance', unit: 'Ω', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'gamma', unit: '', min: { value: 0, exclusive: false }, max: 2 },
    ],
    showLabel: true,
    polarized: false,
  },
  ntc: {
    type: 'ntc',
    category: 'sensors',
    labelPrefix: 'NTC',
    pins: TWO_PINS,
    bounds: { x: -4, y: -2.2, w: 8, h: 3.3 },
    defaultProps: { ...NTC_DEFAULTS },
    // Sıcaklık °C cinsinden.
    propDefs: [
      { kind: 'number', key: 'temperature', unit: '', min: { value: -55, exclusive: false }, max: 150, slider: { min: -40, max: 125, step: 1 } },
      { kind: 'number', key: 'resistance25', unit: 'Ω', min: { value: 0, exclusive: true } },
    ],
    showLabel: true,
    polarized: false,
  },
  speaker: {
    type: 'speaker',
    category: 'outputs',
    labelPrefix: 'HP',
    pins: TWO_PINS,
    bounds: { x: -4, y: -2.9, w: 8, h: 4.1 },
    defaultProps: {},
    propDefs: [],
    showLabel: true,
    polarized: false,
  },
  buzzer: {
    type: 'buzzer',
    category: 'outputs',
    labelPrefix: 'BZ',
    pins: TWO_PINS,
    bounds: { x: -4, y: -2.7, w: 8, h: 3.4 },
    defaultProps: {},
    propDefs: [],
    showLabel: true,
    polarized: true,
  },
  fuse: {
    type: 'fuse',
    category: 'switches',
    labelPrefix: 'F',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1, w: 8, h: 2 },
    defaultProps: { ...FUSE_DEFAULTS },
    propDefs: [{ kind: 'number', key: 'rating', unit: 'A', min: { value: 0, exclusive: true } }],
    showLabel: true,
    polarized: false,
  },
  lamp: {
    type: 'lamp',
    category: 'outputs',
    labelPrefix: 'LP',
    pins: TWO_PINS,
    bounds: { x: -4, y: -1.8, w: 8, h: 3.6 },
    defaultProps: { ...LAMP_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'ratedVoltage', unit: 'V', min: { value: 0, exclusive: true } },
      { kind: 'number', key: 'ratedPower', unit: 'W', min: { value: 0, exclusive: true } },
    ],
    showLabel: true,
    polarized: false,
  },
  tank: {
    type: 'tank',
    category: 'sensors',
    labelPrefix: 'H',
    // Problar sağ kenarda, sembolde ucunun durduğu yükseklikte: ortak (dipte), Seviye 1, 2, 3.
    pins: [
      { x: 5, y: 3 },
      { x: 5, y: 1 },
      { x: 5, y: -1 },
      { x: 5, y: -3 },
    ],
    bounds: { x: -4, y: -4, w: 9, h: 8 },
    // Ayarlar raftaki panelden (seviye, akış, dolma süresi, su direnci).
    defaultProps: { ...TANK_DEFAULTS },
    propDefs: [
      { kind: 'number', key: 'level', unit: '%', min: { value: 0, exclusive: false }, max: 100 },
      { kind: 'select', key: 'mode', options: TANK_MODES },
      { kind: 'number', key: 'fillTime', unit: 's', min: { value: TANK_LIMITS.minFillTime, exclusive: false }, max: TANK_LIMITS.maxFillTime },
      {
        kind: 'number',
        key: 'waterResistance',
        unit: 'Ω',
        min: { value: TANK_LIMITS.minWaterResistance, exclusive: false },
        max: TANK_LIMITS.maxWaterResistance,
      },
    ],
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
    category: 'instruments',
    labelPrefix: 'OSC',
    // Girişler sol kenarda: A, B ve ortak uç (COM).
    pins: [
      { x: -5, y: -2 },
      { x: -5, y: 0 },
      { x: -5, y: 2 },
    ],
    bounds: { x: -5, y: -3, w: 9, h: 6 },
    // Ön panel ayarları (bölme, kuplaj, konum, tetik, ADD/INV) osiloskop panelinden değiştirilir;
    // giriş ve toprak bağlantısı özellik penceresinden.
    defaultProps: { ...OSCILLOSCOPE_DEFAULTS },
    propDefs: [
      { kind: 'select', key: 'input', options: SCOPE_INPUTS },
      { kind: 'boolean', key: 'earthed' },
    ],
    showLabel: true,
    polarized: false,
  },
};

/** Kütüphane panelindeki sıra. */
export const CATEGORIES: ReadonlyArray<{ readonly id: Category; readonly types: readonly DeviceType[] }> = [
  { id: 'sources', types: ['battery', 'acsource', 'ground'] },
  { id: 'passive', types: ['resistor', 'potentiometer', 'capacitor', 'inductor', 'transformer'] },
  { id: 'semiconductors', types: ['diode', 'zener', 'led'] },
  { id: 'transistors', types: ['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos'] },
  { id: 'switches', types: ['switch', 'relay', 'fuse'] },
  { id: 'outputs', types: ['lamp', 'motor', 'speaker', 'buzzer'] },
  { id: 'sensors', types: ['ldr', 'ntc', 'tank'] },
  { id: 'meters', types: ['voltmeter', 'ammeter'] },
  { id: 'instruments', types: ['funcgen', 'dcsupply', 'oscilloscope'] },
];

/**
 * Parçanın bir özelliğinin şu anki değeri: belgedeki değer; yoksa (eski kayıt) eski anlamı,
 * o da yoksa varsayılan.
 */
export function partProp(type: DeviceType, props: Readonly<Record<string, PropValue>>, key: string): PropValue | undefined {
  const def = CATALOG[type];
  return props[key] ?? def.legacyProps?.[key] ?? def.defaultProps[key];
}

/** Bir özelliği değiştirir; model seçimi değiştiyse o modelin ön ayarlarını da uygular. */
export function withProp(
  type: DeviceType,
  props: Readonly<Record<string, PropValue>>,
  key: string,
  value: PropValue,
): Record<string, PropValue> {
  const preset = key === 'model' && typeof value === 'string' ? CATALOG[type].modelPresets?.[value] : undefined;
  return { ...props, ...preset, [key]: value };
}

export function isDeviceType(value: unknown): value is DeviceType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, value);
}
