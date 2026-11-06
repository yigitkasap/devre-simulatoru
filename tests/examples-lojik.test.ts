// Lojik devreler örnekleri (Dalga 2): metinlerdeki sayılar simülasyonda ölçülür; Tahtada kur planı kurulur.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import type { ExampleId } from '../src/examples';
import { tr } from '../src/i18n/tr';
import { buildConnectivity } from '../src/model/connectivity';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import type { Netlist } from '../src/sim/netlist';
import { idOf, load, withProps } from './ornek-yardimci';

/** Devrenin netlist'i; `pressed` içindeki düğmeler basılı tutuluyor (arayüzdeki gibi). */
function netlist(doc: CircuitDoc, pressed: readonly string[] = []): Netlist {
  const ids = new Set(pressed.map((label) => idOf(doc, label)));
  const n = buildConnectivity(doc).netlist;
  return { ...n, elements: n.elements.map((e) => (ids.has(e.id) ? { ...e, props: { ...e.props, pressed: true } } : e)) };
}

function run(doc: CircuitDoc, until: number): CircuitSimulator {
  const sim = new CircuitSimulator(netlist(doc));
  expect(sim.runUntil(until).ok).toBe(true);
  return sim;
}

const text = (id: ExampleId) => {
  const t = tr.examples.texts[id];
  return `${t.description} ${t.purpose ?? ''}`;
};
const mA = (sim: CircuitSimulator, doc: CircuitDoc, label: string) => sim.measure(idOf(doc, label))!.current * 1e3;
const logic = (sim: CircuitSimulator, doc: CircuitDoc, label: string) => sim.status(idOf(doc, label)).logic!;
const switches = (doc: CircuitDoc, states: Record<string, boolean>) => Object.entries(states).reduce((d, [l, c]) => withProps(d, l, { closed: c }), doc);

describe('Lojik devreler örnekleri: metinlerdeki sayılar', { timeout: 120_000 }, () => {
  it('VE kapısı: 1 · 1’de 1Y 4,60 V, LED 8,59 mA; öbür satırlarda söner; 74LS08’de 10 kΩ girişi 1,67 V’a çeker (1 okunur), 1 kΩ 0,40 V’a', () => {
    const doc = load('ve-kapisi');
    for (const [a, b] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const d = switches(doc, { S1: a, S2: b });
      const sim = run(d, 1e-3);
      const l = logic(sim, d, 'U1');
      expect(l.levels[2]).toBe(a && b ? 1 : 0);
      if (a && b) {
        expect(l.pins[2]!.voltage).toBeCloseTo(4.6, 2);
        expect(mA(sim, d, 'LED1')).toBeCloseTo(8.59, 2);
        // Çıkışın içindeki düşüm ≈ 46 Ω.
        expect((5 - l.pins[2]!.voltage) / (mA(sim, d, 'LED1') / 1e3)).toBeCloseTo(46, 0);
      } else expect(mA(sim, d, 'LED1')).toBeLessThan(1e-6);
      expect(sim.runtimeDiagnostics).toEqual([]);
    }
    const ls = switches(withProps(doc, 'U1', { model: '74LS08' }), { S2: false });
    const open = run(ls, 1e-3);
    const l = logic(open, ls, 'U1');
    expect(l.pins[1]!.voltage).toBeCloseTo(1.67, 2);
    expect(l.pins[1]!.state).toBe('undefined');
    expect(l.levels[2]).toBe(1);
    expect(l.pins[2]!.voltage).toBeCloseTo(3.35, 2);
    expect(mA(open, ls, 'LED1')).toBeCloseTo(4.93, 2);
    const strong = withProps(ls, 'R2', { resistance: 1e3 });
    const pulled = run(strong, 1e-3);
    expect(logic(pulled, strong, 'U1').pins[1]!.voltage).toBeCloseTo(0.4, 2);
    expect(logic(pulled, strong, 'U1').levels[2]).toBe(0);
    for (const s of ['4,60 V', '≈ 46 Ω', '8,59 mA', '1,67 V', '3,35 V', '4,93 mA', '0,40 V', '≈ 2,6 V']) expect(text('ve-kapisi')).toContain(s);
  });

  it('NAND ile DEĞİL ve VE: LED1 = A VE B (7,74 mA), LED2 = DEĞİL A (8,59 mA)', () => {
    const doc = load('nand-kapilar');
    for (const [a, b] of [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ] as const) {
      const d = switches(doc, { S1: a, S2: b });
      const sim = run(d, 1e-3);
      expect(mA(sim, d, 'LED1') > 1, `VE ${a} ${b}`).toBe(a && b);
      expect(mA(sim, d, 'LED2') > 1, `DEĞİL ${a}`).toBe(!a);
      if (a && b) expect(mA(sim, d, 'LED1')).toBeCloseTo(7.74, 2);
      if (!a) expect(mA(sim, d, 'LED2')).toBeCloseTo(8.59, 2);
      expect(sim.runtimeDiagnostics).toEqual([]);
    }
    for (const s of ['7,74 mA', '8,59 mA']) expect(text('nand-kapilar')).toContain(s);
  });

  it('Yarım toplayıcı: toplam ÖZEL VEYA (7,74 mA), elde VE (8,59 mA)', () => {
    const doc = load('yarim-toplayici');
    for (const [a, b] of [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ] as const) {
      const d = switches(doc, { S1: a, S2: b });
      const sim = run(d, 1e-3);
      expect(mA(sim, d, 'LED1') > 1, `S ${a} ${b}`).toBe(a !== b);
      expect(mA(sim, d, 'LED2') > 1, `C ${a} ${b}`).toBe(a && b);
      if (a !== b) expect(mA(sim, d, 'LED1')).toBeCloseTo(7.74, 2);
      if (a && b) expect(mA(sim, d, 'LED2')).toBeCloseTo(8.59, 2);
      expect(sim.runtimeDiagnostics).toEqual([]);
    }
    for (const s of ['7,74 mA', '8,59 mA']) expect(text('yarim-toplayici')).toContain(s);
  });

  it('SR mandal: BT2 siler, BT1 kurar, bırakınca kalır; ikisine birden basınca Q = Q̅ = 1; açılışta Q = 1', () => {
    const doc = load('sr-mandal');
    const sim = new CircuitSimulator(netlist(doc));
    expect(sim.runUntil(1e-3).ok).toBe(true);
    const q = () => [logic(sim, doc, 'U1').levels[5], logic(sim, doc, 'U1').levels[2]];
    expect(q()).toEqual([1, 0]);
    const step = (pressed: readonly string[], expected: number[]) => {
      sim.update(netlist(doc, pressed));
      expect(sim.advance(0.05).ok).toBe(true);
      expect(q(), pressed.join('+') || 'bırak').toEqual(expected);
    };
    step(['BT2'], [0, 1]);
    step([], [0, 1]);
    step(['BT1'], [1, 0]);
    expect(mA(sim, doc, 'LED1')).toBeCloseTo(8.59, 2);
    step([], [1, 0]);
    step(['BT1', 'BT2'], [1, 1]);
    step([], [1, 0]);
    expect(text('sr-mandal')).toContain('8,59 mA');
  });

  it('Frekans bölücü: saat 968 Hz (1,03 ms), Q 484 Hz', () => {
    const doc = load('frekans-bolucu');
    const sim = run(doc, 5e-3);
    const id = idOf(doc, 'U2');
    const clock: number[] = [];
    const flips: number[] = [];
    let lastClk = sim.status(id).logic!.levels[2];
    let lastQ = sim.status(id).logic!.q![0];
    while (sim.time < 25e-3) {
      expect(sim.advance(2e-6).ok).toBe(true);
      const l = sim.status(id).logic!;
      if (l.levels[2] === 1 && lastClk === 0) clock.push(sim.time);
      if (l.q![0] !== lastQ) flips.push(sim.time);
      lastClk = l.levels[2];
      lastQ = l.q![0];
    }
    const period = (t: number[]) => (t[t.length - 1]! - t[0]!) / (t.length - 1);
    expect(1 / period(clock)).toBeCloseTo(968, 0);
    expect(period(clock) * 1e3).toBeCloseTo(1.03, 2);
    expect(1 / (2 * period(flips))).toBeCloseTo(484, 0);
    for (const s of ['968 Hz', '1,03 ms', '484 Hz', '≈ 986 Hz', '≈ 18 ns']) expect(text('frekans-bolucu')).toContain(s);
  });

  it('Yürüyen ışık: adım 213 ms (4,69 Hz), yanan LED 3,29 mA, sırayla LED0 … LED9', () => {
    const doc = load('yuruyen-isik');
    const sim = run(doc, 0.5);
    const id = idOf(doc, 'U2');
    let last = sim.status(id).logic!.count!;
    const steps: number[] = [];
    while (sim.time < 3) {
      expect(sim.advance(1e-3).ok).toBe(true);
      const c = sim.status(id).logic!.count!;
      if (c !== last) {
        expect(c).toBe((last + 1) % 10);
        steps.push(sim.time);
        // Yalnızca sayımın LED'i yanar.
        for (let k = 0; k < 10; k++) expect(mA(sim, doc, `LED${k}`) > 1, `LED${k}`).toBe(k === c);
      }
      last = c;
    }
    const period = (steps[steps.length - 1]! - steps[0]!) / (steps.length - 1);
    expect(period * 1e3).toBeCloseTo(213, -1);
    expect(1 / period).toBeCloseTo(4.69, 1);
    expect(mA(sim, doc, `LED${last}`)).toBeCloseTo(3.29, 2);
    for (const s of ['213 ms', '4,69 Hz', '3,29 mA', '≈ 4,8 Hz']) expect(text('yuruyen-isik')).toContain(s);
  });

  it('BCD → 7 segment: 0–9 rakamları, segment başına 10,0 mA (çıkış 4,10 V); 9’dan büyükte söner; ön dirençsiz segment yanar', () => {
    const doc = load('bcd-7-segment');
    for (let code = 0; code < 16; code++) {
      const d = ['S1', 'S2', 'S3', 'S4'].reduce((x, l, k) => withProps(x, l, { to: (code >> k) & 1 ? 'b' : 'a' }), doc);
      const sim = run(d, 1e-3);
      const display = sim.status(idOf(d, 'DS1')).display!;
      expect(logic(sim, d, 'U1').digit).toBe(code <= 9 ? code : null);
      const lit = display.currents.filter((c) => c > 1e-3);
      if (code > 9) expect(lit).toEqual([]);
      for (const c of lit) expect(c * 1e3).toBeCloseTo(10, 1);
      expect(sim.runtimeDiagnostics).toEqual([]);
    }
    const five = run(doc, 1e-3);
    expect(logic(five, doc, 'U1').digit).toBe(5);
    expect(logic(five, doc, 'U1').pins[12]!.voltage).toBeCloseTo(4.1, 2);
    const bare = run(withProps(doc, 'Ra', { resistance: 0.01 }), 1e-3);
    expect(bare.status(idOf(doc, 'DS1')).display!.burned[0]).toBe(true);
    for (const s of ['10,0 mA', '4,10 V', '1,90 V', '2,20 V', '30 mA']) expect(text('bcd-7-segment')).toContain(s);
  });

  it('her örneğin Tahtada kur planı kurulur (bütün parçalar tahtada ya da masada)', () => {
    for (const id of ['ve-kapisi', 'nand-kapilar', 'yarim-toplayici', 'sr-mandal', 'frekans-bolucu', 'yuruyen-isik', 'bcd-7-segment'] as const) {
      const doc = load(id);
      const plan = planBreadboard(doc);
      const placed = new Set([...plan.onBoard.keys(), ...plan.table.keys()]);
      console.log(id, 'tahta', plan.boards, 'sütun', plan.cols);
      for (const p of doc.parts) if (p.type !== 'ground') expect(placed.has(p.id), `${id}: ${p.label}`).toBe(true);
    }
  });
});
