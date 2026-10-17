// 555 zamanlayıcı (NE555): astabil frekansı ve doluluk oranı, monostabil süresi, RESET, çıkış
// seviyeleri ve besleme akımı. Beklenen değerler RC dolma denkleminden ve veri sayfasından.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { TIMER555, Timer555Device } from '../src/sim/devices/timer555';
import { circuit } from './helpers';

type Pins = [string, string, string, string, string, string, string, string];
/** Uç sırası: [GND, TRIG, OUT, RESET, CONT, THRES, DISCH, VCC]. */
const ic = (b: ReturnType<typeof circuit>, pins: Pins) => b.add('timer555', 'U', pins);

function astable(ra: number, rb: number, c: number, volts = 9): Netlist {
  const b = circuit().battery('B', 'v', 'g', volts).ground('G', 'g').resistor('RA', 'v', 'd', ra).resistor('RB', 'd', 't', rb).capacitor('C', 't', 'g', c);
  return ic(b.capacitor('CV', 'cv', 'g', 10e-9).resistor('RL', 'o', 'g', 10e3), ['g', 't', 'o', 'v', 'cv', 't', 'd', 'v']).build();
}

/**
 * Düşük süre: kondansatör R_B üzerinden deşarj ucuna boşalır; deşarj transistörü R_A'nın akımını
 * da çektiği için ucun gerilimi 0 değil V_d ≈ V·R_ds/(R_A + R_ds) (veri sayfası: 8 mA'de 0,15 V):
 * t = (R_B + R_ds)·C·ln((2V/3 − V_d) / (V/3 − V_d)).
 */
function lowTime(ra: number, rb: number, c: number, volts = 9): number {
  const rds = TIMER555.dischargeResistance;
  const vd = (volts * rds) / (ra + rds);
  return (rb + rds) * c * Math.log(((2 * volts) / 3 - vd) / (volts / 3 - vd));
}

/** Çıkışın yükselen ve düşen kenarlarının zamanları. */
function edges(s: CircuitSimulator, until: number, dt: number) {
  const rising: number[] = [];
  const falling: number[] = [];
  let last = (s.device('U') as Timer555Device).high;
  while (s.time < until) {
    s.runUntil(s.time + dt);
    const now = (s.device('U') as Timer555Device).high;
    if (now !== last) (now ? rising : falling).push(s.time);
    last = now;
  }
  return { rising, falling };
}

describe('555 zamanlayıcı (NE555)', () => {
  it('astabil: t_yüksek = ln2·(R_A + R_B)·C, t_düşük ≈ ln2·R_B·C (deşarj ucunun 0,17 V’uyla %4 uzun); ilk yüksek süre RC·ln3', () => {
    const [ra, rb, c] = [1e3, 68e3, 10e-6];
    const s = new CircuitSimulator(astable(ra, rb, c));
    const { rising, falling } = edges(s, 3.5, 1e-3);
    expect(falling[0]! / ((ra + rb) * c * Math.log(3))).toBeCloseTo(1, 2);
    // rising[0]: açılıştaki ilk kenar (kondansatör boşken tetik hemen etkin).
    const high = falling[1]! - rising[1]!;
    const low = rising[1]! - falling[0]!;
    expect(high / (Math.LN2 * (ra + rb) * c)).toBeCloseTo(1, 2);
    expect(low / lowTime(ra, rb, c)).toBeCloseTo(1, 2);
    expect(low / (Math.LN2 * rb * c)).toBeGreaterThan(1.03);
  });

  it('astabil (R_A 1 kΩ, R_B 10 kΩ, 68 nF): ≈ 990 Hz (formül 1,44/((R_A + 2R_B)·C) 1008 Hz; deşarj ucunun gerilimiyle), %1', () => {
    const s = new CircuitSimulator(astable(1e3, 10e3, 68e-9));
    const { rising } = edges(s, 0.02, 2e-6);
    const n = rising.length - 1;
    const f = (n - 1) / (rising[n]! - rising[1]!);
    const want = 1 / (Math.LN2 * 11e3 * 68e-9 + lowTime(1e3, 10e3, 68e-9));
    expect(f / want).toBeGreaterThan(0.99);
    expect(f / want).toBeLessThan(1.01);
    expect(f).toBeCloseTo(990, -1);
  });

  it('kondansatör 1/3 ile 2/3 V_CC arasında salınır; RESET 0 V’a çekilince çıkış düşük kalır', () => {
    const s = new CircuitSimulator(astable(1e3, 68e3, 10e-6));
    s.runUntil(1);
    let min = 99;
    let max = 0;
    while (s.time < 3) {
      s.runUntil(s.time + 2e-3);
      const v = s.measure('C')!.voltage;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeCloseTo(3, 1);
    expect(max).toBeCloseTo(6, 1);
    const b = circuit().battery('B', 'v', 'g', 9).ground('G', 'g').resistor('RA', 'v', 'd', 1e3).resistor('RB', 'd', 't', 68e3).capacitor('C', 't', 'g', 10e-6);
    const reset = new CircuitSimulator(ic(b.resistor('RL', 'o', 'g', 10e3), ['g', 't', 'o', 'g', 'cv', 't', 'd', 'v']).build());
    reset.runUntil(2);
    expect((reset.device('U') as Timer555Device).high).toBe(false);
    expect(reset.measure('U')!.voltage).toBeLessThan(0.1);
  });

  it('monostabil: TRIG kısa süre toprağa çekilince çıkış RC·ln3 (≈ 1,1·R·C) süre yüksek kalır', () => {
    const net = (pressed: boolean) =>
      ic(
        circuit()
          .battery('B', 'v', 'g', 9)
          .ground('G', 'g')
          .resistor('RT', 'v', 'tr', 10e3)
          .switch('S', 'tr', 'g', pressed)
          .resistor('R', 'v', 'th', 100e3)
          .capacitor('C', 'th', 'g', 10e-6)
          .capacitor('CV', 'cv', 'g', 10e-9),
        ['g', 'tr', 'o', 'v', 'cv', 'th', 'th', 'v'],
      ).build();
    const s = new CircuitSimulator(net(false));
    s.runUntil(0.5);
    expect((s.device('U') as Timer555Device).high).toBe(false);
    s.update(net(true));
    const t0 = s.time;
    s.runUntil(s.time + 0.01);
    s.update(net(false));
    const { falling } = edges(s, s.time + 2, 1e-4);
    expect((falling[0]! - t0) / (100e3 * 10e-6 * Math.log(3))).toBeCloseTo(1, 2);
  });

  it('çıkış seviyeleri (15 V): 100 mA verirken ≈ 13,3 V, 10 mA çekerken ≈ 0,1 V; besleme akımı ≈ 10 mA', () => {
    const run = (high: boolean, load: (b: ReturnType<typeof circuit>) => ReturnType<typeof circuit>) => {
      // TRIG toprakta: çıkış hep yüksek. TRIG ve THRES V_CC'de: çıkış düşük.
      const b = load(circuit().battery('B', 'v', 'g', 15).ground('G', 'g'));
      const pins: Pins = high ? ['g', 'g', 'o', 'v', 'cv', 'g', 'd', 'v'] : ['g', 'v', 'o', 'v', 'cv', 'v', 'd', 'v'];
      const s = new CircuitSimulator(ic(b, pins).build());
      s.runUntil(1e-3);
      return s;
    };
    const hi = run(true, (b) => b.resistor('RL', 'o', 'g', 133));
    expect(hi.measure('U')!.voltage).toBeCloseTo(13.3, 1);
    const lo = run(false, (b) => b.resistor('RL', 'v', 'o', 1490));
    expect(lo.measure('U')!.voltage).toBeCloseTo(0.1, 2);
    const idle = run(false, (b) => b);
    expect(-idle.measure('B')!.current).toBeCloseTo(0.01, 3);
  });
});

function example(id: ExampleId) {
  let doc: CircuitDoc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  return {
    sim,
    idOf,
    set(label: string, props: Record<string, number | boolean>) {
      const part = doc.parts.find((p) => p.label === label)!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...props } });
      sim.update(buildConnectivity(doc).netlist);
    },
    edges(until: number, dt: number) {
      const rising: number[] = [];
      const falling: number[] = [];
      let last = (sim.device(idOf('U1')) as Timer555Device).high;
      while (sim.time < until) {
        sim.runUntil(sim.time + dt);
        const now = (sim.device(idOf('U1')) as Timer555Device).high;
        if (now !== last) (now ? rising : falling).push(sim.time);
        last = now;
      }
      return { rising, falling };
    },
  };
}

describe('555 örnekleri: metindeki sayılar', () => {
  it('Astabil: ilk yüksek 0,76 s, sonra 0,48 s yüksek, 0,49 s düşük (≈ 1 Hz); kondansatör 3–6 V', () => {
    const e = example('555-astabil');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const { rising, falling } = e.edges(4, 1e-3);
    expect(falling[0]!).toBeCloseTo(0.76, 1);
    expect(falling[1]! - rising[1]!).toBeCloseTo(0.48, 2);
    expect(rising[1]! - falling[0]!).toBeCloseTo(0.49, 2);
    let min = 99;
    let max = 0;
    const t0 = e.sim.time;
    while (e.sim.time < t0 + 2) {
      e.sim.runUntil(e.sim.time + 2e-3);
      const v = e.sim.measure(e.idOf('V1'))!.voltage;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeCloseTo(3, 1);
    expect(max).toBeCloseTo(6, 1);
  });

  it('Monostabil: S1 kapanıp açılınca çıkış R·C·ln3 = 5,16 s yüksek kalır', () => {
    const e = example('555-monostabil');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.sim.runUntil(1);
    expect((e.sim.device(e.idOf('U1')) as Timer555Device).high).toBe(false);
    e.set('S1', { closed: true });
    const t0 = e.sim.time;
    e.sim.runUntil(t0 + 0.2);
    e.set('S1', { closed: false });
    const { falling } = e.edges(t0 + 8, 1e-3);
    expect(falling[0]! - t0).toBeCloseTo(5.16, 2);
  });

  it('Ses: ≈ 990 Hz; R_B 22 kΩ’da frekans düşer; simülasyon gerçek zamandan hızlı', () => {
    const e = example('555-ses');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.sim.runUntil(0.2);
    const { rising } = e.edges(0.25, 2e-6);
    const f = (rising.length - 1) / (rising[rising.length - 1]! - rising[0]!);
    expect(f).toBeCloseTo(990, -1);
    e.set('RB', { resistance: 22000 });
    e.sim.runUntil(e.sim.time + 0.05);
    const slow = e.edges(e.sim.time + 0.05, 2e-6).rising;
    const f2 = (slow.length - 1) / (slow[slow.length - 1]! - slow[0]!);
    expect(f2).toBeLessThan(500);
    expect(e.sim.runtimeDiagnostics).toEqual([]);
  });
});
