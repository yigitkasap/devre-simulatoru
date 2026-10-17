// Fizik 1: toprak isteğe bağlı. Toprak sembolü ya da topraklı cihaz yoksa her elektriksel ada için
// çözücü bir sıfır noktası (referans düğüm) seçer: önce adadaki bir kaynağın − ucu, yoksa adanın ilk
// pini. Toprak varken toprağa bağlı olmayan adalar da aynı yolla kendi sıfır noktasını alır. Her ada
// referansa tek noktadan bağlandığı için adalar arasında akım yolu oluşmaz.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, compileNetlist, type Netlist } from '../src/sim';
import { circuit } from './helpers';

/** Toprağa giden akımın üst sınırı: gmin yalnızca referanssız düğümlere eklendiği için tam 0 (Fizik 2). */
const GMIN_LEAK = 1e-15;

/** Bir grup bileşenin, toprak ağındaki uçlarından toprağa giden toplam akım. */
function currentIntoGround(s: CircuitSimulator, n: Netlist, ids: readonly string[]): number {
  const ground = s.netOf(compileNetlist(n).autoReferences[0]?.key ?? '') ?? '';
  let sum = 0;
  for (const el of n.elements) {
    if (!ids.includes(el.id)) continue;
    const pc = s.pinCurrents(el.id)!;
    el.pins.forEach((pin, k) => {
      if (s.netOf(pin) === ground) sum += pc[k]!;
    });
  }
  return sum;
}

describe('Fizik 1: toprak isteğe bağlı', () => {
  it('topraksız devre (9 V, 470 Ω, kırmızı LED): akım topraklı devreyle aynı, ≈ 15,27 mA', () => {
    const free = new CircuitSimulator(circuit().battery('B', 'a', 'n', 9).resistor('R', 'a', 'b', 470).led('L', 'b', 'n').build());
    const grounded = new CircuitSimulator(circuit().battery('B', 'a', 'n', 9).resistor('R', 'a', 'b', 470).led('L', 'b', 'n').ground('G', 'n').build());
    expect(free.advance(0).ok).toBe(true);
    grounded.advance(0);
    expect(free.measure('R')!.current).toBeCloseTo(grounded.measure('R')!.current, 12);
    expect(free.measure('R')!.current * 1e3).toBeCloseTo(15.27, 2);
    expect(free.voltageAt('n')).toBe(0);
  });

  it('topraklı devre ve yanında topraksız ikinci devre (5 V, 1 kΩ): 5 mA, iki devre arasında akım 0', () => {
    const n = circuit()
      .battery('B1', 'a', 'g', 9)
      .ground('G', 'g')
      .resistor('R1', 'a', 'g', 1000)
      .battery('B2', 'p', 'q', 5)
      .resistor('R2', 'p', 'q', 1000)
      .build();
    const s = new CircuitSimulator(n);
    expect(s.advance(0).ok).toBe(true);
    expect(s.measure('R1')!.current * 1e3).toBeCloseTo(9, 9);
    expect(s.measure('R2')!.current * 1e3).toBeCloseTo(5, 9);
    // İkinci devrenin sıfır noktasından (çözücünün referansı) giren ya da çıkan net akım yok.
    expect(Math.abs(currentIntoGround(s, n, ['B2', 'R2']))).toBeLessThan(GMIN_LEAK);
    expect(compileNetlist(n).autoReferences.map((r) => r.key)).toEqual(['q']);
  });

  it('iki topraksız ada: her biri kendi sıfır noktasını alır, aralarında akım yok', () => {
    const n = circuit().battery('B1', 'a', 'b', 9).resistor('R1', 'a', 'b', 1000).battery('B2', 'p', 'q', 5).resistor('R2', 'p', 'q', 500).build();
    const s = new CircuitSimulator(n);
    s.advance(0);
    expect(compileNetlist(n).autoReferences.map((r) => r.key)).toEqual(['b', 'q']);
    expect(s.measure('R1')!.current).toBeCloseTo(9e-3, 12);
    expect(s.measure('R2')!.current).toBeCloseTo(10e-3, 12);
    expect(Math.abs(currentIntoGround(s, n, ['B1', 'R1']))).toBeLessThan(GMIN_LEAK);
  });

  it('sıfır noktası seçimi: kaynak − ucu, yoksa ilk pin; devre değişmedikçe aynı nokta', () => {
    // Kaynaksız ada: ilk bileşenin ilk pini.
    expect(compileNetlist(circuit().resistor('R1', 'x', 'y', 10).resistor('R2', 'y', 'x', 20).build()).autoReferences[0]!.key).toBe('x');
    // Kaynak sonra gelse de − ucu seçilir.
    const n = circuit().resistor('R1', 'a', 'b', 10).battery('B', 'a', 'b', 3).build();
    expect(compileNetlist(n).autoReferences[0]!.key).toBe('b');
    // DC güç kaynağının çıkışı, topraksız fonksiyon üretecinin COM'u.
    const ps = circuit().add('dcsupply', 'PS', ['p', 'm', 'p2', 'm2'], { voltage1: 5 }).resistor('R', 'p', 'm', 100).build();
    expect(compileNetlist(ps).autoReferences.find((r) => r.elementId === 'PS')?.key).toBe('m');
    const fg = circuit().add('funcgen', 'FG', ['o', 't', 'c'], { earthed: false }).resistor('R', 'o', 'c', 100).build();
    expect(compileNetlist(fg).autoReferences[0]!.key).toBe('c');
    // Değer değişince (yapı aynı) seçim değişmez.
    const changed = circuit().resistor('R1', 'a', 'b', 99).battery('B', 'a', 'b', 7).build();
    expect(compileNetlist(changed).autoReferences[0]!.key).toBe('b');
  });

  it('topraklı cihaz (fonksiyon üreteci, osiloskop) devrenin toprağıdır: otomatik sıfır noktası yok', () => {
    const n = circuit().add('funcgen', 'FG', ['o', 't', 'c'], { earthed: true }).resistor('R', 'o', 'c', 100).build();
    expect(compileNetlist(n).autoReferences).toEqual([]);
  });

  it('açık anahtar ve ideal voltmetre adaları ayırır; gerçek osiloskop girişi birleştirir', () => {
    const open = circuit().battery('B1', 'a', 'b', 9).resistor('R1', 'a', 'b', 10).switch('S', 'a', 'x', false).battery('B2', 'x', 'y', 5).resistor('R2', 'x', 'y', 10).build();
    expect(compileNetlist(open).autoReferences).toHaveLength(2);
    const closed = circuit().battery('B1', 'a', 'b', 9).resistor('R1', 'a', 'b', 10).switch('S', 'a', 'x', true).battery('B2', 'x', 'y', 5).resistor('R2', 'x', 'y', 10).build();
    expect(compileNetlist(closed).autoReferences).toHaveLength(1);
    const ideal = circuit().battery('B1', 'a', 'b', 9).resistor('R1', 'a', 'b', 10).voltmeter('V', 'a', 'x', 'ideal').battery('B2', 'x', 'y', 5).resistor('R2', 'x', 'y', 10).build();
    expect(compileNetlist(ideal).autoReferences).toHaveLength(2);
    const scope = circuit().battery('B1', 'a', 'b', 9).resistor('R1', 'a', 'b', 10).oscilloscope('OS', 'a', 'a', 'x', { input: 'real', earthed: false }).battery('B2', 'x', 'y', 5).resistor('R2', 'x', 'y', 10).build();
    expect(compileNetlist(scope).autoReferences).toHaveLength(1);
  });
});
