// ATmega328P sarmalayıcısı (avr8js): derlenmiş örnek programlar gerçek zamanlamayla koşar.

import { describe, expect, it } from 'vitest';
import { FIRMWARE as PROGRAMS } from '../src/sim/arduino/firmware.gen';
import { Atmega328, MCU_FREQUENCY, PinMode, decodeFirmware } from '../src/sim/arduino/mcu';

function boot(name: string): Atmega328 {
  const program = PROGRAMS[name];
  if (!program) throw new Error(`program yok: ${name}`);
  return new Atmega328(decodeFirmware(program.firmware), program.idle);
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
    // Boşta atlama (delay) kullanılmadan da aynı program aynı kenarları verir (en çok 0,3 ms fark).
    const exact = new Atmega328(decodeFirmware(PROGRAMS.blink!.firmware));
    const exactEdges: number[] = [];
    let lastExact = exact.mode(13);
    exact.onPins = () => {
      const m = exact.mode(13);
      if (m !== lastExact) exactEdges.push(exact.cycles / MCU_FREQUENCY);
      lastExact = m;
    };
    exact.run(2.2 * MCU_FREQUENCY);
    expect(exactEdges.length).toBe(edges.length);
    exactEdges.forEach((t, i) => expect(Math.abs(t - edges[i]![0])).toBeLessThan(0.3e-3 * (1 + i / 2)));
    expect(mcu.skipped).toBeGreaterThan(0.8 * 2.2 * MCU_FREQUENCY);
    const lows = edges.filter(([, m]) => m === PinMode.Low).map(([t]) => t);
    expect(lows.some((t) => Math.abs(t - highs[0]! - 0.5) < 0.005)).toBe(true);
    console.log(`2,2 s Blink ${wall.toFixed(0)} ms sürdü (gerçek zamanın ${((2200 / wall) * 100).toFixed(0)} %'i)`);
  });
});
