// Canlı ölçümlerin kararlı gösterimi: salınan değerler (AC, 555'in kare dalgası) titremeden
// pencere özetiyle (≈ etkin değer / ortalama, durumlar ⇄), sabit ve tek yönde değişen değerler
// canlı gösterilir; hesaplanamayan değer "hesaplanamıyor" yazar.

import { describe, expect, it } from 'vitest';
import { LiveWindow, NodeWindow, stableMeterText, stableReadout, stableValue } from '../src/editor/liveReadout';
import type { Part } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

const part = (id: string, type: Part['type'], props: Part['props'] = {}): Part => ({ id, type, label: id, x: 0, y: 0, rotation: 0, props }) as Part;

/** Arayüz gibi kare kare ilerletir; her karede izlenen parçanın bilgi kutusunu döndürür. */
function frames(sim: CircuitSimulator, p: Part, count: number, dt = 1 / 60, meter = false) {
  sim.watch([p.id]);
  const window = new LiveWindow();
  const out: string[][] = [];
  const texts: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    expect(sim.advance(dt, 6000).ok).toBe(true);
    window.add(sim.watchedStats(p.id), dt);
    const m = sim.measure(p.id)!;
    const r = stableReadout(p, m, sim.status(p.id), window.summary);
    out.push(r!.rows.map((row) => `${row.label}: ${row.value}`));
    if (meter) texts.push(stableMeterText(p, m, sim.status(p.id), window.summary));
  }
  return { rows: out, texts, last: out[out.length - 1]! };
}

describe('Canlı ölçümler: kararlı gösterim', () => {
  it('AC devrede direnç: gerilim ≈ etkin değer (7,07 V), kareden kareye değişmiyor', () => {
    const sim = new CircuitSimulator(
      circuit().acsource('AC1', 'a', 'gnd', { amplitude: 10, frequency: 50 }).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).build(),
    );
    const { rows, last } = frames(sim, part('R1', 'resistor', { resistance: 1000 }), 60);
    expect(last[0]).toMatch(/^Gerilim: ≈ 7,0\d\d V$/);
    expect(last[1]).toMatch(/^Akım: ≈ 7,0\d\d mA$/);
    // Güç: ortalama V²/R = 50 mW (pencere tam periyot sayısı değil: %1).
    const power = Number(/≈ ([\d,]+) mW/.exec(last[2]!)![1]!.replace(',', '.'));
    expect(Math.abs(power - 50)).toBeLessThan(0.5);
    // Pencere içinde (0,4 s = 24 kare) değer aynı kalır.
    expect(new Set(rows.slice(30, 50).map((r) => r[0])).size).toBeLessThanOrEqual(2);
  });

  it('yükü asimetrik AC (diyotlu yük, 50 Ω çıkış direnci): etkin değer işaretsiz; tek kutuplu değer işaretli', () => {
    // 1N4001 X-Y örneğindeki gibi: üretecin çıkışı (o) pozitif yarıda biraz düşer, ortalaması hafif
    // negatif olur; "≈ −3,4 V" değil "≈ 3,4 V" yazmalı. Ters diyotlu dirençte yalnızca negatif yarı
    // dalga var: işaret kalır.
    const base = () => circuit().acsource('AC1', 's', 'gnd', { amplitude: 5, frequency: 50 }).ground('G1', 'gnd').resistor('R50', 's', 'o', 50).resistor('RP', 'o', 'gnd', 1e6);
    const forward = () => base().diode('D1', 'o', 'k').resistor('R1', 'k', 'gnd', 1000).build();
    const reverse = () => base().diode('D2', 'n', 'o').resistor('R2', 'n', 'gnd', 1000).build();
    const out = frames(new CircuitSimulator(forward()), part('RP', 'resistor', { resistance: 1e6 }), 60).last;
    expect(out[0]).toMatch(/^Gerilim: ≈ 3,\d+ V$/);
    // Üretecin kartındaki satır (stableValue): ölçümün kendisi işaretli.
    const value = (build: typeof forward, id: string) => {
      const sim = new CircuitSimulator(build());
      sim.watch([id]);
      const window = new LiveWindow();
      for (let i = 0; i < 60; i++) {
        expect(sim.advance(1 / 60, 6000).ok).toBe(true);
        window.add(sim.watchedStats(id), 1 / 60);
      }
      return stableValue(sim.measure(id)!.voltage, window.summary?.get('m.voltage'));
    };
    const symmetric = value(forward, 'RP');
    expect(symmetric.approx).toBe(true);
    expect(symmetric.value).toBeGreaterThan(3.2);
    const halfWave = value(reverse, 'R2');
    expect(halfWave.approx).toBe(true);
    expect(halfWave.value).toBeLessThan(-1);
  });

  it('kablo gerilimi (1N4001 X-Y örneği gibi): karenin ortalaması oynasa da pencere ortalaması sabit; uçlar her adımdan', () => {
    // Toprak diyot ile direnç arasında: üretecin iki ucu da salınır, karenin (1/60 s, 16,7 periyot)
    // ortalaması kareden kareye oynar (−1,2 … −1,5 V).
    const sim = new CircuitSimulator(
      circuit().acsource('AC1', 's', 'com', { amplitude: 5, frequency: 1000 }).resistor('R50', 's', 'o', 50).diode('D1', 'o', 'gnd').ground('G1', 'gnd').resistor('R1', 'gnd', 'com', 1000).build(),
    );
    const window = new NodeWindow();
    const frameMeans: number[] = [];
    const summaries: string[] = [];
    for (let i = 0; i < 60; i++) {
      expect(sim.advance(1 / 60, 20000).ok).toBe(true);
      const mean = sim.averageVoltageAt('o')!;
      const range = sim.voltageRangeAt('o')!;
      // Uçlar her adımdan: diyodun iletimdeki gerilimi ve ters yöndeki tepe.
      expect(range.max).toBeGreaterThan(0.5);
      expect(range.max).toBeLessThan(0.9);
      expect(range.min).toBeLessThan(-4.8);
      frameMeans.push(mean);
      window.add({ mean, min: range.min, max: range.max, end: sim.voltageAt('o')! }, 1 / 60);
      if (i >= 30) summaries.push(`${window.summary!.mean.toFixed(3)} ${window.summary!.varying}`);
    }
    // Karenin ortalaması oynuyor (etiket bu yüzden titriyordu); pencerenin özeti 0,4 s'de bir değişir.
    expect(Math.max(...frameMeans.slice(10)) - Math.min(...frameMeans.slice(10))).toBeGreaterThan(0.05);
    expect(new Set(summaries).size).toBeLessThanOrEqual(3);
    expect(window.summary!.varying).toBe(true);
    expect(window.summary!.mean).toBeLessThan(-1);
    expect(window.summary!.mean).toBeGreaterThan(-1.6);
    expect(window.summary!.min).toBeLessThan(-4.8);
    expect(window.summary!.max).toBeGreaterThan(0.5);
  });

  it('kablo gerilimi: sabit ve tek yönde değişen değer salınım sayılmaz (canlı gösterilir)', () => {
    const steady = new NodeWindow();
    for (let i = 0; i < 30; i++) steady.add({ mean: 9, min: 9, max: 9, end: 9 }, 1 / 60);
    expect(steady.summary!.varying).toBe(false);
    // Dolan kondansatör: kare başına 0,05 V artış.
    const ramp = new NodeWindow();
    for (let i = 0; i < 30; i++) ramp.add({ mean: i * 0.05 + 0.025, min: i * 0.05, max: (i + 1) * 0.05, end: (i + 1) * 0.05 }, 1 / 60);
    expect(ramp.summary!.varying).toBe(false);
    // Hızlı kare dalga, karede bir anlık örnekle (AC kaynaksız 555): salınım; ortalama ≈ doluluk × yüksek.
    const square = new NodeWindow();
    for (let i = 0; i < 30; i++) {
      const v = (i * 7) % 3 === 0 ? 0 : 9;
      square.add({ mean: v, min: v, max: v, end: v }, 1 / 60);
    }
    expect(square.summary!.varying).toBe(true);
    expect(square.summary!.min).toBe(0);
    expect(square.summary!.max).toBe(9);
  });

  it('DC devre: değerler canlı ve işaretsiz (≈ yok)', () => {
    const sim = new CircuitSimulator(circuit().battery('B1', 'a', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'a', 'gnd', 1000).build());
    const { last } = frames(sim, part('R1', 'resistor', { resistance: 1000 }), 5);
    expect(last[0]).toBe('Gerilim: 9,000 V');
  });

  it('dolan kondansatör (tek yönde değişim) canlı akar, ≈ almaz', () => {
    const sim = new CircuitSimulator(
      circuit().battery('B1', 'a', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'a', 'b', 100e3).capacitor('C1', 'b', 'gnd', 10e-6).build(),
    );
    const { rows } = frames(sim, part('C1', 'capacitor', { capacitance: 10e-6 }), 30);
    expect(rows.every((r) => !r[0]!.includes('≈'))).toBe(true);
    expect(new Set(rows.map((r) => r[0])).size).toBeGreaterThan(20);
  });

  it('555 (≈ 990 Hz): çıkış "Yüksek ⇄ Düşük", karta göre titremez', () => {
    const b = circuit().battery('B', 'v', 'g', 9).ground('G', 'g').resistor('RA', 'v', 'd', 1e3).resistor('RB', 'd', 't', 10e3).capacitor('C', 't', 'g', 68e-9);
    const sim = new CircuitSimulator(b.capacitor('CV', 'cv', 'g', 10e-9).resistor('RL', 'o', 'g', 10e3).add('timer555', 'U', ['g', 't', 'o', 'v', 'cv', 't', 'd', 'v']).build());
    const { rows, last } = frames(sim, part('U', 'timer555'), 40);
    expect(last[0]).toMatch(/^Çıkış: (Yüksek|Düşük) · .* ⇄ (Yüksek|Düşük) · /);
    expect(new Set(rows.slice(25, 40).map((r) => r[0])).size).toBeLessThanOrEqual(2);
  });

  it('555 çıkışındaki DC voltmetre ortalamayı gösterir (≈ doluluk × yüksek seviye)', () => {
    const b = circuit().battery('B', 'v', 'g', 9).ground('G', 'g').resistor('RA', 'v', 'd', 1e3).resistor('RB', 'd', 't', 10e3).capacitor('C', 't', 'g', 68e-9);
    const sim = new CircuitSimulator(
      b.capacitor('CV', 'cv', 'g', 10e-9).resistor('RL', 'o', 'g', 10e3).add('timer555', 'U', ['g', 't', 'o', 'v', 'cv', 't', 'd', 'v']).voltmeter('V1', 'o', 'g').build(),
    );
    const { texts } = frames(sim, part('V1', 'voltmeter', { mode: 'dc' }), 40, 1 / 60, true);
    const values = texts.slice(25).map((t) => Number(t!.replace(/[^\d,]/g, '').replace(',', '.')));
    // Yüksek ≈ 7,6 V, doluluk ≈ %52 → ortalama ≈ 4 V; pencere içinde sabit.
    for (const v of values) expect(v).toBeGreaterThan(3.5);
    for (const v of values) expect(v).toBeLessThan(4.6);
    expect(new Set(texts.slice(25)).size).toBeLessThanOrEqual(2);
  });

  it('hesaplanamayan değer "hesaplanamıyor" yazar', () => {
    const r = stableReadout(part('R1', 'resistor', { resistance: 1000 }), { voltage: Number.NaN, current: Number.POSITIVE_INFINITY, power: 0 }, {}, null);
    expect(r!.rows[0]!.value).toBe('hesaplanamıyor');
    expect(r!.rows[1]!.value).toBe('hesaplanamıyor');
    expect(r!.rows[2]!.value).not.toBe('hesaplanamıyor');
  });
});
