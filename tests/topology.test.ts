// Topoloji kontrolleri (görev tanımı, bölüm 8.10 ve 3.4).

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, compileNetlist } from '../src/sim';
import { circuit } from './helpers';

const codes = (b: ReturnType<typeof circuit>) => compileNetlist(b.build()).diagnostics.map((d) => `${d.severity}:${d.code}`);

describe('10. Topoloji', () => {
  it('toprak yoksa hata; simülasyon başlamaz', () => {
    const netlist = circuit().battery('B1', 'a', 'b', 9, 1).resistor('R1', 'a', 'b', 100).build();
    const compiled = compileNetlist(netlist);
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'no-ground' }));
    const sim = new CircuitSimulator(netlist);
    expect(sim.canRun).toBe(false);
    const result = sim.advance(0.01);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('no-ground');
  });

  it('birbirine paralel iki ideal gerilim kaynağı → döngü hatası', () => {
    const diagnostics = compileNetlist(
      circuit()
        .battery('B1', 'a', 'gnd', 9)
        .battery('B2', 'a', 'gnd', 5)
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 100)
        .build(),
    ).diagnostics;
    const loop = diagnostics.find((d) => d.code === 'voltage-loop');
    expect(loop?.severity).toBe('error');
    expect([...(loop?.elementIds ?? [])].sort()).toEqual(['B1', 'B2']);
  });

  it('ucu boşta bir direnç → uyarı (simülasyon yine başlar)', () => {
    const netlist = circuit()
      .battery('B1', 'a', 'gnd', 9, 1)
      .ground('G1', 'gnd')
      .resistor('R1', 'a', 'gnd', 100)
      .resistor('R2', 'a', 'bos', 100)
      .build();
    const diagnostics = compileNetlist(netlist).diagnostics;
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'floating-pin', elementIds: ['R2'], pin: 1 }),
    ]);
    expect(new CircuitSimulator(netlist).advance(0).ok).toBe(true);
  });

  it('iç direnci 0 olan pilin uçları kabloyla birleştirilirse döngü hatası', () => {
    expect(codes(circuit().battery('B1', 'a', 'b', 9, 0).ground('G1', 'b').wire('a', 'b'))).toContain('error:voltage-loop');
  });

  it('iç dirençli pil kısa devre edilirse hata değil (iç direnç akımı sınırlar)', () => {
    expect(codes(circuit().battery('B1', 'a', 'b', 9, 1).ground('G1', 'b').wire('a', 'b'))).not.toContain('error:voltage-loop');
  });

  it('ideal pil ile ideal ampermetre döngüsü → hata, ampermetre paralel uyarısı', () => {
    const list = codes(circuit().battery('B1', 'a', 'gnd', 9).ground('G1', 'gnd').ammeter('A1', 'a', 'gnd', 'ideal'));
    expect(list).toContain('error:voltage-loop');
    expect(list).toContain('warning:ammeter-parallel');
  });

  it('ampermetre pilin iki ucuna bağlanırsa eğitsel uyarı ve kısa devre', () => {
    const netlist = circuit().battery('B1', 'a', 'gnd', 9, 1).ground('G1', 'gnd').ammeter('A1', 'a', 'gnd').build();
    const sim = new CircuitSimulator(netlist);
    expect(sim.topologyDiagnostics.map((d) => d.code)).toEqual(['ammeter-parallel']);
    sim.advance(0);
    expect(sim.runtimeDiagnostics.map((d) => d.code)).toEqual(['short-circuit']);
    // 9 V / (1 Ω + 0,1 Ω) ≈ 8,18 A
    expect(sim.measure('A1')!.current).toBeCloseTo(9 / 1.1, 5);
  });

  it('toprak devreye bağlı değilse hata', () => {
    expect(codes(circuit().battery('B1', 'a', 'b', 9, 1).resistor('R1', 'a', 'b', 10).ground('G1', 'yalniz'))).toContain(
      'error:ground-unconnected',
    );
  });

  it('toprağa bağlı olmayan devre parçası için uyarı', () => {
    const list = codes(
      circuit()
        .battery('B1', 'a', 'gnd', 9, 1)
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 10)
        .battery('B2', 'x', 'y', 5, 1)
        .resistor('R2', 'x', 'y', 10),
    );
    expect(list).toEqual(['warning:floating-island']);
  });

  it('kablolar union-find ile aynı düğümü birleştirir', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'p1', 'gnd', 10)
        .ground('G1', 'g2')
        .wire('gnd', 'k1')
        .wire('k1', 'g2')
        .resistor('R1', 'p2', 'm', 1000)
        .resistor('R2', 'm', 'g3', 1000)
        .wire('p1', 'p2')
        .wire('g3', 'k1')
        .build(),
    );
    expect(sim.topologyDiagnostics).toEqual([]);
    sim.advance(0);
    expect(sim.voltageAt('m')).toBeCloseTo(5, 6);
    expect(sim.voltageAt('k1')).toBe(0);
    expect(sim.netOf('p1')).toBe(sim.netOf('p2'));
  });

  it('boşta düğümler matrisi tekil yapmaz (gmin)', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'a', 'gnd', 9, 1)
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 100)
        .switch('S1', 'a', 'x', false)
        .resistor('R2', 'x', 'y', 100)
        .build(),
    );
    const result = sim.advance(0);
    expect(result.ok).toBe(true);
    expect(sim.voltageAt('a')).toBeCloseTo((9 * 100) / 101, 6);
  });
});
