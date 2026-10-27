// Arduino Uno: işlemci (avr8js) ile devre çözümünün eşgüdümü. Örnek programlar gerçek devrelerde.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, type DeviceStatus } from '../src/sim';
import { ARDUINO, ARDUINO_IO } from '../src/sim/devices/arduino';
import { circuit } from './helpers';

/** Arduino pin listesi: verilmeyenler kendi boş ağına bağlanır. */
function uno(id: string, nets: Partial<Record<string, string>>): string[] {
  const names = ['5V', '3V3', 'GND', ...ARDUINO_IO.map((io) => (io >= 14 ? `A${io - 14}` : `D${io}`))];
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

  it('Blink: kenar, işlemcinin pini değiştirdiği çevrime (62,5 ns) denk gelir; periyot 1 s', () => {
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
    // delay(500) iki kez + loop'un birkaç µs'si.
    expect(rises[1]! - rises[0]!).toBeGreaterThan(1.0);
    expect(rises[1]! - rises[0]!).toBeLessThan(1.0 + 50e-6);
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
