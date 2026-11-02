// Tahtada kur: öğrencinin breadboard'a kurduğu devre. Devre dosyasında şemanın yanında ayrı bir alanda
// ("build") durur; şemayı değiştirmez, geri al ve yinele (belgenin parçası olduğu için) onu da kapsar.
// Şema değişirse kurulum kalır; Denetle farkı gösterir (silinen parçanın kaydı silinir).
//
// Delikler lehim rehberindeki adlarla yazılır: "12c", "üst + rayı (12. sütun hizası)" (bench3d/holes.ts).
//
// {
//   "cols": 30,
//   "parts": { "p2": { "holes": ["2c", "6c"] }, "p5": { "holes": ["17f", "17e", "19e", "19f"], "extra": ["20f", "20e"] } },
//   "wires": [{ "a": "6a", "b": "üst + rayı (5. sütun hizası)", "color": "red" }],
//   "leads": [{ "part": "p1", "pin": 0, "hole": "üst + rayı (2. sütun hizası)" }]
// }

import { BB, type BreadboardPlan, type Hole } from '../bench3d/breadboard';
import { holeLabel, parseHole } from '../bench3d/holes';
import { CATALOG } from './catalog';
import type { Part } from './types';

/** Ara kablo renkleri (araç çubuğundaki sırayla). */
export const WIRE_COLORS = ['red', 'black', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'teal', 'pink'] as const;
export type WireColor = (typeof WIRE_COLORS)[number];
/** + ve − rayına gitmeyen kabloların sırayla aldığı renkler. */
const SEQUENCE: readonly WireColor[] = ['orange', 'yellow', 'green', 'blue', 'purple', 'white', 'teal', 'pink'];

/** Takılı bir parça: pin sırasıyla delikler; DIP'te ve düğmede kullanılmayan bacakların delikleri. */
export interface BuildPart {
  readonly holes: readonly string[];
  readonly extra?: readonly string[];
}

/** İki delik arasındaki ara kablo. */
export interface BuildWire {
  readonly a: string;
  readonly b: string;
  readonly color: WireColor;
}

/** Masadaki bir parçanın (pil, cihaz, ölçü aleti) ucundan deliğe giden kablo. */
export interface BuildLead {
  readonly part: string;
  readonly pin: number;
  readonly hole: string;
}

export interface Build {
  /** Kartın sütun sayısı (yarım boy 30, tam boy 63); kurulum başlarken planBreadboard'un seçtiği. */
  readonly cols: number;
  readonly parts: Readonly<Record<string, BuildPart>>;
  readonly wires: readonly BuildWire[];
  readonly leads: readonly BuildLead[];
}

export function emptyBuild(cols: number): Build {
  return { cols, parts: {}, wires: [], leads: [] };
}

/** Kurulumdaki bütün dolu delikler (bir delikte tek bacak ya da tek kablo ucu). */
export function occupiedHoles(build: Build): Set<string> {
  const used = new Set<string>();
  for (const p of Object.values(build.parts)) for (const h of [...p.holes, ...(p.extra ?? [])]) used.add(h);
  for (const w of build.wires) used.add(w.a).add(w.b);
  for (const l of build.leads) used.add(l.hole);
  return used;
}

const isRail = (name: string, sign: '+' | '−') => name.includes(`${sign} rayı`);

/**
 * Yeni ara kablonun rengi: + rayına giden kırmızı, − rayına giden siyah, öbürleri sırayla (kurulumdaki
 * öbür kabloların sayısına göre).
 */
export function autoWireColor(build: Build, a: string, b: string): WireColor {
  if (isRail(a, '+') || isRail(b, '+')) return 'red';
  if (isRail(a, '−') || isRail(b, '−')) return 'black';
  const others = build.wires.filter((w) => !isRail(w.a, '+') && !isRail(w.b, '+') && !isRail(w.a, '−') && !isRail(w.b, '−')).length;
  return SEQUENCE[others % SEQUENCE.length]!;
}

/** planBreadboard'un yerleşimi kurulum olarak (örnek yerleşim ipucu, testler). */
export function buildFromPlan(plan: BreadboardPlan): Build {
  const name = (h: Hole) => holeLabel(h, plan.cols, plan.boards);
  const parts: Record<string, BuildPart> = {};
  for (const [id, at] of plan.onBoard) {
    parts[id] = { holes: at.holes.map(name), ...(at.extraHoles && at.extraHoles.length > 0 ? { extra: at.extraHoles.map(name) } : {}) };
  }
  let build: Build = { cols: plan.cols, parts, wires: [], leads: plan.leads.map((l) => ({ part: l.partId, pin: l.pin, hole: name(l.hole) })) };
  for (const j of plan.jumpers) {
    const a = name(j.a);
    const b = name(j.b);
    build = { ...build, wires: [...build.wires, { a, b, color: autoWireColor(build, a, b) }] };
  }
  return build;
}

export function serializeBuild(build: Build): Record<string, unknown> {
  return {
    cols: build.cols,
    parts: Object.fromEntries(Object.entries(build.parts).map(([id, p]) => [id, { holes: [...p.holes], ...(p.extra ? { extra: [...p.extra] } : {}) }])),
    wires: build.wires.map((w) => ({ a: w.a, b: w.b, color: w.color })),
    leads: build.leads.map((l) => ({ part: l.part, pin: l.pin, hole: l.hole })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MAX_ITEMS = 5000;

/**
 * JSON'dan kurulum. Geçersizse (bilinmeyen delik, pin sayısı tutmayan parça, aynı delikte iki uç) null:
 * şema yine okunur, kurulum boş başlar. Şemada olmayan parçaların kaydı atlanır.
 */
export function parseBuild(value: unknown, parts: readonly Part[]): Build | null {
  if (!isRecord(value)) return null;
  const cols = value.cols;
  if (cols !== BB.cols && cols !== BB.halfCols) return null;
  const valid = (name: unknown): name is string => typeof name === 'string' && parseHole(name, cols) !== null;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const outParts: Record<string, BuildPart> = {};
  if (!isRecord(value.parts)) return null;
  for (const [id, raw] of Object.entries(value.parts)) {
    const part = byId.get(id);
    if (!part) continue;
    if (!isRecord(raw) || !Array.isArray(raw.holes) || raw.holes.length !== CATALOG[part.type].pins.length || !raw.holes.every(valid)) return null;
    const extra = raw.extra;
    if (extra !== undefined && (!Array.isArray(extra) || !extra.every(valid))) return null;
    outParts[id] = { holes: [...raw.holes], ...(Array.isArray(extra) && extra.length > 0 ? { extra: [...(extra as string[])] } : {}) };
  }
  const wires: BuildWire[] = [];
  if (!Array.isArray(value.wires) || value.wires.length > MAX_ITEMS) return null;
  for (const raw of value.wires) {
    if (!isRecord(raw) || !valid(raw.a) || !valid(raw.b) || raw.a === raw.b) return null;
    if (typeof raw.color !== 'string' || !(WIRE_COLORS as readonly string[]).includes(raw.color)) return null;
    wires.push({ a: raw.a, b: raw.b, color: raw.color as WireColor });
  }
  const leads: BuildLead[] = [];
  if (!Array.isArray(value.leads) || value.leads.length > MAX_ITEMS) return null;
  for (const raw of value.leads) {
    if (!isRecord(raw) || typeof raw.part !== 'string' || !valid(raw.hole) || typeof raw.pin !== 'number' || !Number.isInteger(raw.pin)) return null;
    const part = byId.get(raw.part);
    if (!part) continue;
    if (raw.pin < 0 || raw.pin >= CATALOG[part.type].pins.length) return null;
    if (leads.some((l) => l.part === raw.part && l.pin === raw.pin)) return null;
    leads.push({ part: raw.part, pin: raw.pin, hole: raw.hole });
  }
  const build: Build = { cols, parts: outParts, wires, leads };
  // Bir delikte tek uç.
  const ends = [...Object.values(outParts).flatMap((p) => [...p.holes, ...(p.extra ?? [])]), ...wires.flatMap((w) => [w.a, w.b]), ...leads.map((l) => l.hole)];
  return new Set(ends).size === ends.length ? build : null;
}

/** Silinen parçaların kaydı (delikleri ve kabloları) kurulumdan çıkar. */
export function pruneBuild(build: Build, removed: ReadonlySet<string>): Build {
  if (![...removed].some((id) => build.parts[id] !== undefined || build.leads.some((l) => l.part === id))) return build;
  return {
    ...build,
    parts: Object.fromEntries(Object.entries(build.parts).filter(([id]) => !removed.has(id))),
    leads: build.leads.filter((l) => !removed.has(l.part)),
  };
}
