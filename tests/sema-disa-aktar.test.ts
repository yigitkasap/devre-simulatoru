// Şemayı indir / yazdır: çizimin bileşimi (başlık satırı, kenar boşlukları, beyaz zemin), başlığın ikinci
// satırı, açık tema renklerinin yerine konması ve yazı tiplerinin gömülmesi (adres → veri adresi).

import { describe, expect, it } from 'vitest';
import { inlineFontUrls, resolveVars, varNames } from '../src/editor/exportImage';
import { composeSchematic, headerMeta } from '../src/editor/schematicExport';

// CircuitView'in çıktısına benzer: dış kutu, viewBox'lı SVG, içinde çizgi ve yazı.
const circuit = '<div class="h-full w-full"><svg role="img" aria-label="" viewBox="-40 -40 500 300" preserveAspectRatio="xMidYMid meet"><polyline points="0,0 100,0" stroke="var(--color-symbol)"/><text font-family="var(--font-mono)">10 V</text></svg></div>';
const measure = (text: string, size: number) => text.length * size * 0.55;

describe('Şemayı indir / yazdır: çizimin bileşimi', () => {
  it('başlıkla: üstte iki satır ve çizgi, şema ortada ve 1 ızgara = 10 px; zemin beyaz', () => {
    const img = composeSchematic(circuit, { title: 'Yarım dalga doğrultucu', meta: 'Deney 2 · Şekil-4 · 7 Kasım 2026' }, measure)!;
    expect(img.width).toBe(500 + 48);
    expect(img.height).toBe(24 + 62 + 300 + 24);
    expect(img.markup).toMatch(/^<svg viewBox="0 0 548 410"/);
    expect(img.markup).toContain('<rect width="548" height="410" fill="#ffffff"/>');
    expect(img.markup).toContain('>Yarım dalga doğrultucu</text>');
    expect(img.markup).toContain('>Deney 2 · Şekil-4 · 7 Kasım 2026</text>');
    expect(img.markup).toContain('<svg x="24" y="86" width="500" height="300" viewBox="-40 -40 500 300" overflow="visible"><polyline');
    expect(img.markup.endsWith('</svg></svg>')).toBe(true);
  });

  it('başlıksız 62 px alçak; küçük devrede en az 360 px genişlik, şema ortada', () => {
    const small = '<svg viewBox="0 0 100 80"><circle r="3"/></svg>';
    const img = composeSchematic(small, null, measure)!;
    expect(img.width).toBe(360);
    expect(img.height).toBe(24 + 80 + 24);
    expect(img.markup).toContain('<svg x="130" y="24" width="100" height="80"');
    expect(img.markup).not.toContain('<text');
  });

  it('uzun başlık genişliği büyütür; yazılar XML için kaçışlı', () => {
    const img = composeSchematic(circuit, { title: 'R < 1 kΩ & "deneme"', meta: 'x'.repeat(200) }, measure)!;
    expect(img.width).toBe(Math.ceil(200 * 12 * 0.55) + 48);
    expect(img.markup).toContain('R &lt; 1 kΩ &amp; &quot;deneme&quot;');
  });

  it('o anki değerlerle: sağ altta, şemanın altında renk ölçeği (degrade ve "Gerilim ±10 V"); resim 36 px uzar', () => {
    const legend = { label: 'Gerilim ±10 V', colors: ['#1f4fbf', '#178a3a', '#c4291c'] };
    const plain = composeSchematic(circuit, null, measure)!;
    const img = composeSchematic(circuit, null, measure, legend)!;
    expect(img.height - plain.height).toBe(36);
    expect(img.markup).toContain('<g data-legend="">');
    expect(img.markup).toContain('<stop offset="0%" stop-color="#1f4fbf"/><stop offset="50%" stop-color="#178a3a"/><stop offset="100%" stop-color="#c4291c"/>');
    expect(img.markup).toContain('>Gerilim ±10 V</text>');
    // Sağ kenara dayalı: x + genişlik = resmin genişliği − kenar boşluğu.
    const chip = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="28" rx="14"/.exec(img.markup)!;
    expect(Number(chip[1]) + Number(chip[3])).toBe(img.width - 24);
    expect(Number(chip[2])).toBe(24 + 300 + 8);
  });

  it('şemada çizim yoksa (viewBox yok ya da geçersiz) null', () => {
    expect(composeSchematic('<div></div>', null, measure)).toBeNull();
    expect(composeSchematic('<svg viewBox="NaN NaN NaN NaN"></svg>', null, measure)).toBeNull();
  });

  it('başlığın ikinci satırı: föy (varsa), Türkçe tarih, site adresi', () => {
    const date = new Date(2026, 10, 7);
    expect(headerMeta({ foy: 'Deney 5 · Şekil-15', date, site: 'yigitkasap.github.io/devre-simulatoru' })).toBe('Deney 5 · Şekil-15 · 7 Kasım 2026 · yigitkasap.github.io/devre-simulatoru');
    expect(headerMeta({ foy: null, date, site: 'localhost:4322/devre-simulatoru' })).toBe('7 Kasım 2026 · localhost:4322/devre-simulatoru');
  });
});

describe('Dışa aktarma: açık tema renkleri ve gömülü yazı tipleri', () => {
  it('belirteçlerin adları bulunur, değerleriyle değiştirilir (yazı tipindeki çift tırnak tek tırnağa)', () => {
    const markup = '<line stroke="var(--color-symbol)"/><text font-family="var(--font-mono)" fill="var(--color-muted)">a</text><x stroke="var(--color-yok)"/>';
    expect([...varNames(markup)].sort()).toEqual(['--color-muted', '--color-symbol', '--color-yok', '--font-mono']);
    const values = new Map([
      ['--color-symbol', '#1d2733'],
      ['--color-muted', '#5d6b79'],
      ['--font-mono', '"IBM Plex Mono", monospace'],
    ]);
    expect(resolveVars(markup, values)).toBe(`<line stroke="#1d2733"/><text font-family="'IBM Plex Mono', monospace" fill="#5d6b79">a</text><x stroke="#000000"/>`);
  });

  it('@font-face adresleri veri adresiyle değişir; bilinmeyen adres olduğu gibi kalır', () => {
    const css = `@font-face { font-family: "IBM Plex Sans"; src: url("/_astro/plex.woff2") format("woff2"); }`;
    const out = inlineFontUrls(css, new Map([['/_astro/plex.woff2', 'data:font/woff2;base64,AAA']]));
    expect(out).toBe(`@font-face { font-family: "IBM Plex Sans"; src: url("data:font/woff2;base64,AAA") format("woff2"); }`);
    expect(inlineFontUrls(`src: url(/a.woff2)`, new Map())).toBe('src: url(/a.woff2)');
  });
});
