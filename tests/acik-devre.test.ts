// Fizik 2: açık devrede akım tam 0. gmin (1e-12 S) yalnızca referansa hiçbir iletken yolu olmayan
// düğüm gruplarına, her gruba tek noktadan eklenir; kablosu eksik ya da anahtarı açık bir devrede
// ampermetre, parça akımları ve akım animasyonu tam olarak 0'dır (|I| < 1e-15 A, ekranda 0).

import { describe, expect, it } from 'vitest';
import { meterText } from '../src/editor/readouts';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { circuit } from './helpers';

const ZERO = 1e-15;

/** KCL artığı: her ağa giren akımların toplamının en büyüğü, en büyük pin akımına oranla. */
function kcl(s: CircuitSimulator, n: Netlist): number {
  const byNet = new Map<string, number>();
  let scale = 0;
  for (const el of n.elements) {
    const pc = s.pinCurrents(el.id);
    if (!pc) continue;
    el.pins.forEach((pin, k) => {
      const net = s.netOf(pin) ?? pin;
      byNet.set(net, (byNet.get(net) ?? 0) + (pc[k] ?? 0));
      scale = Math.max(scale, Math.abs(pc[k] ?? 0));
    });
  }
  return Math.max(...byNet.values(), 0) / scale;
}

describe('Fizik 2: açık devrede akım tam 0', () => {
  it('9 V, ampermetre, 1 kΩ ve ucu boşta LED: ampermetre tam 0 gösterir, parçalardan akım geçmez', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', 9).ground('G', 'g').ammeter('A', 'a', 'x').resistor('R', 'x', 'y', 1000).led('L', 'y', 'z').build());
    expect(s.advance(0).ok).toBe(true);
    const reading = s.status('A').reading!;
    expect(Math.abs(reading)).toBeLessThan(ZERO);
    for (const id of ['A', 'R', 'L', 'B']) expect(Math.abs(s.measure(id)!.current)).toBeLessThan(ZERO);
    const part = { id: 'A', type: 'ammeter' as const, label: 'A1', x: 0, y: 0, rotation: 0 as const, props: { ideal: false, resistance: 0.1, mode: 'dc' } };
    expect(meterText(part, s.measure('A')!, s.status('A'))).toBe('0,000 A');
  });

  it('ideal ampermetre ve kablosu eksik devre de tam 0', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', 9).ground('G', 'g').ammeter('A', 'a', 'x', 'ideal').resistor('R', 'x', 'y', 470).build());
    s.advance(0);
    expect(Math.abs(s.status('A').reading!)).toBeLessThan(ZERO);
    expect(Math.abs(s.measure('R')!.current)).toBeLessThan(ZERO);
    // Uç boşta olduğu için direncin iki ucu da 9 V'ta: üzerinde gerilim yok.
    expect(s.voltageAt('y')).toBeCloseTo(9, 12);
  });

  it('açık anahtar: uçlarında 9 V, akım tam 0', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', 9).ground('G', 'g').switch('S', 'a', 'b', false).resistor('R', 'b', 'g', 1000).ammeter('A', 'g', 'g2').build());
    s.advance(0);
    expect(s.measure('S')!.voltage).toBeCloseTo(9, 12);
    expect(s.measure('S')!.current).toBe(0);
    expect(Math.abs(s.measure('R')!.current)).toBeLessThan(ZERO);
    expect(Math.abs(s.measure('B')!.current)).toBeLessThan(ZERO);
  });

  it('geçici çözümde de: kondansatörlü devrede ucu boşta kol akım çekmez', () => {
    const s = new CircuitSimulator(
      circuit().battery('B', 'a', 'g', 10).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 1e-6).resistor('R2', 'c', 'open', 1000).build(),
    );
    s.runUntil(0.01);
    expect(Math.abs(s.measure('R2')!.current)).toBeLessThan(ZERO);
    expect(s.measure('C')!.voltage).toBeCloseTo(10, 2);
  });

  it('ideal voltmetrenin arkasındaki ayrı devre: kendi akımı doğru, toprağa kaçak yok', () => {
    const n = circuit()
      .battery('B1', 'a', 'g', 9)
      .ground('G', 'g')
      .resistor('R1', 'a', 'g', 1000)
      .voltmeter('V', 'a', 'p', 'ideal')
      .battery('B2', 'p', 'q', 5)
      .resistor('R2', 'p', 'q', 500)
      .build();
    const s = new CircuitSimulator(n);
    s.advance(0);
    expect(s.measure('R2')!.current).toBeCloseTo(10e-3, 14);
    expect(s.measure('R1')!.current).toBeCloseTo(9e-3, 14);
    expect(kcl(s, n)).toBeLessThan(1e-12);
  });

  it('BJT devresinde KCL: doğru akım çözümü bir Newton adımıyla cilalanır (artık < 1e-12)', () => {
    const n = circuit().battery('B', 'v', 'g', 9).ground('G', 'g').resistor('RB', 'v', 'b', 430e3).resistor('RC', 'v', 'c', 1000).add('npn', 'Q', ['c', 'b', 'g'], { model: 'BC107' }).build();
    const s = new CircuitSimulator(n);
    s.advance(0);
    expect(kcl(s, n)).toBeLessThan(1e-12);
  });

  it('KCL ve enerji korunumu artıkları (gmin kaçağı yok): köprüde < 1e-12', () => {
    const n = circuit().battery('B', 'A', 'g', 10).ground('G', 'g')
      .resistor('R1', 'A', 'B', 1000).resistor('R2', 'B', 'g', 2000).resistor('R3', 'A', 'C', 3000).resistor('R4', 'C', 'g', 4000).resistor('R5', 'B', 'C', 5000).build();
    const s = new CircuitSimulator(n);
    s.advance(0);
    expect(kcl(s, n)).toBeLessThan(1e-12);
    const sum = ['B', 'R1', 'R2', 'R3', 'R4', 'R5'].reduce((acc, id) => acc + s.measure(id)!.power, 0);
    expect(Math.abs(sum / s.measure('B')!.power)).toBeLessThan(1e-12);
  });
});
