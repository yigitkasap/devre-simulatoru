// Ölçüm tablosunun birimi (tablo-birim, 2026-11-19): açılır liste, önekli birime göre ölçekleme, kendiliğinden
// önek, % hatanın birimden bağımsızlığı ve eski kayıtlardaki serbest metin birim.
import { describe, expect, it } from 'vitest';
import type { TableRow } from '../src/model/analysis';
import { measuredText, parseTheory, percentError, tableCsv } from '../src/editor/analysis/table';
import { autoUnit, baseOf, formatInUnit, isListedUnit, parseInUnit, UNIT_GROUPS, unitDef } from '../src/editor/analysis/tableUnits';

describe('tablo birimi', () => {
  it('liste gruplu ve istenen birimleri içeriyor', () => {
    const symbols = (key: string) => UNIT_GROUPS.find((g) => g.key === key)!.units.map((d) => d.symbol);
    expect(symbols('voltage')).toEqual(['µV', 'mV', 'V', 'kV']);
    expect(symbols('current')).toEqual(['nA', 'µA', 'mA', 'A']);
    expect(symbols('resistance')).toEqual(['Ω', 'kΩ', 'MΩ']);
    expect(symbols('power')).toEqual(['µW', 'mW', 'W']);
    expect(symbols('other')).toEqual(['Hz', 'kHz', 's', 'ms', 'µs', 'F', 'µF', 'nF', 'pF', 'H', 'mH', '°C', '%']);
  });

  it('yalın sayı seçili birimde: mA + 4,3 → 0,0043 A; kΩ + 4,7 → 4700 Ω; µs + 250 → 2,5e-4 s', () => {
    expect(parseInUnit('4,3', 'mA')).toBeCloseTo(0.0043, 15);
    expect(parseInUnit('4,7', 'kΩ')).toBeCloseTo(4700, 9);
    expect(parseInUnit('250', 'µs')).toBeCloseTo(2.5e-4, 15);
    expect(parseInUnit('1,5', 'kHz')).toBeCloseTo(1500, 9);
    expect(parseInUnit('22', 'nF')).toBeCloseTo(22e-9, 18);
    expect(parseInUnit('−3,2', 'mV')).toBeCloseTo(-0.0032, 15);
  });

  it('önek ya da birim yazılmışsa yazılan geçerli', () => {
    expect(parseInUnit('4,3 mA', 'mA')).toBeCloseTo(0.0043, 15);
    expect(parseInUnit('4,3m', 'A')).toBeCloseTo(0.0043, 15);
    expect(parseInUnit('2 V', 'mV')).toBeCloseTo(2, 12);
    expect(parseInUnit('100 ms', 's')).toBeCloseTo(0.1, 12);
    expect(parseInUnit('1 MΩ', 'kΩ')).toBeCloseTo(1e6, 6);
    expect(parseInUnit('', 'mA')).toBeNull();
    expect(parseInUnit('abc', 'mA')).toBeNull();
  });

  it('% hata birimden bağımsız: aynı değer mA ya da A ile yazılınca aynı hata', () => {
    const measured = 0.004442;
    const inMa = percentError(measured, parseTheory('4,3', 'mA'));
    const inA = percentError(measured, parseTheory('0,0043', 'A'));
    const inUa = percentError(measured, parseTheory('4300', 'µA'));
    expect(inMa).toBeCloseTo(3.3023, 3);
    expect(inA).toBeCloseTo(inMa!, 9);
    expect(inUa).toBeCloseTo(inMa!, 9);
  });

  it('ölçülen seçili birimde gösterilir', () => {
    expect(formatInUnit(0.004442, 'mA')).toBe('4,442 mA');
    expect(formatInUnit(4.441, 'V')).toBe('4,441 V');
    expect(formatInUnit(0.5577, 'mV')).toBe('557,7 mV');
    expect(formatInUnit(1000, 'kΩ')).toBe('1,000 kΩ');
    expect(formatInUnit(0.05, 'V')).toBe('0,05000 V');
    // Seçili birimde çok küçük kalan değer önekli yazılır.
    expect(formatInUnit(3e-9, 'mA')).toBe('3,000 nA');
    // Listede olmayan birim: önekli SI (eski davranış).
    expect(formatInUnit(0.004442, 'J')).toBe('4,442 mJ');
    const row: TableRow = { id: 'a', name: 'I', formula: '', theory: '', measured: 0.004442, unit: 'mA', source: '', lab: '' };
    expect(measuredText(row)).toBe('4,442 mA');
  });

  it('kendiliğinden önek: akım → mA, gerilim → V ya da mV, zaman → ms; listede olmayan temel birim kendisi', () => {
    expect(autoUnit('A', 0.004442)).toBe('mA');
    expect(autoUnit('A', 2.5e-5)).toBe('µA');
    expect(autoUnit('A', 3e-12)).toBe('nA');
    expect(autoUnit('V', 4.441)).toBe('V');
    expect(autoUnit('V', 0.5577)).toBe('mV');
    expect(autoUnit('V', 12000)).toBe('kV');
    expect(autoUnit('s', 0.1001)).toBe('ms');
    expect(autoUnit('Hz', 1234)).toBe('kHz');
    expect(autoUnit('Ω', 0)).toBe('Ω');
    expect(autoUnit('', 2.3)).toBe('');
    expect(autoUnit('A/V²', 0.002)).toBe('A/V²');
    expect(baseOf('mA')).toBe('A');
    expect(baseOf('kat')).toBe('kat');
  });

  it('eski kayıtlar: listedeki birim seçili gelir (u ile yazılan mikro dahil), olmayan "Diğer" olarak korunur', () => {
    expect(isListedUnit('V')).toBe(true);
    expect(isListedUnit('mA')).toBe(true);
    expect(unitDef('uA')?.symbol).toBe('µA');
    expect(unitDef('μs')?.symbol).toBe('µs');
    expect(isListedUnit('kat')).toBe(false);
    expect(isListedUnit('dB')).toBe(false);
    expect(isListedUnit('')).toBe(false);
    // Eski kayıt: birim "V", teorik "9,93" → 9,93 V (önceki davranışla aynı).
    expect(parseTheory('9,93', 'V')).toBeCloseTo(9.93, 12);
    // Serbest metin birim bozulmuyor: CSV'de olduğu gibi, sayı ölçeksiz.
    const row: TableRow = { id: 'b', name: 'Kazanç', formula: '', theory: '12', measured: 11.5, unit: 'kat', source: '', lab: '' };
    expect(tableCsv([row], false, ';').split('\r\n')[1]).toMatch(/^Kazanç;;12;11,5;kat;;4,1666/);
  });

  it('CSV sayıları Birim sütunundaki birimde', () => {
    const row: TableRow = { id: 'c', name: 'I', formula: '', theory: '4,3', measured: 0.004442, unit: 'mA', source: '', lab: '4,5' };
    const line = tableCsv([row], true, ';').split('\r\n')[1]!;
    const cells = line.split(';');
    expect(cells[2]).toBe('4,3');
    expect(cells[3]).toBe('4,442');
    expect(cells[4]).toBe('mA');
    expect(cells[7]).toBe('4,5');
  });
});
