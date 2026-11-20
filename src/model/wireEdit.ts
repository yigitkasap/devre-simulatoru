// Kablo düzenleme (kablo-duzen, 2026-11-19): köşeli kablonun yalnızca bir düz parçasını silmek (kablo o noktadan
// ikiye bölünür), kablonun ucunu sürükleyip bir bacağa, başka bir kablonun ucuna ya da ortasına bağlamak ve ucu
// ucuna değen iki kabloyu (arada başka bağlantı yoksa) tek kabloda birleştirmek. Hepsi saf fonksiyondur.

import { onSegmentInterior, pinPositions, samePoint } from './geometry';
import type { CircuitDoc, Point, Wire } from './types';
import { normalizePoints } from './wires';

function nextWireId(wires: readonly Wire[]): string {
  let max = 0;
  for (const w of wires) {
    if (!w.id.startsWith('w')) continue;
    const n = Number(w.id.slice(1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `w${max + 1}`;
}

/** Aynı doğru üzerinde geri dönen kıvrımları da kaldırır (A → B → C, C A'ya doğru geri dönüyorsa B atılır). */
function simplify(points: readonly Point[]): Point[] {
  let out = normalizePoints(points);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 1; i + 1 < out.length; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (!collinear) continue;
      out = normalizePoints([...out.slice(0, i), ...out.slice(i + 1)]);
      changed = true;
      break;
    }
  }
  return out;
}

/**
 * Kablonun `index`. düz parçasını (points[index] → points[index+1]) siler. Kablo o noktadan ikiye bölünür: sol yan
 * kablonun kimliğini korur, sağ yan yeni kimlik alır; uçlar yerinde kalır. Tek parçalı kablo bütünüyle silinir.
 */
export function deleteSegment(doc: CircuitDoc, wireId: string, index: number): CircuitDoc {
  const wire = doc.wires.find((w) => w.id === wireId);
  if (!wire) return doc;
  const segments = wire.points.length - 1;
  if (segments <= 1 || index < 0 || index >= segments) return { ...doc, wires: doc.wires.filter((w) => w.id !== wireId) };
  const left = wire.points.slice(0, index + 1);
  const right = wire.points.slice(index + 1);
  const wires: Wire[] = [];
  for (const w of doc.wires) {
    if (w.id !== wireId) {
      wires.push(w);
      continue;
    }
    if (left.length >= 2) wires.push({ id: wire.id, points: left });
  }
  if (right.length >= 2) wires.push({ id: left.length >= 2 ? nextWireId(doc.wires) : wire.id, points: right });
  return { ...doc, wires };
}

/**
 * Kablonun bir ucunu `to` noktasına götürür: yalnızca son parça uzar ya da kısalır; uç o doğrunun dışındaysa son
 * köşeden dik açıyla bir köşe eklenir (son parçanın yönünde devam edilir). Öbür köşeler yerinde kalır.
 */
export function dragEndpoint(points: readonly Point[], which: 'start' | 'end', to: Point): Point[] {
  const pts = which === 'start' ? [...points].reverse() : [...points];
  if (pts.length < 2) return [...points];
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const base = pts.slice(0, -1);
  let route: Point[];
  if (prev.x === to.x || prev.y === to.y) route = [to];
  else {
    const horizontal = prev.y === last.y && prev.x !== last.x;
    route = [horizontal ? { x: to.x, y: prev.y } : { x: prev.x, y: to.y }, to];
  }
  const result = simplify([...base, ...route]);
  // Uç, kablonun başladığı noktaya geri getirildiyse kablo tek noktaya iner (çağıran temizler).
  return which === 'start' ? result.reverse() : result;
}

/** p noktasında bir ucu olan kablolar (`except` hariç) ve hangi uçları. */
function endsAt(doc: CircuitDoc, p: Point, except: string): { wire: Wire; which: 'start' | 'end' }[] {
  const out: { wire: Wire; which: 'start' | 'end' }[] = [];
  for (const w of doc.wires) {
    if (w.id === except) continue;
    if (samePoint(w.points[0]!, p)) out.push({ wire: w, which: 'start' });
    else if (samePoint(w.points[w.points.length - 1]!, p)) out.push({ wire: w, which: 'end' });
  }
  return out;
}

/** p noktasında (uç olmadan) köşesi ya da ortası olan kablo var mı (`except` dışında)? */
function passesThrough(doc: CircuitDoc, p: Point, except: ReadonlySet<string>): boolean {
  for (const w of doc.wires) {
    if (except.has(w.id)) continue;
    const pts = w.points;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0 && i < pts.length - 1 && samePoint(pts[i]!, p)) return true;
      if (i + 1 < pts.length && onSegmentInterior(p, pts[i]!, pts[i + 1]!)) return true;
    }
  }
  return false;
}

/**
 * Kablonun `which` ucu başka bir kablonun ucuna değiyorsa ve o noktada başka bağlantı yoksa (bacak, üçüncü kablo,
 * T bağlantısı) iki kablo tek kabloda birleşir; birleşen kablo `wireId` kimliğini korur. Birleşme yoksa belge aynen.
 */
export function mergeAtEnd(doc: CircuitDoc, wireId: string, which: 'start' | 'end'): { doc: CircuitDoc; merged: string | null } {
  const wire = doc.wires.find((w) => w.id === wireId);
  if (!wire || wire.points.length < 2) return { doc, merged: null };
  const p = which === 'start' ? wire.points[0]! : wire.points[wire.points.length - 1]!;
  const others = endsAt(doc, p, wireId);
  if (others.length !== 1) return { doc, merged: null };
  const other = others[0]!;
  // Kendi öbür ucu da aynı noktadaysa (halka) ya da noktada bir bacak ya da geçen kablo varsa birleşmez.
  if (samePoint(wire.points[0]!, wire.points[wire.points.length - 1]!)) return { doc, merged: null };
  if (doc.parts.some((part) => pinPositions(part).some((pin) => samePoint(pin, p)))) return { doc, merged: null };
  if (passesThrough(doc, p, new Set([wireId, other.wire.id]))) return { doc, merged: null };
  // Kablonun kendisi o noktadan bir köşesiyle ya da ortasıyla geçiyorsa da birleşmez.
  const own = which === 'start' ? wire.points.slice(1) : wire.points.slice(0, -1);
  if (own.some((q) => samePoint(q, p)) || passesThrough({ ...doc, wires: [{ id: '', points: own }] }, p, new Set())) return { doc, merged: null };
  const mine = which === 'end' ? [...wire.points] : [...wire.points].reverse(); // p'de biter
  const theirs = other.which === 'start' ? [...other.wire.points] : [...other.wire.points].reverse(); // p'de başlar
  const joined = simplify([...mine, ...theirs.slice(1)]);
  const points = which === 'end' ? joined : joined.reverse();
  if (points.length < 2) return { doc, merged: null };
  const wires = doc.wires.filter((w) => w.id !== other.wire.id).map((w) => (w.id === wireId ? { ...w, points } : w));
  return { doc: { ...doc, wires }, merged: other.wire.id };
}

/**
 * Uç sürüklemesinin sonucu: kablo `to` noktasına uzar/kısalır; bırakılınca (`release`) ucu ucuna değen kabloyla
 * birleşir. Tek noktaya inen kablo silinir.
 */
export function moveWireEnd(doc: CircuitDoc, wireId: string, which: 'start' | 'end', to: Point, release: boolean): CircuitDoc {
  const wire = doc.wires.find((w) => w.id === wireId);
  if (!wire) return doc;
  const points = dragEndpoint(wire.points, which, to);
  if (points.length < 2) return { ...doc, wires: doc.wires.filter((w) => w.id !== wireId) };
  const moved = { ...doc, wires: doc.wires.map((w) => (w.id === wireId ? { ...w, points } : w)) };
  return release ? mergeAtEnd(moved, wireId, which).doc : moved;
}

/** Seçimdeki kabloların silinmesi: parçası seçili kabloda yalnızca o parça, öbürlerinde bütün kablo. */
export function splitForDelete(
  doc: CircuitDoc,
  wireIds: readonly string[],
  segments: Readonly<Record<string, number>> | undefined,
): { doc: CircuitDoc; whole: string[]; cut: number } {
  let next = doc;
  const whole: string[] = [];
  let cut = 0;
  for (const id of wireIds) {
    const index = segments?.[id];
    const wire = next.wires.find((w) => w.id === id);
    if (wire && index !== undefined && wire.points.length > 2) {
      next = deleteSegment(next, id, index);
      cut += 1;
    } else whole.push(id);
  }
  return { doc: next, whole, cut };
}
