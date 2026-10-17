// Laboratuvar cihazları: fonksiyon üreteci, DC güç kaynağı, osiloskobun kuplajı/girişi ve şebeke toprağı.

import { describe, expect, it } from 'vitest';
import { buildScopeView } from '../src/editor/scopeView';
import { CircuitSimulator, OscilloscopeDevice, scopeSettings, warpPhase, type PropValue } from '../src/sim';
import { circuit } from './helpers';

function sim(builder: ReturnType<typeof circuit>, until = 0): CircuitSimulator {
  const s = new CircuitSimulator(builder.build());
  const result = s.runUntil(until);
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  return s;
}

function swing(s: CircuitSimulator, value: () => number, duration: number, slice: number): { max: number; min: number; mean: number } {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let sum = 0;
  let n = 0;
  const end = s.time + duration;
  while (s.time < end - 1e-15) {
    expect(s.advance(slice).ok).toBe(true);
    const v = value();
    max = Math.max(max, v);
    min = Math.min(min, v);
    sum += v;
    n++;
  }
  return { max, min, mean: sum / n };
}

const gen = (b: ReturnType<typeof circuit>, out: string, com: string, props: Record<string, PropValue> = {}, ttl = 'ttl') =>
  b.add('funcgen', 'FG1', [out, ttl, com], { waveform: 'sine', frequency: 1000, amplitude: 10, offset: 0, duty: 50, attenuate: false, earthed: true, ...props });

describe('Fonksiyon üreteci', () => {
  it('genlik açık devre tepe-tepe değeridir; 50 Ω’luk yükte yarıya düşer', () => {
    const open = sim(gen(circuit().resistor('R1', 'out', 'com', 1e9), 'out', 'com'), 0.002);
    const o = swing(open, () => open.voltageAt('out')!, 0.001, 1e-6);
    expect(o.max - o.min).toBeCloseTo(10, 1);
    const loaded = sim(gen(circuit().resistor('R1', 'out', 'com', 50), 'out', 'com'), 0.002);
    const l = swing(loaded, () => loaded.voltageAt('out')!, 0.001, 1e-6);
    expect(l.max - l.min).toBeCloseTo(5, 1);
  });

  it('DC offset, −20 dB zayıflatıcı ve topraklı COM (toprak sembolü gerekmez)', () => {
    const s = sim(gen(circuit().resistor('R1', 'out', 'com', 1e6), 'out', 'com', { offset: 3, amplitude: 2 }), 0.002);
    expect(s.topologyDiagnostics.some((d) => d.severity === 'error')).toBe(false);
    expect(s.voltageAt('com')).toBe(0);
    const w = swing(s, () => s.voltageAt('out')!, 0.001, 1e-6);
    expect(w.max).toBeCloseTo(4, 1);
    expect(w.min).toBeCloseTo(2, 1);
    const att = sim(gen(circuit().resistor('R1', 'out', 'com', 1e6), 'out', 'com', { offset: 3, amplitude: 2, attenuate: true }), 0.002);
    const a = swing(att, () => att.voltageAt('out')!, 0.001, 1e-6);
    expect(a.max).toBeCloseTo(0.4, 2);
  });

  it('simetri: %25’lik kare dalga periyodun dörtte biri yüksek; TTL 0/5 V', () => {
    expect(warpPhase(0.25, 0.25)).toBeCloseTo(0.5, 12);
    const s = sim(
      gen(circuit().resistor('R1', 'out', 'com', 1e6).resistor('R2', 'ttl', 'com', 1e6), 'out', 'com', { waveform: 'square', duty: 25 }),
      0.002,
    );
    let high = 0;
    let n = 0;
    let ttlHigh = 0;
    const end = s.time + 0.001;
    while (s.time < end - 1e-12) {
      s.advance(1e-6);
      if (s.voltageAt('out')! > 0) high++;
      if (s.voltageAt('ttl')! > 4.9) ttlHigh++;
      n++;
    }
    expect(high / n).toBeCloseTo(0.25, 1);
    expect(ttlHigh / n).toBeCloseTo(0.25, 1);
  });

  it('1 MHz’te zaman adımı 20 ns; dalga doğru izlenir', () => {
    const s = sim(gen(circuit().resistor('R1', 'out', 'com', 1e6), 'out', 'com', { frequency: 1e6 }), 2e-6);
    expect(s.timeStep).toBeCloseTo(20e-9, 15);
    const w = swing(s, () => s.voltageAt('out')!, 2e-6, 1e-8);
    expect(w.max - w.min).toBeCloseTo(10, 0);
  });
});

describe('DC güç kaynağı', () => {
  const supply = (b: ReturnType<typeof circuit>, props: Record<string, PropValue>) =>
    b.add('dcsupply', 'PS1', ['p1', 'n1', 'p2', 'n2'], { voltage1: 12, currentLimit1: 0.1, voltage2: 5, currentLimit2: 0.5, ...props });

  it('sabit gerilim (CV): 12 V, 1 kΩ yükte 12 V', () => {
    const s = sim(supply(circuit().ground('G1', 'n1').ground('G2', 'n2').resistor('R1', 'p1', 'n1', 1000).resistor('R2', 'p2', 'n2', 1000), {}));
    expect(s.voltageAt('p1')!).toBeCloseTo(12, 2);
    expect(s.status('PS1').currentLimited).toEqual([false, false]);
  });

  it('akım sınırı (CC): 0,1 A sınırlı çıkışa 10 Ω → 0,1 A, 1 V; CC lambası yanar', () => {
    const s = sim(supply(circuit().ground('G1', 'n1').ground('G2', 'n2').resistor('R1', 'p1', 'n1', 10).resistor('R2', 'p2', 'n2', 1000), {}));
    expect(s.voltageAt('p1')!).toBeCloseTo(1, 1);
    expect(-s.pinCurrents('PS1')![0]!).toBeCloseTo(0.1, 3);
    expect(s.status('PS1').currentLimited).toEqual([true, false]);
  });

  it('çıkışlar yüzer: seri bağlanan 3 V + 2 V = 5 V', () => {
    const s = sim(
      supply(circuit().ground('G1', 'n1').wire('p1', 'n2').resistor('R1', 'p2', 'n1', 1000), { voltage1: 3, voltage2: 2 }),
    );
    expect(s.voltageAt('p2')!).toBeCloseTo(5, 2);
  });
});

describe('Osiloskop girişi', () => {
  const scope = (b: ReturnType<typeof circuit>, props: Record<string, PropValue>) =>
    b.add('oscilloscope', 'O1', ['a', 'nc', 'gnd'], { timePerDiv: 1e-3, input: 'real', earthed: false, couplingA: 'dc', ...props });

  it('gerçek giriş 1 MΩ’dur: 1 MΩ’luk kaynak direncinde ölçülen gerilim yarıya düşer', () => {
    const real = sim(scope(circuit().battery('B1', 'v', 'gnd', 10).ground('G1', 'gnd').resistor('R1', 'v', 'a', 1e6), {}), 0.01);
    expect(real.voltageAt('a')!).toBeCloseTo(5, 2);
    const ideal = sim(scope(circuit().battery('B1', 'v', 'gnd', 10).ground('G1', 'gnd').resistor('R1', 'v', 'a', 1e6), { input: 'ideal' }), 0.01);
    expect(ideal.voltageAt('a')!).toBeCloseTo(10, 4);
  });

  it('AC kuplaj DC bileşeni süzer, GND sıfır çizgisi verir', () => {
    const build = (couplingA: string) =>
      scope(
        circuit().ground('G1', 'gnd').add('funcgen', 'FG1', ['a', 'ttl', 'gnd'], { frequency: 1000, amplitude: 2, offset: 3, earthed: true }),
        { couplingA, earthed: true },
      );
    const recorded = (couplingA: string) => {
      const s = sim(build(couplingA), 0.3);
      const rec = (s.device('O1') as OscilloscopeDevice).recorder;
      let sum = 0;
      let max = Number.NEGATIVE_INFINITY;
      for (let k = rec.end - 500; k < rec.end; k++) {
        sum += rec.channels[0].last[rec.slot(k)]!;
        max = Math.max(max, rec.channels[0].max[rec.slot(k)]!);
      }
      return { mean: sum / 500, max };
    };
    const dc = recorded('dc');
    expect(dc.mean).toBeCloseTo(3, 1);
    const ac = recorded('ac');
    expect(Math.abs(ac.mean)).toBeLessThan(0.05);
    expect(ac.max).toBeCloseTo(1, 1);
    expect(recorded('gnd').max).toBe(0);
  });
});

describe('Şebeke toprağı ve köprü doğrultmaç', () => {
  /** Topraklı fonksiyon üreteciyle beslenen köprü; yük p–n arasında 100 kΩ. */
  const bridge = () =>
    circuit()
      .add('funcgen', 'FG1', ['out', 'ttl', 'com'], { frequency: 1000, amplitude: 10, earthed: true })
      .diode('D1', 'out', 'p')
      .diode('D2', 'com', 'p')
      .diode('D3', 'n', 'out')
      .diode('D4', 'n', 'com')
      .resistor('RL', 'p', 'n', 100e3);

  it('doğru bağlantı: yük tam dalga (iki yarıda da ≈ 3,6 V tepe)', () => {
    const s = sim(bridge(), 0.002);
    const w = swing(s, () => s.voltageAt('p')! - s.voltageAt('n')!, 0.002, 2e-6);
    expect(w.max).toBeGreaterThan(3.4);
    expect(w.min).toBeGreaterThan(-0.01);
    // Her iki yarı periyotta da tepe: 0,5 ms aralıklarla yük gerilimi yüksektir.
    s.runUntil(0.00425);
    const first = s.voltageAt('p')! - s.voltageAt('n')!;
    s.runUntil(0.00475);
    const second = s.voltageAt('p')! - s.voltageAt('n')!;
    expect(first).toBeGreaterThan(3);
    expect(second).toBeGreaterThan(3);
  });

  it('toprak tuzağı: topraklı prob ucu yükün eksi ucuna takılınca D4 kısa devre olur, çıkış yarım dalgaya döner', () => {
    const s = sim(
      bridge().add('oscilloscope', 'O1', ['p', 'nc', 'n'], { timePerDiv: 2e-4, input: 'real', earthed: true }),
      0.002,
    );
    expect(s.voltageAt('n')).toBe(0);
    s.runUntil(0.00425);
    expect(s.voltageAt('p')! - s.voltageAt('n')!).toBeGreaterThan(3);
    s.runUntil(0.00475);
    expect(Math.abs(s.voltageAt('p')! - s.voltageAt('n')!)).toBeLessThan(0.1);
  });

  it('doğru ölçüm: iki kanal + B ters + ADD → A − B = yük gerilimi (tam dalga)', () => {
    const props = { timePerDiv: 2e-4, input: 'real', earthed: true, mode: 'add', invertB: true };
    const s = sim(bridge().add('oscilloscope', 'O1', ['p', 'n', 'com'], props), 0.01);
    const scope = s.device('O1') as OscilloscopeDevice;
    const view = buildScopeView(scope.recorder, scopeSettings(props), [true, true]);
    expect(view.channels[0].stats!.max).toBeGreaterThan(3.3);
    expect(view.channels[0].stats!.min).toBeGreaterThan(-0.05);
    expect(view.channels[0].stats!.frequency).toBeCloseTo(2000, -1);
  });
});
