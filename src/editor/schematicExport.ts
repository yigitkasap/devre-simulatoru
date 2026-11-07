// Şemayı resim olarak dışa aktarma: devrenin çizimi (CircuitView, simülasyonsuz ya da o anki değerlerle)
// isteğe bağlı başlık satırıyla (devrenin adı; föy örneğiyse deney ve şekil, tarih, site adresi) tek bir
// SVG'de. İndirilen SVG ve PNG ile yazdırılan sayfa aynı çizim: açık temanın renkleri, beyaz zemin
// (exportImage.ts). Şema ekran dışında bir kez çizilip SVG yazısı olarak alınır (react-dom/server,
// pencere açılınca yüklenir).

import { createElement } from 'react';
import type { Connectivity } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import { textWidth } from './analysis/chartText';
import { CircuitView } from './CircuitView';
import { EXPORT_BACKGROUND } from './exportImage';
import type { Settings } from './settings';
import type { SimFrame } from './useSimulation';

export interface SchematicHeader {
  /** Devrenin adı. */
  readonly title: string;
  /** İkinci satır: "Deney 5 · Şekil-15 · 7 Kasım 2026 · yigitkasap.github.io/devre-simulatoru". */
  readonly meta: string;
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

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Şemanın SVG'si (CircuitView'in çıktısı) ve başlıktan dışa aktarılacak çizim: zemin, başlık satırları ve
 * altında ince çizgi, şema 1 ızgara = 10 px ölçeğinde ortada. Şemada parça yoksa null.
 */
export function composeSchematic(circuit: string, header: SchematicHeader | null, measure: (text: string, size: number) => number = (t, s) => textWidth(t, s, 'sans')): SchematicImage | null {
  const open = /<svg\b[^>]*>/.exec(circuit);
  const viewBox = /viewBox="([^"]+)"/.exec(open?.[0] ?? '');
  const end = circuit.lastIndexOf('</svg>');
  if (!open || !viewBox || end < 0) return null;
  const [vx, vy, vw, vh] = viewBox[1]!.split(/[\s,]+/).map(Number) as [number, number, number, number];
  if (![vx, vy, vw, vh].every(Number.isFinite) || vw <= 0 || vh <= 0) return null;
  const inner = circuit.slice(open.index + open[0].length, end);
  const headerWidth = header ? Math.max(measure(header.title, TITLE_SIZE) * 1.04, measure(header.meta, META_SIZE)) : 0;
  const width = Math.ceil(Math.max(vw, headerWidth, MIN_WIDTH - 2 * MARGIN) + 2 * MARGIN);
  const top = MARGIN + (header ? HEADER : 0);
  const height = Math.ceil(top + vh + MARGIN);
  const x = (width - vw) / 2;
  const head = header
    ? `<g font-family="var(--font-sans)">` +
      `<text x="${MARGIN}" y="${MARGIN + TITLE_SIZE}" font-size="${TITLE_SIZE}" font-weight="600" fill="var(--color-ink)">${escapeXml(header.title)}</text>` +
      `<text x="${MARGIN}" y="${MARGIN + TITLE_SIZE + 8 + META_SIZE}" font-size="${META_SIZE}" fill="var(--color-muted)">${escapeXml(header.meta)}</text>` +
      `<line x1="${MARGIN}" x2="${width - MARGIN}" y1="${MARGIN + HEADER - 12}" y2="${MARGIN + HEADER - 12}" stroke="var(--color-line-2)" stroke-width="1"/>` +
      `</g>`
    : '';
  const markup =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(header?.title ?? '')}">` +
    `<rect width="${width}" height="${height}" fill="${EXPORT_BACKGROUND}"/>` +
    head +
    `<svg x="${x}" y="${top}" width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible">${inner}</svg>` +
    `</svg>`;
  return { markup, width, height };
}

/** Başlığın ikinci satırı: föy (varsa), tarih, site adresi. */
export function headerMeta(parts: { readonly foy: string | null; readonly date: Date; readonly site: string }): string {
  const date = parts.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  return [parts.foy, date, parts.site].filter((p): p is string => Boolean(p)).join(' · ');
}

/** Devrenin çizimi (CircuitView) SVG yazısı olarak: o anki değerlerle (frame) ya da sade. */
export async function circuitMarkup(doc: CircuitDoc, connectivity: Connectivity, frame: SimFrame | null, settings: Pick<Settings, 'resistorStyle' | 'wireScale'>): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(createElement(CircuitView, { doc, connectivity, frame, settings, label: '', className: '' }));
}
