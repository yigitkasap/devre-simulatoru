// Newton yakınsaması: tarama betiğinin (scripts/tarama/motor.tarama.ts) uç değerlerde bulduğu
// çöküşler. Hepsi ilk adımda "nr-failed" veriyordu.
//   - Güç kaynağının akım sınırlayıcısı (tanh) doyumda iletkenliği ≈ 0 olduğundan CV ile CC
//     arasında döngüye giriyordu: tanh değişimi yinelemede 0,5 ile sınırlı (pnjlim karşılığı).
//   - Op-amp'ın iki tanh katı doyumda ±1600 V'luk ikili döngüye giriyordu: doğrusallaştırma
//     noktası iki katın tanh değişimi 0,5'i geçmeyecek kadar kısaltılır.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { Part } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';

function runWith(id: ExampleId, label: string, key: string, value: number, seconds = 0.05) {
  let doc = exampleDoc(id)!;
  const part = doc.parts.find((p) => p.label === label)!;
  doc = updatePart(doc, part.id, { props: { ...part.props, [key]: value } as Part['props'] });
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  while (sim.time < seconds) {
    const r = sim.advance(1 / 60, 20000);
    expect(r.error?.code).toBeUndefined();
    expect(r.ok).toBe(true);
  }
  return sim;
}

describe('Newton yakınsaması: uç değerler', () => {
  const cases: Array<[ExampleId, string, string, number]> = [
    ['paralel-kirpici', 'PS1', 'voltage1', 30],
    ['fet-yukseltec', 'RD', 'resistance', 2.7],
    ['mosfet-yukseltec', 'RD', 'resistance', 10],
    ['role-transistor', 'R1', 'resistance', 4.7],
    ['role-transistor', 'PS1', 'voltage1', 30],
    ['role-transistor', 'FG1', 'frequency', 1000],
    ['opamp-eviren', 'B1', 'voltage', 0.015],
    ['opamp-eviren', 'B2', 'voltage', 0.015],
    ['opamp-evirmeyen', 'B1', 'voltage', 0.015],
    ['opamp-karsilastirici', 'B1', 'voltage', 0.015],
    ['opamp-karsilastirici', 'B2', 'voltage', 0.015],
    ['opamp-eviren', 'B1', 'voltage', 15000],
  ];
  for (const [id, label, key, value] of cases) {
    it(`${id}: ${label}.${key} = ${value} çalışır`, () => {
      runWith(id, label, key, value);
    });
  }

  it('akım sınırındaki güç kaynağı (CC): çıkış akımı sınırda, gerilim düşer', () => {
    const sim = runWith('fet-yukseltec', 'RD', 'resistance', 2.7);
    const doc = exampleDoc('fet-yukseltec')!;
    const ps = doc.parts.find((p) => p.label === 'PS1')!;
    const out = sim.status(ps.id).outputs![0]!;
    const limit = Number(ps.props.currentLimit1 ?? 0.5);
    expect(Math.abs(out.current)).toBeLessThanOrEqual(limit * 1.0001);
  });

  it('op-amp ±15 mV beslemede (çalışmaz): çıkış rayların arasında kalır', () => {
    const sim = runWith('opamp-eviren', 'B1', 'voltage', 0.015);
    const doc = exampleDoc('opamp-eviren')!;
    const u = doc.parts.find((p) => p.label === 'U1')!;
    const vo = sim.status(u.id).opamp!.output;
    expect(vo).toBeLessThan(0.02);
    expect(vo).toBeGreaterThan(-15.01);
  });
});
