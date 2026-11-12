// Masadaki parçadan breadboard'a giden kablonun yolu: uçtan dik kalkan, alçak bir kübik Bézier. Yol
// masadaki parçaların gövdelerinin (kutularının) içinden geçerse kavis o uçta yükseltilir: pilin
// uzak ucundaki (+) uçtan çıkan kablo pilin üstünden aşar (önceden gövdenin içinden geçiyordu).

import { Box3, CubicBezierCurve3, CurvePath, LineCurve3, Vector3, type Curve } from 'three';

export interface Obstacle {
  /** Gövdenin dünya kutusu. */
  readonly box: Box3;
  /** Kablonun çıktığı parça: ucun hemen çevresi (kablonun kalktığı yer) sayılmaz. */
  readonly own: boolean;
}

/** Kablonun yarıçapı ve gövdeyle arasında kalacak pay. */
const CLEARANCE = 0.28 + 0.2;
/** Kendi parçasında ucun bu yatay uzaklığı içindeki örnekler sayılmaz (kablo orada uçtan kalkar). */
const OWN_RADIUS = 1.2;
const SAMPLES = 64;
const STEP = 0.8;
const MAX_LIFT = 24;

/** Önceki alçak kavis (v3): parçaların ve etiketlerin üstünü kapatmaz. */
export function baseLift(dist: number): number {
  return Math.min(6, 1.2 + 0.08 * dist);
}

function curveOf(a: Vector3, b: Vector3, liftA: number, liftB: number): CubicBezierCurve3 {
  return new CubicBezierCurve3(a, a.clone().add(new Vector3(0, liftA, 0)), b.clone().add(new Vector3(0, liftB, 0)), b);
}

/** Yolun gövdelere girdiği örneklerin parametreleri (t, 0–1). */
export function collisions(curve: Curve<Vector3>, obstacles: readonly Obstacle[]): number[] {
  const start = curve.getPoint(0);
  const hits: number[] = [];
  const boxes = obstacles.map((o) => ({ box: o.box.clone().expandByScalar(CLEARANCE), own: o.own }));
  const p = new Vector3();
  for (let i = 1; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    curve.getPoint(t, p);
    const near = Math.hypot(p.x - start.x, p.z - start.z) < OWN_RADIUS;
    if (boxes.some((o) => o.box.containsPoint(p) && !(o.own && near))) hits.push(t);
  }
  return hits;
}

/**
 * Ön paneldeki soketten çıkan kablo: soketten `dir` yönünde düz çıkar, öne doğru yatay teğetle masaya
 * sarkar, masada tahtaya doğru ilerler ve deliğin üstüne (`b`) yukarıdan iner. Parçalı (doğru + kübik
 * Bézier'ler): masadaki kısım masanın altına salınmaz. `board`: breadboard'ların kutusu. `end` verilirse
 * kablo `b`'ye o yönden girer (bağlantı direğindeki muz fişin arkası). `maxReach`: soketin önünde masaya inişin
 * en çok uzaklığı (direkler cihazlara tahtadan yakın).
 */
export function socketCurve(from: Vector3, dir: Vector3, b: Vector3, board: Box3, end?: Vector3, maxReach = 9): CurvePath<Vector3> {
  const flat = new Vector3(dir.x, 0, dir.z);
  if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
  flat.normalize();
  const table = 0.42;
  const out = from.clone().addScaledVector(dir, 1.2);
  // Soketin önünde masaya iniş: yüksek soketten çıkan kablo daha uzağa sarkar.
  const reach = Math.min(maxReach, 3 + 0.4 * Math.max(0, from.y - table));
  const down = out.clone().addScaledVector(flat, reach).setY(table);
  const path = new CurvePath<Vector3>();
  path.add(new LineCurve3(from.clone(), out));
  path.add(new CubicBezierCurve3(out, out.clone().addScaledVector(dir, reach * 0.45), down.clone().addScaledVector(flat, -reach * 0.4), down));
  // Masadan deliğe: önce masada ilerler, tahtanın kenarını aşacak kadar yükselip deliğe dik iner.
  const toHole = new Vector3(b.x - down.x, 0, b.z - down.z);
  const run = toHole.length();
  const heading = run > 1e-6 ? toHole.clone().divideScalar(run) : flat.clone();
  const rise = Math.max(4, b.y - table + 2.5);
  void board;
  const last = end ? b.clone().addScaledVector(end, Math.min(rise, 4.5)) : b.clone().add(new Vector3(0, rise, 0));
  path.add(new CubicBezierCurve3(down, down.clone().addScaledVector(heading, run * 0.5), last, b.clone()));
  return path;
}

/**
 * Kablonun eğrisi: `a` parçanın ucunun üstü, `b` deliğin üstü. Önce alçak kavis; gövdeye çarpan
 * yarıda (uç tarafı ya da delik tarafı) denetim noktası adım adım yükseltilir.
 */
export function leadCurve(a: Vector3, b: Vector3, obstacles: readonly Obstacle[]): CubicBezierCurve3 {
  let liftA = baseLift(a.distanceTo(b));
  let liftB = liftA;
  let curve = curveOf(a, b, liftA, liftB);
  for (let hits = collisions(curve, obstacles); hits.length > 0 && Math.max(liftA, liftB) < MAX_LIFT; hits = collisions(curve, obstacles)) {
    if (hits.some((t) => t < 0.5)) liftA += STEP;
    if (hits.some((t) => t >= 0.5)) liftB += STEP;
    curve = curveOf(a, b, liftA, liftB);
  }
  return curve;
}
