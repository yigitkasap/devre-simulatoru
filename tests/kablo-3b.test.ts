// 3B tezgâh: masadaki parçadan breadboard'a giden kablo gövdelerin içinden geçmez. Pilin uzak ucundaki
// (+) uçtan çıkan kablo eskiden pilin gövdesinden geçiyordu; şimdi üstünden aşar. Yakın uçtaki kablo
// eskisi gibi alçak kalır.

import { describe, expect, it } from 'vitest';
import { Box3, CubicBezierCurve3, Vector3 } from 'three';
import { baseLift, collisions, leadCurve } from '../src/bench3d/leadRoute';

// Pil (parts.ts → batteryModel): x boyunca 9,6 uzunluk, yarıçap 1,9, ekseni y = 2; uçlarından masadaki
// uçlara inen kısa teller. Kutusu teller dahil.
const battery = new Box3(new Vector3(-6.4, 0, -1.95), new Vector3(6.4, 3.92, 1.95));
const hole = new Vector3(14, 3.3 + 1.5, -3);
const plusEnd = new Vector3(-6, 0.12 + 1.4, 0);
const minusEnd = new Vector3(6, 0.12 + 1.4, 0);
const old = (a: Vector3, b: Vector3) => {
  const lift = baseLift(a.distanceTo(b));
  return new CubicBezierCurve3(a, a.clone().add(new Vector3(0, lift, 0)), b.clone().add(new Vector3(0, lift, 0)), b);
};
const peak = (c: CubicBezierCurve3) => Math.max(...c.getPoints(64).map((p) => p.y));

describe('3B kablolar', () => {
  it('pilin uzak ucundan çıkan kablo eskiden gövdeden geçiyordu, şimdi üstünden aşıyor', () => {
    const own = [{ box: battery, own: true }];
    expect(collisions(old(plusEnd, hole), own).length).toBeGreaterThan(0);
    const curve = leadCurve(plusEnd, hole, own);
    expect(collisions(curve, own)).toEqual([]);
    expect(peak(curve)).toBeLessThan(14);
  });

  it('yakın uçtaki kablo eskisi gibi alçak kavisli', () => {
    const own = [{ box: battery, own: true }];
    const curve = leadCurve(minusEnd, hole, own);
    expect(curve.v1.y - minusEnd.y).toBeCloseTo(baseLift(minusEnd.distanceTo(hole)));
    expect(collisions(curve, own)).toEqual([]);
  });

  it('başka bir parçanın gövdesi yolun ortasındaysa kablo onun da üstünden geçiyor', () => {
    const source = new Box3(new Vector3(-30, 0, -2.4), new Vector3(-20, 2.6, 2.4));
    const box = { box: new Box3(new Vector3(-2, 0, -3), new Vector3(4, 8, 3)), own: false };
    const curve = leadCurve(new Vector3(-21, 4, 0), hole, [{ box: source, own: true }, box]);
    expect(collisions(old(new Vector3(-21, 4, 0), hole), [box]).length).toBeGreaterThan(0);
    expect(collisions(curve, [{ box: source, own: true }, box])).toEqual([]);
  });
});
