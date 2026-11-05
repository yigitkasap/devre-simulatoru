// Dalga 2: lojik entegreler ve 7 segment gösterge. Doğruluk tabloları (74HC ve 74LS), eşiklerin ve
// çıkış gerilimlerinin veri sayfasıyla karşılaştırılması (yük altında V_OH / V_OL), boştaki giriş,
// beslemesiz entegre, yanma, gecikme, flip-flop, sayıcı, kod çözücü ve göstergenin aşırı akımda yanması.

import { describe, expect, it } from 'vitest';
import { GATE_CHIPS, GATE_CHIP_TYPES, LOGIC_CHIPS, SEVEN_SEGMENT_CODES, gateModels, gateOutput, type LogicChipType } from '../src/model/logicChips';
import { CircuitSimulator } from '../src/sim';
import { SEG7 } from '../src/sim/devices/display7';
import { circuit } from './helpers';

type Builder = ReturnType<typeof circuit>;

/** Entegrenin düğümleri: verilen bacaklar adlandırılmış düğümlerde, öbürleri kendi (boş) düğümünde. */
function pins(type: LogicChipType, given: Record<number, string>): string[] {
  return Array.from({ length: LOGIC_CHIPS[type].names.length }, (_, i) => given[i + 1] ?? `u${i + 1}`);
}

/** Beslemeli devre: VCC düğümü `vcc`, toprak `gnd`. */
function powered(vcc = 5): Builder {
  return circuit().battery('B1', 'vcc', 'gnd', vcc, 0).ground('G1', 'gnd');
}

function run(c: Builder, time = 2e-6): CircuitSimulator {
  const sim = new CircuitSimulator(c.build());
  sim.advance(time);
  return sim;
}

const codes = (sim: CircuitSimulator) => sim.runtimeDiagnostics.map((d) => d.code);

describe('Kapı entegreleri: doğruluk tablosu (74HC ve 74LS)', () => {
  for (const type of GATE_CHIP_TYPES) {
    for (const model of gateModels(type)) {
      it(`${model}: her kapı, her giriş birleşimi`, () => {
        const chip = GATE_CHIPS[type];
        const n = chip.gates[0]!.inputs.length;
        for (let combo = 0; combo < 2 ** n; combo++) {
          const ins = Array.from({ length: n }, (_, k) => (combo >> (n - 1 - k)) & 1);
          const given: Record<number, string> = { 7: 'gnd', 14: 'vcc' };
          for (const g of chip.gates) g.inputs.forEach((p, k) => (given[p] = ins[k] ? 'vcc' : 'gnd'));
          const sim = run(powered().add(type, 'U1', pins(type, given), { model }));
          const l = sim.status('U1').logic!;
          for (const g of chip.gates) expect(l.levels[g.output - 1], `${model} ${ins.join('')} → ${g.output}. bacak`).toBe(gateOutput(chip.kind, ins));
        }
      });
    }
  }
});

describe('Eşikler ve çıkış gerilimleri (veri sayfası)', () => {
  /** 7404'ün 1A girişi `vin`'de; 1Y'nin okuduğu seviye ve kartın durumu. */
  const inverter = (model: string, vcc: number, vin: number) => {
    const sim = run(powered(vcc).battery('BI', 'in', 'gnd', vin, 0).add('ic7404', 'U1', pins('ic7404', { 1: 'in', 2: 'y', 7: 'gnd', 14: 'vcc' }), { model }).resistor('RL', 'y', 'gnd', 1e6));
    const l = sim.status('U1').logic!;
    return { level: l.levels[0], state: l.pins[0]!.state, sim };
  };

  it('74HC (4,5 V): V_IL 1,35 V → 0, V_IH 3,15 V → 1, arası belirsiz ve uyarılı', () => {
    expect(inverter('74HC04', 4.5, 1.35)).toMatchObject({ level: 0, state: 'low' });
    expect(inverter('74HC04', 4.5, 3.15)).toMatchObject({ level: 1, state: 'high' });
    const mid = inverter('74HC04', 4.5, 2.4);
    expect(mid.state).toBe('undefined');
    const w = mid.sim.runtimeDiagnostics.find((d) => d.code === 'logic-input-undefined');
    expect(w?.params).toMatchObject({ pin: 1, vil: 1.35, vih: 3.15 });
  });

  it('74HC (2 V ve 6 V): eşikler tablodaki noktalarda (0,5 / 1,5 V ve 1,8 / 4,2 V)', () => {
    expect(inverter('74HC04', 2, 0.5).state).toBe('low');
    expect(inverter('74HC04', 2, 1.5).state).toBe('high');
    expect(inverter('74HC04', 6, 1.8).state).toBe('low');
    expect(inverter('74HC04', 6, 4.2).state).toBe('high');
  });

  it('74LS (5 V): V_IL 0,8 V → 0, V_IH 2 V → 1', () => {
    expect(inverter('74LS04', 5, 0.8)).toMatchObject({ level: 0, state: 'low' });
    expect(inverter('74LS04', 5, 2)).toMatchObject({ level: 1, state: 'high' });
    expect(inverter('74LS04', 5, 1.4).state).toBe('undefined');
  });

  it('CD4017B (5 / 10 V): V_IL 1,5 / 3 V, V_IH 3,5 / 7 V (RESET girişi)', () => {
    for (const [vdd, vil, vih] of [[5, 1.5, 3.5], [10, 3, 7]] as const) {
      const state = (v: number) =>
        run(powered(vdd).battery('BR', 'r', 'gnd', v, 0).add('cd4017', 'U1', pins('cd4017', { 8: 'gnd', 16: 'vcc', 13: 'gnd', 14: 'gnd', 15: 'r' }))).status('U1').logic!.pins[14]!.state;
      expect(state(vil)).toBe('low');
      expect(state(vih)).toBe('high');
    }
  });

  /** 7408'in 1Y'si (1) yük direnciyle toprağa, 2Y'si (0) çekme direnciyle VCC'ye. */
  const loaded = (model: string, vcc: number, rHigh: number, rLow: number) => {
    const sim = run(
      powered(vcc)
        .add('ic7408', 'U1', pins('ic7408', { 1: 'vcc', 2: 'vcc', 3: 'y', 4: 'gnd', 5: 'gnd', 6: 'z', 7: 'gnd', 14: 'vcc' }), { model })
        .resistor('RH', 'y', 'gnd', rHigh)
        .resistor('RZ', 'vcc', 'z', rLow),
    );
    const l = sim.status('U1').logic!;
    return { voh: l.pins[2]!.voltage, vol: l.pins[5]!.voltage, sim };
  };

  it('74HC08 (4,5 V): I_OH −4 mA’de V_OH 4,3 V, I_OL 4 mA’de V_OL 0,17 V (tipik)', () => {
    const { voh, vol } = loaded('74HC08', 4.5, 4.3 / 4e-3, (4.5 - 0.17) / 4e-3);
    expect(voh).toBeCloseTo(4.3, 3);
    expect(vol).toBeCloseTo(0.17, 3);
  });

  it('74HC08 (6 V): I_OH −5,2 mA’de 5,8 V, I_OL 5,2 mA’de 0,15 V (tipik)', () => {
    const { voh, vol } = loaded('74HC08', 6, 5.8 / 5.2e-3, (6 - 0.15) / 5.2e-3);
    expect(voh).toBeCloseTo(5.8, 3);
    expect(vol).toBeCloseTo(0.15, 3);
  });

  it('74LS08 (4,75 V): I_OH −0,4 mA’de 3,4 V, I_OL 4 mA’de 0,25 V (tipik)', () => {
    const { voh, vol } = loaded('74LS08', 4.75, 3.4 / 0.4e-3, (4.75 - 0.25) / 4e-3);
    expect(voh).toBeCloseTo(3.4, 3);
    expect(vol).toBeCloseTo(0.25, 3);
  });

  it('kısa devre ve aşırı yük: 74HC08’in 1 çıkışı 10 Ω’la toprağa: gerilim düşer, 25 mA aşılınca uyarı', () => {
    const { voh, sim } = loaded('74HC08', 5, 10, 1e6);
    expect(voh).toBeLessThan(1);
    const w = sim.runtimeDiagnostics.find((d) => d.code === 'pin-overcurrent');
    expect(w?.params?.pin).toBe(3);
    expect(w?.params?.current).toBeGreaterThan(25e-3);
    // 74LS: kısa devre akımı I_OS aralığının ortasında (−60 mA, V_CC = 5,25 V).
    const ls = loaded('74LS08', 5.25, 1e-3, 1e6);
    expect(ls.voh / 1e-3).toBeCloseTo(60e-3, 3);
  });

  it('CD4511B: segment çıkışı 5 V’ta 10 mA’de 4,10 V, 20 mA’de 3,75 V (tipik)', () => {
    for (const [i, v] of [[10e-3, 4.1], [20e-3, 3.75]] as const) {
      const sim = run(
        powered(5)
          .add('cd4511', 'U1', pins('cd4511', { 1: 'gnd', 2: 'gnd', 3: 'vcc', 4: 'vcc', 5: 'gnd', 6: 'gnd', 7: 'gnd', 8: 'gnd', 16: 'vcc', 13: 'a' }))
          .resistor('RA', 'a', 'gnd', v / i),
      );
      expect(sim.status('U1').logic!.pins[12]!.voltage).toBeCloseTo(v, 3);
    }
  });
});

describe('Boştaki giriş ve besleme', () => {
  it('74HC: bağlı olmayan ya da sürülmeyen (açık anahtar) giriş: "CMOS giriş boşta" uyarısı; 0 V sayılır', () => {
    const open = run(
      powered()
        .add('switch', 'S1', ['vcc', 'a'], { closed: false })
        .add('ic7408', 'U1', pins('ic7408', { 1: 'a', 2: 'vcc', 3: 'y', 4: 'gnd', 5: 'gnd', 7: 'gnd', 9: 'gnd', 10: 'gnd', 12: 'gnd', 13: 'gnd', 14: 'vcc' }), { model: '74HC08' })
        .resistor('RL', 'y', 'gnd', 1e5),
    );
    const l = open.status('U1').logic!;
    expect(l.pins[0]!.state).toBe('floating');
    expect(l.levels[2]).toBe(0);
    expect(open.runtimeDiagnostics.filter((d) => d.code === 'logic-input-floating').map((d) => d.params?.pin)).toEqual([1]);
    // 10 kΩ aşağı çekme direnciyle uyarı kalkar.
    const pulled = run(
      powered()
        .add('switch', 'S1', ['vcc', 'a'], { closed: false })
        .resistor('RP', 'a', 'gnd', 10e3)
        .add('ic7408', 'U1', pins('ic7408', { 1: 'a', 2: 'vcc', 3: 'y', 4: 'gnd', 5: 'gnd', 7: 'gnd', 9: 'gnd', 10: 'gnd', 12: 'gnd', 13: 'gnd', 14: 'vcc' }), { model: '74HC08' })
        .resistor('RL', 'y', 'gnd', 1e5),
    );
    expect(codes(pulled)).not.toContain('logic-input-floating');
    expect(pulled.status('U1').logic!.pins[0]!.state).toBe('low');
  });

  it('74LS: boştaki giriş ≈ 2,59 V’ta kalır ve 1 okunur (uyarı yok); I_IL −0,4 mA', () => {
    const sim = run(powered().add('ic7408', 'U1', pins('ic7408', { 2: 'vcc', 3: 'y', 4: 'gnd', 5: 'gnd', 7: 'gnd', 9: 'gnd', 10: 'gnd', 12: 'gnd', 13: 'gnd', 14: 'vcc' }), { model: '74LS08' }).resistor('RL', 'y', 'gnd', 1e5));
    const l = sim.status('U1').logic!;
    expect(l.pins[0]!.voltage).toBeCloseTo(2.59, 2);
    expect(l.levels[0]).toBe(1);
    expect(l.levels[2]).toBe(1);
    expect(codes(sim)).not.toContain('logic-input-floating');
    // 0,4 V'taki girişin verdiği akım: −0,4 mA.
    const low = run(powered().battery('BI', 'i', 'gnd', 0.4, 0).add('ic7408', 'U1', pins('ic7408', { 1: 'i', 2: 'vcc', 7: 'gnd', 14: 'vcc' }), { model: '74LS08' }));
    expect(low.measure('BI')!.current).toBeCloseTo(0.4e-3, 6);
  });

  it('beslemesiz entegre: çıkışlar sürülmez, "entegre beslenmiyor" uyarısı', () => {
    const sim = run(powered().add('ic7408', 'U1', pins('ic7408', { 1: 'vcc', 2: 'vcc', 3: 'y', 7: 'gnd' }), { model: '74HC08' }).resistor('RL', 'y', 'gnd', 1e4));
    const l = sim.status('U1').logic!;
    expect(l.powered).toBe(false);
    expect(l.pins[2]!.state).toBe('off');
    expect(l.pins[2]!.voltage).toBeCloseTo(0, 6);
    expect(codes(sim)).toContain('logic-unpowered');
  });

  it('besleme aralığı: 74LS 5,5 V’ta uyarı; 74HC 7 V’u (mutlak en büyük) aşınca yanar', () => {
    expect(codes(run(powered(5.5).add('ic7408', 'U1', pins('ic7408', { 7: 'gnd', 14: 'vcc' }), { model: '74LS08' })))).toContain('logic-supply-range');
    const burned = run(powered(8).add('ic7408', 'U1', pins('ic7408', { 1: 'vcc', 2: 'vcc', 3: 'y', 7: 'gnd', 14: 'vcc' }), { model: '74HC08' }).resistor('RL', 'y', 'gnd', 1e4));
    expect(burned.status('U1').burned).toBe(true);
    expect(burned.status('U1').logic!.powered).toBe(false);
    const d = burned.runtimeDiagnostics.find((x) => x.code === 'ic-burned');
    expect(d?.params).toMatchObject({ supply: 8, limit: 7 });
  });
});

describe('Yayılma gecikmesi', () => {
  /** 7404'ün girişine 1 MHz kare dalga; girişin eşiği geçmesiyle çıkışın değişmesi arasındaki süre. */
  const delay = (model: string, vcc: number) => {
    const sim = new CircuitSimulator(
      powered(vcc)
        .add('acsource', 'S1', ['in', 'gnd'], { waveform: 'square', frequency: 1e6, amplitude: vcc / 2, offset: vcc / 2, internalResistance: 0 })
        .add('ic7404', 'U1', pins('ic7404', { 1: 'in', 2: 'y', 7: 'gnd', 14: 'vcc' }), { model })
        .resistor('RL', 'y', 'gnd', 1e6)
        .build(),
    );
    const edges: Array<{ t: number; input: number | null; output: number | null }> = [];
    let prev: { input: number | null; output: number | null } | null = null;
    for (let k = 0; k < 3000; k++) {
      sim.advance(1e-9);
      const l = sim.status('U1').logic!;
      const now = { input: l.levels[0]!, output: l.levels[1]! };
      if (prev && (now.input !== prev.input || now.output !== prev.output)) edges.push({ t: sim.time, ...now });
      prev = now;
    }
    // İlk düşen giriş kenarından sonra çıkışın yükselmesi (t_PLH) ve ilk yükselen kenardan sonra düşmesi (t_PHL).
    const fall = edges.find((e) => e.input === 0)!;
    const rise = edges.find((e) => e.t > fall.t && e.output === 1)!;
    const up = edges.find((e) => e.t > rise.t && e.input === 1)!;
    const down = edges.find((e) => e.t > up.t && e.output === 0)!;
    return { lh: rise.t - fall.t, hl: down.t - up.t };
  };

  it('74HC04 (4,5 V): t_pd 9 ns; 74LS04: t_PLH 9 ns, t_PHL 10 ns (1 ns çözünürlükle)', () => {
    const hc = delay('74HC04', 4.5);
    expect(hc.lh).toBeCloseTo(9e-9, 8.7);
    expect(hc.hl).toBeCloseTo(9e-9, 8.7);
    const ls = delay('74LS04', 5);
    expect(ls.lh).toBeCloseTo(9e-9, 8.7);
    expect(ls.hl).toBeCloseTo(10e-9, 8.7);
  });
});

describe('7474: D flip-flop', () => {
  /** 1. flip-flop: D, PRĒ, CLR̄ sabit; saat 1 kHz kare dalga (ilk yarım periyot 1, ilk yükselen kenar 1 ms'de) ya da 0. */
  const ff = (model: string, d: number, pre: number, clr: number, clock: boolean): Builder =>
    powered()
      .add('ic7474', 'U1', pins('ic7474', { 1: clr ? 'vcc' : 'gnd', 2: d ? 'vcc' : 'gnd', 3: clock ? 'clk' : 'gnd', 4: pre ? 'vcc' : 'gnd', 5: 'q', 6: 'qn', 7: 'gnd', 10: 'vcc', 11: 'gnd', 12: 'gnd', 13: 'vcc', 14: 'vcc' }), { model })
      .add('acsource', 'S1', ['clk', 'gnd'], { waveform: 'square', frequency: 1e3, amplitude: 2.5, offset: 2.5, internalResistance: 0 })
      .resistor('RQ', 'q', 'gnd', 1e6)
      .resistor('RN', 'qn', 'gnd', 1e6);
  const outs = (sim: CircuitSimulator) => {
    const l = sim.status('U1').logic!;
    return [l.levels[4], l.levels[5]];
  };

  for (const model of gateModels('ic7474')) {
    it(`${model}: Q yalnızca CLK’ın yükselen kenarında D’yi alır; Q̄ tersi`, () => {
      const sim = new CircuitSimulator(ff(model, 1, 1, 1, true).build());
      sim.advance(0.9e-3);
      expect(outs(sim)).toEqual([0, 1]);
      sim.advance(0.2e-3);
      expect(outs(sim)).toEqual([1, 0]);
      expect(sim.status('U1').logic!.q).toEqual([1, 0]);
      // D = 0 iken kenar gelmedikçe Q değişmez.
      const hold = new CircuitSimulator(ff(model, 0, 1, 1, false).build());
      hold.advance(2e-3);
      expect(outs(hold)).toEqual([0, 1]);
    });

    it(`${model}: PRĒ = 0 → Q = 1, CLR̄ = 0 → Q = 0 (saatsiz); ikisi 0 iken Q ve Q̄ ikisi de 1`, () => {
      expect(outs(run(ff(model, 0, 0, 1, false)))).toEqual([1, 0]);
      expect(outs(run(ff(model, 1, 1, 0, true), 1.5e-3))).toEqual([0, 1]);
      expect(outs(run(ff(model, 0, 0, 0, false)))).toEqual([1, 1]);
    });
  }

  it('frekans bölücü (Q̄ → D): çıkış saatin yarı frekansında', () => {
    const sim = new CircuitSimulator(
      powered()
        .add('ic7474', 'U1', pins('ic7474', { 1: 'vcc', 2: 'qn', 3: 'clk', 4: 'vcc', 5: 'q', 6: 'qn', 7: 'gnd', 10: 'vcc', 11: 'gnd', 12: 'gnd', 13: 'vcc', 14: 'vcc' }), { model: '74HC74' })
        .add('acsource', 'S1', ['clk', 'gnd'], { waveform: 'square', frequency: 1e3, amplitude: 2.5, offset: 2.5, internalResistance: 0 })
        .resistor('RQ', 'q', 'gnd', 1e6)
        .build(),
    );
    const q: number[] = [];
    sim.advance(0.5e-3);
    for (let k = 0; k < 8; k++) {
      sim.advance(1e-3);
      q.push(sim.status('U1').logic!.q![0]!);
    }
    // Her yükselen kenarda (1, 2, 3 … ms) Q döner; kenarların arasında (1,5; 2,5 … ms) okunur: 1, 0, 1, 0 …
    expect(q).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
  });
});

describe('CD4017B: onluk sayıcı', () => {
  /** Saat 1 kHz kare dalga (ilk yükselen kenar 1 ms'de); RESET ve INH sabit. */
  const counter = (rst: string, inh: string): Builder =>
    powered()
      .add('acsource', 'S1', ['clk', 'gnd'], { waveform: 'square', frequency: 1e3, amplitude: 2.5, offset: 2.5, internalResistance: 0 })
      .add('cd4017', 'U1', pins('cd4017', { 8: 'gnd', 16: 'vcc', 14: 'clk', 13: inh, 15: rst, 12: 'co' }))
      .resistor('RC', 'co', 'gnd', 1e6);
  const outputs = LOGIC_CHIPS.cd4017.outputs;

  it('her yükselen kenarda bir sayar; yalnız sayımın çıkışı 1; CO 0–4’te 1, 5–9’da 0; 10’da başa döner', () => {
    const sim = new CircuitSimulator(counter('gnd', 'gnd').build());
    sim.advance(0.5e-3);
    for (let n = 0; n <= 12; n++) {
      const l = sim.status('U1').logic!;
      const count = n % 10;
      expect(l.count, `${n}. kenardan sonra`).toBe(count);
      expect(outputs.slice(0, 10).map((p) => l.levels[p - 1])).toEqual(Array.from({ length: 10 }, (_, k) => (k === count ? 1 : 0)));
      expect(l.levels[11]).toBe(count < 5 ? 1 : 0);
      sim.advance(1e-3);
    }
  });

  it('RESET 1 iken 0’da kalır; CLOCK INHIBIT 1 iken saymaz', () => {
    expect(run(counter('vcc', 'gnd'), 5.5e-3).status('U1').logic!.count).toBe(0);
    expect(run(counter('gnd', 'vcc'), 5.5e-3).status('U1').logic!.count).toBe(0);
    expect(run(counter('gnd', 'gnd'), 5.5e-3).status('U1').logic!.count).toBe(5);
  });
});

describe('CD4511B: BCD → 7 segment', () => {
  /** A…D kodu, LT̄, BL̄, LE; a…g çıkışları 10 kΩ'la toprağa. */
  const decoder = (code: number, lt = 1, bl = 1, le = 0): Builder => {
    const bit = (k: number) => ((code >> k) & 1 ? 'vcc' : 'gnd');
    let c = powered().add(
      'cd4511',
      'U1',
      pins('cd4511', { 7: bit(0), 1: bit(1), 2: bit(2), 6: bit(3), 3: lt ? 'vcc' : 'gnd', 4: bl ? 'vcc' : 'gnd', 5: le ? 'vcc' : 'gnd', 8: 'gnd', 16: 'vcc', 13: 'sa', 12: 'sb', 11: 'sc', 10: 'sd', 9: 'se', 15: 'sf', 14: 'sg' }),
    );
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) c = c.resistor(`R${s}`, `s${s}`, 'gnd', 1e4);
    return c;
  };
  const segments = (sim: CircuitSimulator) => {
    const l = sim.status('U1').logic!;
    return LOGIC_CHIPS.cd4511.outputs.map((p) => l.levels[p - 1]);
  };

  it('0–9 kodları veri sayfasının tablosundaki segmentler (6 ve 9 kuyruksuz); gösterilen rakam', () => {
    for (let d = 0; d <= 9; d++) {
      const sim = run(decoder(d));
      expect(segments(sim), `${d}`).toEqual([...SEVEN_SEGMENT_CODES[d]!]);
      expect(sim.status('U1').logic!.digit).toBe(d);
    }
    expect(SEVEN_SEGMENT_CODES[6]![0]).toBe(0);
    expect(SEVEN_SEGMENT_CODES[9]![3]).toBe(0);
  });

  it('9’dan büyük kod ve BL̄ = 0 karartır; LT̄ = 0 bütün segmentleri yakar (BL̄’den önce)', () => {
    for (let d = 10; d <= 15; d++) expect(segments(run(decoder(d)))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(segments(run(decoder(5, 1, 0)))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(run(decoder(5, 1, 0)).status('U1').logic!.digit).toBeNull();
    expect(segments(run(decoder(5, 0, 0)))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('LE = 1 iken mandal son kodu tutar', () => {
    // LE açılışta 1: mandal açılıştaki 0 kodunda kalır, girişteki 7 görünmez.
    expect(run(decoder(7, 1, 1, 1)).status('U1').logic!.digit).toBe(0);
  });
});

describe('7 segment gösterge (SC56-11EWA)', () => {
  /** a segmenti R üzerinden 5 V'a; ortak katot toprakta. */
  const display = (r: number) => run(powered().resistor('R1', 'vcc', 'a', r).add('seg7', 'DS1', ['a', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'gnd']), 1e-6);

  it('10 mA’de ileri gerilim 1,9 V (veri sayfası, tipik)', () => {
    const r = (5 - SEG7.forwardVoltage) / SEG7.testCurrent;
    const d = display(r).status('DS1').display!;
    expect(d.currents[0]).toBeCloseTo(10e-3, 5);
    expect(d.brightness[0]).toBeCloseTo(1, 6);
    expect(d.brightness[1]).toBe(0);
  });

  it('30 mA’in üstünde segment yanar (açık devre), uyarı; ön dirençle yanmaz', () => {
    const sim = display(47);
    const d = sim.status('DS1').display!;
    expect(d.burned[0]).toBe(true);
    expect(d.currents[0]).toBe(0);
    const w = sim.runtimeDiagnostics.find((x) => x.code === 'segment-burned');
    expect(w?.params?.segment).toBe(0);
    expect(w?.params?.current).toBeGreaterThan(30e-3);
    expect(display(330).status('DS1').display!.burned[0]).toBe(false);
  });
});
