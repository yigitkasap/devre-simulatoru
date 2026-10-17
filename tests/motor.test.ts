// DC motor: zıt EMK, mekanik zaman sabiti, yük, enerji korunumu, jeneratör ve frenleme. Beklenen
// değerler motorun eşdeğer devresinin analitik çözümünden ve maxon A-max 26 veri sayfasından.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { MOTOR_DEFAULTS, MotorDevice } from '../src/sim/devices/motor';
import { circuit } from './helpers';

const D = MOTOR_DEFAULTS;
const R = D.armatureResistance;
const L = D.armatureInductance;
const K = D.torqueConstant * 1e-3;
const J = D.inertia * 1e-7;
const TF = D.frictionTorque * 1e-3;
const CM = J / (K * K);
const RPM = 60 / (2 * Math.PI);

const speed = (s: CircuitSimulator) => s.status('M').motor!.speed;
const current = (s: CircuitSimulator) => s.measure('M')!.current;

/** 12 V'luk pil, anahtar ve motor (isteğe bağlı yük torku, serbest geçiş diyodu, fren direnci). */
function motorCircuit(o: { closed?: boolean; load?: number; diode?: boolean; brake?: number; volts?: number } = {}): Netlist {
  const b = circuit()
    .battery('B', 'p', 'g', o.volts ?? 12)
    .ground('G', 'g')
    .switch('S', 'p', 'm', o.closed ?? true)
    .add('motor', 'M', ['m', 'g'], o.load ? { loadTorque: o.load } : {});
  if (o.diode) b.diode('D', 'g', 'm');
  if (o.brake !== undefined) b.resistor('RB', 'm', 'g', o.brake);
  return b.build();
}

describe('DC motor: zıt EMK ve Lenz', () => {
  it('boşta: 12 V’ta ≈ 8160 dev/dk (veri sayfası 8190) ve 57 mA; zıt EMK = V − R·I', () => {
    const s = new CircuitSimulator(motorCircuit());
    s.runUntil(0.3);
    const omega = (12 - R * (TF / K)) / K;
    expect(speed(s)).toBeCloseTo(omega, 1);
    expect(speed(s) * RPM).toBeGreaterThan(8100);
    expect(speed(s) * RPM).toBeLessThan(8250);
    expect(current(s)).toBeCloseTo(0.057, 4);
    expect(s.status('M').motor!.backEmf).toBeCloseTo(12 - R * current(s), 3);
  });

  it('kalkış: akım ≈ V/R’ye (5,8 A) çıkar; hız τ_m = R·J/k² ≈ 14,6 ms ile artar (e(τ) = %63,2)', () => {
    const s = new CircuitSimulator(motorCircuit());
    let peak = 0;
    while (s.time < 2e-3) {
      s.runUntil(s.time + 5e-6);
      peak = Math.max(peak, current(s));
    }
    expect(peak).toBeGreaterThan(5.5);
    expect(peak).toBeLessThan(12 / R);
    const tau = R * CM;
    expect(tau).toBeCloseTo(14.6e-3, 4);
    s.runUntil(tau);
    const final = 12 - R * (TF / K);
    // L'nin gecikmesi (τ_e = L/R ≈ 0,11 ms) sonucu ≈ %0,4 kaydırır.
    expect((speed(s) * K) / final).toBeGreaterThan(0.628);
    expect((speed(s) * K) / final).toBeLessThan(0.636);
  });

  it('yük: 10 mN·m’de akım I₀ + T/k ≈ 0,78 A, hız 1023 dev/dk düşer (veri sayfası: 103 dev/dk/mN·m)', () => {
    const free = new CircuitSimulator(motorCircuit());
    const loaded = new CircuitSimulator(motorCircuit({ load: 10 }));
    free.runUntil(0.3);
    loaded.runUntil(0.3);
    expect(current(loaded)).toBeCloseTo(TF / K + 0.01 / K, 4);
    const drop = (speed(free) - speed(loaded)) * RPM;
    expect(drop / 10).toBeCloseTo((R / (K * K)) * 1e-3 * RPM, 1);
    expect(drop / 10).toBeGreaterThan(100);
    expect(drop / 10).toBeLessThan(106);
    expect(loaded.status('M').motor!.loadPower).toBeCloseTo(0.01 * speed(loaded), 6);
  });

  it('enerji korunumu: kalkışta pilin verdiği enerji = bakır kaybı + sürtünme işi + ½Jω² + ½LI² (%0,5)', () => {
    const s = new CircuitSimulator(motorCircuit({ load: 5 }));
    let input = 0;
    let copper = 0;
    let drag = 0;
    let t = 0;
    let last = { p: 0, cu: 0, d: 0 };
    while (s.time < 0.08) {
      s.runUntil(s.time + 2e-5);
      const dt = s.time - t;
      t = s.time;
      const m = s.measure('M')!;
      const i = m.current;
      const w = speed(s);
      const now = { p: m.voltage * i, cu: R * i * i, d: (TF + 0.005) * Math.abs(w) };
      input += 0.5 * (now.p + last.p) * dt;
      copper += 0.5 * (now.cu + last.cu) * dt;
      drag += 0.5 * (now.d + last.d) * dt;
      last = now;
    }
    const w = speed(s);
    const i = current(s);
    const stored = 0.5 * J * w * w + 0.5 * L * i * i;
    expect(Math.abs(input - (copper + drag + stored)) / input).toBeLessThan(5e-3);
  });

  it('durma: yük durma torkundan (≈ 80 mN·m) büyükse dönmez, akım V/R ≈ 5,8 A; sargı ısınınca uyarı', () => {
    const s = new CircuitSimulator(motorCircuit({ load: 100 }));
    s.runUntil(0.2);
    expect(Math.abs(speed(s)) * RPM).toBeLessThan(5);
    expect(current(s)).toBeCloseTo(12 / R, 2);
    expect(s.runtimeDiagnostics.map((d) => d.code)).not.toContain('motor-overload');
    s.runUntil(1.5);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('motor-overload');
  });

  it('jeneratör: akımı kesilen motor boşta döner, uçlarında zıt EMK görülür; sürtünmeyle J·ω₀/T ≈ 1,47 s’de durur', () => {
    const s = new CircuitSimulator(motorCircuit({ diode: true }));
    s.runUntil(0.3);
    const w0 = speed(s);
    s.update(motorCircuit({ closed: false, diode: true }));
    const t0 = s.time;
    s.runUntil(t0 + 0.5);
    const expected = w0 - (TF / J) * 0.5;
    expect(speed(s)).toBeCloseTo(expected, 0);
    expect(s.measure('M')!.voltage).toBeCloseTo(expected * K, 2);
    s.runUntil(t0 + 1.6);
    expect(Math.abs(speed(s)) * RPM).toBeLessThan(5);
    expect((J * w0) / TF).toBeCloseTo(1.47, 2);
  });

  it('dinamik frenleme: 1 Ω’la kısa devre edilen motorun akımı ters döner (jeneratör), hız τ = (R + 1 Ω)·J/k² ile düşer', () => {
    const s = new CircuitSimulator(motorCircuit({ diode: true }));
    s.runUntil(0.3);
    const w0 = speed(s);
    s.update(motorCircuit({ closed: false, diode: true, brake: 1 }));
    const t0 = s.time;
    s.runUntil(t0 + 1e-3);
    expect(current(s)).toBeLessThan(-3);
    const tau = (R + 1) * CM;
    s.runUntil(t0 + tau);
    // Sürtünme frenlemeye katkı verir: hız e⁻¹’in biraz altında.
    const ratio = speed(s) / w0;
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(Math.exp(-1) + 0.005);
    s.runUntil(t0 + 0.3);
    expect(Math.abs(speed(s)) * RPM).toBeLessThan(5);
  });

  it('Lenz: yüklü motorun akımı anahtarla kesilince uçlarında yüzlerce voltluk sıçrama (uyarı); serbest geçiş diyoduyla yok', () => {
    const bare = new CircuitSimulator(motorCircuit({ load: 10 }));
    bare.runUntil(0.3);
    bare.update(motorCircuit({ load: 10, closed: false }));
    bare.runUntil(0.31);
    expect((bare.device('M') as MotorDevice).spikeVoltage()).toBeGreaterThan(200);
    expect(bare.runtimeDiagnostics.map((d) => d.code)).toContain('inductor-spike');
    const safe = new CircuitSimulator(motorCircuit({ load: 10, diode: true }));
    safe.runUntil(0.3);
    safe.update(motorCircuit({ load: 10, closed: false, diode: true }));
    safe.runUntil(0.31);
    // Diyot kesime girerken L ile uç kapasitesi kısa bir süre salınır (≈ 2e): uyarı eşiğinin (2 × 12 V) altında.
    expect((safe.device('M') as MotorDevice).spikeVoltage()).toBeLessThan(24);
    expect(safe.runtimeDiagnostics.map((d) => d.code)).not.toContain('inductor-spike');
  });
});

function example(id: ExampleId) {
  let doc: CircuitDoc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  return {
    sim,
    idOf,
    rpm: () => sim.status(idOf('M1')).motor!.speed * RPM,
    amps: () => sim.measure(idOf('A1'))!.current,
    set(label: string, props: Record<string, number | boolean>) {
      const part = doc.parts.find((p) => p.label === label)!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...props } });
      sim.update(buildConnectivity(doc).netlist);
    },
  };
}

describe('Motor örnekleri: metindeki sayılar', () => {
  it('DC motor: kalkışta ≈ 5,6 A; boşta 8160 dev/dk, 57 mA, zıt EMK 11,88 V; 10 mN·m’de 7130 dev/dk, 0,78 A, verim ≈ %80; durunca 5,8 A ve uyarı', () => {
    const e = example('dc-motor');
    e.sim.runUntil(0.05);
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.set('S1', { closed: true });
    let peak = 0;
    const t0 = e.sim.time;
    while (e.sim.time < t0 + 3e-3) {
      e.sim.runUntil(e.sim.time + 5e-6);
      peak = Math.max(peak, e.amps());
    }
    expect(peak).toBeGreaterThan(5.5);
    expect(peak).toBeLessThan(5.7);
    e.sim.runUntil(t0 + 0.3);
    expect(e.rpm()).toBeGreaterThan(8150);
    expect(e.rpm()).toBeLessThan(8175);
    expect(e.amps()).toBeCloseTo(0.057, 3);
    expect(e.sim.status(e.idOf('M1')).motor!.backEmf).toBeCloseTo(11.88, 2);
    e.set('M1', { loadTorque: 10 });
    e.sim.runUntil(e.sim.time + 0.3);
    expect(e.rpm()).toBeGreaterThan(7100);
    expect(e.rpm()).toBeLessThan(7160);
    expect(e.amps()).toBeCloseTo(0.78, 2);
    const efficiency = e.sim.status(e.idOf('M1')).motor!.loadPower / (12 * e.amps());
    expect(efficiency).toBeGreaterThan(0.79);
    expect(efficiency).toBeLessThan(0.81);
    e.set('M1', { loadTorque: 100 });
    e.sim.runUntil(e.sim.time + 0.2);
    expect(Math.abs(e.rpm())).toBeLessThan(5);
    expect(e.amps()).toBeCloseTo(5.8, 1);
    e.sim.runUntil(e.sim.time + 0.4);
    expect(e.sim.runtimeDiagnostics.map((d) => d.code)).toContain('motor-overload');
  });

  it('Jeneratör: S1 açılınca 0,25 s’de ≈ 9,9 V, 1 s’de ≈ 3,8 V, ≈ 1,5 s’de durur; S2 ile ters ≈ 0,34 A ve ≈ 0,5 s’de durur', () => {
    const e = example('motor-jenerator');
    e.sim.runUntil(0.3);
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.set('S1', { closed: false });
    const t0 = e.sim.time;
    e.sim.runUntil(t0 + 0.25);
    expect(e.sim.measure(e.idOf('V1'))!.voltage).toBeCloseTo(9.86, 1);
    e.sim.runUntil(t0 + 1);
    expect(e.sim.measure(e.idOf('V1'))!.voltage).toBeCloseTo(3.79, 1);
    while (e.rpm() > 1 && e.sim.time < t0 + 3) e.sim.runUntil(e.sim.time + 0.005);
    expect(e.sim.time - t0).toBeGreaterThan(1.4);
    expect(e.sim.time - t0).toBeLessThan(1.55);
    e.set('S1', { closed: true });
    e.sim.runUntil(e.sim.time + 0.3);
    e.set('S1', { closed: false });
    e.set('S2', { closed: true });
    const t1 = e.sim.time;
    e.sim.runUntil(t1 + 2e-3);
    expect(e.amps()).toBeCloseTo(-0.34, 2);
    while (e.rpm() > 1 && e.sim.time < t1 + 3) e.sim.runUntil(e.sim.time + 0.005);
    expect(e.sim.time - t1).toBeGreaterThan(0.4);
    expect(e.sim.time - t1).toBeLessThan(0.55);
    expect(e.sim.runtimeDiagnostics).toEqual([]);
  });

  it('H köprüsü: S1+S4 ileri 8160 dev/dk, S2+S3 geri −8160 dev/dk; dönerken yön değişince ≈ 11 A; S1+S3 kısa devre', () => {
    const e = example('motor-h-koprusu');
    e.sim.runUntil(0.05);
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.set('S1', { closed: true });
    e.set('S4', { closed: true });
    e.sim.runUntil(e.sim.time + 0.3);
    expect(e.rpm()).toBeCloseTo(8162, -1);
    e.set('S1', { closed: false });
    e.set('S4', { closed: false });
    e.set('S2', { closed: true });
    e.set('S3', { closed: true });
    let peak = 0;
    const t0 = e.sim.time;
    while (e.sim.time < t0 + 3e-3) {
      e.sim.runUntil(e.sim.time + 5e-6);
      peak = Math.min(peak, e.amps());
    }
    expect(peak).toBeLessThan(-10.5);
    expect(peak).toBeGreaterThan(-24 / R);
    e.sim.runUntil(t0 + 0.4);
    expect(e.rpm()).toBeCloseTo(-8162, -1);
    e.set('S1', { closed: true });
    e.sim.runUntil(e.sim.time + 0.01);
    expect(e.sim.runtimeDiagnostics.map((d) => d.code)).toContain('short-circuit');
  });
});
