// Lojik entegrelerin bacak tanımları: çözücü (sim/devices/logic.ts), şema sembolü, defter kartı, 3B
// ve PCB aynı tanımı kullanır. Bacak adları ve sırası TI veri sayfalarındaki DIP (N / E kılıf) bacak
// şemalarından (README, "Lojik entegreler").

import type { DeviceType } from '../sim/netlist';

/** Kapı türü (ANSI şekli ve doğruluk tablosu). */
export type GateKind = 'nand' | 'nor' | 'not' | 'and' | 'or' | 'xor';

/** Bir kapı: giriş ve çıkış bacaklarının numaraları (1'den). */
export interface ChipGate {
  readonly inputs: readonly number[];
  readonly output: number;
}

/** Kapı entegresi: kapı türü, 14 bacağın adları ve kapılar. */
export interface GateChip {
  readonly kind: GateKind;
  readonly names: readonly string[];
  readonly gates: readonly ChipGate[];
}

/** Dört iki girişli kapı (7400, 7408, 7432, 7486): 1A 1B 1Y 2A 2B 2Y GND 3Y 3A 3B 4Y 4A 4B VCC. */
const QUAD_NAMES = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
const QUAD_GATES: readonly ChipGate[] = [
  { inputs: [1, 2], output: 3 },
  { inputs: [4, 5], output: 6 },
  { inputs: [9, 10], output: 8 },
  { inputs: [12, 13], output: 11 },
];

export const GATE_CHIPS = {
  ic7400: { kind: 'nand', names: QUAD_NAMES, gates: QUAD_GATES },
  // 7402'de çıkış önce: 1Y 1A 1B 2Y 2A 2B GND 3A 3B 3Y 4A 4B 4Y VCC.
  ic7402: {
    kind: 'nor',
    names: ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'],
    gates: [
      { inputs: [2, 3], output: 1 },
      { inputs: [5, 6], output: 4 },
      { inputs: [8, 9], output: 10 },
      { inputs: [11, 12], output: 13 },
    ],
  },
  // Altı DEĞİL kapısı: 1A 1Y 2A 2Y 3A 3Y GND 4Y 4A 5Y 5A 6Y 6A VCC.
  ic7404: {
    kind: 'not',
    names: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
    gates: [
      { inputs: [1], output: 2 },
      { inputs: [3], output: 4 },
      { inputs: [5], output: 6 },
      { inputs: [9], output: 8 },
      { inputs: [11], output: 10 },
      { inputs: [13], output: 12 },
    ],
  },
  ic7408: { kind: 'and', names: QUAD_NAMES, gates: QUAD_GATES },
  ic7432: { kind: 'or', names: QUAD_NAMES, gates: QUAD_GATES },
  ic7486: { kind: 'xor', names: QUAD_NAMES, gates: QUAD_GATES },
} as const satisfies Record<string, GateChip>;

export type GateChipType = keyof typeof GATE_CHIPS;

export const GATE_CHIP_TYPES = Object.keys(GATE_CHIPS) as GateChipType[];

export function isGateChip(type: DeviceType): type is GateChipType {
  return Object.prototype.hasOwnProperty.call(GATE_CHIPS, type);
}

/** Kapının çıkışı (girişler 0/1). */
export function gateOutput(kind: GateKind, inputs: readonly number[]): number {
  const ones = inputs.filter((v) => v === 1).length;
  switch (kind) {
    case 'and':
      return ones === inputs.length ? 1 : 0;
    case 'nand':
      return ones === inputs.length ? 0 : 1;
    case 'or':
      return ones > 0 ? 1 : 0;
    case 'nor':
      return ones > 0 ? 0 : 1;
    case 'xor':
      return ones % 2;
    case 'not':
      return inputs[0] === 1 ? 0 : 1;
  }
}

/** Model seçimi: aynı işlevin 74HC ve 74LS sürümü (ör. 74HC08 / 74LS08). 7486 ve 7474'ün LS'si A sürümü. */
export function gateModels(type: GateChipType | 'ic7474'): readonly string[] {
  const n = type.slice(4);
  return [`74HC${n}`, type === 'ic7486' || type === 'ic7474' ? `74LS${n}A` : `74LS${n}`];
}

/**
 * Bütün lojik entegreler (kapılar, 7474, CD4017, CD4511): bacak adları (1'den), besleme bacakları,
 * girişler ve çıkışlar (bacak numarası), etkin düşük (üstü çizgili) adlar.
 */
export interface LogicChipDef {
  readonly names: readonly string[];
  readonly vcc: number;
  readonly gnd: number;
  readonly inputs: readonly number[];
  readonly outputs: readonly number[];
  /** Adı üstü çizgili yazılan bacaklar (etkin düşük girişler, Q̄ çıkışları). */
  readonly bars: readonly number[];
}

function gateDef(type: GateChipType): LogicChipDef {
  const chip = GATE_CHIPS[type];
  return {
    names: chip.names,
    vcc: 14,
    gnd: 7,
    inputs: chip.gates.flatMap((g) => g.inputs),
    outputs: chip.gates.map((g) => g.output),
    bars: [],
  };
}

export const LOGIC_CHIPS: Readonly<Record<GateChipType | 'ic7474' | 'cd4017' | 'cd4511', LogicChipDef>> = {
  ...(Object.fromEntries(GATE_CHIP_TYPES.map((t) => [t, gateDef(t)])) as Record<GateChipType, LogicChipDef>),
  // SN74HC74 / SN74LS74A: 1CLR̄ 1D 1CLK 1PRĒ 1Q 1Q̄ GND 2Q̄ 2Q 2PRĒ 2CLK 2D 2CLR̄ VCC.
  ic7474: {
    names: ['1CLR', '1D', '1CLK', '1PRE', '1Q', '1Q', 'GND', '2Q', '2Q', '2PRE', '2CLK', '2D', '2CLR', 'VCC'],
    vcc: 14,
    gnd: 7,
    inputs: [1, 2, 3, 4, 13, 12, 11, 10],
    outputs: [5, 6, 9, 8],
    bars: [1, 4, 6, 8, 10, 13],
  },
  // CD4017B: Q5 Q1 Q0 Q2 Q6 Q7 Q3 VSS Q8 Q4 Q9 CO INH CLK RST VDD (13: CLOCK INHIBIT).
  cd4017: {
    names: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLK', 'RST', 'VDD'],
    vcc: 16,
    gnd: 8,
    inputs: [14, 13, 15],
    outputs: [3, 2, 4, 7, 10, 1, 5, 6, 9, 11, 12],
    bars: [],
  },
  // CD4511B: B C LT̄ BL̄ LE D A VSS e d c b a g f VDD.
  cd4511: {
    names: ['B', 'C', 'LT', 'BL', 'LE', 'D', 'A', 'VSS', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VDD'],
    vcc: 16,
    gnd: 8,
    inputs: [7, 1, 2, 6, 3, 4, 5],
    outputs: [13, 12, 11, 10, 9, 15, 14],
    bars: [3, 4],
  },
};

export type LogicChipType = GateChipType | 'ic7474' | 'cd4017' | 'cd4511';

export const LOGIC_CHIP_TYPES = Object.keys(LOGIC_CHIPS) as LogicChipType[];

export function isLogicChip(type: DeviceType): type is LogicChipType {
  return Object.prototype.hasOwnProperty.call(LOGIC_CHIPS, type);
}

/** Bacak adları modele göre: SN74LS00 (SDLS025D) 3A/3B ve 4A/4B'yi HC00'a göre ters adlandırır. */
export function chipPinNames(type: LogicChipType, model: string): readonly string[] {
  const names = LOGIC_CHIPS[type].names;
  if (model !== '74LS00') return names;
  return names.map((n, i) => (i === 8 ? '3B' : i === 9 ? '3A' : i === 11 ? '4B' : i === 12 ? '4A' : n));
}

/** CD4511B doğruluk tablosu (SCHS072B, s. 4): rakam → a…g; 6 ve 9 kuyruksuz (6'da a, 9'da d sönük). */
export const SEVEN_SEGMENT_CODES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 0, 0, 0],
  [1, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 0, 1],
  [0, 1, 1, 0, 0, 1, 1],
  [1, 0, 1, 1, 0, 1, 1],
  [0, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1],
];

/** Segmentlerin gösterdiği rakam: hiçbiri yanmıyorsa 'blank', rakama uymuyorsa null. */
export function digitOf(segments: readonly number[]): number | 'blank' | null {
  if (segments.every((s) => s === 0)) return 'blank';
  const i = SEVEN_SEGMENT_CODES.findIndex((code) => code.every((s, k) => s === segments[k]));
  return i >= 0 ? i : null;
}

/** Üstü çizgili (etkin düşük) ad: her harfe U+0305 birleşik üst çizgi; baştaki rakam çizilmez ("1CLR" → "1C̅L̅R̅"). */
export function barName(name: string): string {
  const m = /^(\d*)(.*)$/.exec(name)!;
  return m[1]! + [...m[2]!].map((c) => `${c}̅`).join('');
}

/** Bacağın metinlerde kullanılan adı (etkin düşükse üstü çizgili). `pin`: 1'den. */
export function chipPinLabel(type: LogicChipType, pin: number, model = ''): string {
  const name = chipPinNames(type, model)[pin - 1]!;
  return LOGIC_CHIPS[type].bars.includes(pin) ? barName(name) : name;
}
