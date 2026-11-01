// Arıza bulmada "Buraya ampermetre tak" (B2): ampermetre dokunulan yerde kablo parçasının üstüne,
// kablonun yönünde oturur (uçları 8 birim aralıklı; kablo iki yarıya bölünür, yarılar ampermetrenin
// uçlarında biter). Gövdesi, göstergesi ya da adı başka bir kablonun, parçanın ya da yazının üstüne
// biniyorsa yakındaki bir yer seçilir: kablo boyunca kaydırılır ya da kablonun en çok 3 birim yanına
// konur. Yanda iki biçim var: U (kablo 8 birim açılır, ampermetre 3 birim yanında, uçlarına iki dik
// kablo) ve kısa kablo parçaları için saç tokası (kablo 1 birim açılır, ampermetre kabloya dik, yakın
// ucu kablodan en çok 3 birim ötede, iki kablo dolanır). Yandaki yerler fazladan kablo çizdiği için
// biraz uzak sayılır. Bağlantı kabloları başka bir kabloyu dik açıyla, noktasız kesebilir; bir
// parçanın, bağlantı noktasının (kablo ya da parça ucu, kablo köşesi), ölçü aleti göstergesinin ya da
// yazının üstüne binemez. Göstergesi bir yanda sığmazsa öbür (boş) yanına açılır. Böyle bir yer yoksa
// ampermetre takılmaz ("yer yok").
// Ampermetre dokunulan kolda kalır: boşluk, dokunulan noktanın iki yanındaki ilk bağlantıyı (bu kablo
// parçasına değen başka bir kablo ya da parça ucu) aşmaz; aşsaydı başka bir kolun akımını ölçerdi.
// Kayıt ve kaldırma: model/meters.ts.

import type { Box } from '../../model/catalog';
import { addPart, addWire, nextLabel, replaceWirePoints } from '../../model/docOps';
import { partBounds, pinPositions, samePoint } from '../../model/geometry';
import type { InsertedMeter } from '../../model/meters';
import type { CircuitDoc, Part, Point, Rotation } from '../../model/types';
import { METER_DISPLAY, meterDisplayRect, meterFlipped, partTextBoxes } from '../PartView';

export type InsertError = 'short' | 'junction' | 'diagonal' | 'crowded';

/** Ampermetrenin uçları arası (ızgara birimi; katalogdaki iki uç ±4). */
const SPAN = 8;
/** Yana konan ampermetre kablodan en çok 3 birim ötede: U biçiminde ekseni, saç tokasında yakın ucu. */
const U_OFFSETS = [3] as const;
const PIN_OFFSETS = [2, 3] as const;
/** Saç tokasında ampermetrenin ekseni, yakın bağlantı kablosundan bu kadar ötede (gövde yarı genişliği 1,7). */
const PIN_SIDES = [3, 5] as const;
/** Yandaki yerlerin fazladan uzaklığı: kablonun üstü, biraz uzakta da olsa yeğlenir. */
const U_COST = 2;
const PIN_COST = 4;
/**
 * Çakışma payları (ızgara birimi): ampermetre parçalara ve yazılara BOX_PAD, gövdesi kablolara WIRE_PAD,
 * göstergesi ve adı kablolara TEXT_PAD kadar yaklaşmaz.
 */
const BOX_PAD = 0.25;
const WIRE_PAD = 0.6;
const TEXT_PAD = 0.3;
/** Parça kutusunun uç taşıyan kenarındaki bacak payı: bacak ince bir çizgi, gösterge ve yazı yanına girebilir. */
const LEAD = 1;

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

/** İki dik kablo parçası aynı doğrunun üstündeyse ortak uzunlukları (dik kesişme serbest). */
function collinear(s: Segment, o: Segment): number {
  const [a, b] = s;
  const [c, d] = o;
  const sv = a.x === b.x;
  if (sv !== (c.x === d.x) || (sv ? a.x !== c.x : a.y !== c.y)) return 0;
  const [s0, s1] = sv ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [o0, o1] = sv ? [Math.min(c.y, d.y), Math.max(c.y, d.y)] : [Math.min(c.x, d.x), Math.max(c.x, d.x)];
  return Math.max(0, Math.min(s1, o1) - Math.max(s0, o0));
}

/** Nokta kablo parçasının içinde mi (uçları hariç). */
function onInterior(p: Point, s: Segment): boolean {
  const [a, b] = s;
  if (a.x === b.x) return p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
  return p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
}

/** Nokta kablo parçasının üstünde mi (uçları dahil). */
const onSegment = (p: Point, s: Segment) => samePoint(p, s[0]) || samePoint(p, s[1]) || onInterior(p, s);

/** Parçanın gövde kutusu (uç taşıyan kenarlardan bacak payı kadar içeride) ve bacak çizgileri. */
function partCore(part: Part): { box: Box; leads: Segment[] } {
  const b = partBounds(part);
  let [x0, y0, x1, y1] = [b.x, b.y, b.x + b.w, b.y + b.h];
  const leads: Segment[] = [];
  for (const p of pinPositions(part)) {
    const edge = p.x === b.x ? { x: 1, y: 0 } : p.x === b.x + b.w ? { x: -1, y: 0 } : p.y === b.y ? { x: 0, y: 1 } : p.y === b.y + b.h ? { x: 0, y: -1 } : null;
    if (!edge) continue;
    leads.push([p, add(p, edge, LEAD)]);
    if (edge.x === 1) x0 = Math.max(x0, b.x + LEAD);
    if (edge.x === -1) x1 = Math.min(x1, b.x + b.w - LEAD);
    if (edge.y === 1) y0 = Math.max(y0, b.y + LEAD);
    if (edge.y === -1) y1 = Math.min(y1, b.y + b.h - LEAD);
  }
  return { box: { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }, leads };
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
 * Kabloya ampermetre takar. `at`: kablonun üstünde dokunulan nokta; `flips`: takılı ampermetrelerin
 * gösterge yanı (kayıtlardan). Kablo parçası 3 birimden kısaysa ya da eğikse, boşluk için uygun yer
 * yoksa hata.
 */
export function insertAmmeter(
  doc: CircuitDoc,
  wireId: string,
  at: Point,
  flips?: ReadonlyMap<string, boolean>,
): { doc: CircuitDoc; meter: InsertedMeter } | { error: InsertError } {
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
  // Bu parçaya değen başka kablo ve parça uçları (bağlantılar): boşluk dokunulan noktanın iki yanındakileri aşmaz.
  const ends = [...doc.wires.filter((w) => w.id !== wireId).flatMap((w) => [w.points[0]!, w.points[w.points.length - 1]!]), ...doc.parts.flatMap((p) => pinPositions(p))];
  const joints = ends
    .filter((q) => (u.x === 0 ? q.x === A.x : q.y === A.y))
    .map((q) => (q.x - A.x) * u.x + (q.y - A.y) * u.y)
    .filter((t) => t > 0 && t < length);
  const first = Math.max(best > 0 ? 0 : 1, ...joints.filter((t) => t <= tap));
  const last = Math.min(best + 2 < wire.points.length ? length : length - 1, ...joints.filter((t) => t >= tap));

  const spots: Spot[] = [];
  for (let s = first; s + SPAN <= last; s++) {
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

  // Engeller: parçalar (tam kutu ve bacaksız gövde), ölçü aletlerinin göstergeleri ve yazılar, kablolar
  // (bölünen parçanın boşluk dışı kısmı yerine göre) ve kablo köşeleri.
  const bounds = doc.parts.map((p) => partBounds(p));
  const cores = doc.parts.map(partCore);
  const leads = cores.flatMap((c) => c.leads);
  const labels: Box[] = [];
  doc.parts.forEach((p, i) => {
    const meter = METER_DISPLAY.has(p.type);
    const flip = meter && (flips?.get(p.id) ?? meterFlipped(p, bounds.filter((_, j) => j !== i)));
    labels.push(...(meter ? [meterDisplayRect(p, flip)] : []), ...partTextBoxes(p, flip));
  });
  const others: Segment[] = doc.wires.flatMap((w) => pathSegments(w.points).filter((_, i) => w.id !== wireId || i !== best));
  const corners: Point[] = doc.wires.flatMap((w) => w.points.slice(1, -1));
  const label = nextLabel(doc, 'ammeter');
  /** Gösterge bu yanda iken çakışma: üst üste binen alan ve uzunluk (0: yer uygun). */
  const cost = (spot: Spot, flip: boolean): number => {
    const part: Part = { id: '', type: 'ammeter', label, x: spot.center.x, y: spot.center.y, rotation: spot.rotation, props: {} };
    const body = partBounds(part);
    const shown = [meterDisplayRect(part, flip), ...partTextBoxes(part, flip)];
    const pins = pinPositions(part);
    // Bölünen parçanın boşluk dışı kısımları: ampermetre kablonun üstündeyse uçlarında biter (engel değil).
    const pieces: Segment[] = spot.links.length === 0 ? [] : [...(spot.gap[0] > 0 ? [[A, P(spot.gap[0])] as const] : []), ...(spot.gap[1] < length ? [[P(spot.gap[1]), B] as const] : [])];
    const segments: Segment[] = [...others, ...pieces];
    const links = spot.links.flatMap(pathSegments);
    let hard = 0;
    // Gövde: parçalara, yazılara ve kablolara binmez; ucunda biten kablo (bağlantı) yalnızca gövdenin içinden geçemez.
    for (const o of bounds) hard += overlap(grow(body, BOX_PAD), o);
    for (const o of labels) hard += overlap(grow(body, BOX_PAD), o);
    for (const s of segments) hard += pins.some((p) => samePoint(p, s[0]) || samePoint(p, s[1])) ? inside(s, body) : inside(s, grow(body, WIRE_PAD));
    // Uçlar başka bir kablonun içine düşmez (bağlanırdı).
    for (const p of pins) for (const s of segments) if (onInterior(p, s)) hard += 1;
    // Gösterge ve ad: parçaların gövdesine, bacaklarına, yazılara, kablolara ve bağlantı kablolarına binmez.
    for (const b of shown) {
      for (const c of cores) hard += overlap(grow(b, BOX_PAD), c.box);
      for (const o of labels) hard += overlap(grow(b, BOX_PAD), o);
      for (const s of [...segments, ...leads, ...links]) hard += inside(s, grow(b, TEXT_PAD));
    }
    // Bağlantı kabloları: kabloları yalnızca dik kesebilir; parça, gösterge, yazı ve bağlantı noktasının üstünden geçemez.
    for (const l of links) {
      for (const o of [...bounds, ...labels, ...shown]) hard += inside(l, grow(o, BOX_PAD));
      hard += inside(l, body);
      for (const s of segments) hard += collinear(l, s);
      for (const q of [...ends, ...corners]) if (onInterior(q, l)) hard += 1;
    }
    // Bağlantı kablolarının köşeleri başka bir kablonun üstüne düşmez (bağlantı gibi görünür).
    for (const path of spot.links) for (const q of path.slice(1, -1)) if (segments.some((s) => onSegment(q, s))) hard += 1;
    return hard;
  };
  // En yakından uzağa çakışmayan ilk yer; gösterge önce olağan yanında, sığmazsa öbür yanında (kenara
  // değmek çakışma değil; kayan noktadan kalan çok küçük alan sayılmaz).
  let chosen: { spot: Spot; flip: boolean } | null = null;
  for (const spot of [...spots].sort((a, b) => a.score - b.score)) {
    const flip = cost(spot, false) < 1e-6 ? false : cost(spot, true) < 1e-6 ? true : null;
    if (flip !== null) {
      chosen = { spot, flip };
      break;
    }
  }
  if (!chosen) return { error: 'crowded' };
  const { spot, flip } = chosen;

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
  return { doc: next, meter: { part: added.id, x: spot.center.x, y: spot.center.y, rotation: spot.rotation, flip, wire: wireId, half: half.id, links, made, points: before } };
}
