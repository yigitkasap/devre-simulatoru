// Parça Dalga 1: yeni parçaların modelleri ve arayüz bağlantıları.

import { describe, expect, it } from 'vitest';
import { measureResistance } from '../src/editor/fault/meter';
import { meterRole, meterText } from '../src/editor/readouts';
import { tr } from '../src/i18n/tr';
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
