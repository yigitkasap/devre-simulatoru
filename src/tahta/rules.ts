// Tahtada kur: takma kuralları (T2). Saf hesap: hangi deliğe hangi bacak takılabilir, sabit düzenli
// kılıfların (TO-92, TO-220, köprü, trimpot, DIP, basmalı düğme) delikleri, takma ve çıkarma.
//
// Kararlar (README → Tahtada kur, 5 ve 6):
//   - Bacak aralığı gerçek boya göre sınırlı: direnç ve diyot 3–8 delik, LED ve kondansatör 1–3. Öbür iki
//     bacaklı parçalar planın aralığının çevresinde: [aralık − 1, aralık + 2] (en az 1). İki bacak aynı
//     satırda ya da aynı sütunda (düz); aralık delik aralığı biriminde (orta kanal 3 birim sayılır).
//   - Transistör, trimpot, TO-220 ve köprü aynı satırda ardışık deliklere; 741, 555 ve PC817 orta kanalın
//     üstüne (e ve f satırları); basmalı düğme kanalın iki yanına (d ve g satırları, ikiz bacaklar iki
//     sütun yanda).
//   - Bir delikte tek bacak ya da tek kablo ucu: dolu deliğe takılmaz.

import { DIP4_PINS, DIP_PINS, LEG_ORDER, holeXZ, mountOf, planSpan, type Hole, type Mount } from '../bench3d/breadboard';
import { allHoles, holeLabel, parseHole } from '../bench3d/holes';
import { occupiedHoles, type Build, type BuildPart } from '../model/build';
import { CATALOG } from '../model/catalog';
import type { DeviceType } from '../sim/netlist';

/** İki bacaklı parçanın bacak aralığı (delik aralığı biriminde). */
export function legRange(type: DeviceType): { readonly min: number; readonly max: number } {
  switch (type) {
    case 'resistor':
    case 'diode':
    case 'schottky':
    case 'zener':
      return { min: 3, max: 8 };
    case 'led':
    case 'capacitor':
      return { min: 1, max: 3 };
    default: {
      const span = planSpan(type) ?? 2;
      return { min: Math.max(1, span - 1), max: span + 2 };
    }
  }
}

/** Sabit düzenli (bacakları birlikte takılan) kılıflar. */
export function isFixed(type: DeviceType): boolean {
  const mount = mountOf(type);
  return mount !== undefined && mount !== 'axial' && mount !== 'radial';
}

export function pinCount(type: DeviceType): number {
  return CATALOG[type].pins.length;
}

const EPS = 1e-6;

/** İki deliğin uzaklığı (delik aralığı biriminde) ve aynı satırda / sütunda olup olmadıkları. */
function apart(a: Hole, b: Hole, cols: number): { distance: number; straight: boolean } {
  const pa = holeXZ(a, cols);
  const pb = holeXZ(b, cols);
  const dx = Math.abs(pa.x - pb.x);
  const dz = Math.abs(pa.z - pb.z);
  // Ray delikleri yarım boyda sütunların yarım aralık yanında: 0,6'ya kadar kayma düz sayılır.
  return { distance: Math.hypot(dx, dz), straight: dx < 0.6 || dz < 0.6 };
}

/** İki bacaklı parçanın ikinci bacağı bu deliğe uzanır mı (dolu olup olmadığına bakılmaz)? */
export function reaches(type: DeviceType, first: Hole, second: Hole, cols: number): boolean {
  const { min, max } = legRange(type);
  const { distance, straight } = apart(first, second, cols);
  return straight && distance >= min - 0.01 && distance <= max + 0.01 && distance > EPS;
}

/** İkinci bacak için uygun (uzanan ve boş) delikler: tahtada yeşil halka. */
export function secondLegHoles(type: DeviceType, first: Hole, cols: number, occupied: ReadonlySet<string>): Hole[] {
  return allHoles(cols).filter((h) => !occupied.has(holeLabel(h, cols)) && reaches(type, first, h, cols));
}

/** Sabit düzenli kılıfın yönü: 0 normal, 1 180° döndürülmüş (R). */
export type Orientation = 0 | 1;

/**
 * Sabit düzenli kılıfın delikleri: imlecin üstünde olduğu delik ilk (soldaki) bacaktır; DIP'te ve düğmede
 * yalnızca sütunu sayılır (satırlar sabit). Tahtadan taşıyorsa null.
 */
export function fixedHoles(type: DeviceType, at: Hole, orientation: Orientation, cols: number): BuildHoles | null {
  const mount = mountOf(type);
  if (!mount || mount === 'axial' || mount === 'radial' || at.kind !== 'strip') return null;
  const strip = (col: number, row: number): Hole | null => (col >= 1 && col <= cols ? { kind: 'strip', board: at.board, col, row } : null);
  const done = (holes: Array<Hole | null>, extra: Array<Hole | null> = []): BuildHoles | null =>
    holes.every((h) => h !== null) && extra.every((h) => h !== null) ? { holes: holes as Hole[], extra: extra as Hole[] } : null;
  switch (mount as Mount) {
    case 'to92':
    case 'pot':
    case 'inline': {
      // Aynı satırda ardışık delikler; bacakların gerçek sırası (LEG_ORDER) soldan sağa, 180°'de tersi.
      const n = pinCount(type);
      const physical = LEG_ORDER[type] ?? Array.from({ length: n }, (_, i) => i);
      const order = orientation === 1 ? [...physical].reverse() : physical;
      const holes: Array<Hole | null> = new Array(n).fill(null);
      order.forEach((pin, k) => (holes[pin] = strip(at.col + k, at.row)));
      return done(holes);
    }
    case 'dip8':
    case 'dip4': {
      // Orta kanalın üstünde: alt sıra f (5), üst sıra e (4). 1. bacak sol altta (180°'de sağ üstte).
      const half = mount === 'dip4' ? 2 : 4;
      const map = (mount === 'dip4' ? DIP4_PINS : DIP_PINS)[type]!;
      const legOf = (dip: number): Hole | null => {
        const normal = dip <= half ? { col: at.col + dip - 1, row: 5 } : { col: at.col + 2 * half - dip, row: 4 };
        return orientation === 0 ? strip(normal.col, normal.row) : strip(2 * at.col + half - 1 - normal.col, normal.row === 5 ? 4 : 5);
      };
      const extra: Array<Hole | null> = [];
      for (let dip = 1; dip <= 2 * half; dip++) if (!map.includes(dip)) extra.push(legOf(dip));
      return done(
        map.map((dip) => legOf(dip)),
        extra,
      );
    }
    case 'button': {
      // Kanalın iki yanında: uçlar d (3) ve g (6) satırında aynı sütunda; ikiz bacaklar iki sütun yanda
      // (180°'de öbür yanda).
      const twin = orientation === 0 ? at.col + 2 : at.col - 2;
      return done([strip(at.col, 3), strip(at.col, 6)], [strip(twin, 3), strip(twin, 6)]);
    }
    default:
      return null;
  }
}

export interface BuildHoles {
  readonly holes: readonly Hole[];
  readonly extra: readonly Hole[];
}

/** Takma denemesinin sonucu. */
export type PlaceResult = { readonly ok: true; readonly build: Build } | { readonly ok: false; readonly reason: 'occupied' | 'reach' | 'board' };

/** Parçayı deliklere takar (yerindeyse kendi delikleri boş sayılır). Dolu delik ya da uzanmayan bacak: hata. */
export function placePart(build: Build, type: DeviceType, partId: string, at: BuildHoles | null): PlaceResult {
  if (!at || at.holes.length !== pinCount(type)) return { ok: false, reason: 'board' };
  const name = (h: Hole) => holeLabel(h, build.cols);
  const names = at.holes.map(name);
  const extra = at.extra.map(name);
  const all = [...names, ...extra];
  if (new Set(all).size !== all.length) return { ok: false, reason: 'occupied' };
  if (!isFixed(type) && !reaches(type, at.holes[0]!, at.holes[1]!, build.cols)) return { ok: false, reason: 'reach' };
  const without = removePart(build, partId);
  const used = occupiedHoles(without);
  if (all.some((h) => used.has(h))) return { ok: false, reason: 'occupied' };
  const entry: BuildPart = { holes: names, ...(extra.length > 0 ? { extra } : {}) };
  return { ok: true, build: { ...without, parts: { ...without.parts, [partId]: entry } } };
}

/** Parçayı tahtadan çıkarır (kutuya döner). */
export function removePart(build: Build, partId: string): Build {
  if (!build.parts[partId]) return build;
  const parts = { ...build.parts };
  delete parts[partId];
  return { ...build, parts };
}

/** Takılı parçanın delikleri (Hole). */
export function partHoles(build: Build, partId: string): BuildHoles | null {
  const p = build.parts[partId];
  if (!p) return null;
  const holes = p.holes.map((n) => parseHole(n, build.cols));
  const extra = (p.extra ?? []).map((n) => parseHole(n, build.cols));
  return holes.every((h) => h) && extra.every((h) => h) ? { holes: holes as Hole[], extra: extra as Hole[] } : null;
}

/**
 * Takılı parçayı 180° döndürür (R): iki bacaklıda bacaklar yer değiştirir; sabit düzenlide her bacak
 * kılıfın merkezine göre döner (aynı delikler, bacak sırası ters; DIP'te ve düğmede iki sıra da yer değiştirir).
 */
export function rotatePlaced(build: Build, type: DeviceType, partId: string): PlaceResult {
  const at = partHoles(build, partId);
  if (!at) return { ok: false, reason: 'board' };
  if (!isFixed(type)) return placePart(build, type, partId, { holes: [at.holes[1]!, at.holes[0]!], extra: [] });
  const strips = [...at.holes, ...at.extra].filter((h): h is Extract<Hole, { kind: 'strip' }> => h.kind === 'strip');
  if (strips.length !== at.holes.length + at.extra.length) return { ok: false, reason: 'board' };
  const cols = strips.map((h) => h.col);
  const rows = strips.map((h) => h.row);
  const c = Math.min(...cols) + Math.max(...cols);
  const r = Math.min(...rows) + Math.max(...rows);
  const turn = (h: Hole): Hole => (h.kind === 'strip' ? { ...h, col: c - h.col, row: r - h.row } : h);
  return placePart(build, type, partId, { holes: at.holes.map(turn), extra: at.extra.map(turn) });
}

/**
 * Takılı parçayı tahtada (dc, dr) kaydırır (gövdeden sürükleme): bütün bacaklar şeritteyse sütun ve
 * satır (a–j sırasıyla) kadar. Taşan, rayda bacağı olan ya da dolu deliğe düşen taşıma: hata.
 */
export function movePlaced(build: Build, type: DeviceType, partId: string, dc: number, dr: number): PlaceResult {
  const at = partHoles(build, partId);
  if (!at) return { ok: false, reason: 'board' };
  const shift = (h: Hole): Hole | null => {
    if (h.kind !== 'strip') return null;
    const col = h.col + dc;
    const row = h.row + dr;
    return col >= 1 && col <= build.cols && row >= 0 && row <= 9 ? { ...h, col, row } : null;
  };
  const holes = at.holes.map(shift);
  const extra = at.extra.map(shift);
  if ([...holes, ...extra].some((h) => h === null)) return { ok: false, reason: 'board' };
  // DIP ve düğme kanala göre sabit satırlarda kalır.
  const mount = mountOf(type);
  if ((mount === 'dip8' || mount === 'dip4' || mount === 'button') && dr !== 0) return { ok: false, reason: 'board' };
  return placePart(build, type, partId, { holes: holes as Hole[], extra: extra as Hole[] });
}

/** İki bacaklı parçanın bir bacağını başka deliğe taşır (bacağın ucundan sürükleme). */
export function moveLeg(build: Build, type: DeviceType, partId: string, leg: number, to: Hole): PlaceResult {
  const at = partHoles(build, partId);
  if (!at || isFixed(type)) return { ok: false, reason: 'board' };
  const holes = at.holes.map((h, i) => (i === leg ? to : h));
  return placePart(build, type, partId, { holes, extra: [] });
}

/** Klavyeyle takma: yazılan delik adı ("11h"; büyük/küçük harf, boşluk önemsiz). */
export function typedHole(text: string, cols: number): Hole | null {
  const t = text.trim().toLocaleLowerCase('tr').replace(/\s+/g, '');
  return parseHole(t, cols) ?? parseHole(text.trim(), cols);
}
