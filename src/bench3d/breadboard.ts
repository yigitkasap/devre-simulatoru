// Breadboard yerleşimi (three'siz, saf hesap): şemadaki devreden tezgâhtaki yerleşim.
//
// Breadboard: 63 sütun (küçük devrelerde 30 sütunluk yarım boy); her sütunun üst yarısı (a–e) ve alt yarısı (f–j) beşer delikli birer şerittir
// (şerit = bir düğüm). Orta kanal DIP entegreler içindir. Üstte ve altta ikişer güç rayı (+ kırmızı,
// − mavi), her biri 50 delik. Birim 2,54 mm (delik aralığı).
//
// Kurallar:
//   - Breadboard'a takılan parçalar: direnç, kondansatör, bobin, diyot, zener, LED, LDR, NTC, buzzer,
//     anahtar, sigorta (iki bacak, aynı satırda iki sütun), transistörler ve potansiyometre (üç
//     ardışık sütun), 741 ve 555 (DIP-8, orta kanalın üstünde). Öbürleri (Arduino, pil, cihazlar,
//     lamba, motor, hoparlör, röle modülü, transformatör, hazne) masada, breadboard'un çevresinde
//     durur; uçlarından breadboard'a kablo gelir. Toprak sembolü fiziksel bir parça değildir.
//   - Her ağın bir ya da birkaç şeridi olur; bir ağın şeritleri jumper'larla birleştirilir. Toprak
//     ağı − rayına, ana besleme ağı + rayına bağlanır (şeritleri raya birer jumper'la).
//   - Parçalar şemadaki soldan sağa sırasıyla yerleşir; ardışık iki parçanın ortak ağı varsa aynı
//     şeridi paylaşır (direnç → LED zinciri jumper'sız olur).
//   - Bir şeride en çok 3 bacak ya da kablo takılır; 2 delik şeritleri birleştiren jumper'lara kalır.
//
// İki plan var (2026-11-14, "tahta düzeni"): planBreadboard 3B tezgâh ve Tahtada kur içindir, tahta şema gibi okunur
// (seri zincirler aynı yarıda soldan sağa, alet uçları bağlı oldukları bacağın şeridinde; yukarıdaki son iki kuralın
// yerine zincir ve bacak kuralları geçer). planCard Karta aktar içindir (delikli plaket, baskı devre, KiCad):
// yukarıdaki kurallarla önceki yerleşim, değişmez.

import { CATALOG } from '../model/catalog';
import { SEG7_LEGS } from '../model/logicChips';
import { buildConnectivity, pinKey } from '../model/connectivity';
import { pinPositions } from '../model/geometry';
import type { CircuitDoc, Part } from '../model/types';
import { numProp, type DeviceType } from '../sim/netlist';
import { batteryFootprint } from './dimensions';

export const BB = {
  /** Tam boy (830 delik) ve yarım boy (400 delik) breadboard'un sütun sayısı. */
  cols: 63,
  halfCols: 30,
  depth: 21.6,
  height: 3.3,
  /** Birden çok breadboard z boyunca bu aralıkla dizilir. */
  pitch: 26,
};

/** Breadboard'un genişliği (x). */
export const boardWidth = (cols: number) => cols + 3;
/** Bir raydaki delik sayısı: beşli gruplar (tam boyda 50, yarım boyda 25). */
export const railHoles = (cols: number) => (cols >= BB.cols ? 50 : 25);
/** Sütun (1–cols) → x (kartın ortası 0). */
export const colX = (col: number, cols: number = BB.cols) => col - (cols + 1) / 2;
/** Şerit satırı (0–9 = a–j) → z. Orta kanal e ile f arasında (3 birim). */
export const stripRowZ = (row: number) => (row < 5 ? -5.5 + row : 1.5 + (row - 5));
/** Ray (0 üst +, 1 üst −, 2 alt −, 3 alt +) → z. */
export const railZ = (rail: number) => [-9, -8, 8, 9][rail]!;
/** Ray deliği (0–; beşli gruplar arasında bir boşluk) → x. */
export const railX = (k: number, cols: number = BB.cols) => {
  const n = railHoles(cols);
  const span = n - 1 + Math.floor((n - 1) / 5);
  return -span / 2 + k + Math.floor(k / 5);
};
export const boardZ = (board: number) => board * BB.pitch;

export type Hole =
  | { readonly kind: 'strip'; readonly board: number; readonly col: number; readonly row: number }
  | { readonly kind: 'rail'; readonly board: number; readonly rail: number; readonly k: number };

/** Deliğin breadboard üstündeki yeri (x, z); `cols`: kartın sütun sayısı. */
export function holeXZ(h: Hole, cols: number): { x: number; z: number } {
  return h.kind === 'strip'
    ? { x: colX(h.col, cols), z: boardZ(h.board) + stripRowZ(h.row) }
    : { x: railX(h.k, cols), z: boardZ(h.board) + railZ(h.rail) };
}

export type Mount = 'axial' | 'radial' | 'to92' | 'pot' | 'dip4' | 'dip8' | 'dip14' | 'dip16' | 'seg10' | 'button' | 'inline';

/**
 * Orta kanalın üstüne oturan DIP kılıflar: bir sıradaki bacak sayısı ve bacakların satırları (üst
 * sıra, alt sıra; 0 = a … 9 = j). 1. bacak alt sıranın en solunda, numaralar alt sırada soldan sağa,
 * üst sırada sağdan sola artar. DIP'lerde sıralar e ve f (7,62 mm); 0,56" 7 segment göstergede
 * sıralar arası 15,24 mm (6 delik): d ve h.
 */
const DIP_SHAPES: Partial<Record<Mount, { readonly half: number; readonly top: number; readonly bottom: number }>> = {
  dip4: { half: 2, top: 4, bottom: 5 },
  dip8: { half: 4, top: 4, bottom: 5 },
  dip14: { half: 7, top: 4, bottom: 5 },
  dip16: { half: 8, top: 4, bottom: 5 },
  seg10: { half: 5, top: 3, bottom: 7 },
};

/** DIP kılıfın biçimi (bir sıradaki bacak sayısı, satırlar); DIP olmayan takılışta null. */
export function dipShape(mount: Mount | undefined): { readonly half: number; readonly top: number; readonly bottom: number } | null {
  return (mount && DIP_SHAPES[mount]) ?? null;
}

/**
 * DIP bacağının deliği: `start` 1. bacağın sütunu; `flipped` 180° döndürülmüş (1. bacak üst sıranın
 * en sağında).
 */
export function dipLegHole(shape: { readonly half: number; readonly top: number; readonly bottom: number }, start: number, leg: number, flipped = false): { col: number; row: number } {
  const normal = leg <= shape.half ? { col: start + leg - 1, row: shape.bottom } : { col: start + 2 * shape.half - leg, row: shape.top };
  return flipped ? { col: 2 * start + shape.half - 1 - normal.col, row: normal.row === shape.bottom ? shape.top : shape.bottom } : normal;
}

export interface BoardPart {
  readonly partId: string;
  readonly mount: Mount;
  /** Pin sırasıyla takıldığı delikler. */
  readonly holes: readonly Hole[];
  /** DIP: kullanılmayan bacakların delikleri (görünüm için). */
  readonly extraHoles?: readonly Hole[];
}

export interface TablePart {
  readonly partId: string;
  readonly x: number;
  readonly z: number;
  /** Derece (y ekseni etrafında; şemadaki dönüş yönüyle). */
  readonly rotation: number;
}

export interface Jumper {
  readonly net: string;
  readonly a: Hole;
  readonly b: Hole;
  /** Tahtada kur: öğrencinin seçtiği renk (yoksa ağın rengi). */
  readonly color?: string;
}

/** Masadaki bir parçanın ucundan breadboard'a giden kablo. */
export interface Lead {
  readonly net: string;
  readonly partId: string;
  readonly pin: number;
  readonly hole: Hole;
  /** Tahtada kur: kablonun rengi (yoksa ağın rengi). */
  readonly color?: string;
}

export type NetRole = 'ground' | 'supply';

export interface BreadboardPlan {
  readonly boards: number;
  /** Kartların sütun sayısı (tam boy 63, yarım boy 30). */
  readonly cols: number;
  readonly onBoard: ReadonlyMap<string, BoardPart>;
  readonly table: ReadonlyMap<string, TablePart>;
  readonly jumpers: readonly Jumper[];
  readonly leads: readonly Lead[];
  /** Pin anahtarı (pinKey) → ağ. */
  readonly netOf: ReadonlyMap<string, string>;
  readonly roles: ReadonlyMap<string, NetRole>;
  /** Tahtada kur: takılmamış alet kabloları (aletin önünde sarkar). */
  readonly loose?: ReadonlyArray<{ readonly partId: string; readonly pin: number; readonly color: string }>;
  /**
   * Tezgâh planı: seri zincirler (şemadaki sırayla, soldan sağa). Eleman: iki bacaklı tahta parçası ya da
   * ampermetre; `inPin`: zincirde önceki elemana bakan ucu.
   */
  readonly chains?: ReadonlyArray<ReadonlyArray<{ readonly partId: string; readonly inPin: number }>>;
}

/** Breadboard'a takılan parçaların takılışı ve iki bacaklılarda sütun aralığı. */
const MOUNTS: Partial<Record<DeviceType, { mount: Mount; span?: number }>> = {
  resistor: { mount: 'axial', span: 4 },
  diode: { mount: 'axial', span: 4 },
  schottky: { mount: 'axial', span: 4 },
  zener: { mount: 'axial', span: 3 },
  fuse: { mount: 'axial', span: 9 },
  capacitor: { mount: 'radial', span: 1 },
  inductor: { mount: 'radial', span: 2 },
  led: { mount: 'radial', span: 1 },
  ldr: { mount: 'radial', span: 1 },
  ntc: { mount: 'radial', span: 1 },
  buzzer: { mount: 'radial', span: 3 },
  switch: { mount: 'axial', span: 2 },
  pushbutton: { mount: 'button' },
  spdt: { mount: 'to92' },
  scr: { mount: 'to92' },
  bridge: { mount: 'inline' },
  reg7805: { mount: 'inline' },
  lm317: { mount: 'inline' },
  npn: { mount: 'to92' },
  pnp: { mount: 'to92' },
  njfet: { mount: 'to92' },
  pjfet: { mount: 'to92' },
  nmos: { mount: 'to92' },
  pmos: { mount: 'to92' },
  potentiometer: { mount: 'pot' },
  opamp: { mount: 'dip8' },
  opto: { mount: 'dip4' },
  timer555: { mount: 'dip8' },
  ic7400: { mount: 'dip14' },
  ic7402: { mount: 'dip14' },
  ic7404: { mount: 'dip14' },
  ic7408: { mount: 'dip14' },
  ic7432: { mount: 'dip14' },
  ic7486: { mount: 'dip14' },
  ic7474: { mount: 'dip14' },
  cd4017: { mount: 'dip16' },
  cd4511: { mount: 'dip16' },
  seg7: { mount: 'seg10' },
};

/**
 * Sıralı bacaklı parçalarda gerçek kılıftaki bacak sırası (soldan sağa, sütun sırasıyla) → pin. Yoksa
 * pin sırası (BC547'de C-B-E).
 */
export const LEG_ORDER: Partial<Record<DeviceType, readonly number[]>> = {
  spdt: [1, 0, 2], // A, C, B: ortak uç ortada
  bridge: [1, 0, 2, 3], // KBP: + ~ ~ −
  reg7805: [0, 1, 2], // TO-220: IN, GND, OUT
  lm317: [1, 2, 0], // TO-220: ADJ, OUT, IN
  scr: [1, 2, 0], // TO-92 MCR100: K, G, A
};

/** DIP: parça pin sırası → kılıfın bacak numarası. Yoksa pin sırası bacak sırasıdır (1, 2, …). */
export const DIP_PINS: Partial<Record<DeviceType, readonly number[]>> = {
  opamp: [2, 3, 6, 7, 4], // LM741: −, +, OUT, V+, V− (1, 5, 8 boş)
  timer555: [1, 2, 3, 4, 5, 6, 7, 8],
  opto: [1, 2, 4, 3], // PC817: 1 A, 2 K, 3 E, 4 C (Sharp iç bağlantı şeması)
  seg7: SEG7_LEGS, // SC56-11EWA: a 7, b 6, c 4, d 2, e 1, f 9, g 10, DP 5, ortak katot 3 (8 boş: içeriden 3'e bağlı)
};

/** DIP parçanın pinlerinin bacak numaraları (pin sırasıyla). */
export function dipPins(type: DeviceType): readonly number[] {
  return DIP_PINS[type] ?? Array.from({ length: CATALOG[type].pins.length }, (_, i) => i + 1);
}

/**
 * Masadaki parçaların yeri: sol sütun (kaynaklar), arka sıra (cihazlar), sağ sütun (yükler). Tahtanın önüne parça
 * konmaz ("3B: okunurluk önce": önündeki parça ve kabloları tahtayı örter).
 */
type Side = 'left' | 'back' | 'right';
/**
 * Arkadaki cihazların en öndeki düğmesiyle tahtanın arka kenarı arası (birim, ≈ 2,5 mm): kabloların ön
 * soketten çıkıp masaya sarkacağı kadar yer (leadRoute.socketCurve en çok 9 birim öne çıkar); daha uzağı
 * kabloları uzatır.
 */
const BACK_GAP = 14;

/**
 * `slot`: kabloların tahtada hangi deliğe gideceği için kullanılan genişlik (cihazların eski, küçük
 * modellerininki). Gerçek boyutlu cihazların sırası tahtadan geniş; deliği gövdenin yerine göre seçmek
 * kabloları rayların uç deliklerine iterdi, rayları birleştiren köprüler kayardı (Tahtada kur değişirdi).
 */
const TABLE: Partial<Record<DeviceType, { side: Side; w: number; d: number; rotation: number; slot?: number }>> = {
  // Tahta dışı parçalar sade ve küçük: en büyük boyutları yarım boy tahtanın genişliğinin dörtte birini (SIDE_MAX)
  // geçmez (registry.ts → fitSide). Arduino kendi kartı: gerçek ölçüsünde kalır (uçları 2,54 mm aralıklı).
  arduino: { side: 'left', w: 21, d: 27, rotation: 0 },
  battery: { side: 'left', w: 8, d: 5, rotation: 0 },
  acsource: { side: 'left', w: 8, d: 4.2, rotation: 0 },
  currentsource: { side: 'left', w: 8, d: 4.2, rotation: 0 },
  // Laboratuvar cihazları (instruments.ts; üreteç ve osiloskop gerçeğin %60'ı, güç kaynağı %50'si, el multimetresi
  // kılıflı 75 × 150 mm'nin %60'ı): dik, ön paneli öne bakar. d/2 gövdenin ortasından en öndeki düğmeye ya da kola
  // kadar (arkası tahtadan uzakta kalır). `slot` değişmedi: kabloların delikleri aynı.
  dcsupply: { side: 'back', w: 60, d: 57, rotation: 0, slot: 11.6 },
  funcgen: { side: 'back', w: 63, d: 77, rotation: 0, slot: 8.6 },
  oscilloscope: { side: 'back', w: 76, d: 35, rotation: 0, slot: 8.6 },
  // El multimetreleri öbür cihazlara göre %30 küçük (instruments.ts → DMM_SHRINK; 2026-11-14).
  voltmeter: { side: 'back', w: 13.3, d: 19.6, rotation: 0, slot: 11 },
  ammeter: { side: 'back', w: 13.3, d: 19.6, rotation: 0, slot: 11 },
  multimeter: { side: 'back', w: 13.3, d: 19.6, rotation: 0, slot: 12.5 },
  lamp: { side: 'right', w: 8, d: 5, rotation: 0 },
  motor: { side: 'right', w: 8, d: 5, rotation: 0 },
  speaker: { side: 'right', w: 8, d: 6.5, rotation: 0 },
  relay: { side: 'right', w: 8, d: 5.5, rotation: 0 },
  transformer: { side: 'right', w: 8, d: 6.5, rotation: 0 },
  tank: { side: 'right', w: 8, d: 8, rotation: 0 },
};

/** Tahta dışı parçanın (cihazlar ve Arduino dışında) en büyük boyutu (birim): yarım boy tahtanın (33 birim) dörtte biri. */
export const SIDE_MAX = 8;

/** Masadaki parçanın yeri ve kapladığı alan; pilin alanı gerilimine göre (9 V'luk blok ya da AA pil yatağı). */
function tableOf(part: Part): NonNullable<(typeof TABLE)[DeviceType]> {
  const t = TABLE[part.type]!;
  return part.type === 'battery' ? { ...t, ...batteryFootprint(numProp(part.props, 'voltage', 9)) } : t;
}

/** Parça masada mı (tahtanın solunda ya da sağında; cihazlar ve Arduino dışında): modeli SIDE_MAX'e sığdırılır. */
export function isSidePart(type: DeviceType): boolean {
  const t = TABLE[type];
  return t !== undefined && t.side !== 'back' && type !== 'arduino';
}

/** Kablo ve jumper renkleri (ağ başına): toprak siyah, besleme kırmızı, öbürleri sırayla. */
const NET_COLORS = ['#f08a24', '#f2c230', '#2f9e5b', '#2f6fd6', '#8e5bd1', '#e9ecef', '#18a3a8', '#d64b8a'];

export function netColors(plan: BreadboardPlan): (net: string) => string {
  const colors = new Map<string, string>();
  let next = 0;
  return (net) => {
    let c = colors.get(net);
    if (!c) {
      const role = plan.roles.get(net);
      c = role === 'ground' ? '#1b1c1f' : role === 'supply' ? '#d22f27' : NET_COLORS[next++ % NET_COLORS.length]!;
      colors.set(net, c);
    }
    return c;
  };
}

export function isOnBoard(type: DeviceType): boolean {
  return MOUNTS[type] !== undefined;
}

/** Breadboard'a takılan parçanın takılışı (masadaki parçada undefined). */
export function mountOf(type: DeviceType): Mount | undefined {
  return MOUNTS[type]?.mount;
}

/** Planın iki bacaklı parçaya verdiği sütun aralığı (Tahtada kur'da bacak aralığı sınırları bunun çevresinde). */
export function planSpan(type: DeviceType): number | undefined {
  return MOUNTS[type]?.span;
}

/** Şeridin parçalara ayrılan delik sayısı (kalanlar jumper'lara). */
const LEG_CAPACITY = 3;
const ROWS_TOP = [2, 3, 1, 4, 0];
const ROWS_BOTTOM = [7, 6, 8, 5, 9];
const GAP = 3;
/** Sol ve sağ sütunda parçalar arası boşluk (birim). */
const SIDE_GAP = 1.5;

interface Strip {
  readonly board: number;
  readonly half: 0 | 1;
  readonly col: number;
  readonly net: string | null;
  readonly rows: Set<number>;
  legs: number;
}

/** Seri zincirin elemanı: iki bacaklı tahta parçası ya da ampermetre; `inPin` zincirde önceki elemana bakan ucu. */
interface Link {
  readonly part: Part;
  readonly inPin: number;
}

/** Kaynakların + ve − uçları (zincirin yönü: besleme yanından toprak yanına). */
const SOURCE_PLUS: Partial<Record<DeviceType, readonly number[]>> = { battery: [0], dcsupply: [0, 2], funcgen: [0, 1], acsource: [0] };
const SOURCE_MINUS: Partial<Record<DeviceType, readonly number[]>> = { battery: [1], dcsupply: [1, 3], funcgen: [2], acsource: [1] };

interface Slot {
  readonly board: number;
  readonly half: 0 | 1;
  /** Bir sonraki boş sütun. */
  cursor: number;
  /** Son yerleşen parçanın son sütunu (zincir paylaşımı için); yoksa 0. */
  frontier: number;
}

/**
 * Tezgâhın ve Tahtada kur'un planı ("tahta düzeni", 2026-11-14): tahta şema gibi okunur. Seri bağlı parçalar
 * (ampermetre dahil) şemadaki sırayla aynı yarıda soldan sağa yan yana; ampermetrenin girdiği yerde iki parça
 * arasında bir şerit boşluk. Her alet ucu, şemada bağlı olduğu bacağın şeridine, o bacağa en yakın boş deliğe
 * (voltmetrenin iki ucu ölçtüğü parçanın iki bacağının yanına). Toprak − rayına, besleme + rayına.
 * Devre yarım boy karta sığıyorsa (en çok 28 sütun) yarım boy, yoksa tam boy breadboard.
 */
export function planBreadboard(doc: CircuitDoc): BreadboardPlan {
  return sized(doc, true);
}

/**
 * Karta aktar'ın planı (delikli plaket rehberi, baskı devre, KiCad, Gerber): önceki yerleşim, değişmez. Parçalar
 * şemadaki soldan sağa sırasıyla en boş yarıya; alet kabloları cihazın hizasındaki en yakın şeride.
 */
export function planCard(doc: CircuitDoc): BreadboardPlan {
  return sized(doc, false);
}

function sized(doc: CircuitDoc, series: boolean): BreadboardPlan {
  const full = plan(doc, BB.cols, series);
  if (full.boards > 1) return full;
  const half = lastColumn(full) > BB.halfCols - 2 ? null : plan(doc, BB.halfCols, series);
  const chosen = half && half.boards === 1 ? half : full;
  if (!series) return chosen;
  // Tezgâh planı: alet ucu çok olan devre (CENTER_FROM ve üstü) tahtanın soluna yığılmaz, ortalanır: direkler
  // deliklerinin hizasında durur, telleri kısa kalır ve iki yana eşit açılır (solda yığılı devrede teller tek yönden
  // yelpaze yapar, arka kanala sığmaz). Az uçlu devre yerinde kalır. Arduino'lu devre ortalanmaz: Arduino solda,
  // telleri uzardı.
  if (chosen.leads.length < CENTER_FROM || doc.parts.some((p) => p.type === 'arduino')) return chosen;
  const first = FIRST_COLUMN + Math.floor((chosen.cols - 1 - lastColumn(chosen)) / 2);
  if (first <= FIRST_COLUMN) return chosen;
  const centered = plan(doc, chosen.cols, series, first);
  return centered.boards === 1 && lastColumn(centered) <= chosen.cols - 1 ? centered : chosen;
}

/** Planın kullandığı en sağdaki sütun. */
function lastColumn(p: BreadboardPlan): number {
  const used = [...p.onBoard.values()].flatMap((part) => [...part.holes, ...(part.extraHoles ?? [])]);
  const strips = [...used, ...p.leads.map((l) => l.hole), ...p.jumpers.flatMap((j) => [j.a, j.b])];
  return Math.max(0, ...strips.map((h) => (h.kind === 'strip' ? h.col : 0)));
}

/** Devrenin tahtada ortalandığı en az alet ucu sayısı (direk sayısı). */
const CENTER_FROM = 6;
/** Yerleşimin başladığı sütun (1. sütun boş kalır). */
const FIRST_COLUMN = 2;

function plan(doc: CircuitDoc, cols: number, series: boolean, first: number = FIRST_COLUMN): BreadboardPlan {
  // --- Ağlar --------------------------------------------------------------------------------------
  const { netlist } = buildConnectivity(doc);
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (parent.has(c) && parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const el of netlist.elements) for (const pin of el.pins) if (!parent.has(pin)) parent.set(pin, pin);
  for (const link of netlist.links) {
    if (!parent.has(link.a)) parent.set(link.a, link.a);
    if (!parent.has(link.b)) parent.set(link.b, link.b);
    union(link.a, link.b);
  }
  const groundPins = netlist.elements.filter((e) => e.type === 'ground').flatMap((e) => e.pins);
  for (let i = 1; i < groundPins.length; i++) union(groundPins[0]!, groundPins[i]!);
  // Arduino'nun iki GND ucu kartın içinde aynı bakırdır: breadboard'da tek ağ.
  for (const el of netlist.elements) if (el.type === 'arduino') union(el.pins[2]!, el.pins[21]!);

  const netOf = new Map<string, string>();
  const members = new Map<string, number>();
  for (const el of netlist.elements) {
    if (el.type === 'ground') continue;
    el.pins.forEach((pin) => {
      const net = find(pin);
      netOf.set(pin, net);
      members.set(net, (members.get(net) ?? 0) + 1);
    });
  }
  const groundNet = groundPins.length > 0 ? find(groundPins[0]!) : null;
  const net = (part: Part, pin: number) => netOf.get(pinKey(part.id, pin))!;
  /** Başka bir parçanın pinine de bağlı mı (toprak sembolü sayılır)? */
  const connected = (part: Part, pin: number) => {
    const n = net(part, pin);
    return (members.get(n) ?? 0) > 1 || (n === groundNet && groundNet !== null);
  };

  // --- Raylar: toprak ve ana besleme ----------------------------------------------------------------
  const roles = new Map<string, NetRole>();
  const byType = (t: DeviceType) => doc.parts.filter((p) => p.type === t);
  let ground = groundNet !== null && members.has(groundNet) ? groundNet : null;
  if (!ground) {
    const candidates = [...byType('arduino').flatMap((p) => [net(p, 2), net(p, 21)]), ...byType('battery').map((p) => net(p, 1)), ...byType('dcsupply').map((p) => net(p, 1))];
    ground = candidates.filter((n) => (members.get(n) ?? 0) > 1).sort((a, b) => members.get(b)! - members.get(a)!)[0] ?? null;
  }
  if (ground) roles.set(ground, 'ground');
  const supplies = [
    ...byType('arduino').map((p) => net(p, 0)),
    ...byType('battery').map((p) => net(p, 0)),
    ...byType('dcsupply').flatMap((p) => [net(p, 0), net(p, 2)]),
  ].filter((n) => n !== ground && (members.get(n) ?? 0) > 1);
  const supply = supplies.sort((a, b) => members.get(b)! - members.get(a)!)[0];
  if (supply) roles.set(supply, 'supply');

  // --- Breadboard şeritleri ---------------------------------------------------------------------------
  const strips = new Map<string, Strip>();
  const netStrips = new Map<string, Strip[]>();
  const stripKey = (b: number, h: number, c: number) => `${b}:${h}:${c}`;
  const slots: Slot[] = [];
  const slotsOf = (board: number) => {
    while (slots.length < (board + 1) * 2) {
      const b = Math.floor(slots.length / 2);
      slots.push({ board: b, half: (slots.length % 2) as 0 | 1, cursor: b === 0 ? first : FIRST_COLUMN, frontier: 0 });
    }
    return [slots[board * 2]!, slots[board * 2 + 1]!];
  };
  slotsOf(0);
  let boards = 1;

  const takeStrip = (board: number, half: 0 | 1, col: number, n: string | null): Strip => {
    const key = stripKey(board, half, col);
    let s = strips.get(key);
    if (!s) {
      s = { board, half, col, net: n, rows: new Set(), legs: 0 };
      strips.set(key, s);
      if (n !== null) netStrips.set(n, [...(netStrips.get(n) ?? []), s]);
    }
    return s;
  };
  const freeRow = (s: Strip, prefer: readonly number[]) => prefer.find((r) => !s.rows.has(r));
  const rowsOf = (half: 0 | 1) => (half === 0 ? ROWS_TOP : ROWS_BOTTOM);
  const stripHole = (s: Strip, row: number): Hole => {
    s.rows.add(row);
    return { kind: 'strip', board: s.board, col: s.col, row };
  };
  const capacityLeft = (s: Strip) => LEG_CAPACITY + (s.net !== null && roles.has(s.net) ? 1 : 0) - s.legs;

  /** `width` sütunluk yer: tercihen zincir paylaşımıyla; yoksa en boş yarıda; sığmazsa yeni breadboard. */
  const findSlot = (width: number, shareNets: readonly string[]): { slot: Slot; start: number; shared: string | null } => {
    for (let board = 0; ; board++) {
      if (board >= boards) {
        boards = board + 1;
      }
      const pair = slotsOf(board);
      for (const slot of pair) {
        if (slot.frontier > 0) {
          const s = strips.get(stripKey(slot.board, slot.half, slot.frontier));
          if (s && s.net !== null && shareNets.includes(s.net) && capacityLeft(s) > 0 && slot.frontier + width - 1 <= cols - 1) {
            return { slot, start: slot.frontier, shared: s.net };
          }
        }
      }
      const open = pair.filter((s) => s.cursor + width - 1 <= cols - 1).sort((a, b) => a.cursor - b.cursor);
      if (open[0]) return { slot: open[0], start: open[0].cursor, shared: null };
    }
  };

  const onBoard = new Map<string, BoardPart>();
  const ordered = [...doc.parts].sort((a, b) => a.x - b.x || a.y - b.y);

  // --- Seri zincirler (tezgâh planı) -------------------------------------------------------------------
  // Zincir: akım taşıyan tam iki ucun buluştuğu ağlarla art arda bağlı iki bacaklı tahta parçaları ve
  // ampermetreler. Voltmetre ve osiloskop uçları akım taşımaz, sayılmaz; toprak ve besleme ağları raya gider,
  // zinciri böler.
  const byId = new Map(doc.parts.map((p) => [p.id, p]));
  const through = (p: Part) => p.type === 'ammeter' || (p.type === 'multimeter' && p.props.mode === 'a');
  const sensing = (p: Part) => p.type === 'voltmeter' || p.type === 'oscilloscope' || (p.type === 'multimeter' && p.props.mode !== 'a');
  const carriers = new Map<string, Array<{ part: Part; pin: number }>>();
  const chainOf = new Map<string, readonly Link[]>();
  const chains: Array<readonly Link[]> = [];
  const inChain = new Set<string>();
  if (series) {
    for (const el of netlist.elements) {
      const part = byId.get(el.id);
      if (!part || el.type === 'ground' || sensing(part)) continue;
      el.pins.forEach((key, pin) => {
        const n = netOf.get(key);
        if (n !== undefined) carriers.set(n, [...(carriers.get(n) ?? []), { part, pin }]);
      });
    }
    const link = (p: Part) => MOUNTS[p.type]?.span !== undefined || through(p);
    const joint = (n: string) => {
      const c = carriers.get(n);
      return !roles.has(n) && n !== groundNet && c !== undefined && c.length === 2 && c[0]!.part.id !== c[1]!.part.id && link(c[0]!.part) && link(c[1]!.part);
    };
    /** Zincirin ucundaki ağ: 0 besleme yanı (kaynağın + ucu), 2 toprak yanı, 1 belirsiz. */
    const rank = (n: string) => {
      const c = carriers.get(n) ?? [];
      if (roles.get(n) === 'ground' || n === groundNet) return 2;
      if (roles.get(n) === 'supply' || c.some((x) => SOURCE_PLUS[x.part.type]?.includes(x.pin))) return 0;
      return c.some((x) => SOURCE_MINUS[x.part.type]?.includes(x.pin)) ? 2 : 1;
    };
    const walked = new Set<string>();
    for (const start of ordered) {
      if (!link(start) || walked.has(start.id)) continue;
      const open = [0, 1].filter((pin) => joint(net(start, pin)));
      if (open.length !== 1) continue;
      let links: Link[] = [];
      let cur = start;
      let inPin = 1 - open[0]!;
      for (;;) {
        walked.add(cur.id);
        links.push({ part: cur, inPin });
        const n = net(cur, 1 - inPin);
        if (!joint(n)) break;
        const next = carriers.get(n)!.find((c) => c.part.id !== cur.id)!;
        if (walked.has(next.part.id)) break;
        cur = next.part;
        inPin = next.pin;
      }
      // Yön: besleme yanından toprak yanına; belli değilse şemadaki yer (soldan sağa, yukarıdan aşağıya).
      const first = links[0]!;
      const last = links[links.length - 1]!;
      const a = rank(net(first.part, first.inPin));
      const b = rank(net(last.part, 1 - last.inPin));
      if (a > b || (a === b && (first.part.x > last.part.x || (first.part.x === last.part.x && first.part.y > last.part.y)))) {
        links = links.reverse().map((l) => ({ part: l.part, inPin: 1 - l.inPin }));
      }
      if (links.length > 1 && links.some((l) => !through(l.part))) {
        chains.push(links);
        for (const l of links) chainOf.set(l.part.id, links);
      }
    }
  }
  /**
   * Zinciri yerleştirir: düğümler zincir boyunca ağlardır (0: ilk elemanın dış ucu … n: son elemanın dış ucu).
   * Düğümün şeridi olur: bir tahta parçasının bacağıysa, iki ampermetrenin arasındaysa ya da zincirin ucundaki
   * ampermetrenin tahtada hiçbir bacağı olmayan ve raya gitmeyen dış ağıysa (ampermetre ile komşusunun buluştuğu
   * boş şerit). Tahta parçası iki düğümünü bacak aralığı kadar, ampermetre iki sütun ayırır (arada bir şerit boş).
   */
  const placeChain = (links: readonly Link[]): boolean => {
    const n = links.length;
    const nets = [net(links[0]!.part, links[0]!.inPin), ...links.map((l) => net(l.part, 1 - l.inPin))];
    const board = links.map((l) => !through(l.part));
    const hasLeg = (name: string) => (carriers.get(name) ?? []).some((c) => MOUNTS[c.part.type] !== undefined);
    const stripped = nets.map((name, i) => {
      const before = i > 0 ? board[i - 1]! : null;
      const after = i < n ? board[i]! : null;
      if (before === true || after === true) return true;
      if (before === false && after === false) return true;
      return !roles.has(name) && name !== groundNet && !hasLeg(name);
    });
    const from = stripped.indexOf(true);
    const to = stripped.lastIndexOf(true);
    const offset: number[] = new Array<number>(n + 1).fill(0);
    for (let i = from + 1; i <= to; i++) offset[i] = offset[i - 1]! + (board[i - 1]! ? MOUNTS[links[i - 1]!.part.type]!.span! : 2);
    const width = offset[to]! + 1;
    if (width > cols - 2) return false;
    const { slot, start } = findSlot(width, from === 0 && board[0]! ? [nets[0]!] : []);
    const column = nets.map((name, i) => (stripped[i] ? takeStrip(slot.board, slot.half, start + offset[i]!, name) : null));
    const pref = rowsOf(slot.half);
    links.forEach((l, i) => {
      if (!board[i]) return;
      const pair = [column[i]!, column[i + 1]!];
      const common = pref.find((r) => pair.every((s) => !s.rows.has(r)));
      const holes: Hole[] = new Array<Hole>(2);
      pair.forEach((s, k) => {
        s.legs++;
        holes[k === 0 ? l.inPin : 1 - l.inPin] = stripHole(s, common ?? freeRow(s, pref) ?? pref[0]!);
      });
      onBoard.set(l.part.id, { partId: l.part.id, mount: MOUNTS[l.part.type]!.mount, holes });
    });
    const end = start + offset[to]!;
    slot.frontier = to > 0 && board[to - 1]! ? end : 0;
    slot.cursor = end + GAP;
    for (const l of links) inChain.add(l.part.id);
    return true;
  };

  for (const part of ordered) {
    const spec = MOUNTS[part.type];
    if (!spec) continue;
    if (inChain.has(part.id)) continue;
    const chain = chainOf.get(part.id);
    if (chain && placeChain(chain)) continue;
    const shape = dipShape(spec.mount);
    if (shape) {
      // Orta kanalın üstünde: iki yarının aynı `half` sütunu.
      const half = shape.half;
      let board = 0;
      let start = 0;
      for (; ; board++) {
        if (board >= boards) boards = board + 1;
        const [top, bottom] = slotsOf(board);
        start = Math.max(top!.cursor, bottom!.cursor);
        if (start + half - 1 <= cols - 1) break;
      }
      const [top, bottom] = slotsOf(board);
      const map = dipPins(part.type);
      const legOf = (dip: number): { half: 0 | 1; col: number; row: number } => {
        const at = dipLegHole(shape, start, dip);
        return { ...at, half: at.row >= 5 ? 1 : 0 };
      };
      const holes = map.map((dip, i) => {
        const at = legOf(dip);
        const s = takeStrip(board, at.half, at.col, net(part, i));
        s.legs++;
        return stripHole(s, at.row);
      });
      const extraHoles: Hole[] = [];
      for (let dip = 1; dip <= 2 * half; dip++) {
        if (map.includes(dip)) continue;
        const at = legOf(dip);
        extraHoles.push(stripHole(takeStrip(board, at.half, at.col, null), at.row));
      }
      for (const slot of [top!, bottom!]) {
        slot.frontier = 0;
        slot.cursor = start + half - 1 + GAP;
      }
      onBoard.set(part.id, { partId: part.id, mount: spec.mount, holes, extraHoles });
      continue;
    }
    if (spec.mount === 'button') {
      // 12 mm basmalı düğme orta kanalın iki yanında: uçlar d (üst yarı) ve g (alt yarı) satırında, aynı
      // sütunda; içten bağlı ikiz bacaklar iki sütun yanda (şeritleri yalnızca düğmeye ayrılır).
      let board = 0;
      let start = 0;
      for (; ; board++) {
        if (board >= boards) boards = board + 1;
        const [top, bottom] = slotsOf(board);
        start = Math.max(top!.cursor, bottom!.cursor);
        if (start + 2 <= cols - 1) break;
      }
      const [top, bottom] = slotsOf(board);
      const pinStrip = [takeStrip(board, 0, start, net(part, 0)), takeStrip(board, 1, start, net(part, 1))];
      pinStrip.forEach((s) => s.legs++);
      const holes = [stripHole(pinStrip[0]!, 3), stripHole(pinStrip[1]!, 6)];
      const extraHoles = [stripHole(takeStrip(board, 0, start + 2, null), 3), stripHole(takeStrip(board, 1, start + 2, null), 6)];
      for (const slot of [top!, bottom!]) {
        slot.frontier = 0;
        slot.cursor = start + 2 + GAP;
      }
      onBoard.set(part.id, { partId: part.id, mount: 'button', holes, extraHoles });
      continue;
    }
    // Sıralı bacaklar (TO-92, trimpot, köprü diyot, TO-220): aynı satırda ardışık delikler.
    const pins = spec.mount === 'inline' ? part.type === 'bridge' ? 4 : 3 : spec.mount === 'to92' || spec.mount === 'pot' ? 3 : 2;
    const span = pins >= 3 ? 1 : spec.span!;
    const width = pins >= 3 ? pins : span + 1;
    const nets = Array.from({ length: pins }, (_, i) => net(part, i));
    const physical = LEG_ORDER[part.type] ?? Array.from({ length: pins }, (_, i) => i);
    const ends = [nets[physical[0]!]!, nets[physical[pins - 1]!]!];
    const { slot, start, shared } = findSlot(width, ends);
    // Paylaşılan ağ son bacaktaysa parça ters takılır (o bacak ilk sütuna).
    const reversed = shared !== null && shared !== ends[0] && shared === ends[1];
    const order = reversed ? [...physical].reverse() : physical;
    const columns = pins >= 3 ? Array.from({ length: pins }, (_, k) => start + k) : [start, start + span];
    const columnStrips = columns.map((col, k) => takeStrip(slot.board, slot.half, col, nets[order[k]!]!));
    // Aynı satır (bütün şeritlerde boş) tercih edilir.
    const pref = rowsOf(slot.half);
    const common = pref.find((r) => columnStrips.every((s) => !s.rows.has(r)));
    const holes: Hole[] = new Array(pins);
    columnStrips.forEach((s, k) => {
      s.legs++;
      holes[order[k]!] = stripHole(s, common ?? freeRow(s, pref) ?? pref[0]!);
    });
    slot.frontier = columns[columns.length - 1]!;
    slot.cursor = slot.frontier + GAP;
    onBoard.set(part.id, { partId: part.id, mount: spec.mount, holes });
  }

  // --- Masadaki parçalar ---------------------------------------------------------------------------
  const table = new Map<string, TablePart>();
  const sides: Record<Side, Part[]> = { left: [], back: [], right: [] };
  for (const part of ordered) {
    const t = TABLE[part.type];
    if (t) sides[t.side].push(part);
  }
  const boardsDepth = boardZ(boards - 1) + BB.depth / 2;
  const top = -BB.depth / 2;
  const leftEdge = -boardWidth(cols) / 2;
  // Sol ve sağ sütun: arkadan öne, taban plakasının dışında. Sütun breadboard'ların ortasına göre dizilir; ama hiçbir
  // parça tahtanın ön kenarını (kameraya bakan yanı) geçmez: sütun tahtadan uzunsa ön kenara hizalanır ve arkaya
  // uzar (Arduino + pil). Arkada cihazların önüne varacak kadar uzunsa kalan parçalar bir dış sütuna geçer.
  const sideDepth = boardsDepth - top + BACK_GAP - 2;
  for (const side of ['left', 'right'] as const) {
    const columns: Array<Array<{ p: Part; t: ReturnType<typeof tableOf> }>> = [[]];
    let used = 0;
    for (const p of sides[side]) {
      const t = tableOf(p);
      const column = columns[columns.length - 1]!;
      if (column.length > 0 && used + SIDE_GAP + t.d > sideDepth) {
        columns.push([{ p, t }]);
        used = t.d;
      } else {
        used += (column.length > 0 ? SIDE_GAP : 0) + t.d;
        column.push({ p, t });
      }
    }
    let inner = -leftEdge + 4;
    for (const items of columns) {
      const total = items.reduce((s, i) => s + i.t.d, 0) + SIDE_GAP * Math.max(0, items.length - 1);
      let z = Math.min((top + boardsDepth) / 2 - total / 2, boardsDepth - total);
      for (const { p, t } of items) {
        table.set(p.id, { partId: p.id, x: (side === 'left' ? -1 : 1) * (inner + t.w / 2), z: z + t.d / 2, rotation: t.rotation });
        z += t.d + SIDE_GAP;
      }
      inner += Math.max(0, ...items.map((i) => i.t.w)) + SIDE_GAP;
    }
  }
  /** Kablonun tahtadaki deliği bu x'e göre seçilir (`slot`). */
  const leadX = new Map<string, number>();
  {
    const items = sides.back.map((p) => ({ p, t: tableOf(p) }));
    const total = items.reduce((s, i) => s + i.t.w, 0) + GAP * Math.max(0, items.length - 1);
    const slots = items.reduce((s, i) => s + (i.t.slot ?? i.t.w), 0) + GAP * Math.max(0, items.length - 1);
    let x = -total / 2;
    let sx = -slots / 2;
    for (const { p, t } of items) {
      // Arkadaki cihazlarla tahta arasında ön panelden çıkan kabloların masaya sarkacağı kadar yer.
      const z = top - BACK_GAP - t.d / 2;
      table.set(p.id, { partId: p.id, x: x + t.w / 2, z, rotation: t.rotation });
      leadX.set(p.id, sx + (t.slot ?? t.w) / 2);
      x += t.w + GAP;
      sx += (t.slot ?? t.w) + GAP;
    }
  }

  // --- Masadaki parçaların kabloları ------------------------------------------------------------------
  const railUsed = new Set<string>();
  const railKey = (b: number, r: number, k: number) => `${b}:${r}:${k}`;
  /** Rayın `x`'e en yakın boş deliği. */
  const railHole = (board: number, rail: number, x: number): Hole => {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let k = 0; k < railHoles(cols); k++) {
      if (railUsed.has(railKey(board, rail, k))) continue;
      const d = Math.abs(railX(k, cols) - x);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    railUsed.add(railKey(board, rail, best));
    return { kind: 'rail', board, rail, k: best };
  };
  const railFor = (role: NetRole, topSide: boolean) => (role === 'supply' ? (topSide ? 0 : 3) : topSide ? 1 : 2);
  /** Bir ağın ray kullanımı: ray başına (breadboard, ray) kümesi. */
  const railsUsed = new Map<string, Set<string>>();
  const useRail = (n: string, board: number, rail: number) => {
    const set = railsUsed.get(n) ?? new Set<string>();
    set.add(`${board}:${rail}`);
    railsUsed.set(n, set);
  };

  /** Ağ için boş yeri olan şerit (`x`'e yakın, tercihen `half`); yoksa yeni şerit. */
  const stripFor = (n: string, x: number, half: 0 | 1, board: number): Strip => {
    const options = (netStrips.get(n) ?? []).filter((s) => capacityLeft(s) > 0 && (!series || s.rows.size < 5));
    if (options.length > 0) {
      return options.sort((a, b) => Math.abs(colX(a.col, cols) - x) + (a.half === half ? 0 : 6) - (Math.abs(colX(b.col, cols) - x) + (b.half === half ? 0 : 6)))[0]!;
    }
    const pair = slotsOf(board);
    let slot = pair[half]!;
    if (slot.cursor > cols - 1) slot = pair[1 - half]!;
    if (slot.cursor > cols - 1) {
      boards++;
      slot = slotsOf(boards - 1)[half]!;
    }
    const s = takeStrip(slot.board, slot.half, slot.cursor, n);
    slot.frontier = 0;
    slot.cursor += 2;
    return s;
  };

  // --- Tezgâh planı: alet ucu, şemada bağlı olduğu bacağın şeridine ---------------------------------------------
  const jumpers: Jumper[] = [];
  const joined = new Map<string, number>();
  /** Bir ağın şeritlerini birleştiren köprüler (toprak ve besleme: her şerit kendi yarısının rayına). */
  const joinStrips = () => {
    for (const [n, list] of netStrips) {
      const done = joined.get(n) ?? 0;
      if (done >= list.length) continue;
      joined.set(n, list.length);
      const role = roles.get(n);
      if (role) {
        // Her şerit kendi yarısının rayına.
        for (const s of list.slice(done)) {
          const rail = railFor(role, s.half === 0);
          useRail(n, s.board, rail);
          const near = s.half === 0 ? [0, 1, 2, 3, 4] : [9, 8, 7, 6, 5];
          jumpers.push({ net: n, a: stripHole(s, freeRow(s, near) ?? near[0]!), b: railHole(s.board, rail, colX(s.col, cols)) });
        }
        continue;
      }
      // İlk geçişte sıralı; sonradan eklenen şerit (alet kablosu için açılan) listedeki öncekine bağlanır.
      const sorted = done === 0 ? [...list].sort((a, b) => a.board - b.board || a.half - b.half || a.col - b.col) : list;
      for (let i = Math.max(1, done); i < sorted.length; i++) {
        const a = sorted[i - 1]!;
        const b = sorted[i]!;
        // Aynı yarıda: ortak boş satır; yarılar farklıysa kanala yakın satırlar.
        const pa = a.half === 0 ? [0, 4, 1, 3, 2] : [9, 5, 8, 6, 7];
        const pb = b.half === 0 ? [0, 4, 1, 3, 2] : [9, 5, 8, 6, 7];
        const same = a.half === b.half ? pa.find((r) => !a.rows.has(r) && !b.rows.has(r)) : undefined;
        jumpers.push({ net: n, a: stripHole(a, same ?? freeRow(a, pa) ?? pa[0]!), b: stripHole(b, same ?? freeRow(b, pb) ?? pb[0]!) });
      }
    }
  };
  /** Ağın tahtadaki bacakları (şeridi ve satırıyla). */
  const legs = new Map<string, Array<{ part: Part; pin: number; strip: Strip; row: number }>>();
  if (series) {
    for (const [id, at] of onBoard) {
      const part = byId.get(id)!;
      at.holes.forEach((h, pin) => {
        if (h.kind !== 'strip') return;
        const strip = strips.get(stripKey(h.board, h.row >= 5 ? 1 : 0, h.col))!;
        const n = net(part, pin);
        legs.set(n, [...(legs.get(n) ?? []), { part, pin, strip, row: h.row }]);
      });
    }
    // Köprüler önce: alet uçları kalan deliklerden bacağa en yakınına takılır.
    joinStrips();
  }
  const pinAt = (p: Part, pin: number) => pinPositions(p)[pin] ?? { x: p.x, y: p.y };
  const far = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  /** İki uçlu gerilim ölçerin paralel bağlı olduğu tahta parçası: iki ucunun ağında da bacağı olan, şemada en yakını. */
  const across = (m: Part): Part | null => {
    if (!sensing(m) || m.type === 'oscilloscope' || net(m, 0) === net(m, 1)) return null;
    const a = legs.get(net(m, 0)) ?? [];
    const b = legs.get(net(m, 1)) ?? [];
    const both = a.filter((x) => b.some((y) => y.part.id === x.part.id)).map((x) => x.part);
    return both.sort((p, q) => far(p, m) - far(q, m) || p.x - q.x || p.y - q.y)[0] ?? null;
  };
  /** Şeridin `row` satırına en yakın boş deliği (eşitlikte arkadaki: tel direkten gelir). */
  const nearRow = (s: Strip, row: number) =>
    (s.half === 0 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]).filter((r) => !s.rows.has(r)).sort((p, q) => Math.abs(p - row) - Math.abs(q - row) || p - q)[0];
  /**
   * Alet ucunun (cihaz ya da tahta dışı parça) deliği. Ölçen uçlar (voltmetre, ampermetre, multimetre, osiloskop
   * kanalı): ağın bacağı varsa o bacağın şeridi. Öbür uçlar (kaynaklar, üreteç, osiloskop toprağı, motor, röle…):
   * toprak ve besleme ağında ray; yoksa bağlı olduğu bacağın şeridi. Ağın tahtada bacağı yoksa: ray ya da boş şerit.
   */
  const seriesHole = (part: Part, pin: number, n: string, aim: number): Hole => {
    const role = roles.get(n);
    const list = legs.get(n) ?? [];
    const measures = part.type === 'voltmeter' || part.type === 'ammeter' || part.type === 'multimeter' || (part.type === 'oscilloscope' && pin < 2);
    if (role && (!measures || list.length === 0)) {
      const rail = railFor(role, true);
      useRail(n, 0, rail);
      return railHole(0, rail, aim);
    }
    if (list.length > 0) {
      const from = pinAt(part, pin);
      const mate = across(part);
      const first = (l: { part: Part }) => (mate && l.part.id === mate.id ? 0 : 1);
      const ranked = [...list].sort((p, q) => first(p) - first(q) || far(from, pinAt(p.part, p.pin)) - far(from, pinAt(q.part, q.pin)) || p.strip.col - q.strip.col);
      for (const leg of ranked) {
        const row = nearRow(leg.strip, leg.row);
        if (row === undefined) continue;
        leg.strip.legs++;
        return stripHole(leg.strip, row);
      }
    }
    const s = stripFor(n, aim, 0, 0);
    s.legs++;
    const prefer = s.half === 0 ? [0, 1, 4, 3, 2] : [5, 6, 9, 8, 7];
    return stripHole(s, freeRow(s, prefer) ?? prefer[0]!);
  };

  const leads: Lead[] = [];
  for (const part of ordered) {
    const place = table.get(part.id);
    if (!place) continue;
    const side = TABLE[part.type]!.side;
    const aim = side === 'left' ? leftEdge : side === 'right' ? -leftEdge : leadX.get(part.id) ?? place.x;
    const pinCount = netlist.elements.find((e) => e.id === part.id)!.pins.length;
    const led = new Set<string>();
    for (let pin = 0; pin < pinCount; pin++) {
      if (!connected(part, pin)) continue;
      const n = net(part, pin);
      // Arduino'nun iki GND'si aynı ağ: tek kablo yeter.
      if (part.type === 'arduino' && (pin === 2 || pin === 21) && led.has(n)) continue;
      led.add(n);
      if (series && part.type !== 'arduino') {
        leads.push({ net: n, partId: part.id, pin, hole: seriesHole(part, pin, n, aim) });
        continue;
      }
      const role = roles.get(n);
      // Kablolar tahtanın arka yarısına (üst raylar, a–e satırları) gelir: önden bakınca parçaların arkasında kalır.
      const topSide = true;
      const board = 0;
      if (role) {
        const rail = railFor(role, topSide);
        useRail(n, board, rail);
        leads.push({ net: n, partId: part.id, pin, hole: railHole(board, rail, aim) });
        continue;
      }
      const half: 0 | 1 = topSide ? 0 : 1;
      const s = stripFor(n, aim, half, board);
      s.legs++;
      const prefer = s.half === 0 ? (topSide ? [0, 1, 4, 3, 2] : [4, 3, 0, 1, 2]) : topSide ? [5, 6, 9, 8, 7] : [9, 8, 5, 6, 7];
      leads.push({ net: n, partId: part.id, pin, hole: stripHole(s, freeRow(s, prefer) ?? prefer[0]!) });
    }
  }

  // --- Jumper'lar ------------------------------------------------------------------------------------
  joinStrips();
  // Aynı ağın kullandığı raylar (üst/alt, breadboard'lar arası) birleştirilir: besleme (+) sol uçta, öbürleri
  // (toprak, −) sağ uçta. Aynı uçta olsalar iki köprü aynı sütunda üst üste biner (tepeden görünümde biri
  // öbürünü ve 1. sütunun deliklerini örter).
  const rightEdge = boardWidth(cols) / 2;
  for (const [n, used] of railsUsed) {
    const list = [...used].map((u) => u.split(':').map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const edge = roles.get(n) === 'supply' ? leftEdge : rightEdge;
    for (let i = 1; i < list.length; i++) {
      const [b0, r0] = list[i - 1]!;
      const [b1, r1] = list[i]!;
      jumpers.push({ net: n, a: railHole(b0, r0, edge), b: railHole(b1, r1, edge) });
    }
  }

  return { boards, cols, onBoard, table, jumpers, leads, netOf, roles, ...(series ? { chains: chains.map((c) => c.map((l) => ({ partId: l.part.id, inPin: l.inPin }))) } : {}) };
}
