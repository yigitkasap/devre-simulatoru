// Analiz → Ölçülen Bode (A4): BC107 ortak emetörlü yükselteçte 1 kHz kazancı 205,5 kat ± %2 ve faz
// ≈ −180° (tasarımın referans verisi tests/veri/veri-bc107-bode.json); sinüs uydurması; orta bant ve
// −3 dB noktası (f_H, iki ölçüm arasında dB – log f ara değeri; referansta ≈ 0,82 MHz).

import { describe, expect, it } from 'vitest';
import { bodeSummary, logFrequencies, measureBode, sineFit, toDb, type BodePoint, type BodeRequest } from '../src/editor/analysis/bode';
import { buildConnectivity, pinKey } from '../src/model/connectivity';
import { exampleDoc } from '../src/examples';
import bode from './veri/veri-bc107-bode.json';

function ampRequest(from: number, to: number, points: number): BodeRequest {
  const doc = exampleDoc('bjt-yukseltec')!;
  const fg = doc.parts.find((p) => p.type === 'funcgen')!;
  const osc = doc.parts.find((p) => p.type === 'oscilloscope')!;
  return {
    netlist: buildConnectivity(doc).netlist,
    source: fg.id,
    input: { a: pinKey(fg.id, 0), b: pinKey(fg.id, 2) },
    output: { a: pinKey(osc.id, 1), b: pinKey(osc.id, 2) },
    from,
    to,
    points,
  };
}

describe('Analiz: ölçülen Bode', () => {
  it('sinüs uydurması: tam periyotluk örneklerden genlik ve faz', () => {
    const times = Array.from({ length: 128 }, (_, k) => k / (64 * 50));
    const v = times.map((t) => 0.3 + 2 * Math.sin(2 * Math.PI * 50 * t - Math.PI / 3));
    const fit = sineFit(v, times, 50);
    expect(fit.amp).toBeCloseTo(2, 9);
    expect(fit.phase).toBeCloseTo(-60, 7);
    expect(logFrequencies(20, 2e6, 16)).toHaveLength(16);
    expect(logFrequencies(20, 2e6, 16)[15]).toBeCloseTo(2e6, 3);
  });

  it('BC107 yükselteç, 1 kHz: kazanç 205,5 kat ± %2, faz ≈ −180°, oturdu', () => {
    const [p] = measureBode(ampRequest(1000, 1000, 1));
    const ref = (bode.satirlar as number[][]).find((r) => r[0] === 1000)!;
    expect(Math.abs(p!.gain - 205.5) / 205.5).toBeLessThan(0.02);
    expect(Math.abs(p!.gain - ref[3]!) / ref[3]!).toBeLessThan(0.02);
    expect(Math.abs(p!.phase + 180)).toBeLessThan(3);
    expect(p!.settled).toBe(true);
    expect(p!.inAmp).toBeCloseTo(0.0099, 4);
    // Önce DC çalışma noktası çözülür (atOperatingPoint); paralel çalıştırmada 5 s'yi aşabiliyor.
  }, 60000);

  it('orta bant ve f_H referans veriden: ≈ 205,5 kat (46,3 dB), f_H ≈ 0,82 MHz', () => {
    const points: BodePoint[] = (bode.satirlar as number[][]).map(([f, inAmp, outAmp, gain, phase]) => ({ f: f!, inAmp: inAmp!, outAmp: outAmp!, gain: gain!, phase: phase!, settled: true }));
    const s = bodeSummary(points)!;
    expect(s.mid.gain).toBeCloseTo(205.5, 0);
    expect(toDb(s.mid.gain)).toBeCloseTo(46.3, 1);
    expect(s.fH! / 1e6).toBeCloseTo(0.82, 1);
    expect(s.fL).toBeNull();
  });
});
