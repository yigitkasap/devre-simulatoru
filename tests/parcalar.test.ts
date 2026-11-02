// Parça Dalga 1: yeni parçaların modelleri ve arayüz bağlantıları.

import { describe, expect, it } from 'vitest';
import { measureResistance } from '../src/editor/fault/meter';
import { meterRole, meterText } from '../src/editor/readouts';
import { tr } from '../src/i18n/tr';
import { planBreadboard } from '../src/bench3d/breadboard';
import { CATALOG, CATEGORIES } from '../src/model/catalog';
import { CircuitSimulator } from '../src/sim';
import { LM317 } from '../src/sim/devices/regulator';
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

describe('Schottky diyot (1N5819)', () => {
  const forward = (i: number) => {
    const sim = new CircuitSimulator(circuit().add('currentsource', 'I1', ['gnd', 'a'], { current: i }).add('schottky', 'D1', ['a', 'gnd'], { model: '1N5819' }).ground('G1', 'gnd').build());
    sim.advance(0);
    return sim.voltageAt('a') ?? NaN;
  };
  it('ileri gerilim veri sayfası tablosundaki üç noktadan geçer (0,1 A 0,34 V, 1 A 0,60 V, 3 A 0,90 V)', () => {
    expect(forward(0.1)).toBeCloseTo(0.34, 3);
    expect(forward(1)).toBeCloseTo(0.6, 3);
    expect(forward(3)).toBeCloseTo(0.9, 3);
  });

  it('10 mA’de 1N4001’den çok düşük (≈ 0,18 V ile ≈ 0,60 V); ters sızıntı ≈ 0,88 mA (tablo: en çok 1 mA)', () => {
    expect(forward(0.01)).toBeCloseTo(0.176, 2);
    const sim = new CircuitSimulator(circuit().battery('B1', 'k', 'gnd', 10).add('schottky', 'D1', ['gnd', 'k'], { model: '1N5819' }).ground('G1', 'gnd').build());
    sim.advance(0);
    const leak = -sim.measure('D1')!.current;
    expect(leak).toBeGreaterThan(0.8e-3);
    expect(leak).toBeLessThan(1e-3);
  });

  it('ters gerilim 40 V’u aşarsa uyarı', () => {
    const sim = new CircuitSimulator(circuit().battery('B1', 'k', 'gnd', 45).add('schottky', 'D1', ['gnd', 'k'], { model: '1N5819' }).ground('G1', 'gnd').build());
    sim.advance(0);
    expect(sim.runtimeDiagnostics.map((d) => d.code)).toContain('reverse-voltage');
  });
});

describe('Gerilim regülatörü 7805', () => {
  const build = (vin: number, load: number) =>
    new CircuitSimulator(circuit().battery('B1', 'in', 'gnd', vin).add('reg7805', 'U1', ['in', 'gnd', 'out']).resistor('RL', 'out', 'gnd', load).ground('G1', 'gnd').build());
  it('12 V girişte 100 Ω yükte 5 V (RO 17 mΩ), 50 mA; GND ucundan bekleme akımı 4,2 mA; harcanan güç ≈ 0,40 W', () => {
    const sim = build(12, 100);
    sim.advance(0);
    const r = sim.status('U1').regulator!;
    expect(r.output).toBeCloseTo(5 - 0.017 * 0.05, 3);
    expect(r.current).toBeCloseTo(0.05, 4);
    expect(r.dropout).toBe(false);
    const [iin, ignd, iout] = sim.pinCurrents('U1')!;
    expect(iin).toBeCloseTo(r.current + 0.0042, 9);
    expect(ignd).toBeCloseTo(-0.0042, 9);
    expect(iout).toBeCloseTo(-r.current, 9);
    expect(r.power).toBeCloseTo(7 * 0.05 + 12 * 0.0042, 3);
    expect(sim.runtimeDiagnostics.map((d) => d.code)).not.toContain('regulator-dropout');
  });

  it('6 V girişte çıkış girişin bırakma gerilimi kadar altında (Şekil 28: 50 mA’de ≈ 1,51 V) ve uyarı', () => {
    const sim = build(6, 100);
    sim.advance(0);
    const r = sim.status('U1').regulator!;
    expect(r.dropout).toBe(true);
    expect(6 - r.output).toBeCloseTo(1.514, 2);
    expect(sim.runtimeDiagnostics.map((d) => d.code)).toContain('regulator-dropout');
  });

  it('yüksüz 5,000 V; girişsiz çıkış ≈ 0', () => {
    const open = new CircuitSimulator(circuit().battery('B1', 'in', 'gnd', 9).add('reg7805', 'U1', ['in', 'gnd', 'out']).ground('G1', 'gnd').build());
    open.advance(0);
    expect(open.status('U1').regulator!.output).toBeCloseTo(5, 6);
    const off = build(0, 100);
    off.advance(0);
    expect(Math.abs(off.status('U1').regulator!.output)).toBeLessThan(1e-3);
  });

  it("breadboard'da üç ardışık delik, gerçek sıra IN, GND, OUT", () => {
    const doc = { version: 1 as const, parts: [{ id: 'u', type: 'reg7805' as const, label: 'U1', x: 0, y: 0, rotation: 0 as const, props: {} }], wires: [] };
    const at = planBreadboard(doc).onBoard.get('u')!;
    const cols = at.holes.map((h) => (h.kind === 'strip' ? h.col : -1));
    expect([cols[0]! + 1, cols[0]! + 2]).toEqual([cols[1], cols[2]]);
  });
});

describe('Ayarlı regülatör LM317', () => {
  const build = (vin: number) =>
    new CircuitSimulator(
      circuit()
        .battery('B1', 'in', 'gnd', vin)
        .add('lm317', 'U1', ['in', 'adj', 'out'], { model: 'LM317T' })
        .resistor('R1', 'out', 'adj', 240)
        .resistor('R2', 'adj', 'gnd', 720)
        .resistor('RL', 'out', 'gnd', 100)
        .ground('G1', 'gnd')
        .build(),
    );
  it('R1 240 Ω, R2 720 Ω: Vout = 1,25 · (1 + 3) = 5 V, ADJ akımı (50 µA) R2’de 36 mV ekler; OUT − ADJ = 1,25 V', () => {
    const sim = build(12);
    sim.advance(0);
    const r = sim.status('U1').regulator!;
    // OUT − ADJ = 1,25 V − RO·I (yük regülasyonu); bölücü bunu 4 katına çıkarır.
    expect(r.output).toBeCloseTo((1.25 - LM317.ro * r.current) * 4 + 50e-6 * 720, 6);
    expect(r.output).toBeCloseTo(5.035, 3);
    expect((sim.voltageAt('out') ?? NaN) - (sim.voltageAt('adj') ?? NaN)).toBeCloseTo(1.25, 3);
    expect(sim.pinCurrents('U1')![1]).toBeCloseTo(-50e-6, 9);
    expect(r.dropout).toBe(false);
  });

  it('6 V girişte giriş yetmez (55 mA’de bırakma ≈ 1,52 V): uyarı', () => {
    const sim = build(6);
    sim.advance(0);
    expect(sim.status('U1').regulator!.dropout).toBe(true);
    expect(sim.runtimeDiagnostics.map((d) => d.code)).toContain('regulator-dropout');
  });

  it("breadboard'da gerçek sıra ADJ, OUT, IN", () => {
    const doc = { version: 1 as const, parts: [{ id: 'u', type: 'lm317' as const, label: 'U1', x: 0, y: 0, rotation: 0 as const, props: { model: 'LM317T' } }], wires: [] };
    const cols = planBreadboard(doc).onBoard.get('u')!.holes.map((h) => (h.kind === 'strip' ? h.col : -1));
    expect([cols[1]! + 1, cols[1]! + 2]).toEqual([cols[2], cols[0]]);
  });
});

describe('Optokuplör (PC817)', () => {
  /** LED: 5 V, 330 Ω; çıkış: 5 V, 470 Ω kollektör yükü (ayrı toprak gibi ama aynı devre). */
  const build = (rank: string, rc: number) =>
    new CircuitSimulator(
      circuit()
        .battery('B1', 'v', 'gnd', 5)
        .resistor('R1', 'v', 'a', 330)
        .add('opto', 'U1', ['a', 'gnd', 'c', 'gnd'], { model: 'PC817', rank })
        .resistor('RC', 'v', 'c', rc)
        .ground('G1', 'gnd')
        .build(),
    );
  it('LED eğrisi (Şekil 6): 10 mA civarında ≈ 1,22 V; çıkış aktifken I_C = CTR · I_F (C sınıfı %300)', () => {
    const sim = build('C', 100e3);
    sim.advance(0);
    const o = sim.status('U1').opto!;
    expect(o.led).toBeGreaterThan(10e-3);
    expect(o.led).toBeLessThan(12e-3);
    expect(o.ledVoltage).toBeGreaterThan(1.2);
    expect(o.ledVoltage).toBeLessThan(1.25);
    // 100 kΩ yükte çıkış doyar (CTR · I_F ≈ 34 mA'yı çekemez): V_CE küçük.
    expect(o.saturated).toBe(true);
    expect(o.vce).toBeLessThan(0.15);
  });

  it('dış devre yeterince akım çekebiliyorsa I_C = CTR · I_F; sınıfa göre (A %120, D %450)', () => {
    for (const [rank, ctr] of [['A', 1.2], ['D', 4.5]] as const) {
      const sim = new CircuitSimulator(
        circuit().battery('B1', 'v', 'gnd', 5).resistor('R1', 'v', 'a', 4700).add('opto', 'U1', ['a', 'gnd', 'c', 'gnd'], { rank }).battery('B2', 'c', 'gnd', 5).ground('G1', 'gnd').build(),
      );
      sim.advance(0);
      const o = sim.status('U1').opto!;
      expect(o.output / o.led).toBeCloseTo(ctr, 6);
    }
  });

  it('doyma tablonun koşulunda: I_F = 20 mA, I_C = 1 mA iken V_CE = 0,1 V', () => {
    const sim = new CircuitSimulator(
      circuit().add('currentsource', 'I1', ['gnd', 'a'], { current: 20e-3 }).add('opto', 'U1', ['a', 'gnd', 'c', 'gnd'], { rank: 'C' }).add('currentsource', 'I2', ['gnd', 'c'], { current: 1e-3 }).ground('G1', 'gnd').build(),
    );
    sim.advance(0);
    expect(sim.status('U1').opto!.vce).toBeCloseTo(0.1, 4);
  });

  it("breadboard'da DIP-4 orta kanalın üstünde: A, K alt yarıda; E, C üst yarıda (C, A'nın karşısında)", () => {
    const doc = { version: 1 as const, parts: [{ id: 'u', type: 'opto' as const, label: 'U1', x: 0, y: 0, rotation: 0 as const, props: { rank: 'C' } }], wires: [] };
    const at = planBreadboard(doc).onBoard.get('u')!;
    expect(at.mount).toBe('dip4');
    const h = at.holes.map((x) => (x.kind === 'strip' ? [x.col, x.row] : [-1, -1]));
    expect(h[0]![1]).toBe(5);
    expect(h[1]).toEqual([h[0]![0]! + 1, 5]);
    expect(h[2]).toEqual([h[0]![0], 4]);
    expect(h[3]).toEqual([h[0]![0]! + 1, 4]);
  });
});

describe('Tristör (MCR100-6)', () => {
  /** 9 V, 470 Ω, LED, tristör; kapı 10 kΩ üstünden düğmeyle 9 V'a; anot beslemesi anahtarla. */
  const latch = (pressed: boolean, supply: boolean) =>
    circuit()
      .battery('B1', 'v', 'gnd', 9)
      .switch('S1', 'v', 's', supply)
      .resistor('R1', 's', 'l', 470)
      .led('LED1', 'l', 'a')
      .add('scr', 'SCR1', ['a', 'gnd', 'g'], { model: 'MCR100-6' })
      .add('pushbutton', 'BT1', ['v', 'p'], { contact: 'no', pressed })
      .resistor('RG', 'p', 'g', 10e3)
      .ground('G1', 'gnd')
      .build();
  it('kapıya akım verilince tetiklenir, düğme bırakılınca da iletimde kalır (mandal); anot akımı kesilince söner', () => {
    const sim = new CircuitSimulator(latch(false, true));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(false);
    expect(sim.measure('LED1')!.current).toBeLessThan(1e-6);
    sim.update(latch(true, true));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(true);
    expect(sim.status('SCR1').scr!.gate).toBeGreaterThan(40e-6);
    sim.update(latch(false, true));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(true);
    const led = sim.measure('LED1')!.current;
    expect(led).toBeGreaterThan(10e-3);
    // İletim gerilimi (Şekil 6'nın uzantısı) ≈ 0,8 V.
    const vak = sim.measure('SCR1')!.voltage;
    expect(vak).toBeGreaterThan(0.75);
    expect(vak).toBeLessThan(0.85);
    sim.update(latch(false, false));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(false);
    sim.update(latch(false, true));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(false);
  });

  it('anot akımı tutma akımına yetmiyorsa (yük 1 MΩ) kapı bırakılınca keser', () => {
    const weak = (pressed: boolean) =>
      circuit().battery('B1', 'v', 'gnd', 9).resistor('RL', 'v', 'a', 1e6).add('scr', 'SCR1', ['a', 'gnd', 'g'], {}).add('pushbutton', 'BT1', ['v', 'p'], { pressed }).resistor('RG', 'p', 'g', 10e3).ground('G1', 'gnd').build();
    const sim = new CircuitSimulator(weak(true));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(true);
    sim.update(weak(false));
    sim.advance(0.01);
    expect(sim.status('SCR1').scr!.on).toBe(false);
  });

  it("breadboard'da üç ardışık delik, gerçek sıra K, G, A", () => {
    const doc = { version: 1 as const, parts: [{ id: 's', type: 'scr' as const, label: 'SCR1', x: 0, y: 0, rotation: 0 as const, props: {} }], wires: [] };
    const cols = planBreadboard(doc).onBoard.get('s')!.holes.map((h) => (h.kind === 'strip' ? h.col : -1));
    // Pin sırası A, K, G: K en solda, sonra G, en sağda A.
    expect([cols[1]! + 1, cols[1]! + 2]).toEqual([cols[2], cols[0]]);
  });
});
