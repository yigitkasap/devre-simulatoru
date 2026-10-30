// Analiz → Tablo (A2): teorik değerin okunması, % hata, doğru uydurma (RC dolmada τ) ve tablonun
// CSV'si (noktalı virgülde ondalık virgül).

import { describe, expect, it } from 'vitest';
import { TraceRecorder } from '../src/editor/analysis/recorder';
import { defaultOffset } from '../src/editor/analysis/TablePane';
import { fitPoints, fitTau, linearFit, parseTheory, percentError, tableCsv, tableTsv } from '../src/editor/analysis/table';
import type { TableRow } from '../src/model/analysis';
import rc from './veri/veri-rc-dolma.json';

/** Referans veriden (5 ms'de bir) doldurulmuş kayıt: t, V(C1). */
function recorded(): TraceRecorder {
  const rec = new TraceRecorder();
  rec.setTraces([{ id: 'v', color: 0, kind: 'voltage', node: 'x', at: { x: 0, y: 0 }, ref: null, refAt: null }]);
  rec.reset(0, 1, false);
  for (const [t, v] of rc as number[][]) rec.sample({ time: t!, voltageAt: () => v!, measure: () => null });
  return rec;
}

describe('Analiz: tablo', () => {
  it('teorik değer birimli ya da birimsiz okunur (virgül, SI öneki)', () => {
    expect(parseTheory('100 ms', 's')).toBeCloseTo(0.1, 12);
    expect(parseTheory('6,32 V', 'V')).toBeCloseTo(6.32, 12);
    expect(parseTheory('3,68m', 'A')).toBeCloseTo(0.00368, 12);
    expect(parseTheory('9,93', 'V')).toBeCloseTo(9.93, 12);
    expect(parseTheory('', 'V')).toBeNull();
    expect(parseTheory('abc', 'V')).toBeNull();
  });

  it('% Hata = |Ölçülen − Teorik| / Teorik × 100 (N2: 6,321 V / 6,32 V → 0,02)', () => {
    expect(percentError(6.321, 6.32)).toBeCloseTo(0.0158, 3);
    expect(percentError(0.1001, 0.1)).toBeCloseTo(0.1, 6);
    expect(percentError(1, 0)).toBeNull();
    expect(percentError(null, 1)).toBeNull();
  });

  it('doğru uydurma: y = ln(10 − V(C1)), x = t → eğim ≈ −10 s⁻¹, τ ≈ 100 ms, R² ≈ 1', () => {
    const rec = recorded();
    const spec = { x: 't', y: 'v', lnOffset: 10 };
    const { xs, ys } = fitPoints(rec, spec);
    // ln'in içi a'nın %1'inin altına inen noktalar atılır (dolmanın sonu).
    expect(xs.length).toBeGreaterThan(80);
    expect(xs.length).toBeLessThan(rec.count);
    const fit = linearFit(xs, ys)!;
    // Voltmetrenin 10 MΩ'u kondansatöre paralel: son değer 9,990 V, eğim −9,99 … −10.
    expect(fit.slope).toBeGreaterThan(-10.05);
    expect(fit.slope).toBeLessThan(-9.95);
    expect(fit.r2).toBeGreaterThan(0.9999);
    expect(fitTau(spec, fit)!).toBeCloseTo(0.1, 2);
    expect(defaultOffset(9.974)).toBeCloseTo(10, 12);
    // x aralığı: yalnız 50–300 ms arasındaki noktalar.
    const ranged = fitPoints(rec, { ...spec, from: 0.05, to: 0.3 });
    expect(Math.min(...ranged.xs)).toBeGreaterThanOrEqual(0.05);
    expect(Math.max(...ranged.xs)).toBeLessThanOrEqual(0.3);
    // Referans zamanları kayan noktalı (0,0499…, 0,3000…04): uçlar düşebilir.
    expect(ranged.xs.length).toBeGreaterThanOrEqual(49);
    expect(ranged.xs.length).toBeLessThanOrEqual(51);
    expect(defaultOffset(4.21)).toBeCloseTo(4.3, 12);
  });

  it('düz bir doğruda eğim, kesişim ve R² = 1; tek noktada uydurma yok', () => {
    const fit = linearFit([0, 1, 2, 3], [1, 3, 5, 7])!;
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(linearFit([1], [2])).toBeNull();
  });

  it('tablo CSV: noktalı virgülde ondalık virgül; laboratuvar sütunu isteğe bağlı; panoya sekmeli', () => {
    const rows: TableRow[] = [{ id: 'a', name: 'τ', formula: 'R·C', theory: '100 ms', measured: 0.1001, unit: 's', source: '%63,2 anı', lab: '' }];
    const csv = tableCsv(rows, true, ';');
    expect(csv.split('\r\n')[0]).toBe('﻿Büyüklük;Formül;Teorik;Ölçülen;Birim;Kaynak;% Hata;Laboratuvar');
    expect(csv.split('\r\n')[1]).toBe('τ;R·C;0,1;0,1001;s;%63,2 anı;0,1;');
    expect(tableCsv(rows, false, ',').split('\r\n')[1]).toBe('τ,R·C,0.1,0.1001,s,%63,2 anı,0.1'.replace('%63,2 anı', '"%63,2 anı"'));
    expect(tableTsv(rows, false).split('\n')[1]).toBe('τ (R·C)\t100 ms\t100,1 ms\t0,10');
  });
});
