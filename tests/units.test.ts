// Birim ayrıştırma ve Türkçe sayı biçimi (görev tanımı, bölüm 8.11 ve 3.3).

import { describe, expect, it } from 'vitest';
import { formatEditable, formatNumber, formatSI, parseValue } from '../src/sim';

function value(input: string, unit?: Parameters<typeof parseValue>[1]): number {
  const result = parseValue(input, unit);
  if (!result.ok) throw new Error(`"${input}" ayrıştırılamadı: ${result.error}`);
  return result.value;
}

describe('11. Birim ayrıştırma', () => {
  it('görevdeki örnekler', () => {
    expect(value('4,7k')).toBe(4700);
    expect(value('100u')).toBeCloseTo(1e-4, 15);
    expect(value('100µ')).toBeCloseTo(1e-4, 15);
    expect(value('1M')).toBe(1e6);
    expect(value('1m')).toBe(1e-3);
    expect(value('2.2n')).toBeCloseTo(2.2e-9, 20);
  });

  it('büyük-küçük harf önemlidir: M mega, m mili', () => {
    expect(value('2M')).toBe(2e6);
    expect(value('2m')).toBe(2e-3);
  });

  it('virgül ve nokta ondalık ayırıcıdır', () => {
    expect(value('4.7k')).toBe(4700);
    expect(value('2,2m')).toBeCloseTo(2.2e-3, 15);
    expect(value('0,5')).toBe(0.5);
    expect(value(',5')).toBe(0.5);
  });

  it('öbür önekler, Yunan mü, boşluk ve birim', () => {
    expect(value('10p')).toBeCloseTo(1e-11, 20);
    expect(value('100μ')).toBeCloseTo(1e-4, 15);
    expect(value('1G')).toBe(1e9);
    expect(value('4,7 kΩ', 'Ω')).toBe(4700);
    expect(value('4,7kohm', 'Ω')).toBe(4700);
    expect(value('1 Mohm', 'Ω')).toBe(1e6);
    expect(value('100 µF', 'F')).toBeCloseTo(1e-4, 15);
    expect(value('9V', 'V')).toBe(9);
    expect(value('20 mA', 'A')).toBeCloseTo(0.02, 15);
    expect(value('  12 ')).toBe(12);
  });

  it('4k7 yazımı ve bilimsel gösterim', () => {
    expect(value('4k7')).toBe(4700);
    expect(value('2M2')).toBe(2.2e6);
    expect(value('1e3')).toBe(1000);
    expect(value('1,5e-3')).toBeCloseTo(1.5e-3, 15);
  });

  it('eksi değerler', () => {
    expect(value('-5')).toBe(-5);
    expect(value('−2,5m')).toBeCloseTo(-2.5e-3, 15);
  });

  it('hatalı girişlerde hata', () => {
    expect(parseValue('')).toEqual({ ok: false, error: 'empty' });
    expect(parseValue('   ')).toEqual({ ok: false, error: 'empty' });
    for (const bad of ['abc', '4,7x', '1..2', '4,7,1', '--1', 'k', '1kk', '1 2', 'Ω']) {
      expect(parseValue(bad).ok, bad).toBe(false);
    }
    expect(parseValue('4,7 kV', 'Ω')).toEqual({ ok: false, error: 'wrong-unit' });
    expect(parseValue('100 µF', 'Ω')).toEqual({ ok: false, error: 'wrong-unit' });
  });
});

describe('Türkçe sayı biçimi', () => {
  it('SI öneki ve ondalık virgül', () => {
    expect(formatSI(4700, 'Ω', { trim: true })).toBe('4,7 kΩ');
    expect(formatSI(0.00961, 'A')).toBe('9,61 mA');
    expect(formatSI(4.7, 'V')).toBe('4,70 V');
    expect(formatSI(1000, 'Ω')).toBe('1,00 kΩ');
    expect(formatSI(1e-4, 'F', { trim: true })).toBe('100 µF');
    expect(formatSI(10e6, 'Ω', { trim: true })).toBe('10 MΩ');
    expect(formatSI(5, 'V', { digits: 4 })).toBe('5,000 V');
    expect(formatSI(12.5e-6, 'V', { digits: 4 })).toBe('12,50 µV');
  });

  it('yuvarlama bir üst öneke taşır', () => {
    expect(formatSI(999.96, 'Ω')).toBe('1,00 kΩ');
    expect(formatSI(0.99999, 'A')).toBe('1,00 A');
  });

  it('sıfır, eksi ve sonsuz', () => {
    expect(formatSI(0, 'V')).toBe('0,00 V');
    expect(formatSI(0, 'V', { trim: true })).toBe('0 V');
    expect(formatSI(1e-18, 'A', { digits: 4 })).toBe('0,000 A');
    expect(formatSI(-0.0025, 'A')).toBe('−2,50 mA');
    expect(formatSI(Number.POSITIVE_INFINITY, 'Ω')).toBe('∞ Ω');
  });

  it('düz sayı ve düzenleme metni', () => {
    expect(formatNumber(4.7, 2)).toBe('4,70');
    expect(formatNumber(-0.001, 2)).toBe('0,00');
    expect(formatEditable(4700)).toBe('4,7k');
    expect(formatEditable(1e-4)).toBe('100µ');
    expect(formatEditable(0.1)).toBe('0,1');
    expect(formatEditable(10e6)).toBe('10M');
    expect(formatEditable(9)).toBe('9');
    expect(value(formatEditable(2.2e-9))).toBeCloseTo(2.2e-9, 20);
  });
});
