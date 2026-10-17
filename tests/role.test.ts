// Röle: elektromıknatıs, çekme/bırakma histerezisi, akı bağının korunması ve serbest geçiş diyodu.
// Beklenen değerler RL devresinin analitik çözümünden (i = I∞·(1 − e^(−t/τ)), τ = L/R).

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { RELAY_DEFAULTS, RELAY_INDUCTANCE_RATIO, RelayDevice } from '../src/sim/devices/relay';
import { circuit } from './helpers';

const D = RELAY_DEFAULTS;
const R = D.coilResistance;
const L_OFF = D.inductance;
const L_ON = D.inductance * RELAY_INDUCTANCE_RATIO;
const I_PULL = D.pullInVoltage / R;
const I_DROP = D.dropOutVoltage / R;

const relayOf = (s: CircuitSimulator) => s.device('K') as RelayDevice;
const coilCurrent = (s: CircuitSimulator) => s.status('K').coil!.current;

/** Pil, anahtar ve röle sargısı; kontak devresi ayrı bir pille (topraksız) iki yüke bağlı. */
function relayCircuit(voltage: number, closed: boolean, flyback = false) {
  const b = circuit()
    .battery('B', 'p', 'g', voltage)
    .ground('G', 'g')
    .switch('S', 'p', 'c', closed)
    .add('relay', 'K', ['c', 'g', 'com', 'no', 'nc'])
    .battery('B2', 'v', 'z', 12)
    .wire('v', 'com')
    .resistor('RNO', 'no', 'z', 120)
    .resistor('RNC', 'nc', 'z', 240);
  if (flyback) b.diode('D', 'g', 'c');
  return b.build();
}

/** `until` anına kadar `dt` adımlarla ilerler; rölenin ilk kez `energized` olduğu anı döndürür. */
function firstSwitch(s: CircuitSimulator, energized: boolean, until: number, dt = 1e-6): number | null {
  while (s.time < until - 1e-12) {
    s.runUntil(Math.min(until, s.time + dt));
    if (relayOf(s).energized === energized) return s.time;
  }
  return null;
}

describe('Röle: elektromıknatıs ve kontak', () => {
  it('anahtar kapanınca sargı akımı τ = L/R ile artar; palet I = V_ç/R’de, t = −τ·ln(1 − 0,7) ≈ 5,03 ms’de çekilir', () => {
    const s = new CircuitSimulator(relayCircuit(12, true));
    const tau = L_OFF / R;
    const expected = -tau * Math.log(1 - I_PULL / (12 / R));
    const t = firstSwitch(s, true, 8e-3);
    expect(t).not.toBeNull();
    // Olay konumlandırma: geçiş 1 µs'lik örnekleme içinde, beklenen anla 2 µs içinde.
    expect(Math.abs(t! - expected)).toBeLessThan(2e-6);
    expect(expected).toBeCloseTo(5.035e-3, 5);
  });

  it('çekme anında akı bağı korunur: akım L_açık / L_çekili oranında düşer (akımdaki "çukur"), sonra τ = L_çekili/R ile 43,6 mA’e çıkar', () => {
    const s = new CircuitSimulator(relayCircuit(12, true));
    const t1 = firstSwitch(s, true, 8e-3, 2e-7)!;
    const after = coilCurrent(s);
    expect(after).toBeCloseTo((I_PULL * L_OFF) / L_ON, 4);
    expect(after).toBeLessThan(0.016);
    // Çekildikten 10 ms sonra: i = I∞ − (I∞ − i₀)·e^(−Δt/τ_ç).
    const iInf = 12 / R;
    s.runUntil(t1 + 10e-3);
    const want = iInf - (iInf - after) * Math.exp(-10e-3 / (L_ON / R));
    expect(Math.abs(coilCurrent(s) - want) / want).toBeLessThan(2e-3);
    s.runUntil(0.1);
    expect(coilCurrent(s)).toBeCloseTo(iInf, 5);
    expect(relayOf(s).energized).toBe(true);
  });

  it('kontak: bırakılmışken C–NK (240 Ω: 50 mA), çekiliyken C–NA (120 Ω: 100 mA); kontak devresi sargıdan yalıtılmış', () => {
    const s = new CircuitSimulator(relayCircuit(12, true));
    s.runUntil(1e-3);
    expect(s.measure('RNC')!.current).toBeCloseTo(0.05, 4);
    expect(s.measure('RNO')!.current).toBeCloseTo(0, 9);
    s.runUntil(20e-3);
    expect(s.measure('RNO')!.current).toBeCloseTo(0.1, 4);
    expect(s.measure('RNC')!.current).toBeCloseTo(0, 9);
    expect(Math.abs(s.status('K').contactCurrent!)).toBeCloseTo(0.1, 4);
    // Sargının toprağı ile kontak devresi arasında akım yolu yok: kontak pili kendi sıfır noktasında.
    expect(s.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('histerezis: 8,3 V’ta çekmez, 8,5 V’ta çeker; çekiliyken 1,9 V’ta tutar, 1,7 V’ta bırakır', () => {
    const s = new CircuitSimulator(relayCircuit(8.3, true));
    s.runUntil(0.1);
    expect(relayOf(s).energized).toBe(false);
    s.update(relayCircuit(8.5, true));
    s.runUntil(0.2);
    expect(relayOf(s).energized).toBe(true);
    s.update(relayCircuit(1.9, true));
    s.runUntil(0.4);
    expect(relayOf(s).energized).toBe(true);
    expect(coilCurrent(s)).toBeGreaterThan(I_DROP);
    s.update(relayCircuit(1.7, true));
    s.runUntil(0.6);
    expect(relayOf(s).energized).toBe(false);
  });

  it('diyotsuz: anahtar açılınca akım mikrosaniyelerde kesilir, palet hemen bırakılır ve sargıda kilovoltluk sıçrama (Lenz uyarısı) olur', () => {
    const s = new CircuitSimulator(relayCircuit(12, true));
    s.runUntil(0.08);
    expect(relayOf(s).energized).toBe(true);
    s.update(relayCircuit(12, false));
    const t0 = s.time;
    const t = firstSwitch(s, false, t0 + 1e-3, 1e-6);
    expect(t).not.toBeNull();
    expect(t! - t0).toBeLessThan(1e-4);
    s.runUntil(t0 + 5e-3);
    expect(relayOf(s).spikeVoltage()).toBeGreaterThan(1000);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('inductor-spike');
  });

  it('serbest geçiş diyodu: akım diyot üzerinden τ ≈ L/R ile söner, palet ≈ 14 ms sonra bırakılır; bırakınca akım L oranında sıçrar, sıçrama yok', () => {
    const s = new CircuitSimulator(relayCircuit(12, true, true));
    s.runUntil(0.08);
    s.update(relayCircuit(12, false, true));
    const t0 = s.time;
    const t = firstSwitch(s, false, t0 + 0.05, 2e-7);
    expect(t).not.toBeNull();
    // L·di/dt = −(R·i + V_D): diyodun ≈ 0,6 V’u akıma ≈ 2,2 mA eklenmiş gibi davranır.
    const vd = 0.6;
    const estimate = (L_ON / R) * Math.log((12 / R + vd / R) / (I_DROP + vd / R));
    expect(t! - t0).toBeGreaterThan(0.85 * estimate);
    expect(t! - t0).toBeLessThan(1.15 * estimate);
    // Akı bağı korunur: bırakma anında akım I_b · L_çekili / L_açık’a sıçrar.
    expect(coilCurrent(s)).toBeCloseTo((I_DROP * L_ON) / L_OFF, 3);
    s.runUntil(t0 + 0.1);
    expect(relayOf(s).spikeVoltage()).toBeLessThan(13);
    expect(s.runtimeDiagnostics.map((d) => d.code)).not.toContain('inductor-spike');
  });
});

/** Örneğin belgesi ve simülatörü; `set` bir parçanın özelliklerini değiştirip devreyi günceller. */
function example(id: ExampleId) {
  let doc: CircuitDoc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  return {
    sim,
    idOf,
    relay: () => sim.device(idOf('K1')) as RelayDevice,
    set(label: string, props: Record<string, boolean>) {
      const part = doc.parts.find((p) => p.label === label)!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...props } });
      sim.update(buildConnectivity(doc).netlist);
    },
  };
}

/** Rölenin konumu `energized` olana kadar 1 µs adımlarla ilerler; geçen süreyi döndürür. */
function until(e: ReturnType<typeof example>, energized: boolean, limit: number): number {
  const t0 = e.sim.time;
  while (e.relay().energized !== energized && e.sim.time - t0 < limit) e.sim.runUntil(e.sim.time + 1e-6);
  expect(e.relay().energized).toBe(energized);
  return e.sim.time - t0;
}

describe('Röle örnekleri: metindeki sayılar', () => {
  it('Röle: S1 kapanınca ≈ 5 ms’de çeker (akım ≈ 15 mA’e düşer), kırmızı LED söner, yeşil yanar; 43,6 mA; S1 açılınca ≈ 14 ms’de bırakır', () => {
    const e = example('role');
    e.sim.runUntil(0.05);
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(e.sim.measure(e.idOf('LED2'))!.current).toBeGreaterThan(0.014);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeLessThan(1e-9);
    e.set('S1', { closed: true });
    const pull = until(e, true, 0.02);
    expect(pull).toBeGreaterThan(4.9e-3);
    expect(pull).toBeLessThan(5.2e-3);
    expect(e.sim.status(e.idOf('K1')).coil!.current).toBeCloseTo(0.0153, 3);
    e.sim.runUntil(e.sim.time + 0.1);
    expect(e.sim.measure(e.idOf('A1'))!.current).toBeCloseTo(0.0436, 3);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeGreaterThan(0.014);
    expect(e.sim.measure(e.idOf('LED2'))!.current).toBeLessThan(1e-9);
    e.set('S1', { closed: false });
    const release = until(e, false, 0.05);
    expect(release).toBeGreaterThan(13e-3);
    expect(release).toBeLessThan(15e-3);
    expect(e.sim.runtimeDiagnostics.map((d) => d.code)).not.toContain('inductor-spike');
  });

  it('Röle sürücüsü: baz akımı ≈ 0,9 mA, kollektör ≈ 0,1 V; ≈ 5 ms’de çeker, ≈ 14 ms’de bırakır; diyotsuz kollektörde ≈ 5 kV ve Lenz uyarısı', () => {
    const e = example('role-transistor');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const pull = until(e, true, 0.02);
    expect(pull).toBeGreaterThan(4.9e-3);
    expect(pull).toBeLessThan(6.5e-3);
    e.sim.runUntil(0.3);
    const q = e.sim.status(e.idOf('Q1'));
    expect(q.control!.current).toBeGreaterThan(0.85e-3);
    expect(q.control!.current).toBeLessThan(0.95e-3);
    expect(Math.abs(e.sim.measure(e.idOf('Q1'))!.voltage)).toBeLessThan(0.15);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeGreaterThan(0.009);
    // TTL 0,5 s'de düşer: palet diyot üzerinden ≈ 14 ms sonra bırakılır.
    e.sim.runUntil(0.5);
    const release = until(e, false, 0.05);
    expect(release).toBeGreaterThan(13e-3);
    expect(release).toBeLessThan(15.5e-3);
    expect(e.sim.runtimeDiagnostics.map((d) => d.code)).not.toContain('inductor-spike');
    e.set('S2', { closed: false });
    e.sim.runUntil(e.sim.time + 1.2);
    expect(e.relay().spikeVoltage()).toBeGreaterThan(4000);
    expect(e.relay().spikeVoltage()).toBeLessThan(6500);
    expect(e.sim.runtimeDiagnostics.map((d) => d.code)).toContain('inductor-spike');
  });

  it('Kendini tutma: S1 kapanıp açılınca röle çekili kalır; S2 açılınca ≈ 14 ms’de bırakır; S2 yeniden kapanınca çekmez', () => {
    const e = example('role-muhurleme');
    e.sim.runUntil(0.05);
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(e.relay().energized).toBe(false);
    e.set('S1', { closed: true });
    e.sim.runUntil(e.sim.time + 0.05);
    expect(e.relay().energized).toBe(true);
    e.set('S1', { closed: false });
    e.sim.runUntil(e.sim.time + 0.1);
    expect(e.relay().energized).toBe(true);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeGreaterThan(0.009);
    e.set('S2', { closed: false });
    const release = until(e, false, 0.05);
    expect(release).toBeGreaterThan(13e-3);
    expect(release).toBeLessThan(15e-3);
    e.sim.runUntil(e.sim.time + 0.05);
    e.set('S2', { closed: true });
    e.sim.runUntil(e.sim.time + 0.1);
    expect(e.relay().energized).toBe(false);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeLessThan(1e-9);
  });
});
