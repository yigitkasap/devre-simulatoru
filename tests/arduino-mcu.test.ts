// ATmega328P sarmalayıcısı (avr8js): derlenmiş örnek programlar gerçek zamanlamayla koşar.

import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '../src/arduino/programs.gen';
import { Atmega328, MCU_FREQUENCY, PinMode, decodeFirmware } from '../src/sim/mcu';

function boot(name: string): Atmega328 {
  const program = PROGRAMS[name];
  if (!program) throw new Error(`program yok: ${name}`);
  return new Atmega328(decodeFirmware(program.firmware));
}

describe('ATmega328P (avr8js)', () => {
  it('Blink: D13 çıkış, 500 ms yüksek / 500 ms düşük (delay, zamanlayıcı 0 kesmesi)', () => {
    const mcu = boot('blink');
    const edges: Array<[number, PinMode]> = [];
    let last = mcu.mode(13);
    mcu.onPins = () => {
      const now = mcu.mode(13);
      if (now !== last) edges.push([mcu.cycles / MCU_FREQUENCY, now]);
      last = now;
    };
    const t0 = performance.now();
    mcu.run(2.2 * MCU_FREQUENCY);
    const wall = performance.now() - t0;
    // İlk geçiş pinMode (giriş → düşük çıkış), sonra yüksek; ardından 0,5 s arayla değişir.
    const highs = edges.filter(([, m]) => m === PinMode.High).map(([t]) => t);
    expect(highs.length).toBe(3);
    expect(highs[1]! - highs[0]!).toBeCloseTo(1.0, 2);
    const lows = edges.filter(([, m]) => m === PinMode.Low).map(([t]) => t);
    expect(lows.some((t) => Math.abs(t - highs[0]! - 0.5) < 0.005)).toBe(true);
    console.log(`2,2 s Blink ${wall.toFixed(0)} ms sürdü (gerçek zamanın ${((2200 / wall) * 100).toFixed(0)} %'i)`);
  });
});
