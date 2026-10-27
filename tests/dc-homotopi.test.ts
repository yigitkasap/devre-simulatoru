// DC çalışma noktasının yedek yolları (ngspice cktop.c): gmin adımlama ve uyarlanır kaynak
// adımlama. Eklem ve tanh sınırlamaları sayesinde bilinen zor devrelerin hepsi düz Newton'la da
// yakınsıyor; burada her yolun tek başına aynı çözüme ulaştığı sınanır (doğrudan Newton
// yakınsamadığında devreye girerler). Devreler tek çözümlüdür: Schmitt tetikleyici gibi
// histerezisli bir devrede yollar iki kararlı durumdan farklısını bulabilir, ikisi de doğrudur.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

type Builder = ReturnType<typeof circuit>;

const CASES: Record<string, () => Builder> = {
  'BJT mandal': () =>
    circuit()
      .battery('V', 'v', 'g', 5)
      .ground('G', 'g')
      .resistor('R1', 'v', 'c1', 1000)
      .resistor('R2', 'v', 'c2', 1000)
      .resistor('RB1', 'c1', 'b2', 10000)
      .resistor('RB2', 'c2', 'b1', 10000)
      .add('npn', 'Q1', ['c1', 'b1', 'g'], { model: 'BC547B', beta: 300 })
      .add('npn', 'Q2', ['c2', 'b2', 'g'], { model: 'BC547B', beta: 300 }),
  '20 LED, 100 V, 1 Ω': () => {
    let b = circuit().battery('V', 'n0', 'g', 100).ground('G', 'g');
    for (let k = 0; k < 20; k++) b = b.led(`L${k}`, `n${k}`, `n${k + 1}`);
    return b.resistor('R', 'n20', 'g', 1);
  },
  'Darlington, 1000 V, 10 Ω': () =>
    circuit()
      .battery('V', 'v', 'g', 1000)
      .ground('G', 'g')
      .battery('VB', 'bb', 'g', 5)
      .resistor('RB', 'bb', 'b1', 1000)
      .add('npn', 'Q1', ['c1', 'b1', 'e'], { model: 'BC547B', beta: 300 })
      .add('npn', 'Q2', ['c1', 'e', 'g'], { model: 'BC547B', beta: 300 })
      .resistor('RC', 'v', 'c1', 10),
  'Diyot köprüsü, 1000 V, 0,1 Ω': () =>
    circuit()
      .battery('V', 'c1', 'c2', 1000)
      .ground('G', 'g')
      .diode('D1', 'c1', 'e')
      .diode('D2', 'c2', 'e')
      .diode('D3', 'g', 'c1')
      .diode('D4', 'g', 'c2')
      .resistor('R', 'e', 'g', 0.1),
};

const NODES = ['v', 'c1', 'c2', 'b1', 'b2', 'e', 'n5', 'n10', 'n20'];

describe('DC: gmin ve kaynak adımlama', () => {
  for (const [name, build] of Object.entries(CASES)) {
    it(`${name}: gmin ve kaynak adımlama düz Newton’la aynı çözüme ulaşır`, () => {
      const solve = (homotopy: 'none' | 'gmin' | 'source') => {
        const sim = new CircuitSimulator(build().build(), { homotopy });
        expect(sim.isTransient, 'DC devre olmalı').toBe(false);
        expect(sim.runUntil(0).ok, homotopy).toBe(true);
        return sim;
      };
      const plain = solve('none');
      for (const homotopy of ['gmin', 'source'] as const) {
        const sim = solve(homotopy);
        // Yedek yol gerçekten adım adım çözdü (düz Newton'dan çok yineleme).
        expect(sim.counters.solves).toBeGreaterThan(plain.counters.solves);
        for (const node of NODES) {
          const a = plain.voltageAt(node);
          if (a === null) continue;
          expect(Math.abs(sim.voltageAt(node)! - a), `${homotopy} ${node}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(a)));
        }
      }
    });
  }
});
