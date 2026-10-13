// AC kaynak, ölçü aletlerinin DC/AC kipi ve osiloskop kaydı.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, OscilloscopeDevice, waveValue } from '../src/sim';
import { circuit } from './helpers';

function run(builder: ReturnType<typeof circuit>, until: number): CircuitSimulator {
  const sim = new CircuitSimulator(builder.build());
  const result = sim.runUntil(until);
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  return sim;
}

/** `duration` boyunca küçük adımlarla ilerleyip bir ağın en büyük ve en küçük gerilimini bulur. */
function extremes(sim: CircuitSimulator, key: string, duration: number, slice = 1e-4): { max: number; min: number } {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  const end = sim.time + duration;
  while (sim.time < end - 1e-12) {
    expect(sim.advance(slice).ok).toBe(true);
    const v = sim.voltageAt(key)!;
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  return { max, min };
}

describe('Dalga biçimleri', () => {
  it('sinüs, kare ve üçgen t = 0’da ilk yarım periyodun başında', () => {
    const f = 50;
    const T = 1 / f;
    expect(waveValue('sine', f, T / 4)).toBeCloseTo(1, 12);
    expect(waveValue('sine', f, (3 * T) / 4)).toBeCloseTo(-1, 12);
    expect(waveValue('square', f, T / 4)).toBe(1);
    expect(waveValue('square', f, (3 * T) / 4)).toBe(-1);
    expect(waveValue('triangle', f, 0)).toBeCloseTo(0, 12);
    expect(waveValue('triangle', f, T / 4)).toBeCloseTo(1, 12);
    expect(waveValue('triangle', f, T / 2)).toBeCloseTo(0, 12);
    expect(waveValue('triangle', f, (3 * T) / 4)).toBeCloseTo(-1, 12);
  });
});

describe('AC kaynak', () => {
  const divider = () =>
    circuit()
      .acsource('AC1', 'kaynak', 'gnd', { amplitude: 10, frequency: 50 })
      .ground('G1', 'gnd')
      .resistor('R1', 'kaynak', 'orta', 1000)
      .resistor('R2', 'orta', 'gnd', 1000);

  it('gerilim bölücü sinüsü izler: t = T/4’te orta nokta 5 V, t = 3T/4’te −5 V', () => {
    const sim = run(divider(), 0.005);
    expect(sim.voltageAt('orta')).toBeCloseTo(5, 6);
    sim.runUntil(0.015);
    expect(sim.voltageAt('orta')).toBeCloseTo(-5, 6);
  });

  it('kondansatörsüz devre de adım adım çözülür; adım periyodun 1/50’sini aşmaz', () => {
    const sim = new CircuitSimulator(divider().build());
    expect(sim.isTransient).toBe(true);
    expect(sim.hasAcSources).toBe(true);
    expect(sim.timeStep).toBeLessThanOrEqual(50e-6);
    const fast = new CircuitSimulator(
      circuit().acsource('AC1', 'a', 'gnd', { frequency: 1000 }).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).build(),
    );
    expect(fast.timeStep).toBeCloseTo(20e-6, 12);
  });

  it('iç direnç: 10 V tepe, R_iç = 1 Ω, yük 9 Ω → yükte 9 V tepe', () => {
    const sim = run(
      circuit()
        .acsource('AC1', 'kaynak', 'gnd', { amplitude: 10, frequency: 50, internalResistance: 1 })
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'gnd', 9),
      0.005,
    );
    expect(sim.voltageAt('kaynak')).toBeCloseTo(9, 6);
  });

  it('DC kayma: 0–10 V arası kare dalga', () => {
    const builder = circuit()
      .acsource('AC1', 'a', 'gnd', { waveform: 'square', amplitude: 5, offset: 5, frequency: 10 })
      .ground('G1', 'gnd')
      .resistor('R1', 'a', 'gnd', 1000);
    const sim = run(builder, 0.01);
    const { max, min } = extremes(sim, 'a', 0.2, 1e-3);
    expect(max).toBeCloseTo(10, 6);
    expect(min).toBeCloseTo(0, 6);
  });

  it('kısa devre: 1 Ω iç dirençli kaynağa 0,1 Ω yük → uyarı, sıfır geçişinde de sürer', () => {
    const sim = run(
      circuit()
        .acsource('AC1', 'a', 'gnd', { amplitude: 10, frequency: 50, internalResistance: 1 })
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 0.1),
      0.04,
    );
    // t = 40 ms: sinüs sıfırdan geçiyor, anlık akım ≈ 0.
    expect(Math.abs(sim.measure('AC1')!.current)).toBeLessThan(0.1);
    const warning = sim.runtimeDiagnostics.find((d) => d.code === 'short-circuit');
    expect(warning?.elementIds).toEqual(['AC1']);
    expect(warning?.params?.current).toBeGreaterThan(8);
  });

  it('ampermetre AC kaynağa paralel bağlanınca uyarı verilir', () => {
    const sim = new CircuitSimulator(
      circuit().acsource('AC1', 'a', 'gnd', { internalResistance: 1 }).ground('G1', 'gnd').ammeter('A1', 'a', 'gnd').build(),
    );
    expect(sim.topologyDiagnostics.some((d) => d.code === 'ammeter-parallel')).toBe(true);
  });
});

describe('Ölçü aletlerinin DC / AC kipi', () => {
  const meters = (mode: 'dc' | 'ac') =>
    circuit()
      .acsource('AC1', 'a', 'gnd', { amplitude: 10, frequency: 50 })
      .ground('G1', 'gnd')
      .resistor('R1', 'a', 'b', 1000)
      .ammeter('A1', 'b', 'gnd', 'ideal', mode)
      .voltmeter('V1', 'a', 'gnd', 'ideal', mode);

  it('sinüste DC kipi ortalamayı (≈ 0), AC kipi etkin değeri (V_m/√2) gösterir', () => {
    const dc = run(meters('dc'), 0.1);
    expect(Math.abs(dc.status('V1').reading!)).toBeLessThan(0.01);
    expect(Math.abs(dc.status('A1').reading!)).toBeLessThan(1e-5);
    const ac = run(meters('ac'), 0.1);
    expect(ac.status('V1').reading!).toBeCloseTo(10 / Math.SQRT2, 3);
    expect(ac.status('A1').reading!).toBeCloseTo(10e-3 / Math.SQRT2, 6);
  });

  it('gösterge bir periyot boyunca sabit kalır (anlık değer değişse de)', () => {
    const sim = run(meters('ac'), 0.1);
    const readings = new Set<number>();
    for (let i = 0; i < 10; i++) {
      sim.advance(1e-3);
      if (sim.time < 0.1195) readings.add(sim.status('V1').reading!);
    }
    expect(readings.size).toBe(1);
  });

  it('AC kaynaksız devrede gösterge anlık değerdir (AC kipinde büyüklüğü)', () => {
    const builder = (mode: 'dc' | 'ac') =>
      circuit().battery('B1', 'a', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).voltmeter('V1', 'gnd', 'a', 'ideal', mode);
    expect(run(builder('dc'), 0).status('V1').reading).toBeCloseTo(-9, 9);
    expect(run(builder('ac'), 0).status('V1').reading).toBeCloseTo(9, 9);
  });

  it('kare dalgada etkin değer tepe değerine, üçgende V_m/√3’e eşittir', () => {
    for (const [waveform, expected] of [['square', 10], ['triangle', 10 / Math.sqrt(3)]] as const) {
      const sim = run(
        circuit()
          .acsource('AC1', 'a', 'gnd', { waveform, amplitude: 10, frequency: 50 })
          .ground('G1', 'gnd')
          .resistor('R1', 'a', 'gnd', 1000)
          .voltmeter('V1', 'a', 'gnd', 'ideal', 'ac'),
        0.1,
      );
      expect(sim.status('V1').reading!).toBeCloseTo(expected, 2);
    }
  });
});

describe('Yarım dalga doğrultmaç', () => {
  const rectifier = () =>
    circuit()
      .acsource('AC1', 'a', 'gnd', { amplitude: 10, frequency: 50 })
      .ground('G1', 'gnd')
      .diode('D1', 'a', 'out')
      .resistor('R1', 'out', 'gnd', 1000)
      .voltmeter('V1', 'out', 'gnd', 'ideal', 'dc');

  it('yük gerilimi yalnızca pozitif yarım dalgalar: tepe ≈ 9,3 V, en küçük ≈ 0', () => {
    const sim = run(rectifier(), 0.04);
    const { max, min } = extremes(sim, 'out', 0.02, 5e-5);
    expect(max).toBeGreaterThan(9.2);
    expect(max).toBeLessThan(9.45);
    expect(min).toBeGreaterThan(-0.01);
  });

  it('DC voltmetre ortalamayı gösterir: ≈ V_tepe / π', () => {
    const sim = run(rectifier(), 0.1);
    const reading = sim.status('V1').reading!;
    expect(reading).toBeGreaterThan(2.8);
    expect(reading).toBeLessThan(3.1);
  });
});

describe('Kare dalga ve RC', () => {
  it('0–10 V, 1 Hz kare dalga, τ = 0,1 s: yarım periyot (5τ) sonunda ≈ 9,93 V, periyot sonunda ≈ 0,07 V', () => {
    const builder = circuit()
      .acsource('AC1', 'a', 'gnd', { waveform: 'square', amplitude: 5, offset: 5, frequency: 1 })
      .ground('G1', 'gnd')
      .resistor('R1', 'a', 'c', 1000)
      .capacitor('C1', 'c', 'gnd', 100e-6);
    const sim = run(builder, 0.4999);
    expect(sim.voltageAt('c')!).toBeGreaterThan(9.9);
    expect(sim.voltageAt('c')!).toBeLessThan(9.96);
    sim.runUntil(0.9999);
    expect(sim.voltageAt('c')!).toBeGreaterThan(0.05);
    expect(sim.voltageAt('c')!).toBeLessThan(0.09);
  });
});

describe('Kare ortalamaları (tuvaldeki çizim için)', () => {
  it('bir periyotluk ilerletmede sinüslü ağın ortalaması ≈ 0; adım atılmazsa anlık değer', () => {
    const sim = new CircuitSimulator(
      circuit().acsource('AC1', 'a', 'gnd', { amplitude: 10, frequency: 50 }).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).build(),
    );
    sim.advance(0.005);
    sim.advance(0.02);
    expect(Math.abs(sim.averageVoltageAt('a')!)).toBeLessThan(0.01);
    expect(Math.abs(sim.averageCurrent('R1')!)).toBeLessThan(1e-5);
    sim.advance(0);
    expect(sim.averageVoltageAt('a')).toBeCloseTo(sim.voltageAt('a')!, 12);
  });
});

describe('Osiloskop', () => {
  it('kanal A kaynağı kaydeder: ±10 V; kayıt ekranın kovalarına bölünür', () => {
    const sim = run(
      circuit()
        .acsource('AC1', 'a', 'gnd', { amplitude: 10, frequency: 50 })
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 1000)
        .oscilloscope('O1', 'a', 'nc', 'gnd', { timePerDiv: 2e-3 }),
      0.03,
    );
    const scope = sim.device('O1') as OscilloscopeDevice;
    const rec = scope.recorder;
    expect(rec.bucketTime).toBeCloseTo(40e-6, 12);
    expect(rec.end - rec.start).toBeGreaterThan(600);
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    for (let k = rec.start; k < rec.end; k++) {
      max = Math.max(max, rec.channels[0].max[rec.slot(k)]!);
      min = Math.min(min, rec.channels[0].min[rec.slot(k)]!);
    }
    expect(max).toBeCloseTo(10, 2);
    expect(min).toBeCloseTo(-10, 2);
  });

  it('kullanılmayan kanal uyarı vermez, boşta ortak uç verir; osiloskop devreyi etkilemez', () => {
    const unused = new CircuitSimulator(
      circuit().battery('B1', 'a', 'gnd', 5).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).oscilloscope('O1', 'a', 'nc', 'gnd').build(),
    );
    expect(unused.topologyDiagnostics).toEqual([]);
    const floatingCom = new CircuitSimulator(
      circuit().battery('B1', 'a', 'gnd', 5).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).oscilloscope('O1', 'a', 'nc', 'com').build(),
    );
    expect(floatingCom.topologyDiagnostics.map((d) => [d.code, d.pin])).toEqual([['floating-pin', 2]]);
  });

  it('DC devrede her ilerletmede kayıt sürer (düz çizgi)', () => {
    const sim = new CircuitSimulator(
      circuit().battery('B1', 'a', 'gnd', 5).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).oscilloscope('O1', 'a', 'nc', 'gnd', { timePerDiv: 1e-3 }).build(),
    );
    sim.advance(0.002);
    sim.advance(0.003);
    const rec = (sim.device('O1') as OscilloscopeDevice).recorder;
    expect(rec.end - rec.start).toBeGreaterThan(100);
    for (let k = rec.start; k < rec.end; k++) expect(rec.channels[0].last[rec.slot(k)]).toBeCloseTo(5, 9);
  });

  it('değer değişince kayıt korunur, bölme süresi değişince sıfırlanır', () => {
    const build = (amplitude: number, timePerDiv: number) =>
      circuit()
        .acsource('AC1', 'a', 'gnd', { amplitude, frequency: 50 })
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 1000)
        .oscilloscope('O1', 'a', 'nc', 'gnd', { timePerDiv })
        .build();
    const sim = run({ build: () => build(10, 2e-3) } as ReturnType<typeof circuit>, 0.01);
    const before = (sim.device('O1') as OscilloscopeDevice).recorder;
    sim.update(build(5, 2e-3));
    expect((sim.device('O1') as OscilloscopeDevice).recorder).toBe(before);
    sim.update(build(5, 5e-3));
    expect((sim.device('O1') as OscilloscopeDevice).recorder).not.toBe(before);
  });
});
