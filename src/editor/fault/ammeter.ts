// Arıza bulmada "Buraya ampermetre tak" (B2): ampermetre dokunulan yerde kablo parçasının üstüne,
// kablonun yönünde oturur (uçları 8 birim aralıklı; kablo iki yarıya bölünür, yarılar ampermetrenin
// uçlarında biter). Gövdesi, göstergesi ya da adı başka bir kablonun, parçanın ya da yazının üstüne
// biniyorsa çakışmayan en yakın yer seçilir: kablo boyunca kaydırılır ya da kablonun yanına konur.
// Yanda iki biçim var: U (kablo 8 birim açılır, ampermetre yanında, uçlarına iki dik kablo) ve kısa
// kablo parçaları için saç tokası (kablo 1 birim açılır, ampermetre kabloya dik, iki kablo dolanır).
// Yandaki yerler fazladan kablo çizdiği için biraz uzak sayılır. Bağlantı kabloları başka bir kablonun
// üstünden, bir parçanın, yazının ya da ucun içinden geçemez; başka bir kabloyu kesebilir (az kesen
// yeğlenir). Çakışmayan yer yoksa ampermetre takılmaz ("yer yok"): üst üste binen ampermetre okunmaz.
// Açılan boşluğun içine başka bir kablonun ucu ya da bir parçanın ucu düşemez (bağlantı koparır).
// Kayıt ve kaldırma: model/meters.ts.

import type { Box } from '../../model/catalog';
import { addPart, addWire, nextLabel, replaceWirePoints } from '../../model/docOps';
import { partBounds, pinPositions, samePoint } from '../../model/geometry';
import type { InsertedMeter } from '../../model/meters';
import type { CircuitDoc, Part, Point, Rotation } from '../../model/types';
import { meterDisplayRect, meterFlipped, partTextBoxes } from '../PartView';

export type InsertError = 'short' | 'junction' | 'diagonal' | 'crowded';

/** Ampermetrenin uçları arası (ızgara birimi; katalogdaki iki uç ±4). */
const SPAN = 8;
/** U biçiminde ampermetrenin kablodan uzaklığı; saç tokasında yakın ucunun uzaklığı (ızgara birimi). */
const U_OFFSETS = [3, 4, 6, 8, 10, 12] as const;
const PIN_OFFSETS = [2, 4, 6, 8, 10] as const;
/** Saç tokasında ampermetrenin ekseni, yakın bağlantı kablosundan bu kadar ötede (gövde yarı genişliği 1,7). */
const PIN_SIDES = [3, 5, 7] as const;
/** Bağlantı kablosunun başka bir kabloyu kesmesi: çakışma değil, ama az kesen yer yeğlenir. */
const CROSS_COST = 0.5;
/** Yandaki yerlerin fazladan uzaklığı: kablonun üstü, biraz uzakta da olsa yeğlenir. */
const U_COST = 2;
const PIN_COST = 4;
/** Çakışma payı (ızgara birimi): ampermetre parçalara ve yazılara bu kadar, kablolara daha çok yaklaşmaz. */
const BOX_PAD = 0.25;
const WIRE_PAD = 0.6;

type Segment = readonly [Point, Point];

const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const pathSegments = (points: readonly Point[]): Segment[] => points.slice(1).map((p, i) => [points[i]!, p] as const);

/** İki kutunun kesişim alanı. */
function overlap(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

/** Dik kablo parçasının kutunun içinde kalan uzunluğu (kenara değmek sayılmaz). */
function inside(s: Segment, b: Box): number {
  const [a, c] = s;
  if (a.x === c.x) {
    if (a.x <= b.x || a.x >= b.x + b.w) return 0;
    return Math.max(0, Math.min(Math.max(a.y, c.y), b.y + b.h) - Math.max(Math.min(a.y, c.y), b.y));
  }
  if (a.y <= b.y || a.y >= b.y + b.h) return 0;
  return Math.max(0, Math.min(Math.max(a.x, c.x), b.x + b.w) - Math.max(Math.min(a.x, c.x), b.x));
}

/** İki dik kablo parçası: üst üste binen uzunluk (overlap) ya da birbirinin içinden geçiyorsa kesişme (cross). */
function clash(s: Segment, o: Segment): { overlap: number; cross: number } {
  const [a, b] = s;
  const [c, d] = o;
  const sv = a.x === b.x;
  const ov = c.x === d.x;
  if (sv === ov) {
    // Aynı doğrultu: aynı doğrunun üstündeyse ortak uzunluk.
    if (sv ? a.x !== c.x : a.y !== c.y) return { overlap: 0, cross: 0 };
    const [s0, s1] = sv ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [o0, o1] = sv ? [Math.min(c.y, d.y), Math.max(c.y, d.y)] : [Math.min(c.x, d.x), Math.max(c.x, d.x)];
    return { overlap: Math.max(0, Math.min(s1, o1) - Math.max(s0, o0)), cross: 0 };
  }
  // Dik: kesişme noktası ikisinin de içindeyse (uçta değmek bağlantı ya da köşe sayılmaz).
  const [v, h] = sv ? [s, o] : [o, s];
  const x = v[0].x;
  const y = h[0].y;
  const within = (p: number, q: number, r: number) => p > Math.min(q, r) && p < Math.max(q, r);
  return { overlap: 0, cross: within(x, h[0].x, h[1].x) && within(y, v[0].y, v[1].y) ? 1 : 0 };
}

/** Nokta kablo parçasının içinde mi (uçları hariç). */
function onInterior(p: Point, s: Segment): boolean {
  const [a, b] = s;
  if (a.x === b.x) return p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
  return p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
}

/** Bir yer: ampermetrenin merkezi ve dönüşü, kablodaki boşluk (t: A'dan uzaklık), bağlantı kabloları. */
interface Spot {
  readonly center: Point;
  readonly rotation: Rotation;
  readonly gap: readonly [number, number];
  readonly links: readonly (readonly Point[])[];
  readonly score: number;
}

/**
 * Kabloya ampermetre takar. `at`: kablonun üstünde dokunulan nokta. Kablo parçası 3 birimden kısaysa
 * ya da eğikse, boşluk için uygun yer yoksa hata.
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
  const tap = Math.max(0, Math.min(length, (at.x - A.x) * u.x + (at.y - A.y) * u.y));
  const along: Rotation = u.y === 0 ? 0 : 90;
  const across: Rotation = u.y === 0 ? 90 : 0;
  const normals: Point[] = u.y === 0 ? [{ x: 0, y: -1 }, { x: 0, y: 1 }] : [{ x: 1, y: 0 }, { x: -1, y: 0 }];
  const P = (t: number) => add(A, u, t);
  // Boşluk köşede başlayıp bitebilir; kablonun ucunda (parçaya ya da başka kabloya bağlı) en az 1 birim içeride.
  const first = best > 0 ? 0 : 1;
  const last = best + 2 < wire.points.length ? length : length - 1;

  // Boşluğun içine (uçları hariç) başka bir kablonun ucu ya da bir parçanın ucu düşmesin.
  const ends = [...doc.wires.filter((w) => w.id !== wireId).flatMap((w) => [w.points[0]!, w.points[w.points.length - 1]!]), ...doc.parts.flatMap((p) => pinPositions(p))];
  const gapFree = (from: number, to: number) =>
    !ends.some((q) => {
      const t = (q.x - A.x) * u.x + (q.y - A.y) * u.y;
      return t > from && t < to && (u.x === 0 ? q.x === A.x : q.y === A.y);
    });

  const spots: Spot[] = [];
  for (let s = first; s + SPAN <= last; s++) {
    if (!gapFree(s, s + SPAN)) continue;
    const center = P(s + SPAN / 2);
    // Kablonun üstünde: uçları boşluğun iki ucunda.
    spots.push({ center, rotation: along, gap: [s, s + SPAN], links: [], score: Math.abs(s + SPAN / 2 - tap) });
    // U: kablonun yanında, boşluğun iki ucundan dik birer kablo.
    for (const off of U_OFFSETS) {
      for (const n of normals) {
        spots.push({
          center: add(center, n, off),
          rotation: along,
          gap: [s, s + SPAN],
          links: [
            [P(s), add(P(s), n, off)],
            [add(P(s + SPAN), n, off), P(s + SPAN)],
          ],
          score: Math.hypot(s + SPAN / 2 - tap, off) + U_COST,
        });
      }
    }
  }
  // Saç tokası: 1 birimlik boşluk; ampermetre kabloya dik, boşluğun bir yanında. Yakın kablo yakın uca,
  // uzak kablo boşluğun öbür ucundan uzak uca dolanır.
  for (let s = first; s + 1 <= last; s++) {
    if (!gapFree(s, s + 1)) continue;
    for (const k of PIN_OFFSETS) {
      for (const n of normals) {
        for (const [side, lateral] of PIN_SIDES.flatMap((d) => [[1, d] as const, [-1, d] as const])) {
          // side 1: ampermetre B tarafında (yakın kablo P2'den), -1: A tarafında (yakın kablo P1'den).
          const [near, far] = side === 1 ? [s + 1, s] : [s, s + 1];
          const axis = near + side * lateral;
          const nearPin = add(P(axis), n, k);
          const farPin = add(nearPin, n, SPAN);
          const nearLink = [P(near), add(P(near), n, k), nearPin];
          const farLink = [P(far), add(P(far), n, k + SPAN), farPin];
          spots.push({
            center: add(nearPin, n, SPAN / 2),
            rotation: across,
            gap: [s, s + 1],
            links: side === 1 ? [farLink, nearLink] : [nearLink, farLink],
            score: Math.hypot(axis - tap, k + SPAN / 2) + PIN_COST,
          });
        }
      }
    }
  }
  if (spots.length === 0) return { error: length < SPAN + 2 ? 'short' : 'junction' };

  // Engeller: parçalar, ölçü aletlerinin ekranları, yazılar ve kablolar (bölünen parçanın boşluk dışı kısmı yerine göre).
  const bounds = doc.parts.map((p) => partBounds(p));
  const boxes: Box[] = [];
  doc.parts.forEach((p, i) => {
    const meter = p.type === 'voltmeter' || p.type === 'ammeter';
    const flip = meter && meterFlipped(p, bounds.filter((_, j) => j !== i));
    boxes.push(bounds[i]!, ...(meter ? [meterDisplayRect(p, flip)] : []), ...partTextBoxes(p, flip));
  });
  const others: Segment[] = doc.wires.flatMap((w) => pathSegments(w.points).filter((_, i) => w.id !== wireId || i !== best));
  const label = nextLabel(doc, 'ammeter');
  /** Çakışma (kesin) ve kesişme sayısı. */
  const cost = (spot: Spot): { hard: number; crossings: number } => {
    const part: Part = { id: '', type: 'ammeter', label, x: spot.center.x, y: spot.center.y, rotation: spot.rotation, props: {} };
    const flip = meterFlipped(part, bounds);
    const shown = [meterDisplayRect(part, flip), ...partTextBoxes(part, flip)];
    const own = [partBounds(part), ...shown];
    // Bölünen parçanın boşluk dışı kısımları: ampermetre kablonun üstündeyse uçlarında biter (engel değil).
    const pieces: Segment[] = spot.links.length === 0 ? [] : [...(spot.gap[0] > 0 ? [[A, P(spot.gap[0])] as const] : []), ...(spot.gap[1] < length ? [[P(spot.gap[1]), B] as const] : [])];
    const segments: Segment[] = [...others, ...pieces];
    const links = spot.links.flatMap(pathSegments);
    let hard = 0;
    let crossings = 0;
    for (const b of own) {
      for (const o of boxes) hard += overlap(grow(b, BOX_PAD), o);
      for (const s of segments) hard += inside(s, grow(b, WIRE_PAD));
    }
    for (const l of links) {
      for (const o of [...boxes, ...shown]) hard += inside(l, grow(o, BOX_PAD));
      // Başka bir kablonun ucu ya da bir parçanın ucu bağlantı kablosunun içine düşerse bağlanırdı.
      for (const q of ends) if (onInterior(q, l)) hard += 1;
      for (const s of segments) {
        const c = clash(l, s);
        hard += c.overlap;
        crossings += c.cross;
      }
    }
    return { hard, crossings };
  };
  // Kenara değmek çakışma değil (kayan noktadan kalan çok küçük alan sayılmaz).
  const free = spots.map((spot) => ({ spot, ...cost(spot) })).filter((o) => o.hard < 1e-6);
  if (free.length === 0) return { error: 'crowded' };
  const { spot } = free.reduce((a, b) => (b.spot.score + b.crossings * CROSS_COST < a.spot.score + a.crossings * CROSS_COST ? b : a));

  const before = wire.points;
  const P1 = P(spot.gap[0]);
  const P2 = P(spot.gap[1]);
  let next = replaceWirePoints(doc, wireId, [...before.slice(0, best + 1), P1]);
  const added = addPart(next, 'ammeter', spot.center, spot.rotation);
  next = added.doc;
  const links: string[] = [];
  for (const points of spot.links) {
    const link = addWire(next, points);
    if (!link.id) return { error: 'short' };
    next = link.doc;
    links.push(link.id);
  }
  const half = addWire(next, [P2, ...before.slice(best + 1)]);
  if (!half.id) return { error: 'short' };
  next = half.doc;
  // Kablonun üstündeyse uçlar boşluğun uçlarında; yandaysa bağlantı kabloları uçlara varır.
  const pins = pinPositions(next.parts.find((p) => p.id === added.id)!);
  const reached = spot.links.length === 0 ? [P1, P2] : spot.links.flatMap((l) => [l[0]!, l[l.length - 1]!]);
  if (!pins.every((p) => reached.some((q) => samePoint(p, q)))) return { error: 'junction' };
  const made = [wireId, half.id, ...links].map((id) => next.wires.find((w) => w.id === id)!);
  return { doc: next, meter: { part: added.id, x: spot.center.x, y: spot.center.y, rotation: spot.rotation, wire: wireId, half: half.id, links, made, points: before } };
}
