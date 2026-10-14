// Kablo gerilimi renk ölçekleri (tasarım: DS-Renk, tokens.css).

import { describe, expect, it } from 'vitest';
import { voltageColor, voltageGradient } from '../src/editor/colors';

/** CSS hsl() → [r, g, b] (yalnızca testte karşılaştırma için). */
function hslToRgb(css: string): number[] {
  const m = /hsl\((\d+(?:\.\d+)?) (\d+)% (\d+)%\)/.exec(css);
  if (!m) throw new Error(css);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Kanal başına en çok 1 birim yuvarlama farkıyla aynı renk mi? */
function expectNear(rgb: number[], hex: string): void {
  const n = Number.parseInt(hex.slice(1), 16);
  const want = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  rgb.forEach((v, k) => expect(Math.abs(v - want[k]!), `${hex} kanal ${k}`).toBeLessThanOrEqual(1));
}

describe('kablo gerilimi renkleri', () => {
  it('klasik ölçek tokens.css duraklarını verir', () => {
    const stops: Array<[number, string]> = [
      [-1, '#194cb3'],
      [-0.5, '#148f8f'],
      [0, '#148f3d'],
      [0.25, '#338f14'],
      [0.5, '#7a8f14'],
      [0.75, '#b37319'],
      [1, '#b31919'],
    ];
    for (const [ratio, hex] of stops) expectNear(hslToRgb(voltageColor(ratio)), hex);
  });

  it('ölçek dışı ve geçersiz oranlar sınırlanır', () => {
    expect(voltageColor(5)).toBe(voltageColor(1));
    expect(voltageColor(-3)).toBe(voltageColor(-1));
    expect(voltageColor(Number.NaN)).toBe(voltageColor(0));
  });

  it('renk körlüğüne uygun ölçek mavi – gri – turuncu duraklarından geçer', () => {
    expect(voltageColor(-1, 'colorblind')).toBe('rgb(43 86 171)');
    expect(voltageColor(0, 'colorblind')).toBe('rgb(122 130 140)');
    expect(voltageColor(1, 'colorblind')).toBe('rgb(196 90 10)');
    // İki durak arası doğrusal: −0,75, #2b56ab ile #6b84b8'in ortası.
    expect(voltageColor(-0.75, 'colorblind')).toBe('rgb(75 109 178)');
  });

  it('açıklama degradesi seçili ölçeği kullanır', () => {
    expect(voltageGradient('classic')).toContain('hsl(140 75% 32%)');
    expect(voltageGradient('colorblind')).toContain('rgb(122 130 140)');
  });
});
