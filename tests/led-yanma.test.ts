// LED'in kademeli yanması: sürekli sınırın (I_F) üstünde uyarı ve ısınma, eklem en yüksek sıcaklığı aşınca
// (uzun süre) ya da akım tepe sınırını (I_FP) aşınca (hemen) yanma. Sınırlar Kingbright veri sayfalarından
// (docs/KARARLAR.md, "Teşhis ve metinler", 4. madde).

import { describe, expect, it } from 'vitest';
import { itemFromDiagnostic } from '../src/editor/messages';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { LED_AMBIENT, LED_MODELS, LedDevice, type LedColor } from '../src/sim/devices/led';
import { circuit } from './helpers';

/** 5 V'luk pil, R ön direnç, LED (kırmızı). */
const led = (r: number, color: LedColor = 'red', capacitor = false): Netlist => {
  const c = circuit().battery('B1', 'k', 'gnd', 5).ground('G1', 'gnd').resistor('R1', 'k', 'a', r).led('D1', 'a', 'gnd', color);
  // Kondansatör devreyi zamana bağlı yapar (adım adım çözülür); LED'in ısınması iki yolda da aynı.
  if (capacitor) c.capacitor('C1', 'k', 'gnd', 1e-6, 5);
  return c.build();
};
const ctx = { label: (id: string) => id, type: () => 'led' as const };
/** LED yanana dek (en çok `limit` s) 50 ms'lik parçalarla ilerletir; yanma anı ya da null. */
function burnTime(sim: CircuitSimulator, limit: number): number | null {
  for (let t = 0; t < limit; t += 0.05) {
    if (sim.status('D1').burned) return t;
    sim.advance(0.05);
  }
  return sim.status('D1').burned ? limit : null;
}

describe('LED: veri sayfası sınırları', () => {
  it('I_F, I_FP, T_j ve R_th JA (Kingbright WP7113 serisi)', () => {
    const table = Object.fromEntries(Object.entries(LED_MODELS).map(([c, m]) => [c, [m.maxCurrent, m.peakCurrent, m.maxJunction, m.thermalResistance]]));
    expect(table).toEqual({
      red: [30e-3, 155e-3, 115, 580],
      yellow: [30e-3, 140e-3, 110, 560],
      green: [25e-3, 140e-3, 110, 600],
      blue: [30e-3, 150e-3, 115, 610],
    });
    expect(LED_AMBIENT).toBe(25);
  });
});

describe('LED: kademeli yanma', () => {
  it('sürekli sınırın biraz üstünde (≈ 63 mA): uyarı, ısınır ama 2 dakikada da yanmaz; mesaj "yanmaz ama ömrü kısalır"', () => {
    const sim = new CircuitSimulator(led(47));
    expect(burnTime(sim, 120)).toBeNull();
    const d = sim.runtimeDiagnostics.find((x) => x.code === 'led-overcurrent');
    expect(d?.params?.current).toBeGreaterThan(60e-3);
    expect(d?.params?.temperature).toBeGreaterThan(90);
    expect(d?.params?.temperature).toBeLessThan(115);
    const text = itemFromDiagnostic(d!, ctx);
    expect(text.severity).toBe('warning');
    expect(text.title).toBe('LED aşırı akımda');
    expect(text.detail).toContain('yanmaz ama ışığı zayıflar ve ömrü kısalır');
  });

  it('eklem sınırını aşacak akım (≈ 127 mA): hemen değil, uzun sürede (≈ 8 s) ısınarak yanar; önce "bu akımda kalırsa … yanar"', () => {
    const sim = new CircuitSimulator(led(22));
    sim.advance(1);
    expect(sim.status('D1').burned).toBe(false);
    const warning = sim.runtimeDiagnostics.find((x) => x.code === 'led-overcurrent')!;
    expect(itemFromDiagnostic(warning, ctx).detail).toContain('bu akımda kalırsa eklem sınırı aşar ve LED yanar');
    const t = burnTime(sim, 30)! + 1;
    expect(t).toBeGreaterThan(7.5);
    expect(t).toBeLessThan(9);
    const burned = sim.runtimeDiagnostics.find((x) => x.code === 'led-burned')!;
    expect(burned.params?.cause).toBe(1);
    expect(itemFromDiagnostic(burned, ctx).detail).toContain('ısınarak yandı');
  });

  it('zamana bağlı devrede (adım adım çözüm) de aynı sürede ısınarak yanar', () => {
    const sim = new CircuitSimulator(led(22, 'red', true));
    const t = burnTime(sim, 30)!;
    expect(t).toBeGreaterThan(7.5);
    expect(t).toBeLessThan(9);
  });

  it('tepe sınırının üstünde (≈ 178 mA): hemen yanar; mesaj "hemen yandı" ve tepe sınırı', () => {
    const sim = new CircuitSimulator(led(15));
    sim.advance(0.016);
    expect(sim.status('D1').burned).toBe(true);
    const burned = sim.runtimeDiagnostics.find((x) => x.code === 'led-burned')!;
    expect(burned.params?.cause).toBe(0);
    expect(burned.params?.peakCurrent).toBeCloseTo(0.155);
    const detail = itemFromDiagnostic(burned, ctx).detail;
    expect(detail).toContain('hemen yandı');
    expect(detail).toContain('155 mA');
  });

  it('yeşil LED daha düşük akımda uyarır (I_F 25 mA)', () => {
    const sim = new CircuitSimulator(led(110, 'green'));
    sim.advance(0.1);
    expect(sim.measure('D1')!.current).toBeGreaterThan(25e-3);
    expect(sim.runtimeDiagnostics.some((x) => x.code === 'led-overcurrent')).toBe(true);
  });

  it('onarılan LED soğuktur: yeniden ısınması yine ≈ 8 s sürer', () => {
    const sim = new CircuitSimulator(led(22));
    burnTime(sim, 30);
    expect(sim.repair('D1')).toBe(true);
    const device = sim.device('D1') as LedDevice;
    expect(device.junctionTemperature).toBe(LED_AMBIENT);
    const t = burnTime(sim, 30)!;
    expect(t).toBeGreaterThan(7.5);
  });
});
