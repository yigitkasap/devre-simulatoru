// Masadaki parçadan breadboard'a giden kablonun eski yolu: uçtan dik kalkan, alçak bir kübik Bézier; gövdeye çarpan
// uçta kavis yükselir. Sahne artık cableRoutes.ts'in yollarını çizer (2026-11-14: şeritler, yuvarlak köşeler);
// buradaki `collisions`, kabloların masadaki parçaların gövdesinden geçmediğini denetlemek için kullanılır
// (scene.cableHits), `leadCurve` eski davranışın testinde.

import { Box3, CubicBezierCurve3, Vector3, type Curve } from 'three';

export interface Obstacle {
  /** Gövdenin dünya kutusu. */
  readonly box: Box3;
  /** Kablonun çıktığı parça: ucun hemen çevresi (kablonun kalktığı yer) sayılmaz. */
  readonly own: boolean;
}

/** Kablonun yarıçapı ve gövdeyle arasında kalacak pay. */
const CLEARANCE = 0.28 + 0.2;
/**
 * Kendi parçasında ucun bu yatay uzaklığı içindeki örnekler sayılmaz (kablo orada uçtan kalkar); ötesinde kablo
 * gövdenin kutusuna girmemelidir, ama yanından sıyırarak geçebilir (pay yok): kablo parçanın yanındaki şeritte
 * arkaya yatar (cableRoutes.ts, 2026-11-14). Başka parçaların gövdesiyle arasında CLEARANCE kalır.
 */
const OWN_RADIUS = 1.6;
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
  const boxes = obstacles.map((o) => ({ box: o.own ? o.box : o.box.clone().expandByScalar(CLEARANCE), own: o.own }));
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
