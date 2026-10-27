// Föy parçalarının modelleri (1N4001, BC107, BF245A, IRF510): veri sayfası değerleri, yük
// depolama (kapasite, ters toparlanma) ve eski kayıtların (model özelliği yok) eski davranışı.

import { describe, expect, it } from 'vitest';
import { CATALOG, partProp, withProp } from '../src/model/catalog';
import { CircuitSimulator, type PropValue } from '../src/sim';
import { depletionCharge } from '../src/sim/devices/junction';
import { DIODE_MODEL_PARAMS } from '../src/sim/devices/diode';
import { circuit } from './helpers';

function solve(builder: ReturnType<typeof circuit>): CircuitSimulator {
  const sim = new CircuitSimulator(builder.build());
  const result = sim.advance(0);
  expect(result.error).toBeUndefined();
  return sim;
}

/** `duration` boyunca `slice` adımlarla ilerleyip bir büyüklüğün uç değerlerini bulur. */
function swing(sim: CircuitSimulator, value: () => number, duration: number, slice: number): { max: number; min: number } {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  const end = sim.time + duration;
  while (sim.time < end - 1e-15) {
    expect(sim.advance(slice).ok).toBe(true);
    const v = value();
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  return { max, min };
}

describe('1N4001', () => {
  it('ileri gerilim veri sayfasının tipik eğrisinde: 10 mA’de 0,60 V, 100 mA’de 0,72 V; 1 kΩ ve 5 V ile ≈ 4,4 mA', () => {
    const point = (current: number) => {
      const sim = solve(circuit().ground('G', 'gnd').battery('B', 'a', 'gnd', 100).resistor('R', 'a', 'd', 100 / current).add('diode', 'D', ['d', 'gnd'], { model: '1N4001' }));
      return sim.measure('D')!;
    };
    expect(point(10e-3).voltage).toBeCloseTo(0.6, 2);
    expect(point(100e-3).voltage).toBeCloseTo(0.72, 2);
    const föy = solve(circuit().ground('G', 'gnd').battery('B', 'a', 'gnd', 5).resistor('R', 'a', 'd', 1000).add('diode', 'D', ['d', 'gnd'], { model: '1N4001' }));
    const m = föy.measure('D')!;
    expect(m.current).toBeGreaterThan(4.4e-3);
    expect(m.current).toBeLessThan(4.5e-3);
    expect(m.voltage).toBeGreaterThan(0.54);
    expect(m.voltage).toBeLessThan(0.57);
  });

  it('eklem kapasitesi veri sayfası eğrisine yakın: 0 V’ta 30 pF, 4 V’ta ≈ 14 pF, 10 V’ta ≈ 10 pF', () => {
    const p = DIODE_MODEL_PARAMS['1N4001'].charge!;
    expect(depletionCharge(0, p).c).toBeCloseTo(30e-12, 13);
    expect(depletionCharge(-4, p).c * 1e12).toBeGreaterThan(13);
    expect(depletionCharge(-4, p).c * 1e12).toBeLessThan(15.5);
    expect(depletionCharge(-10, p).c * 1e12).toBeGreaterThan(9.5);
    expect(depletionCharge(-10, p).c * 1e12).toBeLessThan(11);
    // Yük, kapasitenin integrali: küçük bir adımda ΔQ ≈ C·ΔV.
    const dq = depletionCharge(-2 + 1e-4, p).q - depletionCharge(-2, p).q;
    expect(dq / 1e-4).toBeCloseTo(depletionCharge(-2, p).c, 15);
  });

  /** ±5 V, 10 kHz kare dalga, 1 kΩ ve diyot; ters kutuplanmadan sonraki akım. */
  function recovery(model: string): { during: number; after: number; forward: number } {
    const sim = new CircuitSimulator(
      circuit()
        .ground('G', 'gnd')
        .acsource('V', 'a', 'gnd', { waveform: 'square', amplitude: 5, frequency: 10e3 })
        .resistor('R', 'a', 'd', 1000)
        .add('diode', 'D', ['d', 'gnd'], { model })
        .build(),
      { timeStep: 0.1e-6 },
    );
    expect(sim.runUntil(0.2e-3 + 45e-6).ok).toBe(true);
    const forward = sim.measure('D')!.current;
    sim.runUntil(0.2e-3 + 51e-6);
    const during = sim.measure('D')!.current;
    sim.runUntil(0.2e-3 + 60e-6);
    return { forward, during, after: sim.measure('D')!.current };
  }

  it('ters toparlanma: kare dalga ters dönünce ≈ 3 µs boyunca ≈ −5,4 mA ters akım; genel modelde hiç yok', () => {
    const r = recovery('1N4001');
    expect(r.forward).toBeGreaterThan(4.3e-3);
    expect(r.during).toBeLessThan(-5e-3);
    expect(Math.abs(r.after)).toBeLessThan(0.1e-3);
    const g = recovery('genel');
    expect(Math.abs(g.during)).toBeLessThan(1e-6);
  });

  it('1 MHz’te 1N4001 doğrultmaz (ters tepe akımı ileri tepenin yarısından büyük); 1 kHz’te doğrultur', () => {
    const run = (frequency: number, duration: number, slice: number) => {
      const sim = new CircuitSimulator(
        circuit()
          .ground('G', 'gnd')
          .acsource('V', 'a', 'gnd', { waveform: 'sine', amplitude: 5, frequency })
          .resistor('R', 'a', 'd', 1000)
          .add('diode', 'D', ['d', 'gnd'], { model: '1N4001' })
          .build(),
      );
      expect(sim.runUntil(duration).ok).toBe(true);
      return swing(sim, () => sim.measure('D')!.current, 2 / frequency, slice);
    };
    const fast = run(1e6, 30e-6, 20e-9);
    expect(fast.min).toBeLessThan(-0.5 * fast.max);
    const slow = run(1e3, 3e-3, 20e-6);
    expect(slow.max).toBeGreaterThan(4.2e-3);
    expect(slow.min).toBeGreaterThan(-0.05 * slow.max);
  });
});

describe('BC107', () => {
  /** Topraklı emetörlü yükselteç: 10 kΩ üzerinden sürülen baz, R_C = 4,7 kΩ, V_CC = 12 V. */
  function gain(model: string, frequency: number): number {
    const sim = new CircuitSimulator(
      circuit()
        .ground('G', 'gnd')
        .battery('VCC', 'vcc', 'gnd', 12)
        .acsource('V', 'in', 'gnd', { waveform: 'sine', amplitude: 1e-3, offset: 0.718, frequency })
        .resistor('RB', 'in', 'b', 10e3)
        .resistor('RC', 'vcc', 'c', 4.7e3)
        .add('npn', 'Q', ['c', 'b', 'gnd'], { model, beta: 200 })
        .build(),
    );
    expect(sim.runUntil(10 / frequency).ok).toBe(true);
    const out = swing(sim, () => sim.voltageAt('c')!, 2 / frequency, 1 / (50 * frequency));
    return (out.max - out.min) / 2 / 1e-3;
  }

  it('1 kHz’te ≈ 63 (eski modelden ≈ %5 düşük: Gummel-Poon kartının ters Early gerilimi); Miller etkisiyle 100 kHz’te ≈ 49, 1 MHz’te ≈ 8; eski modelde düşmez', () => {
    const low = gain('BC107', 1e3);
    expect(low).toBeGreaterThan(61);
    expect(low).toBeLessThan(66);
    // VAR = 25,9 V ileri taşıma akımını V_BE/VAR ≈ %2,5 azaltır; g_m ve kazanç onunla düşer.
    const ratio = low / gain('BC547B', 1e3);
    expect(ratio).toBeGreaterThan(0.92);
    expect(ratio).toBeLessThan(0.98);
    const mid = gain('BC107', 1e5) / low;
    expect(mid).toBeGreaterThan(0.65);
    expect(mid).toBeLessThan(0.8);
    expect(gain('BC107', 1e6) / low).toBeLessThan(0.15);
    expect(gain('BC547B', 1e6) / gain('BC547B', 1e3)).toBeGreaterThan(0.98);
  });

  it('doğru akımda V_BE veri sayfası aralığında (≈ 2 mA’de 0,55–0,7 V)', () => {
    const sim = solve(
      circuit()
        .ground('G', 'gnd')
        .battery('VCC', 'vcc', 'gnd', 5)
        .add('npn', 'Q', ['vcc', 'b', 'gnd'], { model: 'BC107', beta: 200 })
        .battery('VB', 'bb', 'gnd', 10)
        .resistor('RB', 'bb', 'b', (10 - 0.65) / 10e-6),
    );
    // I_B = 10 µA, β = 200; Gummel-Poon: Early (V_CE = 4,35 V, VAF = 63 V) artırır, ters Early
    // (V_BE / VAR, VAR = 25,9 V) ve B-E sızıntısı (ISE) azaltır: I_C ≈ 2,05 mA.
    expect(sim.pinCurrents('Q')![0]!).toBeGreaterThan(2.0e-3);
    expect(sim.pinCurrents('Q')![0]!).toBeLessThan(2.1e-3);
    const vbe = sim.voltageAt('b')!;
    expect(vbe).toBeGreaterThan(0.55);
    expect(vbe).toBeLessThan(0.7);
  });
});

describe('BF245A ve IRF510', () => {
  const fet = (type: 'njfet' | 'nmos', props: Record<string, PropValue>, vgs: number, vds = 10) =>
    solve(
      circuit()
        .ground('G', 'gnd')
        .battery('VDD', 'd', 'gnd', vds)
        .battery('VGG', 'g', 'gnd', vgs)
        .add(type, 'M', ['d', 'g', 'gnd'], props),
    ).pinCurrents('M')![0]!;

  it('BF245A (NXP kartı): V_GS = 0’da 10 V’taki akım ≈ 4,14 mA (I_DSS·(1 + λ·10)); −0,4 V’ta ≈ 2,46 mA', () => {
    const props = { ...CATALOG.njfet.defaultProps };
    expect(fet('njfet', props, 0)).toBeCloseTo(4.142e-3, 5);
    expect(fet('njfet', props, -0.4)).toBeCloseTo(2.457e-3, 5);
  });

  it('IRF510: V_GS = 4 V, V_DS = 10 V’ta ≈ 37 mA; 3,8 V’ta kesimde', () => {
    const props = { ...CATALOG.nmos.defaultProps };
    expect(fet('nmos', props, 4)).toBeCloseTo(36.9e-3, 4);
    expect(Math.abs(fet('nmos', props, 3.8))).toBeLessThan(1e-9);
  });

  /** Kaynak dirençli (R_S = 1 kΩ) ortak kaynaklı yükselteç, R_D = 10 kΩ, V_DD = 15 V; kapı üreteçten offset’le sürülür. */
  function mosGain(frequency: number, model = 'IRF510'): number {
    const sim = new CircuitSimulator(
      circuit()
        .ground('G', 'gnd')
        .battery('VDD', 'vdd', 'gnd', 15)
        .acsource('V', 'g', 'gnd', { waveform: 'sine', amplitude: 0.1, offset: 4.55, frequency })
        .resistor('RD', 'vdd', 'd', 10e3)
        .resistor('RS', 's', 'gnd', 1e3)
        .add('nmos', 'M', ['d', 'g', 's'], { ...CATALOG.nmos.defaultProps, model })
        .build(),
    );
    expect(sim.runUntil(10 / frequency).ok).toBe(true);
    const out = swing(sim, () => sim.voltageAt('d')!, 2 / frequency, 1 / (50 * frequency));
    return (out.max - out.min) / 2 / 0.1;
  }

  // R_S, transistörü akım kaynağı gibi yaptığı için C_DS'in etkisi neredeyse yok olur; kazancı
  // drain ile (üreteçle sürülen) kapı arasındaki C_GD (≈ 38 pF) düşürür: kutup ≈ 1/(2π·10 kΩ·38 pF) ≈ 420 kHz.
  it('IRF510 yükselteç: 1 kHz’te kazanç ≈ R_D / R_S ≈ 9,8; C_GD ile 1 MHz’te ≈ 3,7’ye düşer; eski modelde düşmez', () => {
    const low = mosGain(1e3);
    expect(low).toBeGreaterThan(9.6);
    expect(low).toBeLessThan(10);
    const high = mosGain(1e6) / low;
    expect(high).toBeGreaterThan(0.3);
    expect(high).toBeLessThan(0.45);
    expect(mosGain(1e6, '2N7000') / mosGain(1e3, '2N7000')).toBeGreaterThan(0.98);
  });
});

describe('Model seçimi', () => {
  it('yeni parçalar föy modelleriyle gelir; model özelliği olmayan eski kayıtlar genel modeldir', () => {
    expect(CATALOG.diode.defaultProps.model).toBe('1N4001');
    expect(CATALOG.npn.defaultProps.model).toBe('BC107');
    expect(CATALOG.njfet.defaultProps.model).toBe('BF245A');
    expect(CATALOG.nmos.defaultProps.model).toBe('IRF510');
    expect(partProp('diode', {}, 'model')).toBe('genel');
    expect(partProp('npn', { beta: 300 }, 'model')).toBe('BC547B');
    expect(partProp('njfet', {}, 'model')).toBe('2N5457');
    expect(partProp('nmos', {}, 'model')).toBe('2N7000');
  });

  it('model değişince parametreler o modelin değerlerine geçer', () => {
    const jfet = withProp('njfet', { model: 'BF245A', idss: 5e-3, pinchOff: -2 }, 'model', '2N5457');
    expect(jfet).toEqual({ model: '2N5457', idss: 3e-3, pinchOff: -1.5 });
    const back = withProp('njfet', jfet, 'model', 'BF245A');
    expect(back.idss).toBeCloseTo(3.52e-3, 6);
    const mos = withProp('nmos', { model: '2N7000', threshold: 2.1, k: 0.05 }, 'model', 'IRF510');
    expect(mos).toEqual({ model: 'IRF510', threshold: 3.83, k: 1.24 });
    // Model dışındaki alanlar ön ayarı tetiklemez.
    expect(withProp('njfet', { model: 'BF245A', idss: 3.52e-3, pinchOff: -1.74 }, 'idss', 4e-3).idss).toBe(4e-3);
  });

  it('eski kayıt (model yok) ile "genel" model aynı sonucu verir', () => {
    const run = (props: Record<string, PropValue>) =>
      solve(circuit().ground('G', 'gnd').battery('B', 'a', 'gnd', 5).resistor('R', 'a', 'd', 1000).add('diode', 'D', ['d', 'gnd'], props)).measure('D')!
        .voltage;
    expect(run({})).toBe(run({ model: 'genel' }));
    expect(run({})).not.toBeCloseTo(run({ model: '1N4001' }), 2);
  });
});
