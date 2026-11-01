// Parça Dalga 1: yeni parçaların modelleri ve arayüz bağlantıları.

import { describe, expect, it } from 'vitest';
import { measureResistance } from '../src/editor/fault/meter';
import { meterRole, meterText } from '../src/editor/readouts';
import { tr } from '../src/i18n/tr';
import { planBreadboard } from '../src/bench3d/breadboard';
import { CATALOG, CATEGORIES } from '../src/model/catalog';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

const reading = (sim: CircuitSimulator, id: string) => sim.status(id).reading ?? NaN;

describe('Multimetre (MM)', () => {
  /** 9 V pil, 1 kΩ + 2 kΩ gerilim bölücü; multimetre 2 kΩ'un uçlarında ya da seri. */
  const divider = (mode: string, across: boolean) => {
    const c = circuit().battery('B1', 'a', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'a', 'm', 1000);
    return across
      ? c.resistor('R2', 'm', 'gnd', 2000).add('multimeter', 'MM1', ['m', 'gnd'], { mode })
      : c.add('multimeter', 'MM1', ['m', 'n'], { mode }).resistor('R2', 'n', 'gnd', 2000);
  };

  it('V ⎓ kipinde devredeki voltmetreyle aynı (10 MΩ): bölücünün ucu ≈ 6 V', () => {
    const sim = new CircuitSimulator(divider('dc', true).voltmeter('V1', 'm', 'gnd').build());
    sim.advance(0);
    expect(reading(sim, 'MM1')).toBeCloseTo(reading(sim, 'V1'), 9);
    // İki 10 MΩ'luk alet bölücüyü biraz yükler (5,9992 V).
    expect(reading(sim, 'MM1')).toBeCloseTo(6, 2);
  });

  it('A kipinde devredeki ampermetreyle aynı (0,1 Ω, seri): 3 mA; uyarı yok', () => {
    const sim = new CircuitSimulator(divider('a', false).ammeter('A1', 'x', 'y').build());
    sim.advance(0);
    expect(reading(sim, 'MM1')).toBeCloseTo(9 / 3000.1, 9);
    expect(sim.topologyDiagnostics.map((d) => d.code)).not.toContain('multimeter-parallel');
  });

  it('A kipinde parçaya paralel bağlanırsa uyarı (o parçayı kısa devre eder)', () => {
    const sim = new CircuitSimulator(divider('a', true).build());
    const d = sim.topologyDiagnostics.find((x) => x.code === 'multimeter-parallel');
    expect(d?.elementIds).toEqual(['MM1', 'R2']);
    // Pilin iki ucuna: aynı uyarı (ampermetrenin "pil" uyarısı multimetrede tekrar çıkmaz).
    const across = new CircuitSimulator(circuit().battery('B1', 'a', 'gnd', 9, 1).ground('G1', 'gnd').add('multimeter', 'MM1', ['a', 'gnd'], { mode: 'a' }).build());
    expect(across.topologyDiagnostics.map((x) => x.code)).toEqual(['multimeter-parallel']);
  });

  it('Ω kipinde simülasyonda devreden çıkar (açık devre); durmuşken B2 ölçümüyle 2 kΩ', () => {
    const netlist = divider('ohm', true).build();
    const sim = new CircuitSimulator(netlist);
    sim.advance(0);
    expect(sim.measure('R2')!.voltage).toBeCloseTo(6, 9);
    expect(sim.measure('MM1')!.current).toBe(0);
    // Güç kapalı: pil çıkar, R1'in öbür ucu boşta kalır → yalnızca R2.
    expect(measureResistance(netlist, 'm', 'gnd')).toBeCloseTo(2000, 3);
  });

  it('meterRole ve meterText kipe göre: V ⎓ "V", A "A", Ω okumaz', () => {
    const part = (mode: string) => ({ id: 'MM1', type: 'multimeter' as const, label: 'MM1', x: 0, y: 0, rotation: 0 as const, props: { mode } });
    expect(meterRole(part('dc'))).toBe('voltmeter');
    expect(meterRole(part('ac'))).toBe('voltmeter');
    expect(meterRole(part('a'))).toBe('ammeter');
    expect(meterRole(part('ohm'))).toBe('ohm');
    const m = { voltage: 5, current: 0.002, power: 0.01 };
    expect(meterText(part('dc'), m, { reading: 5 })).toBe('5,000 V');
    expect(meterText(part('a'), m, { reading: 0.002 })).toBe('2,000 mA');
    expect(meterText(part('ohm'), m, {})).toBeNull();
  });

  it('katalog ve Parça ekle: Ölçü aletleri grubunda, MM öneki, uçlar VΩ ve COM', () => {
    expect(CATALOG.multimeter.labelPrefix).toBe('MM');
    expect(CATEGORIES.find((c) => c.id === 'meters')!.types).toContain('multimeter');
    expect(tr.devices.pinShort.multimeter).toEqual(['VΩ', 'COM']);
  });
});

describe('DC akım kaynağı (I)', () => {
  it('1 mA, 1 kΩ dirençte 1 V (Ohm yasası); akım 2. uçtan çıkar, uçlarındaki gerilimi dış devre belirler', () => {
    const sim = new CircuitSimulator(circuit().add('currentsource', 'I1', ['gnd', 'a'], { current: 1e-3 }).resistor('R1', 'a', 'gnd', 1000).ground('G1', 'gnd').build());
    sim.advance(0);
    expect(sim.voltageAt('a')).toBeCloseTo(1, 9);
    expect(sim.measure('I1')!.current).toBeCloseTo(1e-3, 12);
    expect(sim.measure('R1')!.current).toBeCloseTo(1e-3, 12);
    expect(sim.topologyDiagnostics.map((d) => d.code)).not.toContain('current-source-open');
    // Direnç iki katına çıkınca gerilim de iki katı (akım sabit).
    const twice = new CircuitSimulator(circuit().add('currentsource', 'I1', ['gnd', 'a'], { current: 1e-3 }).resistor('R1', 'a', 'gnd', 2000).ground('G1', 'gnd').build());
    twice.advance(0);
    expect(twice.voltageAt('a')).toBeCloseTo(2, 9);
  });

  it('açık devrede uyarı; akım vermez, gerilim sonsuza gitmez', () => {
    const sim = new CircuitSimulator(
      circuit().add('currentsource', 'I1', ['gnd', 'a'], { current: 1e-3 }).resistor('R1', 'a', 'b', 1000).switch('S1', 'b', 'gnd', false).ground('G1', 'gnd').build(),
    );
    expect(sim.topologyDiagnostics.find((d) => d.code === 'current-source-open')?.elementIds).toEqual(['I1']);
    expect(sim.advance(0).ok).toBe(true);
    expect(sim.measure('I1')!.current).toBe(0);
    expect(Math.abs(sim.voltageAt('a') ?? NaN)).toBeLessThan(1e-6);
  });

  it('Parça ekle: Kaynaklar grubunda, I öneki', () => {
    expect(CATALOG.currentsource.labelPrefix).toBe('I');
    expect(CATEGORIES.find((c) => c.id === 'sources')!.types).toContain('currentsource');
  });
});

describe('Basmalı düğme (BT)', () => {
  const build = (contact: string, pressed: boolean) =>
    new CircuitSimulator(circuit().battery('B1', 'a', 'gnd', 5).ground('G1', 'gnd').add('pushbutton', 'BT1', ['a', 'b'], { contact, pressed }).resistor('R1', 'b', 'gnd', 1000).build());
  it('normalde açık: basılıyken iletir; normalde kapalı: basılıyken açılır', () => {
    for (const [contact, pressed, on] of [['no', false, false], ['no', true, true], ['nc', false, true], ['nc', true, false]] as const) {
      const sim = build(contact, pressed);
      sim.advance(0);
      expect(sim.measure('R1')!.current, `${contact} ${pressed}`).toBeCloseTo(on ? 5 / 1000 : 0, 6);
      expect(sim.status('BT1').pressed).toBe(pressed);
    }
  });

  it("breadboard'da orta kanalın iki yanında: uçlar d ve g satırında aynı sütunda, ikizler iki sütun yanda", () => {
    const doc = {
      version: 1 as const,
      parts: [{ id: 'bt', type: 'pushbutton' as const, label: 'BT1', x: 0, y: 0, rotation: 0 as const, props: { contact: 'no' } }],
      wires: [],
    };
    const at = planBreadboard(doc).onBoard.get('bt')!;
    expect(at.mount).toBe('button');
    const [p0, p1] = at.holes.map((h) => (h.kind === 'strip' ? h : { col: -1, row: -1 })) as [{ col: number; row: number }, { col: number; row: number }];
    expect([p0.row, p1.row, p0.col === p1.col]).toEqual([3, 6, true]);
    expect(at.extraHoles!.map((h) => (h.kind === 'strip' ? [h.col - p0.col, h.row] : null))).toEqual([[2, 3], [2, 6]]);
  });
});

describe('Çift yollu anahtar (SPDT)', () => {
  const build = (to: string) =>
    new CircuitSimulator(
      circuit().battery('B1', 'c', 'gnd', 5).ground('G1', 'gnd').add('spdt', 'S1', ['c', 'a', 'b'], { to }).resistor('RA', 'a', 'gnd', 1000).resistor('RB', 'b', 'gnd', 1000).build(),
    );
  it('C, A ya da B ile birleşir; öbür uçtan akım geçmez', () => {
    for (const to of ['a', 'b']) {
      const sim = build(to);
      sim.advance(0);
      expect(sim.measure('RA')!.current).toBeCloseTo(to === 'a' ? 5e-3 : 0, 6);
      expect(sim.measure('RB')!.current).toBeCloseTo(to === 'b' ? 5e-3 : 0, 6);
      const pins = sim.pinCurrents('S1')!;
      expect(pins[to === 'a' ? 2 : 1]).toBe(0);
    }
  });

  it("breadboard'da üç ardışık delik, gerçek bacak sırası A, C, B (ortak uç ortada)", () => {
    const doc = { version: 1 as const, parts: [{ id: 's', type: 'spdt' as const, label: 'S1', x: 0, y: 0, rotation: 0 as const, props: { to: 'a' } }], wires: [] };
    const at = planBreadboard(doc).onBoard.get('s')!;
    const cols = at.holes.map((h) => (h.kind === 'strip' ? h.col : -1));
    // Pin sırası C, A, B: A en solda, C ortada, B en sağda.
    expect(cols[1]! + 1).toBe(cols[0]);
    expect(cols[0]! + 1).toBe(cols[2]);
  });
});

describe('Köprü diyot (KBP307)', () => {
  it('her diyot DOWO eğrisine uydu: 10 mA ≈ 0,63 V, 1 A ≈ 0,93 V, 3 A ≈ 1,06 V (eğri 0,64 / 0,93 / 1,07)', () => {
    for (const [i, vf] of [[0.01, 0.64], [1, 0.93], [3, 1.07]] as const) {
      // Akım kaynağıyla ~₁ → + diyodu (öbür diyotlar ters ya da boşta).
      const sim = new CircuitSimulator(circuit().add('currentsource', 'I1', ['gnd', 'ac'], { current: i }).add('bridge', 'BR1', ['ac', 'gnd', 'x', 'y']).ground('G1', 'gnd').build());
      sim.advance(0);
      expect(Math.abs((sim.voltageAt('ac') ?? NaN) - vf)).toBeLessThan(0.02);
    }
  });

  it('tam dalga: giriş hangi yönde olursa olsun çıkış + − − pozitif, iki diyot gerilimi kadar düşük', () => {
    for (const sign of [1, -1]) {
      const sim = new CircuitSimulator(
        circuit().battery('B1', 'a', 'b', 5 * sign).add('bridge', 'BR1', ['a', 'p', 'b', 'n']).resistor('RL', 'p', 'n', 1000).ground('G1', 'n').build(),
      );
      sim.advance(0);
      const out = sim.measure('BR1')!;
      expect(out.voltage).toBeGreaterThan(3.8);
      expect(out.voltage).toBeLessThan(3.95);
      expect(out.current).toBeCloseTo(out.voltage / 1000, 9);
    }
  });

  it("breadboard'da dört ardışık delik, gerçek sıra + ~ ~ −", () => {
    const doc = { version: 1 as const, parts: [{ id: 'br', type: 'bridge' as const, label: 'BR1', x: 0, y: 0, rotation: 0 as const, props: { model: 'KBP307' } }], wires: [] };
    const at = planBreadboard(doc).onBoard.get('br')!;
    const cols = at.holes.map((h) => (h.kind === 'strip' ? h.col : -1));
    // Pin sırası ~, +, ~, −: + en solda, sonra ~ (üst), ~ (alt), −.
    expect([cols[1]! + 1, cols[1]! + 2, cols[1]! + 3]).toEqual([cols[0], cols[2], cols[3]]);
  });
});
