// Masaüstünde çizilen kablonun yolu: engellerden kaçan yatay/dikey yol (L, Z ya da U biçimli).
//
// Bağlantı kuralları (connectivity.ts) yüzünden kablonun geometrisi bağlantı kurabilir: köşesi bir uca ya
// da başka bir kablonun köşesine denk gelirse oraya bağlanır, üstünden geçtiği başka bir kablonun ucu
// T bağlantısı olur. Kullanıcı yalnızca iki uç seçer (pinden pine sürükler ya da tıklar); aradaki yol
// bu yüzden şunlardan kaçınır:
//   - parça gövdesinden, yazısından (ad, değer, not) ve ölçü aletinin ekranından geçmek,
//   - başka bir kablonun üstünden boyuna geçmek (aynı doğru üzerinde örtüşmek),
//   - bir ucun ya da kablo köşesinin üstünden geçmek,
//   - köşesini bir uca, bir kablo köşesine ya da başka bir kablonun üstüne koymak.
// Kabloları dik kesmek serbesttir (bağlantı değildir); yalnızca az kesen yol yeğlenir.
//
// Adaylar: düz yol (hizalıysa), iki L (önce yatay / önce dikey), Z (yatay–dikey–yatay ya da
// dikey–yatay–dikey; ortadaki parça iki ucun arasında) ve U (ortadaki parça dışarıda, en çok
// DETOUR birim). Temiz aday yoksa ızgarada daha çok köşeli temiz yol aranır (gridRoute); o da
// yoksa en az kurala uymayan aday seçilir (kablo bittiğinde Canvas beklenmeyen bağlantıyı bildirir).

import type { Box } from './catalog';
import { onSegmentInterior, pointKey } from './geometry';
import type { Point } from './types';
import { crossesBoxInterior, normalizePoints } from './wires';

export interface RouteObstacles {
  /** Parça gövdeleri, yazıları ve ölçü aletlerinin ekranları: yol içlerinden geçmez. */
  readonly boxes: readonly Box[];
  /** Mevcut kabloların parçaları. */
  readonly segments: readonly (readonly [Point, Point])[];
  /** Bağlantı noktaları: parça uçları, kabloların köşeleri ve uçları. */
  readonly points: readonly Point[];
}

/** Ortadaki parçanın iki ucun dışına en çok kaç birim taşabileceği (U biçimli dolanma). */
const DETOUR = 10;
/** Kurala uymayan her durumun bedeli: temiz yol, uzunluğu ne olursa olsun önce gelir. */
const VIOLATION = 1000;
const BEND = 3;
const CROSSING = 1;
const OTHER_DIRECTION = 0.2;

/** Bir yolun kurala uymayan durumları (sayı) ve dik kesişmeleri. */
export function routeIssues(path: readonly Point[], obstacles: RouteObstacles, pointSet: ReadonlySet<string> = new Set(obstacles.points.map(pointKey))): { violations: number; crossings: number } {
  const from = path[0]!;
  const to = path[path.length - 1]!;
  // Ucu bir kutunun içinde kalıyorsa (toprak simgesi ucunu gövdesinde taşır) o kutu sayılmaz.
  const inside = (p: Point, b: Box) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
  const boxes = obstacles.boxes.filter((b) => !inside(from, b) && !inside(to, b));
  let violations = 0;
  let crossings = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    for (const box of boxes) if (crossesBoxInterior(a, b, box)) violations++;
    for (const [c, d] of obstacles.segments) {
      if (overlaps(a, b, c, d)) violations++;
      else if (crossesInterior(a, b, c, d)) crossings++;
    }
    for (const p of obstacles.points) if (onSegmentInterior(p, a, b)) violations++;
  }
  // Köşeler: bir uca, kablo köşesine ya da kablonun üstüne denk gelmez.
  for (let i = 1; i + 1 < path.length; i++) {
    const v = path[i]!;
    if (pointSet.has(pointKey(v))) violations++;
    else if (obstacles.segments.some(([c, d]) => onSegmentInterior(v, c, d))) violations++;
  }
  return { violations, crossings };
}

/** İki yatay/dikey parça aynı doğru üzerinde, sıfırdan uzun bir bölümde örtüşüyor mu? */
function overlaps(a: Point, b: Point, c: Point, d: Point): boolean {
  if (a.y === b.y && c.y === d.y && a.y === c.y && a.x !== b.x && c.x !== d.x) {
    return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
  }
  if (a.x === b.x && c.x === d.x && a.x === c.x && a.y !== b.y && c.y !== d.y) {
    return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  }
  return false;
}

/** Biri yatay, öbürü dikey iki parça ikisinin de iç noktasında kesişiyor mu? */
function crossesInterior(a: Point, b: Point, c: Point, d: Point): boolean {
  const [h1, h2, v1, v2] = a.y === b.y && c.x === d.x ? [a, b, c, d] : a.x === b.x && c.y === d.y ? [c, d, a, b] : [null, null, null, null];
  if (!h1 || !h2 || !v1 || !v2) return false;
  return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y);
}

/** Aday yollar (başlangıç hariç, routeL gibi). */
function candidates(from: Point, to: Point): Point[][] {
  const out: Point[][] = [];
  const x0 = Math.min(from.x, to.x) - DETOUR;
  const x1 = Math.max(from.x, to.x) + DETOUR;
  const y0 = Math.min(from.y, to.y) - DETOUR;
  const y1 = Math.max(from.y, to.y) + DETOUR;
  if (from.y === to.y || from.x === to.x) out.push([to]);
  else {
    out.push([{ x: to.x, y: from.y }, to]);
    out.push([{ x: from.x, y: to.y }, to]);
  }
  // Z ve U: yatay–dikey–yatay (ortadaki dikey parça x = m'de). Hizalı dikey uçlarda da U olur.
  if (from.y !== to.y) {
    for (let m = Math.floor(x0); m <= Math.ceil(x1); m++) {
      if (m === from.x || m === to.x) continue;
      out.push([{ x: m, y: from.y }, { x: m, y: to.y }, to]);
    }
  }
  if (from.x !== to.x) {
    for (let m = Math.floor(y0); m <= Math.ceil(y1); m++) {
      if (m === from.y || m === to.y) continue;
      out.push([{ x: from.x, y: m }, { x: to.x, y: m }, to]);
    }
  }
  return out;
}

/**
 * `from` noktasından `to` noktasına engellerden kaçan yatay/dikey yol (from hariç). Eşit bedelli
 * yollardan ilk parçası `horizontalFirst` yönünde olan seçilir (routeL'deki köşe tercihi).
 */
export function routeWire(from: Point, to: Point, obstacles: RouteObstacles, horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)): Point[] {
  if (from.x === to.x && from.y === to.y) return [to];
  const pointSet = new Set(obstacles.points.map(pointKey));
  let best: Point[] = [to];
  let bestCost = Infinity;
  let bestViolations = Infinity;
  for (const route of candidates(from, to)) {
    const path = normalizePoints([from, ...route]);
    const { violations, crossings } = routeIssues(path, obstacles, pointSet);
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y);
    const first = path[1]!;
    const horizontal = first.y === from.y;
    const cost =
      violations * VIOLATION + length + (path.length - 2) * BEND + crossings * CROSSING + (path.length > 2 && horizontal !== horizontalFirst ? OTHER_DIRECTION : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = path.slice(1);
      bestViolations = violations;
    }
  }
  if (bestViolations === 0) return best;
  // Üç parçalı temiz yol yok: ızgarada daha çok köşeli temiz yol aranır.
  return gridRoute(from, to, obstacles, horizontalFirst) ?? best;
}

/** Izgara aramasının bölgesi: iki ucun kutusunun her yanda bu kadar dışı. */
const SEARCH_MARGIN = 14;
/** Bölge bundan büyükse (çok uzun kablo) ızgara araması yapılmaz. */
const MAX_CELLS = 60_000;

/**
 * Izgarada köşe cezalı en kısa temiz yol (A*; bedel = uzunluk + köşe başına BEND + dik kesişme başına
 * CROSSING). Kurallar routeIssues'takilerle aynı: kutunun içinden, kablonun üstünden boyuna ve bir
 * bağlantı noktasının üstünden geçilmez; köşe bağlantı noktasına ve kablonun üstüne konmaz. Yol yoksa null.
 */
export function gridRoute(from: Point, to: Point, obstacles: RouteObstacles, horizontalFirst = true): Point[] | null {
  const x0 = Math.min(from.x, to.x) - SEARCH_MARGIN;
  const x1 = Math.max(from.x, to.x) + SEARCH_MARGIN;
  const y0 = Math.min(from.y, to.y) - SEARCH_MARGIN;
  const y1 = Math.max(from.y, to.y) + SEARCH_MARGIN;
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  if (W * H > MAX_CELLS || !Number.isInteger(x0) || !Number.isInteger(y0)) return null;
  const at = (x: number, y: number) => (y - y0) * W + (x - x0);
  const inRange = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  // Kapalı kenarlar: yatay (x,y)→(x+1,y) hBlocked[at(x,y)], dikey (x,y)→(x,y+1) vBlocked[at(x,y)].
  const hBlocked = new Uint8Array(W * H);
  const vBlocked = new Uint8Array(W * H);
  const inside = (p: Point, b: Box) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
  for (const b of obstacles.boxes) {
    if (inside(from, b) || inside(to, b)) continue;
    for (let y = Math.max(y0, Math.ceil(b.y)); y <= Math.min(y1, Math.floor(b.y + b.h)); y++) {
      if (!(y > b.y && y < b.y + b.h)) continue;
      for (let x = Math.max(x0, Math.floor(b.x)); x <= Math.min(x1 - 1, Math.ceil(b.x + b.w)); x++) if (x < b.x + b.w && x + 1 > b.x) hBlocked[at(x, y)] = 1;
    }
    for (let x = Math.max(x0, Math.ceil(b.x)); x <= Math.min(x1, Math.floor(b.x + b.w)); x++) {
      if (!(x > b.x && x < b.x + b.w)) continue;
      for (let y = Math.max(y0, Math.floor(b.y)); y <= Math.min(y1 - 1, Math.ceil(b.y + b.h)); y++) if (y < b.y + b.h && y + 1 > b.y) vBlocked[at(x, y)] = 1;
    }
  }
  // Kabloların üstü: boyuna geçilmez; iç noktalarında köşe yok, dik geçiş kesişmedir.
  const onWire = new Uint8Array(W * H);
  for (const [a, b] of obstacles.segments) {
    if (a.y === b.y) {
      const [lo, hi] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
      for (let x = lo; x < hi; x++) if (inRange(x, a.y) && inRange(x + 1, a.y)) hBlocked[at(x, a.y)] = 1;
      for (let x = lo + 1; x < hi; x++) if (inRange(x, a.y)) onWire[at(x, a.y)] = 1;
    } else if (a.x === b.x) {
      const [lo, hi] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
      for (let y = lo; y < hi; y++) if (inRange(a.x, y) && inRange(a.x, y + 1)) vBlocked[at(a.x, y)] = 1;
      for (let y = lo + 1; y < hi; y++) if (inRange(a.x, y)) onWire[at(a.x, y)] = 1;
    }
  }
  const blockedPoint = new Uint8Array(W * H);
  for (const p of obstacles.points) if (Number.isInteger(p.x) && Number.isInteger(p.y) && inRange(p.x, p.y)) blockedPoint[at(p.x, p.y)] = 1;
  const goal = at(to.x, to.y);
  const start = at(from.x, from.y);
  // Durum: hücre · 4 + yön (0: +x, 1: −x, 2: +y, 3: −y).
  const DX = [1, -1, 0, 0];
  const DY = [0, 0, 1, -1];
  const cost = new Float64Array(W * H * 4).fill(Infinity);
  const prev = new Int32Array(W * H * 4).fill(-1);
  const heap = new MinHeap();
  const edgeOpen = (x: number, y: number, d: number) =>
    d === 0 ? !hBlocked[at(x, y)] : d === 1 ? !hBlocked[at(x - 1, y)] : d === 2 ? !vBlocked[at(x, y)] : !vBlocked[at(x, y - 1)];
  /** (x, y)'den d yönünde bir adım: varılan hücre (geçilemiyorsa −1). */
  const step = (x: number, y: number, d: number): number => {
    const nx = x + DX[d]!;
    const ny = y + DY[d]!;
    if (!inRange(nx, ny) || !edgeOpen(x, y, d)) return -1;
    const n = at(nx, ny);
    if (n === start || (blockedPoint[n] && n !== goal)) return -1;
    return n;
  };
  const h = (cell: number) => Math.abs((cell % W) + x0 - to.x) + Math.abs(Math.floor(cell / W) + y0 - to.y);
  for (let d = 0; d < 4; d++) {
    const n = step(from.x, from.y, d);
    if (n < 0) continue;
    const c = 1 + (onWire[n] && n !== goal ? CROSSING : 0) + (d < 2 !== horizontalFirst ? OTHER_DIRECTION : 0);
    cost[n * 4 + d] = c;
    heap.push(c + h(n), n * 4 + d);
  }
  let found = -1;
  while (heap.size > 0) {
    const [f, state] = heap.pop();
    const cell = state >> 2;
    const d = state & 3;
    const c = cost[state]!;
    if (f - h(cell) > c + 1e-9) continue; // eski kayıt
    if (cell === goal) {
      found = state;
      break;
    }
    const x = (cell % W) + x0;
    const y = Math.floor(cell / W) + y0;
    const canBend = !blockedPoint[cell] && !onWire[cell];
    for (let nd = 0; nd < 4; nd++) {
      if ((nd ^ 1) === d) continue; // geri dönüş yok
      const bend = nd !== d;
      if (bend && !canBend) continue;
      const n = step(x, y, nd);
      if (n < 0) continue;
      const nc = c + 1 + (bend ? BEND : 0) + (onWire[n] && n !== goal ? CROSSING : 0);
      const ns = n * 4 + nd;
      if (nc < cost[ns]!) {
        cost[ns] = nc;
        prev[ns] = state;
        heap.push(nc + h(n), ns);
      }
    }
  }
  if (found < 0) return null;
  const cells: Point[] = [];
  for (let s = found; s >= 0; s = prev[s]!) {
    const cell = s >> 2;
    cells.push({ x: (cell % W) + x0, y: Math.floor(cell / W) + y0 });
  }
  cells.push(from);
  cells.reverse();
  return normalizePoints(cells).slice(1);
}

/** İkili yığın (en küçük öncelik önce). */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, value: number): void {
    const { keys, values } = this;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      keys[i] = keys[parent]!;
      values[i] = values[parent]!;
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }
  pop(): [number, number] {
    const { keys, values } = this;
    const top: [number, number] = [keys[0]!, values[0]!];
    const lastKey = keys.pop()!;
    const lastValue = values.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[m]! >= lastKey) break;
        keys[i] = keys[m]!;
        values[i] = values[m]!;
        i = m;
      }
      keys[i] = lastKey;
      values[i] = lastValue;
    }
    return top;
  }
}
