// Analiz → Eğri izleyici (A3): BF245A çıkış ailesi tasarımın referans verisiyle (tests/veri/
// veri-bf245a.json; V_DS = 10 V'ta I_D 4,14 / 3,25 / 2,46 / 1,78 mA) %1 içinde; transfer eğrisi
// I_DSS'ye çıkar; diyotta akım sınırı; BJT'de I_C ≈ β · I_B; P tipinde büyüklükler pozitif.

import { describe, expect, it } from 'vitest';
import { curveAt, defaultRequest, loadLine, runSweep, sweepValues, type SweepRequest } from '../src/editor/analysis/sweep';
import { buildConnectivity } from '../src/model/connectivity';
import { exampleDoc } from '../src/examples';
import bf245a from './veri/veri-bf245a.json';

const jfet = exampleDoc('jfet-karakteristik')!.parts.find((p) => p.type === 'njfet')!;

describe('Analiz: eğri izleyici', () => {
  it('BF245A çıkış ailesi: V_DS = 10 V’ta I_D referansla %1 içinde (V_GS 0 → 4,14 mA, −0,6 V → 1,78 mA)', () => {
    const req: SweepRequest = { type: 'njfet', props: jfet.props, ...defaultRequest('njfet', jfet.props, 'output') };
    expect(req.steps).toEqual([0, -0.2, -0.4, -0.6]);
    expect(sweepValues(req.from, req.to, req.step)).toHaveLength(31);
    let progress = 0;
    const curves = runSweep(req, (done) => (progress = done));
    expect(progress).toBe(4 * 31);
    const reference = bf245a as Record<string, number[][]>;
    for (const curve of curves) {
      const ref = reference[String(Math.abs(curve.step))]!;
      const at10 = ref.find((r) => r[0] === 10)!;
      const id = curveAt(curve, 10);
      expect(Math.abs(id - at10[2]!) / at10[2]!).toBeLessThan(0.01);
      // Bütün eğri boyunca da %1 (referans V_DS'si ampermetrenin direnci yüzünden binde bir küçük).
      for (const [vds, , ref2] of ref) if (vds! > 0.4) expect(Math.abs(curveAt(curve, vds!) - ref2!) / ref2!).toBeLessThan(0.01);
    }
    expect(curveAt(curves[0]!, 10) * 1e3).toBeCloseTo(4.14, 2);
    expect(curveAt(curves[3]!, 10) * 1e3).toBeCloseTo(1.78, 2);
  });

  it('BF245A transfer: V_DS = 10 V; V_GS = 0’da I_D çıkış ailesiyle aynı, kısılmada sıfıra iner', () => {
    const req: SweepRequest = { type: 'njfet', props: jfet.props, ...defaultRequest('njfet', jfet.props, 'transfer') };
    const [curve] = runSweep(req);
    expect(curveAt(curve!, 0) * 1e3).toBeCloseTo(4.14, 1);
    expect(curveAt(curve!, -1.7)).toBeLessThan(1e-4);
  });

  it('diyot I–V: 0,6 V’ta mA düzeyi; akım sınırını (0,5 A) aşınca eğri biter', () => {
    const [curve] = runSweep({ type: 'diode', props: { model: '1N4001' }, ...defaultRequest('diode', {}, 'diode') });
    expect(curveAt(curve!, 0.6)).toBeGreaterThan(1e-4);
    expect(curveAt(curve!, 0.6)).toBeLessThan(0.1);
    const last = curve!.points[curve!.points.length - 1]!;
    expect(last[0] < 0.9 || last[1] < 0.5).toBe(true);
  });

  it('BJT çıkış ailesi: I_B basamakları ölçülür, aktif bölgede I_C ≈ β · I_B; PNP büyüklükleri pozitif', () => {
    const curves = runSweep({ type: 'npn', props: { model: 'BC107', beta: 200 }, mode: 'output', from: 0, to: 10, step: 0.5, steps: [10e-6, 20e-6] });
    expect(curves[0]!.measuredStep!).toBeCloseTo(10e-6, 8);
    const beta = curveAt(curves[1]!, 5) / curves[1]!.measuredStep!;
    expect(beta).toBeGreaterThan(150);
    expect(beta).toBeLessThan(260);
    const [p] = runSweep({ type: 'pnp', props: {}, mode: 'output', from: 0, to: 5, step: 1, steps: [20e-6] });
    expect(curveAt(p!, 5)).toBeGreaterThan(1e-4);
  });

  it('yük doğrusu: BC107 yükselteçte R_C = 5,6 kΩ, kaynak 12 V, Q doğrunun üstünde; JFET deneyinde R_D yok', () => {
    const amp = exampleDoc('bjt-yukseltec')!;
    const q1 = amp.parts.find((p) => p.label === 'Q1')!;
    const labels = Object.fromEntries(amp.parts.map((p) => [p.id, p.label]));
    const line = loadLine(buildConnectivity(amp).netlist, q1.id, labels)!;
    expect(line.label).toBe('RC');
    expect(line.r).toBe(5600);
    expect(line.supply).toBeCloseTo(12, 1);
    const [vce, ic] = line.q;
    expect(vce).toBeGreaterThan(1);
    expect(vce).toBeLessThan(11);
    expect(Math.abs(line.supply - ic * line.r - vce)).toBeLessThan(0.01);
    const lab = exampleDoc('jfet-karakteristik')!;
    expect(loadLine(buildConnectivity(lab).netlist, jfet.id, {})).toBeNull();
  });
});
