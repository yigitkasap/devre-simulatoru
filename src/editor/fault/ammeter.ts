// Arıza bulmada "Buraya ampermetre tak" (B2): kablo dokunulan yerde 1 birimlik bir boşlukla ikiye
// bölünür, ampermetre kablonun yanına (4 birim öteye) konur ve iki kısa kabloyla araya seri girer.
// Böylece kısa kablo parçalarına da takılır (ampermetrenin uçları 8 birim aralıklı). Kablo uçları
// ızgara noktalarında olduğundan boşluğun içine bağlantı düşmez; boşluğun ucundaki T bağlantısı o
// taraftaki yarıya bağlı kalır. Kablonun ilk
// yarısı asıl kimliğini korur, ikinci yarısı yeni kablodur; özgün noktalar saklanır: ampermetre
// kaldırılınca (ya da silinince) kablo eski hâline döner. Kablo ucundaki arıza yeni yarıya taşınır.

import { addPart, addWire, removeItems, replaceWirePoints } from '../../model/docOps';
import type { Fault } from '../../model/faults';
import { partBounds, pinPositions } from '../../model/geometry';
import type { CircuitDoc, Part, Point, Rotation } from '../../model/types';

/** Takılı bir ampermetre: parça, bölünen kablo (ilk yarı), ikinci yarı, bağlantı kabloları, özgün noktalar. */
export interface InsertedMeter {
  readonly part: string;
  readonly wire: string;
  readonly half: string;
  readonly links: readonly [string, string];
  readonly points: readonly Point[];
}

export type InsertError = 'short' | 'junction' | 'diagonal';

/** Ampermetrenin kablodan uzaklığı (ızgara birimi): sırayla denenir, ilk boş yer seçilir. */
const OFFSETS = [4, 6, 8] as const;

const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** İki kutunun kesişim alanı. */
function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

/**
 * Kabloya ampermetre takar. `at`: kablonun üstünde dokunulan nokta (ızgaraya yuvarlanır; boşluk
 * parçanın uçlarına değmez). Kablo parçası 3 birimden kısaysa ya da eğikse hata.
 */
export function insertAmmeter(doc: CircuitDoc, wireId: string, at: Point): { doc: CircuitDoc; meter: InsertedMeter } | { error: InsertError } {
  const wire = doc.wires.find((w) => w.id === wireId);
  if (!wire) return { error: 'short' };
  // Dokunulan noktaya en yakın kablo parçası.
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i + 1 < wire.points.length; i++) {
    const a = wire.points[i]!;
    const b = wire.points[i + 1]!;
    const x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), at.x));
    const y = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), at.y));
    const d = Math.hypot(at.x - x, at.y - y);
    if (d < bestD) [best, bestD] = [i, d];
  }
  const A = wire.points[best]!;
  const B = wire.points[best + 1]!;
  if (A.x !== B.x && A.y !== B.y) return { error: 'diagonal' };
  const length = Math.abs(B.x - A.x) + Math.abs(B.y - A.y);
  if (length < 3) return { error: 'short' };
  const u: Point = { x: Math.sign(B.x - A.x), y: Math.sign(B.y - A.y) };
  // Boşluk P1–P2 (1 birim), parçanın uçlarından en az 1 birim içeride.
  const along = Math.max(1, Math.min(length - 2, Math.round((at.x - A.x) * u.x + (at.y - A.y) * u.y)));
  const P = add(A, u, along);
  const P1 = P;
  const P2 = add(P, u, 1);
  // Boşluğun içine (uçları hariç) başka bir kablonun ucu ya da bir parçanın ucu düşmesin.
  const onGap = (q: Point) => (q.x - P1.x) * u.x + (q.y - P1.y) * u.y > 0 && (q.x - P2.x) * u.x + (q.y - P2.y) * u.y < 0 && (u.x === 0 ? q.x === P.x : q.y === P.y);
  const ends = doc.wires.filter((w) => w.id !== wireId).flatMap((w) => [w.points[0]!, w.points[w.points.length - 1]!]);
  if (ends.some(onGap) || doc.parts.some((p) => pinPositions(p).some(onGap))) return { error: 'junction' };

  // Ampermetre kablonun yanında: iki yan ve üç uzaklık denenir; boş yer yoksa en az çakışanı.
  const rotation: Rotation = u.y === 0 ? 0 : 90;
  const normals: Point[] = u.y === 0 ? [{ x: 0, y: -1 }, { x: 0, y: 1 }] : [{ x: 1, y: 0 }, { x: -1, y: 0 }];
  const place = (n: Point, off: number): Part => ({ id: '', type: 'ammeter', label: '', x: P.x + n.x * off, y: P.y + n.y * off, rotation, props: {} });
  const covered = (n: Point, off: number) => doc.parts.reduce((sum, p) => sum + overlap(partBounds(place(n, off)), partBounds(p)), 0);
  const options = OFFSETS.flatMap((off) => normals.map((n) => ({ n, off, area: covered(n, off) })));
  const { n, off: offset } = options.find((o) => o.area === 0) ?? options.reduce((a, b) => (b.area < a.area ? b : a));
  const center = add(P, n, offset);

  const before = wire.points;
  let next = replaceWirePoints(doc, wireId, [...before.slice(0, best + 1), P1]);
  const added = addPart(next, 'ammeter', center, rotation);
  next = added.doc;
  const part = next.parts.find((p) => p.id === added.id)!;
  const [pa, pb] = pinPositions(part) as [Point, Point];
  // A tarafına yakın uç A tarafındaki yarıya.
  const nearA = Math.hypot(pa.x - P1.x, pa.y - P1.y) <= Math.hypot(pb.x - P1.x, pb.y - P1.y);
  const [pinA, pinB] = nearA ? [pa, pb] : [pb, pa];
  const linkA = addWire(next, [P1, add(P1, n, offset), pinA]);
  next = linkA.doc;
  const linkB = addWire(next, [pinB, add(P2, n, offset), P2]);
  next = linkB.doc;
  const half = addWire(next, [P2, ...before.slice(best + 1)]);
  next = half.doc;
  if (!linkA.id || !linkB.id || !half.id) return { error: 'short' };
  return { doc: next, meter: { part: added.id, wire: wireId, half: half.id, links: [linkA.id, linkB.id], points: before } };
}

/** Ampermetreyi ve bağlantı kablolarını kaldırır, kabloyu özgün noktalarına döndürür. */
export function removeAmmeter(doc: CircuitDoc, meter: InsertedMeter): CircuitDoc {
  const without = removeItems(doc, [meter.part], [meter.half, ...meter.links]);
  return without.wires.some((w) => w.id === meter.wire) ? replaceWirePoints(without, meter.wire, meter.points) : { ...without, wires: [...without.wires, { id: meter.wire, points: meter.points }] };
}

/** Takılı ampermetreler bölünen kabloların son ucunu ikinci yarıya taşıdı: kablo ucundaki arıza da taşınır. */
export function remapFaults(faults: readonly Fault[], meters: readonly InsertedMeter[]): Fault[] {
  return faults.map((f) => {
    if (f.kind !== 'open' || !('wire' in f.at) || f.at.end !== 1) return f;
    let wire = f.at.wire;
    for (const m of meters) if (m.wire === wire) wire = m.half;
    return wire === f.at.wire ? f : { kind: 'open', at: { wire, end: 1 } };
  });
}

/** Belgede ampermetresi silinmiş takılı ampermetreler (kabloları geri getirilecek). */
export function removedMeters(before: CircuitDoc, after: CircuitDoc, meters: readonly InsertedMeter[]): InsertedMeter[] {
  const now = new Set(after.parts.map((p) => p.id));
  return meters.filter((m) => before.parts.some((p) => p.id === m.part) && !now.has(m.part));
}
