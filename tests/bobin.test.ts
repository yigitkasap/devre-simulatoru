// Fizik 7: bobin (v = L·di/dt), Faraday ve Lenz yasaları. Beklenen değerler analitiktir.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { INDUCTOR_WINDING_CAPACITANCE, InductorDevice } from '../src/sim/devices/inductor';
import { circuit } from './helpers';

const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);
const L = 10e-3;
const coil = (dcResistance = 0) => ({ inductance: L, dcResistance });

/** Bir periyot boyunca N eşit aralıklı örnekle kilitlemeli ölçüm: sin(ωt + φ) bileşeninin genliği ve fazı. */
function lockIn(s: CircuitSimulator, start: number, f: number, read: () => number, n = 400): { amplitude: number; phase: number } {
  let si = 0;
  let co = 0;
  for (let k = 1; k <= n; k++) {
    const t = start + k / (f * n);
    s.runUntil(t);
    const w = 2 * Math.PI * f * t;
    si += read() * Math.sin(w);
    co += read() * Math.cos(w);
  }
  return { amplitude: (2 / n) * Math.hypot(si, co), phase: Math.atan2(co, si) };
}

describe('Fizik 7: RL devresi', () => {
  // 10 V, 100 Ω, 10 mH (sargı direnci 0): τ = L/R = 100 µs, son akım 100 mA.
  const rl = () => new CircuitSimulator(circuit().battery('B', 'a', 'g', 10).ground('G', 'g').resistor('R', 'a', 'x', 100).add('inductor', 'L', ['x', 'g'], coil()).build());

  it('RL dolma: i(τ) = 63,2 mA (en fazla %1), i(5τ) = 99,3 mA', () => {
    const s = rl();
    s.runUntil(100e-6);
    expect(rel(s.measure('L')!.current, 0.1 * (1 - Math.exp(-1)))).toBeLessThan(0.01);
    s.runUntil(500e-6);
    expect(rel(s.measure('L')!.current, 0.1 * (1 - Math.exp(-5)))).toBeLessThan(0.01);
  });

  it('kararlı durumda depolanan enerji ½LI² = 50 µJ; bobinin gerilimi 0 (kısa devre gibi)', () => {
    const s = rl();
    s.runUntil(3e-3);
    const device = s.device('L') as unknown as { energy(x: Float64Array): number };
    const x = (s as unknown as { x: Float64Array }).x;
    expect(rel(device.energy(x), 50e-6)).toBeLessThan(0.01);
    expect(Math.abs(s.measure('L')!.voltage)).toBeLessThan(1e-6);
  });

  it('sargı direnci (varsayılan 12 Ω) akımı sınırlar: 10 V / 112 Ω', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', 10).ground('G', 'g').resistor('R', 'a', 'x', 100).add('inductor', 'L', ['x', 'g'], { inductance: L }).build());
    s.runUntil(3e-3);
    expect(rel(s.measure('L')!.current, 10 / 112)).toBeLessThan(1e-3);
  });
});

describe('Fizik 7: AC devrede bobin', () => {
  const pure = (f: number) =>
    new CircuitSimulator(
      circuit().acsource('S', 'a', 'g', { waveform: 'sine', amplitude: 1, frequency: f, offset: 0, internalResistance: 0 }).ground('G', 'g').add('inductor', 'L', ['a', 'g'], coil()).build(),
    );

  it('endüktif reaktans: 50 Hz’te X_L = 2πfL = 3,1416 Ω, etkin akım V_etkin/X_L (en fazla %1)', () => {
    const s = pure(50);
    s.runUntil(0.04);
    const i = lockIn(s, 0.04, 50, () => s.measure('L')!.current);
    expect(rel(i.amplitude / Math.SQRT2, Math.SQRT1_2 / (2 * Math.PI * 50 * L))).toBeLessThan(0.01);
  });

  it('faz: bobinde gerilim akımdan 90° önde (en fazla 1°)', () => {
    const s = pure(50);
    s.runUntil(0.04);
    const v = lockIn(s, 0.04, 50, () => s.measure('L')!.voltage);
    const i = lockIn(s, 0.06, 50, () => s.measure('L')!.current);
    let lead = ((v.phase - i.phase) * 180) / Math.PI;
    if (lead > 180) lead -= 360;
    if (lead < -180) lead += 360;
    expect(Math.abs(lead - 90)).toBeLessThan(1);
  });

  it('seri RLC: akım en büyük f₀ = 1/(2π√(LC)) ≈ 503,3 Hz’te (V/R), komşu frekanslarda küçük', () => {
    const C = 10e-6;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const amplitudeAt = (f: number) => {
      const s = new CircuitSimulator(
        circuit().acsource('S', 'a', 'g', { waveform: 'sine', amplitude: 1, frequency: f, offset: 0, internalResistance: 0 }).ground('G', 'g')
          .resistor('R', 'a', 'b', 10).add('inductor', 'L', ['b', 'c'], coil()).capacitor('C', 'c', 'g', C).build(),
      );
      s.runUntil(0.03);
      return lockIn(s, 0.03, f, () => s.measure('R')!.current, 200).amplitude;
    };
    const atF0 = amplitudeAt(f0);
    expect(rel(atF0, 0.1)).toBeLessThan(0.01);
    for (const k of [0.9, 0.97, 1.03, 1.1]) expect(amplitudeAt(f0 * k), `f = ${k}·f₀`).toBeLessThan(atF0);
  });
});

describe('Fizik 7: LC salınımı', () => {
  // 10 µF 10 V'a dolu, 10 mH ideal bobin: T = 2π√(LC) ≈ 1,987 ms, tepe akım V·√(C/L) ≈ 0,316 A.
  const C = 10e-6;
  const lc = () => new CircuitSimulator(circuit().ground('G', 'g').capacitor('C', 'a', 'g', C, 10).add('inductor', 'L', ['a', 'g'], coil()).build());

  it('periyot 1,987 ms, tepe akım 0,316 A, enerji korunur (bir periyotta en fazla %1 kayıp)', () => {
    const s = lc();
    const period = 2 * Math.PI * Math.sqrt(L * (C + INDUCTOR_WINDING_CAPACITANCE));
    const energy = () => {
      const v = s.measure('C')!.voltage;
      const i = s.measure('L')!.current;
      return 0.5 * C * v * v + 0.5 * L * i * i;
    };
    const e0 = 0.5 * C * 100;
    // Akımın sıfırdan geçişleri (aynı yönde) → periyot.
    const dt = 2e-6;
    let previous = 0;
    let peak = 0;
    const crossings: number[] = [];
    let worstLoss = 0;
    let lastEnergy = e0;
    let nextCheck = period;
    for (let t = dt; t <= 10.2 * period; t += dt) {
      s.runUntil(t);
      const i = s.measure('L')!.current;
      peak = Math.max(peak, Math.abs(i));
      if (previous < 0 && i >= 0) crossings.push(t - dt + (dt * -previous) / (i - previous));
      previous = i;
      if (t >= nextCheck) {
        const e = energy();
        worstLoss = Math.max(worstLoss, (lastEnergy - e) / lastEnergy);
        lastEnergy = e;
        nextCheck += period;
      }
    }
    const measured = (crossings[crossings.length - 1]! - crossings[0]!) / (crossings.length - 1);
    expect(rel(measured, 2 * Math.PI * Math.sqrt(L * C))).toBeLessThan(0.005);
    expect(rel(peak, 10 * Math.sqrt(C / L))).toBeLessThan(0.01);
    expect(worstLoss).toBeLessThan(0.01);
    expect(rel(energy(), e0)).toBeLessThan(0.01);
  });
});

describe('Fizik 7: Lenz yasası, açılan anahtar', () => {
  /** 10 V, anahtar, 100 Ω, bobin (varsayılan 12 Ω'luk sargı); istenirse bobine ters paralel 1N4001. */
  const build = (closed: boolean, freewheel: boolean): Netlist => {
    const b = circuit().battery('B', 'a', 'g', 10).ground('G', 'g').switch('S', 'a', 's', closed).resistor('R', 's', 'x', 100).add('inductor', 'L', ['x', 'g'], { inductance: L });
    if (freewheel) b.add('diode', 'D', ['g', 'x'], { model: '1N4001' });
    return b.build();
  };

  /** Anahtar kapalıyken oturur, sonra açılır; açıldıktan sonraki en büyük |v_L| ve uyarılar. */
  function openSwitch(freewheel: boolean) {
    const s = new CircuitSimulator(build(true, freewheel));
    s.runUntil(5e-3);
    const before = s.measure('L')!.current;
    s.update(build(false, freewheel));
    let finite = true;
    let sampled = 0;
    for (let k = 1; k <= 400; k++) {
      expect(s.advance(1e-6).ok).toBe(true);
      const v = s.measure('L')!.voltage;
      if (!Number.isFinite(v)) finite = false;
      sampled = Math.max(sampled, Math.abs(v));
    }
    // Bobin her adımda uç geriliminin tepesini tutar (1,9 µs'lik salınımın tepesi örneklemeyle kaçmasın).
    const peak = (s.device('L') as InductorDevice).spikeVoltage();
    return { s, before, peak, sampled, finite, codes: s.runtimeDiagnostics.map((d) => d.code) };
  }

  it('serbest geçiş diyodu yokken: sıçrama sonlu (≈ I·√(L/C_p) ≈ 3 kV), NaN yok, uyarı var', () => {
    const r = openSwitch(false);
    expect(r.finite).toBe(true);
    expect(rel(r.before, 10 / 112)).toBeLessThan(1e-3);
    // Enerji ½LI² sargı kapasitesine geçer: ideal tepe I·√(L/C_p) ≈ 2,98 kV. Sargı kapasitesi geri
    // Euler ile çözüldüğü için ilk çeyrek periyotta ≈ %10 sönüm olur (gerçek bobinde çekirdek kaybı).
    const ideal = r.before * Math.sqrt(L / INDUCTOR_WINDING_CAPACITANCE);
    expect(r.peak / ideal).toBeGreaterThan(0.85);
    expect(r.peak / ideal).toBeLessThanOrEqual(1);
    expect(r.codes).toContain('inductor-spike');
    // Açık anahtardan akım tam 0 (Fizik 2 korunur).
    expect(r.s.measure('S')!.current).toBe(0);
  });

  it('serbest geçiş diyoduyla: sıçrama ≈ bir diyot gerilimi (1 V’un altında), uyarı yok; akım diyottan söner', () => {
    const r = openSwitch(true);
    expect(r.finite).toBe(true);
    // Açıldıktan sonra uç gerilimi diyotun ileri gerilimine (≈ −0,6 V) iner; tepe 1 V'un altında.
    expect(r.sampled).toBeLessThan(1);
    expect(r.sampled).toBeGreaterThan(0.4);
    expect(r.codes).not.toContain('inductor-spike');
    expect(Math.abs(r.s.measure('D')!.current)).toBeGreaterThan(0.01);
  });

  it('LC salınımında (kaynak yok, kondansatör 10 V) uyarı çıkmaz', () => {
    const s = new CircuitSimulator(circuit().ground('G', 'g').capacitor('C', 'a', 'g', 10e-6, 10).add('inductor', 'L', ['a', 'g'], coil()).build());
    for (let k = 0; k < 10; k++) {
      s.advance(1e-3);
      expect(s.runtimeDiagnostics.map((d) => d.code)).not.toContain('inductor-spike');
    }
  });
});

describe('Fizik 7: bobin örnekleri', () => {
  /** Örneği anahtar kapalı başlatır; `until` anına kadar çalıştırır, sonra anahtarı açar. */
  async function closeThenOpen(id: 'rl-devresi' | 'bobin-serbest-gecis') {
    const { exampleDoc } = await import('../src/examples');
    const { buildConnectivity } = await import('../src/model/connectivity');
    const { updatePart } = await import('../src/model/docOps');
    const doc = exampleDoc(id)!;
    const sw = doc.parts.find((p) => p.type === 'switch')!;
    const label = (l: string) => doc.parts.find((p) => p.label === l)!.id;
    const closed = updatePart(doc, sw.id, { props: { ...sw.props, closed: true } });
    const s = new CircuitSimulator(buildConnectivity(closed).netlist);
    return { s, label, open: () => s.update(buildConnectivity(updatePart(closed, sw.id, { props: { ...sw.props, closed: false } })).netlist) };
  }

  it('RL devresi: τ ≈ 89 µs, son akım 10 V / 112 Ω ≈ 89 mA; anahtar açılınca Lenz uyarısı', async () => {
    const { s, label, open } = await closeThenOpen('rl-devresi');
    const tau = 10e-3 / 112;
    s.runUntil(tau);
    expect(rel(s.status(label('A1')).reading!, (10 / 112) * (1 - Math.exp(-1)))).toBeLessThan(0.01);
    s.runUntil(3e-3);
    expect(rel(s.status(label('A1')).reading!, 10 / 112)).toBeLessThan(0.002);
    expect(rel(s.measure(label('L1'))!.voltage, (12 * 10) / 112)).toBeLessThan(0.002);
    open();
    s.advance(20e-6);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('inductor-spike');
  });

  it('Bobin ve serbest geçiş diyotu: açınca ≈ −0,6 V, akım diyottan söner, uyarı yok', async () => {
    const { s, label, open } = await closeThenOpen('bobin-serbest-gecis');
    s.runUntil(3e-3);
    open();
    s.advance(20e-6);
    const v = s.measure(label('L1'))!.voltage;
    expect(v).toBeLessThan(-0.4);
    expect(v).toBeGreaterThan(-0.9);
    expect(s.measure(label('D1'))!.current).toBeGreaterThan(0.08);
    expect(s.runtimeDiagnostics.map((d) => d.code)).not.toContain('inductor-spike');
    s.advance(5e-3);
    expect(Math.abs(s.measure(label('L1'))!.current)).toBeLessThan(1e-3);
  });
});
