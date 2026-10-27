// Canlı ölçümlerin kararlı gösterimi: salınan değerler (AC, 555'in kare dalgası) titremeden
// pencere özetiyle (≈ etkin değer / ortalama, durumlar ⇄), sabit ve tek yönde değişen değerler
// canlı gösterilir; hesaplanamayan değer "hesaplanamıyor" yazar.

import { describe, expect, it } from 'vitest';
import { LiveWindow, stableMeterText, stableReadout } from '../src/editor/liveReadout';
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
