// Kablo ve tel yolları (three'nin yalnızca matematik sınıfları, DOM yok). "3B: kablolar üst üste binmez, yumuşak
// bükülür" (2026-11-14): yol, dayanak noktalarından (köşeli çizgi) kurulur; her köşe iki komşu doğruya teğet bir
// çember yayıyla yuvarlatılır (fillet). Yayın yarıçapı istenen yarıçaptır; komşu doğrular kısaysa yay onlara sığacak
// kadar küçülür ve ulaşılan en küçük yarıçap bildirilir (testler bunu sınırla karşılaştırır). Boru geometrisi yolun
// kendi noktalarından kurulur: düz kısımda iki halka, yayda her ≈ 12°'de bir halka (üçgen sayısı düşük kalır).

import { BufferGeometry, Curve, Float32BufferAttribute, Vector3 } from 'three';

export interface RoundedPath {
  /** Yolun noktaları: düz kısımların uçları ve yayların ara noktaları. */
  readonly points: Vector3[];
  /** Yuvarlatılan köşelerdeki en küçük yarıçap (köşe yoksa sonsuz). */
  readonly minRadius: number;
  readonly length: number;
}

/** Yaydaki ardışık noktalar arasındaki en büyük açı (radyan): "bükülmede yeterli segment". */
const ARC_STEP = (12 * Math.PI) / 180;

/**
 * Köşeli çizgiyi yuvarlatır. `radius`: her iç köşe için istenen yarıçap (sayı ya da köşe sırasına göre işlev; 0 ya
 * da eksi: köşe keskin kalır). Köşenin teğet boyu t = r · tan(φ / 2) (φ: sapma açısı); bir doğrunun iki ucundaki
 * teğet boylarının toplamı doğrunun boyunu geçerse ikisi de aynı oranda kısalır.
 */
export function roundPath(way: readonly Vector3[], radius: number | ((corner: number) => number)): RoundedPath {
  const pts = way.filter((p, i) => i === 0 || p.distanceTo(way[i - 1]!) > 1e-6);
  const n = pts.length;
  if (n < 3) return { points: pts.map((p) => p.clone()), minRadius: Number.POSITIVE_INFINITY, length: n === 2 ? pts[0]!.distanceTo(pts[1]!) : 0 };
  const dirs: Vector3[] = [];
  const lens: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = pts[i]!.clone().sub(pts[i - 1]!);
    lens.push(d.length());
    dirs.push(d.normalize());
  }
  // Köşe i (1 … n − 2): önceki doğru dirs[i − 1], sonraki dirs[i].
  const angle: number[] = new Array<number>(n).fill(0);
  const tangent: number[] = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const phi = dirs[i - 1]!.angleTo(dirs[i]!);
    angle[i] = phi;
    const r = typeof radius === 'number' ? radius : radius(i);
    // Tam geri dönüş (φ ≈ 180°) yuvarlatılamaz: keskin kalır (yollar böyle köşe üretmez).
    tangent[i] = phi < 1e-4 || phi > Math.PI - 1e-3 || r <= 0 ? 0 : r * Math.tan(phi / 2);
  }
  // Doğrulara sığdır: birkaç tur yeter (bir köşenin kısalması komşusuna yer açar, açmaz).
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (let s = 0; s < n - 1; s++) {
      const sum = tangent[s]! + tangent[s + 1]!;
      if (sum > lens[s]! + 1e-9) {
        const k = lens[s]! / sum;
        tangent[s] = tangent[s]! * k;
        tangent[s + 1] = tangent[s + 1]! * k;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const out: Vector3[] = [pts[0]!.clone()];
  let minRadius = Number.POSITIVE_INFINITY;
  let length = 0;
  const push = (p: Vector3) => {
    const last = out[out.length - 1]!;
    const d = p.distanceTo(last);
    if (d > 1e-6) {
      length += d;
      out.push(p);
    }
  };
  for (let i = 1; i < n - 1; i++) {
    const t = tangent[i]!;
    const phi = angle[i]!;
    const corner = pts[i]!;
    if (t < 1e-6) {
      // Keskin köşe: sapma varsa yarıçap sıfırdır.
      if (phi > 1e-3) minRadius = 0;
      push(corner.clone());
      continue;
    }
    const u = dirs[i - 1]!;
    const v = dirs[i]!;
    const r = t / Math.tan(phi / 2);
    minRadius = Math.min(minRadius, r);
    const start = corner.clone().addScaledVector(u, -t);
    // Merkez: köşeden açıortay boyunca r / cos(φ / 2).
    const bis = v.clone().sub(u).normalize();
    const center = corner.clone().addScaledVector(bis, r / Math.cos(phi / 2));
    const e1 = start.clone().sub(center).divideScalar(r);
    const steps = Math.max(2, Math.ceil(phi / ARC_STEP));
    push(start);
    for (let k = 1; k <= steps; k++) {
      const a = (phi * k) / steps;
      push(center.clone().addScaledVector(e1, r * Math.cos(a)).addScaledVector(u, r * Math.sin(a)));
    }
  }
  push(pts[n - 1]!.clone());
  return { points: out, minRadius, length };
}

/** Noktalardan geçen kırık çizgi, eğri olarak (boy parametreli): akım noktaları ve eski denetimler için. */
export class PolyCurve extends Curve<Vector3> {
  private readonly at: number[];
  private readonly total: number;

  constructor(readonly points: readonly Vector3[]) {
    super();
    this.at = [0];
    for (let i = 1; i < points.length; i++) this.at.push(this.at[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
    this.total = this.at[this.at.length - 1] ?? 0;
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    const pts = this.points;
    if (pts.length === 0) return target.set(0, 0, 0);
    if (pts.length === 1 || this.total <= 0) return target.copy(pts[0]!);
    const s = Math.max(0, Math.min(1, t)) * this.total;
    let lo = 0;
    let hi = this.at.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.at[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const span = this.at[hi]! - this.at[lo]!;
    return target.copy(pts[lo]!).lerp(pts[hi]!, span > 0 ? (s - this.at[lo]!) / span : 0);
  }

  /** Kırık çizgide boy parametresi doğrusal: getPointAt = getPoint. */
  override getPointAt(u: number, target = new Vector3()): Vector3 {
    return this.getPoint(u, target);
  }

  override getLength(): number {
    return this.total;
  }
}

/**
 * Noktalardan geçen boru (yarıçap `r`, çevrede `sides` kenar). Halkalar noktalarda; çerçeve bir halkadan ötekine en
 * küçük dönmeyle taşınır (burulma yok). Uçlar açık (fişin ya da deliğin içinde).
 */
export function tubeGeometry(points: readonly Vector3[], r: number, sides = 8): BufferGeometry {
  const geometry = new BufferGeometry();
  const n = points.length;
  if (n < 2) return geometry;
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const tangentAt = (i: number) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    return b.clone().sub(a).normalize();
  };
  let t = tangentAt(0);
  // İlk normal: teğete dik herhangi bir yön.
  const seed = Math.abs(t.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let nrm = seed.clone().addScaledVector(t, -seed.dot(t)).normalize();
  const axis = new Vector3();
  for (let i = 0; i < n; i++) {
    const next = tangentAt(i);
    if (i > 0) {
      axis.crossVectors(t, next);
      const sin = axis.length();
      if (sin > 1e-8) nrm.applyAxisAngle(axis.divideScalar(sin), Math.atan2(sin, t.dot(next)));
      nrm.addScaledVector(next, -nrm.dot(next)).normalize();
    }
    t = next;
    const bin = new Vector3().crossVectors(t, nrm);
    const p = points[i]!;
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides;
      const cx = Math.cos(a);
      const sx = Math.sin(a);
      const nx = nrm.x * cx + bin.x * sx;
      const ny = nrm.y * cx + bin.y * sx;
      const nz = nrm.z * cx + bin.z * sx;
      position.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
      normal.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      index.push(a, c, b, b, c, d);
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
}

/** İki doğru parçası arasındaki en kısa uzaklık. */
export function segmentDistance(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3): number {
  const d1x = q1.x - p1.x;
  const d1y = q1.y - p1.y;
  const d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x;
  const d2y = q2.y - p2.y;
  const d2z = q2.z - p2.z;
  const rx = p1.x - p2.x;
  const ry = p1.y - p2.y;
  const rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(rx, ry, rz);
  if (a <= 1e-12) t = Math.max(0, Math.min(1, f / e));
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      if (den > 1e-12) s = Math.max(0, Math.min(1, (b * f - c * e) / den));
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t);
}

/** Yolun, uçlarından `skip` boy içerideki kısmı (uçlar: fiş, direk, delik; orada kablolar yan yana durur). */
export function trimPath(points: readonly Vector3[], skipStart: number, skipEnd = skipStart): Vector3[] {
  const total = points.reduce((sum, p, i) => (i === 0 ? 0 : sum + p.distanceTo(points[i - 1]!)), 0);
  if (total <= skipStart + skipEnd + 1e-6) return [];
  const out: Vector3[] = [];
  let at = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = a.distanceTo(b);
    const from = Math.max(skipStart, at);
    const to = Math.min(total - skipEnd, at + len);
    if (to > from + 1e-9 && len > 0) {
      const pa = a.clone().lerp(b, (from - at) / len);
      if (out.length === 0 || out[out.length - 1]!.distanceTo(pa) > 1e-9) out.push(pa);
      out.push(a.clone().lerp(b, (to - at) / len));
    }
    at += len;
  }
  return out;
}

/** İki yolun (kırık çizgi) merkez çizgileri arasındaki en kısa uzaklık; `stop` altına inince aramayı keser. */
export function pathDistance(a: readonly Vector3[], b: readonly Vector3[], stop = 0): number {
  let best = Number.POSITIVE_INFINITY;
  if (a.length < 2 || b.length < 2) return best;
  // Kaba eleme: kutular birbirinden `best` kadar uzaksa bakılmaz.
  const box = (pts: readonly Vector3[]) => {
    const lo = pts[0]!.clone();
    const hi = pts[0]!.clone();
    for (const p of pts) {
      lo.min(p);
      hi.max(p);
    }
    return { lo, hi };
  };
  const ba = box(a);
  const bb = box(b);
  const gap = Math.max(ba.lo.x - bb.hi.x, bb.lo.x - ba.hi.x, ba.lo.y - bb.hi.y, bb.lo.y - ba.hi.y, ba.lo.z - bb.hi.z, bb.lo.z - ba.hi.z);
  if (gap > Math.max(stop, 0) + 4) return gap;
  for (let i = 1; i < a.length; i++) {
    const p1 = a[i - 1]!;
    const q1 = a[i]!;
    for (let k = 1; k < b.length; k++) {
      const p2 = b[k - 1]!;
      const q2 = b[k]!;
      // Parçaların kutuları `best` kadar uzaksa atla.
      if (Math.min(p1.x, q1.x) - Math.max(p2.x, q2.x) > best || Math.min(p2.x, q2.x) - Math.max(p1.x, q1.x) > best) continue;
      if (Math.min(p1.z, q1.z) - Math.max(p2.z, q2.z) > best || Math.min(p2.z, q2.z) - Math.max(p1.z, q1.z) > best) continue;
      if (Math.min(p1.y, q1.y) - Math.max(p2.y, q2.y) > best || Math.min(p2.y, q2.y) - Math.max(p1.y, q1.y) > best) continue;
      const d = segmentDistance(p1, q1, p2, q2);
      if (d < best) {
        best = d;
        if (best < stop) return best;
      }
    }
  }
  return best;
}
