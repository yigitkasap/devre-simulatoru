// Şemayı resim olarak dışa aktarma: devrenin çizimi (CircuitView, simülasyonsuz ya da o anki değerlerle)
// isteğe bağlı başlık satırıyla (devrenin adı; föy örneğiyse deney ve şekil, tarih, site adresi) tek bir
// SVG'de. Sade çizim föy gibi az mürekkepli (drawStyle.ts); o anki değerlerle çizimin sağ altında gerilim
// renk ölçeği (ekrandaki "Gerilim ±10 V" çipi). İndirilen SVG ve PNG ile yazdırılan sayfa aynı çizim: açık temanın renkleri, beyaz zemin
// (exportImage.ts). Şema ekran dışında bir kez çizilip SVG yazısı olarak alınır (react-dom/server,
// pencere açılınca yüklenir).

import { createElement } from 'react';
import type { Connectivity } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import { textWidth } from './analysis/chartText';
import { CircuitView } from './CircuitView';
import { DrawStyleContext } from './drawStyle';
import { EXPORT_BACKGROUND } from './exportImage';
import type { Settings } from './settings';
import type { SimFrame } from './useSimulation';

export interface SchematicHeader {
  /** Devrenin adı. */
  readonly title: string;
  /** İkinci satır: "Deney 5 · Şekil-15 · 7 Kasım 2026 · yigitkasap.github.io/devre-simulatoru". */
  readonly meta: string;
}

/** Gerilim renk ölçeği: yazısı ("Gerilim ±10 V") ve degradenin durakları (−Vmax … +Vmax, açık tema). */
export interface SchematicLegend {
  readonly label: string;
  readonly colors: readonly string[];
}

export interface SchematicImage {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
}

/** Kenar boşluğu, başlık satırlarının yazı boyları ve en küçük genişlik (px). */
const MARGIN = 24;
const TITLE_SIZE = 18;
const META_SIZE = 12;
const HEADER = 62;
const MIN_WIDTH = 360;
/** Renk ölçeği çipi: yükseklik, degrade çubuğu, yazı boyu, şemayla arası. */
const LEGEND_H = 28;
const LEGEND_BAR = 32;
const LEGEND_FONT = 11;
const LEGEND_GAP = 8;

const round = (v: number) => Math.round(v * 100) / 100;
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Measure = (text: string, size: number, kind: 'sans' | 'mono') => number;

/**
 * Şemanın SVG'si (CircuitView'in çıktısı), başlık ve renk ölçeğinden dışa aktarılacak çizim: zemin, başlık
 * satırları ve altında ince çizgi, şema 1 ızgara = 10 px ölçeğinde ortada, ölçek sağ altta (şemanın altında).
 * Şemada parça yoksa null.
 */
export function composeSchematic(circuit: string, header: SchematicHeader | null, measure: Measure = textWidth, legend: SchematicLegend | null = null): SchematicImage | null {
  const open = /<svg\b[^>]*>/.exec(circuit);
  const viewBox = /viewBox="([^"]+)"/.exec(open?.[0] ?? '');
  const end = circuit.lastIndexOf('</svg>');
  if (!open || !viewBox || end < 0) return null;
  const [vx, vy, vw, vh] = viewBox[1]!.split(/[\s,]+/).map(Number) as [number, number, number, number];
  if (![vx, vy, vw, vh].every(Number.isFinite) || vw <= 0 || vh <= 0) return null;
  const inner = circuit.slice(open.index + open[0].length, end);
  const headerWidth = header ? Math.max(measure(header.title, TITLE_SIZE, 'sans') * 1.04, measure(header.meta, META_SIZE, 'sans')) : 0;
  const legendWidth = legend ? Math.ceil(12 + LEGEND_BAR + 8 + measure(legend.label, LEGEND_FONT, 'mono') + 12) : 0;
  const width = Math.ceil(Math.max(vw, headerWidth, legendWidth, MIN_WIDTH - 2 * MARGIN) + 2 * MARGIN);
  const top = MARGIN + (header ? HEADER : 0);
  const height = Math.ceil(top + vh + (legend ? LEGEND_GAP + LEGEND_H : 0) + MARGIN);
  const x = (width - vw) / 2;
  const head = header
    ? `<g font-family="var(--font-sans)">` +
      `<text x="${MARGIN}" y="${MARGIN + TITLE_SIZE}" font-size="${TITLE_SIZE}" font-weight="600" fill="var(--color-ink)">${escapeXml(header.title)}</text>` +
      `<text x="${MARGIN}" y="${MARGIN + TITLE_SIZE + 8 + META_SIZE}" font-size="${META_SIZE}" fill="var(--color-muted)">${escapeXml(header.meta)}</text>` +
      `<line x1="${MARGIN}" x2="${width - MARGIN}" y1="${MARGIN + HEADER - 12}" y2="${MARGIN + HEADER - 12}" stroke="var(--color-line-2)" stroke-width="1"/>` +
      `</g>`
    : '';
  let scale = '';
  if (legend) {
    // Ekrandaki çip gibi: yuvarlak kenarlı, ince çerçeveli; solda degrade çubuğu, sağda yazı.
    const lx = width - MARGIN - legendWidth;
    const ly = top + vh + LEGEND_GAP;
    const stops = legend.colors.map((c, i) => `<stop offset="${round((i / Math.max(1, legend.colors.length - 1)) * 100)}%" stop-color="${c}"/>`).join('');
    scale =
      `<g data-legend="">` +
      `<defs><linearGradient id="gerilim-olcegi" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>` +
      `<rect x="${lx}" y="${ly}" width="${legendWidth}" height="${LEGEND_H}" rx="${LEGEND_H / 2}" fill="${EXPORT_BACKGROUND}" stroke="var(--color-line)" stroke-width="1"/>` +
      `<rect x="${lx + 12}" y="${ly + LEGEND_H / 2 - 4}" width="${LEGEND_BAR}" height="8" rx="4" fill="url(#gerilim-olcegi)"/>` +
      `<text x="${lx + 12 + LEGEND_BAR + 8}" y="${ly + LEGEND_H / 2 + 4}" font-family="var(--font-mono)" font-size="${LEGEND_FONT}" font-weight="500" fill="var(--color-ink-2)">${escapeXml(legend.label)}</text>` +
      `</g>`;
  }
  const markup =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(header?.title ?? '')}">` +
    `<rect width="${width}" height="${height}" fill="${EXPORT_BACKGROUND}"/>` +
    head +
    `<svg x="${x}" y="${top}" width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible">${inner}</svg>` +
    scale +
    `</svg>`;
  return { markup, width, height };
}

/** Başlığın ikinci satırı: föy (varsa), tarih, site adresi. */
export function headerMeta(parts: { readonly foy: string | null; readonly date: Date; readonly site: string }): string {
  const date = parts.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  return [parts.foy, date, parts.site].filter((p): p is string => Boolean(p)).join(' · ');
}

/**
 * Devrenin çizimi (CircuitView) SVG yazısı olarak: o anki değerlerle (frame) ya da sade (föy gibi az
 * mürekkep); her ikisinde de kablo renkleri açık temanın.
 */
export async function circuitMarkup(doc: CircuitDoc, connectivity: Connectivity, frame: SimFrame | null, settings: Pick<Settings, 'resistorStyle' | 'wireScale'>): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const view = createElement(CircuitView, { doc, connectivity, frame, settings, label: '', className: '' });
  return renderToStaticMarkup(createElement(DrawStyleContext.Provider, { value: { exporting: true, plain: frame === null } }, view));
}
