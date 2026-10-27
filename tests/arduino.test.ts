// Arduino Uno: işlemci (avr8js) ile devre çözümünün eşgüdümü. Örnek programlar gerçek devrelerde.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, type DeviceStatus } from '../src/sim';
import { ARDUINO, ARDUINO_IO } from '../src/sim/devices/arduino';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import '../src/sim/arduino/load';
import { circuit } from './helpers';

/** Arduino pin listesi: verilmeyenler kendi boş ağına bağlanır. */
function uno(id: string, nets: Partial<Record<string, string>>): string[] {
  const names = ['5V', '3V3', 'GND', ...ARDUINO_IO.map((io) => (io >= 14 ? `A${io - 14}` : `D${io}`)), 'GND2'];
  return names.map((name) => nets[name] ?? `${id}_${name}_boş`);
}

function arduino(sim: CircuitSimulator, id = 'U'): NonNullable<DeviceStatus['arduino']> {
  return sim.status(id)!.arduino!;
}

describe('Arduino Uno', () => {
  it('Blink: D13–220 Ω–LED; LED 0,5 s yanar 0,5 s söner, yanarken ≈ 11 mA', () => {
    const net = circuit()
      .add('arduino', 'U', uno('U', { GND: 'g', D13: 'p' }), { program: 'blink' })
      .resistor('R', 'p', 'a', 220)
      .led('L', 'a', 'g')
      .build();
    const sim = new CircuitSimulator(net);
    const samples: Array<[number, number]> = [];
    for (let t = 0.05; t <= 2.0001; t += 0.05) {
      expect(sim.runUntil(t).ok).toBe(true);
      samples.push([t, sim.measure('L')!.current]);
    }
    // İlk yarım saniye (setup'tan hemen sonra) yanık, sonra 0,5 s'lik periyotlarla.
    const on = (t: number) => samples.find(([s]) => Math.abs(s - t) < 1e-6)![1] > 5e-3;
    expect(on(0.25)).toBe(true);
    expect(on(0.75)).toBe(false);
    expect(on(1.25)).toBe(true);
    expect(on(1.75)).toBe(false);
    const current = samples.find(([s]) => Math.abs(s - 0.25) < 1e-6)![1];
    // (5 V − V_LED) / (220 + 25 Ω), kırmızı LED ≈ 2,0 V: ≈ 12 mA.
    expect(current).toBeGreaterThan(10e-3);
    expect(current).toBeLessThan(13.5e-3);
    expect(arduino(sim).ledL).toBe(false);
  });

  it('Blink: kenar, işlemcinin pini değiştirdiği ana denk gelir; periyot 1 s (± 0,3 ms)', () => {
    const net = circuit()
      .add('arduino', 'U', uno('U', { GND: 'g', D13: 'p' }), { program: 'blink' })
      .resistor('R', 'p', 'g', 1000)
      .build();
    const sim = new CircuitSimulator(net);
    // Kenarın hemen öncesinde ve sonrasında: kırılma noktasına denk gelen adımda pin eski değerinde,
    // bir sonraki adımda yeni değerinde.
    const rises: number[] = [];
    let t = 0;
    let last = 0;
    while (t < 2.2 && rises.length < 2) {
      sim.runUntil((t += 1e-3));
      const v = sim.voltageAt('p')!;
      if (v > 2.5 && last <= 2.5) {
        // Yükselen kenar son 1 ms içinde: 1 µs adımlarla yeniden bul.
        const fine = new CircuitSimulator(net);
        let s = t - 1e-3;
        fine.runUntil(s);
        while (fine.voltageAt('p')! <= 2.5) fine.runUntil((s += 1e-6));
        rises.push(s);
      }
      last = v;
    }
    expect(rises.length).toBe(2);
    // delay(500) iki kez + loop'un birkaç µs'si; delay() boşta atlamayla en çok 125 µs geç döner.
    expect(rises[1]! - rises[0]!).toBeGreaterThan(1.0);
    expect(rises[1]! - rises[0]!).toBeLessThan(1.0 + 300e-6);
  });

  it('Düğme (INPUT_PULLUP): bırakıkken pin 5 V ve LED sönük; basınca pin 0 V, LED yanar', () => {
    const build = (closed: boolean) =>
      circuit()
        .add('arduino', 'U', uno('U', { GND: 'g', D2: 'b', D13: 'p' }), { program: 'dugme' })
        .switch('S', 'b', 'g', closed)
        .resistor('R', 'p', 'a', 220)
        .led('L', 'a', 'g')
        .build();
    const open = new CircuitSimulator(build(false));
    open.runUntil(0.02);
    expect(open.voltageAt('b')!).toBeCloseTo(5, 3);
    expect(open.measure('L')!.current).toBeLessThan(1e-6);
    const closed = new CircuitSimulator(build(true));
    closed.runUntil(0.02);
    expect(closed.voltageAt('b')!).toBeCloseTo(0, 6);
    expect(closed.measure('L')!.current).toBeGreaterThan(10e-3);
    // Çekme direnci: 5 V / 35 kΩ ≈ 0,14 mA anahtardan geçer.
    expect(closed.measure('S')!.current).toBeCloseTo(ARDUINO.supply / ARDUINO.pullUp, 6);
  });

  it('Potansiyometre: analogRead bölücünün gerilimini okur, Seri ekrana yazar; PWM ortalaması onu izler', () => {
    const net = circuit()
      .add('arduino', 'U', uno('U', { '5V': 'v', GND: 'g', A0: 'w', D9: 'p' }), { program: 'potansiyometre' })
      .resistor('R1', 'v', 'w', 10e3)
      .resistor('R2', 'w', 'g', 30e3)
      .resistor('R', 'p', 'g', 1000)
      .build();
    const sim = new CircuitSimulator(net);
    expect(sim.runUntil(0.5).ok).toBe(true);
    const serial = arduino(sim).serial;
    // A0 = 5 · 30/40 = 3,75 V (5V ucu yük altında ≈ 5 V) → 768.
    const match = /A0 = (\d+)\s+\(([\d.]+) V\)\s+PWM = (\d+)/.exec(serial);
    expect(match, serial).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(765);
    expect(Number(match![1])).toBeLessThanOrEqual(768);
    expect(Number(match![3])).toBe(191);
  });

  it('PWM süzgeci: doluluk 64/255 → kondansatörde ≈ 1,25 V (490 Hz, 10 kΩ · 10 µF)', () => {
    const net = circuit()
      .add('arduino', 'U', uno('U', { GND: 'g', D9: 'p' }), { program: 'pwm-filtre' })
      .resistor('R', 'p', 'c', 10e3)
      .capacitor('C', 'c', 'g', 10e-6)
      .build();
    const sim = new CircuitSimulator(net);
    expect(sim.runUntil(2.5).ok).toBe(true);
    const v = sim.voltageAt('c')!;
    // Çıkış direnci 25 Ω, yükün 10 kΩ'u yanında önemsiz: 5 · 64/255 = 1,255 V; dalgalanma ≈ 25 mV.
    expect(v).toBeGreaterThan(1.2);
    expect(v).toBeLessThan(1.31);
    expect(arduino(sim).serial).toContain('Doluluk 64/255 → beklenen 1,25 V'.replace(',', '.'));
  });

  it('Termometre: 25 °C ortamda NTC ≈ 10 kΩ, Seri ekranda ≈ 25 °C', () => {
    const net = circuit()
      .add('arduino', 'U', uno('U', { '5V': 'v', GND: 'g', A0: 'w' }), { program: 'termometre' })
      .resistor('R', 'v', 'w', 10e3)
      .add('ntc', 'T', ['w', 'g'], {})
      .build();
    const sim = new CircuitSimulator(net);
    expect(sim.runUntil(0.6).ok).toBe(true);
    const match = /Sıcaklık: (-?[\d.]+) °C/.exec(arduino(sim).serial);
    expect(match, arduino(sim).serial).not.toBeNull();
    expect(Math.abs(Number(match![1]) - 25)).toBeLessThan(1.5);
  });

  it('Pinden 40 mA\'den fazla çekilirse uyarı (D13 doğrudan 47 Ω ile GND\'ye)', () => {
    const net = circuit()
      .add('arduino', 'U', uno('U', { GND: 'g', D13: 'p' }), { program: 'blink' })
      .resistor('R', 'p', 'g', 47)
      .build();
    const sim = new CircuitSimulator(net);
    sim.runUntil(0.1);
    // 5 V / (47 + 25 Ω) ≈ 69 mA; pin 5 · 47/72 ≈ 3,3 V'a düşer.
    expect(sim.measure('R')!.current).toBeCloseTo(5 / 72, 4);
    expect(sim.runtimeDiagnostics.some((d) => d.code === 'pin-overcurrent')).toBe(true);
  });
});

// İşlemci saniyede 16 milyon çevrim koşar: birkaç saniyelik örnekler uzun sürer.
describe('Arduino örnekleri: metinlerdeki sayılar', { timeout: 120_000 }, () => {
  const run = (id: ExampleId, t: number, change?: [string, Record<string, number | boolean>]) => {
    let doc = exampleDoc(id)!;
    if (change) {
      const part = doc.parts.find((p) => p.label === change[0])!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...change[1] } });
    }
    const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
    expect(sim.runUntil(t).ok, id).toBe(true);
    const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
    return { sim, idOf, serial: () => sim.status(idOf('ARD1')).arduino!.serial };
  };

  it('Blink ≈ 13 mA; trafik ışığı 13,0 / 12,1 / 11,7 mA', () => {
    const b = run('ard-blink', 0.25);
    expect(b.sim.measure(b.idOf('LED1'))!.current * 1e3).toBeCloseTo(13.0, 1);
    const red = run('ard-trafik-isigi', 2);
    expect(red.sim.measure(red.idOf('LED1'))!.current * 1e3).toBeCloseTo(13.0, 1);
    const yellow = run('ard-trafik-isigi', 3.5);
    expect(yellow.sim.measure(yellow.idOf('LED2'))!.current * 1e3).toBeCloseTo(12.1, 1);
    const green = run('ard-trafik-isigi', 5);
    expect(green.sim.measure(green.idOf('LED3'))!.current * 1e3).toBeCloseTo(11.7, 1);
  });

  it('Potansiyometre %50 → 511 (PWM 127), %20 → 210; gece lambası 744 / 413 / 154', () => {
    expect(run('ard-potansiyometre', 0.5).serial()).toContain('A0 = 511  (2.50 V)  PWM = 127');
    expect(run('ard-potansiyometre', 0.5, ['P1', { position: 20 }]).serial()).toContain('A0 = 210');
    expect(run('ard-gece-lambasi', 0.6).serial()).toContain('Işık: 744');
    expect(run('ard-gece-lambasi', 0.6, ['LDR1', { illuminance: 10 }]).serial()).toContain('Işık: 413');
    const dark = run('ard-gece-lambasi', 0.6, ['LDR1', { illuminance: 1 }]);
    expect(dark.serial()).toContain('Işık: 154');
    expect(dark.sim.measure(dark.idOf('LED1'))!.current).toBeGreaterThan(10e-3);
  });

  it('Termometre 25,0 / 59,7 / 0,7 °C; PWM süzgeci 1,253 / 2,512 V; röle sargısı 43,5 mA', () => {
    expect(run('ard-termometre', 1.2).serial()).toContain('Sıcaklık: 25.0 °C');
    expect(run('ard-termometre', 1.2, ['NTC1', { temperature: 60 }]).serial()).toContain('Sıcaklık: 59.7 °C');
    expect(run('ard-termometre', 1.2, ['NTC1', { temperature: 0 }]).serial()).toContain('Sıcaklık: 0.7 °C');
    const pwm = run('ard-pwm-filtre', 2.9);
    expect(pwm.sim.status(pwm.idOf('V1')).reading!).toBeCloseTo(1.253, 2);
    const pwm2 = run('ard-pwm-filtre', 5.9);
    expect(pwm2.sim.status(pwm2.idOf('V1')).reading!).toBeCloseTo(2.512, 2);
    const relay = run('ard-role', 1);
    expect(relay.sim.status(relay.idOf('K1')).coil!.current * 1e3).toBeCloseTo(43.5, 0);
    expect(relay.sim.status(relay.idOf('LP1')).glow!).toBeGreaterThan(0.9);
    const off = run('ard-role', 3);
    expect(off.sim.status(off.idOf('K1')).energized).toBe(false);
  });
});
