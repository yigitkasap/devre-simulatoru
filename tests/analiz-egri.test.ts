// Analiz → Eğri izleyici (A3): BF245A çıkış ailesi tasarımın referans verisiyle (tests/veri/
// veri-bf245a.json; V_DS = 10 V'ta I_D 4,14 / 3,25 / 2,46 / 1,78 mA) %1 içinde; transfer eğrisi
// I_DSS'ye çıkar; diyotta akım sınırı; BJT'de I_C ≈ β · I_B; P tipinde büyüklükler pozitif.

import { describe, expect, it } from 'vitest';
import { curveAt, defaultRequest, loadLine, qSteps, runSweep, supplyTo, sweepValues, type SweepRequest } from '../src/editor/analysis/sweep';
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
  it('Q basamağı (analiz düzeltmeleri, 9): BC107’de Q’daki gerçek I_B ≈ 5 µA ayrı bir eğri, öbür basamaklar aynı; aralık beslemeye (12 V) kadar', () => {
    const amp = exampleDoc('bjt-yukseltec')!;
    const q1 = amp.parts.find((p) => p.label === 'Q1')!;
    const line = loadLine(buildConnectivity(amp).netlist, q1.id, {})!;
    // RB = 2,2 MΩ, V_BE ≈ 0,64 V: I_B = (12 − 0,64) / 2,2 MΩ ≈ 5,16 µA.
    expect(line.qStep!).toBeGreaterThan(4.5e-6);
    expect(line.qStep!).toBeLessThan(5.5e-6);
    expect(supplyTo(line.supply, 0.1)).toBe(12);
    const base = defaultRequest('npn', q1.props, 'output');
    const req: SweepRequest = { type: 'npn', props: q1.props, ...base, to: supplyTo(line.supply, base.step), step: 0.5, qStep: line.qStep! };
    let total = 0;
    const curves = runSweep(req, (_, t) => (total = t));
    expect(total).toBe(5 * sweepValues(0, 12, 0.5).length);
    expect(curves.map((c) => c.step)).toEqual([...base.steps, line.qStep]);
    expect(curves.map((c) => c.q === true)).toEqual([false, false, false, false, true]);
    const qc = curves[4]!;
    expect(qc.measuredStep!).toBeCloseTo(line.qStep!, 8);
    expect(qc.points[qc.points.length - 1]![0]).toBeCloseTo(12, 6);
    // Q noktası Q eğrisinin üstünde (sıcaklıkla birkaç yüzde).
    expect(Math.abs(curveAt(qc, line.q[0]) / line.q[1] - 1)).toBeLessThan(0.05);
  });

  it('Q basamağı JFET ve MOSFET’te Q’daki V_GS: BF245A yükselteçte 0 V, IRF510 yükselteçte ≈ 3,85 V; aralık 15 V', () => {
    const fet = exampleDoc('fet-yukseltec')!;
    const j1 = fet.parts.find((p) => p.type === 'njfet')!;
    const jl = loadLine(buildConnectivity(fet).netlist, j1.id, {})!;
    expect(Math.abs(jl.qStep!)).toBeLessThan(0.01);
    expect(supplyTo(jl.supply, 0.5)).toBe(15);
    const mos = exampleDoc('mosfet-yukseltec')!;
    const m1 = mos.parts.find((p) => p.type === 'nmos')!;
    const ml = loadLine(buildConnectivity(mos).netlist, m1.id, {})!;
    // Kapı FG1'in 4,55 V ofsetinde, R_S = 1 kΩ: V_GS = 4,55 − R_S · k (V_GS − V_T)², V_T = 3,83 V,
    // k = 1,24 A/V² → V_GS = 3,8537 V (simülatörde ölçülen 3,853 V).
    expect(ml.qStep!).toBeGreaterThan(3.84);
    expect(ml.qStep!).toBeLessThan(3.87);
    expect(supplyTo(ml.supply, 0.25)).toBe(15);
    const curves = runSweep({ type: 'nmos', props: m1.props, ...defaultRequest('nmos', m1.props, 'output'), to: 15, step: 1, qStep: ml.qStep! });
    expect(curves).toHaveLength(5);
    expect(curves[4]!.q).toBe(true);
    // Q noktası (V_DS, I_D) Q eğrisinin üstünde.
    expect(Math.abs(curveAt(curves[4]!, ml.q[0]) / ml.q[1] - 1)).toBeLessThan(0.05);
  });
  it('MOSFET’te yük doğrusu açıkken varsayılan basamaklar Q’nun çevresinde: IRF510 yükselteçte 3,83 / 3,84 / 3,86 / 3,87 V; eğriler yük doğrusuyla aynı ölçekte', () => {
    const mos = exampleDoc('mosfet-yukseltec')!;
    const m1 = mos.parts.find((p) => p.type === 'nmos')!;
    const ml = loadLine(buildConnectivity(mos).netlist, m1.id, {})!;
    expect(ml.threshold).toBeCloseTo(3.83, 6);
    const steps = qSteps(ml.qStep!, ml.threshold!);
    expect(steps).toEqual([3.83, 3.84, 3.86, 3.87]);
    const curves = runSweep({ type: 'nmos', props: m1.props, mode: 'output', from: 0, to: 15, step: 0.25, steps, qStep: ml.qStep! });
    // En büyük basamağın akımı yük doğrusunun en büyük akımıyla (15 V / 11 kΩ ≈ 1,36 mA) aynı ölçekte.
    const top = Math.max(...curves[3]!.points.map(([, y]) => y));
    expect(top).toBeGreaterThan(1e-3);
    expect(top).toBeLessThan(3e-3);
    // Q'daki akım (≈ 0,68 mA) 3,84 V ve 3,86 V eğrilerinin arasında.
    const atQ = (c: number) => curveAt(curves[c]!, ml.q[0]);
    expect(atQ(1)).toBeLessThan(ml.q[1]);
    expect(atQ(2)).toBeGreaterThan(ml.q[1]);
    // BJT ve JFET'te eşik yok: basamaklar değişmez.
    const amp = exampleDoc('bjt-yukseltec')!;
    expect(loadLine(buildConnectivity(amp).netlist, amp.parts.find((p) => p.label === 'Q1')!.id, {})!.threshold).toBeNull();
  });
});
