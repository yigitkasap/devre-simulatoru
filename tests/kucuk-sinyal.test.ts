// Küçük sinyal AC (A5): motorun linearize'ı ve Bode'un "Teori" eğrisi. RC alçak geçirende analitik
// H = 1 / (1 + jωRC); BC107 ortak emetörlü yükselteçte teori ölçülen Bode'la (aynı modeller) örtüşür.
// linearize yalnızca okur: ardından geçici çözüm aynen sürer.

import { describe, expect, it } from 'vitest';
import { bodeSummary, logFrequencies, measureBode, type BodeRequest } from '../src/editor/analysis/bode';
import { theoryAt, theoryBode } from '../src/editor/analysis/bodeTheory';
import { buildConnectivity, pinKey } from '../src/model/connectivity';
import { exampleDoc } from '../src/examples';
import { CircuitSimulator } from '../src/sim';
import type { Netlist } from '../src/sim/netlist';

const R = 1000;
const C = 1e-6;
/** Fonksiyon üreteci (OUT, TTL, COM) → R → C → toprak. */
const rc: Netlist = {
  elements: [
    { id: 'FG', type: 'funcgen', props: { waveform: 'sine', frequency: 100, amplitude: 2, offset: 0 }, pins: ['in', 'ttl', '0'] },
    { id: 'R', type: 'resistor', props: { resistance: R }, pins: ['in', 'out'] },
    { id: 'C', type: 'capacitor', props: { capacitance: C, kind: 'film' }, pins: ['out', '0'] },
    { id: 'G', type: 'ground', props: {}, pins: ['0'] },
  ],
  links: [],
};
const rcRequest: BodeRequest = { netlist: rc, source: 'FG', input: { a: 'in', b: '0' }, output: { a: 'out', b: '0' }, from: 10, to: 1e5, points: 9 };

/** BC107 ortak emetörlü yükselteç (föy örneği); `amplitude` üretecin tepe-tepe değeri (−20 dB zayıflatıcıdan önce). */
function ampRequest(from: number, to: number, points: number, amplitude?: number): BodeRequest {
  const doc = exampleDoc('bjt-yukseltec')!;
  const fg = doc.parts.find((p) => p.type === 'funcgen')!;
  const osc = doc.parts.find((p) => p.type === 'oscilloscope')!;
  const parts = amplitude === undefined ? doc.parts : doc.parts.map((p) => (p.id === fg.id ? { ...p, props: { ...p.props, amplitude } } : p));
  return {
    netlist: buildConnectivity({ ...doc, parts }).netlist,
    source: fg.id,
    input: { a: pinKey(fg.id, 0), b: pinKey(fg.id, 2) },
    output: { a: pinKey(osc.id, 1), b: pinKey(osc.id, 2) },
    from,
    to,
    points,
  };
}

describe('Küçük sinyal AC', () => {
  it('RC alçak geçiren: kazanç ve faz analitik 1 / (1 + jωRC) ile aynı', () => {
    const freqs = logFrequencies(10, 1e5, 9);
    const res = theoryBode(rcRequest, freqs);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const p of res.points) {
      const wrc = 2 * Math.PI * p.f * R * C;
      expect(p.gain).toBeCloseTo(1 / Math.hypot(1, wrc), 6);
      expect(p.phase).toBeCloseTo((-Math.atan(wrc) * 180) / Math.PI, 4);
    }
  });

  it('linearize yalnızca okur: ardından geçici çözüm linearize edilmemiş eşiyle aynı', () => {
    const net = ampRequest(1000, 1000, 1).netlist;
    const a = new CircuitSimulator(net);
    const b = new CircuitSimulator(net);
    a.runUntil(2e-3);
    b.runUntil(2e-3);
    expect(a.linearize()).not.toBeNull();
    a.runUntil(4e-3);
    b.runUntil(4e-3);
    const key = ampRequest(1, 1, 1).output.a;
    expect(a.voltageAt(key)).toBe(b.voltageAt(key));
  });

  it('BC107 yükselteç: küçük genlikte (2 mVpp) ölçülen Bode teoriyle örtüşüyor (kazanç %1, faz 1,5°)', () => {
    // Örnekteki 20 mVpp'de ölçülen orta bant ≈ %2 düşük (205,8 / 209,8 kat): büyük sinyal etkisi. Ölçülen
    // noktalar teoriden %0,6'ya kadar sapar (oturma ölçütünün payı; 200 Hz'te 211,0 / 209,8, 2 MHz'te
    // 104,8 / 105,7); teori ngspice .ac ile aynı (tests/spice).
    const req = ampRequest(20, 2e6, 6, 0.02);
    const freqs = logFrequencies(20, 2e6, 6);
    const theory = theoryBode(req, freqs);
    expect(theory.ok).toBe(true);
    if (!theory.ok) return;
    const measured = measureBode(req);
    expect(measured).toHaveLength(6);
    measured.forEach((m, i) => {
      const t = theory.points[i]!;
      expect(Math.abs(m.gain - t.gain) / t.gain).toBeLessThan(1e-2);
      expect(Math.abs(m.phase - t.phase)).toBeLessThan(1.5);
    });
    expect(theory.points[2]!.gain).toBeCloseTo(209.8, 0);
  }, 120000);

  it('ölçülen Bode’un oturduğu simülatörden hesaplanan teori, bağımsız teoriyle aynı (aynı çalışma noktası)', () => {
    const req = ampRequest(1000, 1000, 1);
    const freqs = [100, 1000, 1e6];
    let fromMeasure: ReturnType<typeof theoryAt> | null = null;
    measureBode(req, undefined, undefined, (sim) => {
      fromMeasure = theoryAt(sim, req, freqs);
    });
    const alone = theoryBode(req, freqs);
    expect(fromMeasure).not.toBeNull();
    const a = fromMeasure as unknown as ReturnType<typeof theoryAt>;
    expect(a.ok && alone.ok).toBe(true);
    if (!a.ok || !alone.ok) return;
    a.points.forEach((p, i) => expect(p.gain / alone.points[i]!.gain).toBeCloseTo(1, 6));
  }, 120000);

  it('BC107 örneğinde (20 mVpp) teorinin orta bandı ≈ 209,8 kat, f_H ≈ 1,1 MHz; ölçülen ≈ %2 düşük', () => {
    const req = ampRequest(20, 2e6, 16);
    const theory = theoryBode(req, logFrequencies(20, 1e7, 21));
    expect(theory.ok).toBe(true);
    if (!theory.ok) return;
    const t = bodeSummary(theory.points.map((p) => ({ ...p, inAmp: 1, outAmp: p.gain, settled: true })))!;
    expect(t.mid.gain).toBeCloseTo(209.8, 0);
    expect(t.fH! / 1e6).toBeGreaterThan(1.0);
    expect(t.fH! / 1e6).toBeLessThan(1.2);
    const [m] = measureBode(ampRequest(1000, 1000, 1));
    expect((t.mid.gain - m!.gain) / t.mid.gain).toBeGreaterThan(0.01);
    expect((t.mid.gain - m!.gain) / t.mid.gain).toBeLessThan(0.03);
  }, 120000);
});
