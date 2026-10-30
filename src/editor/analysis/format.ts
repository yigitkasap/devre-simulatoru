// Analiz grafiklerinin eksenleri, CSV ve dosya verme. Sayılar Türkçe biçimde (ondalık virgül).

import { formatNumber } from '../../sim/units';

/** Eksen için "güzel" bölmeler (1-2-5 dizisi) ve bölme aralığı. */
export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0], step: 1 };
  if (max - min < 1e-30) {
    const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const e = 10 ** Math.floor(Math.log10(raw));
  const m = raw / e;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  const first = Math.floor(min / step + 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  if (ticks[ticks.length - 1]! < max - step * 1e-9) ticks.push(ticks[ticks.length - 1]! + step);
  return { ticks, step };
}

/** Bölme yazısı: adımın gerektirdiği kadar ondalık (0,25 adımda iki, 0,1 adımda bir). */
export function tickText(value: number, step: number): string {
  let decimals = 0;
  while (decimals < 6 && Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-6 * 10 ** decimals) decimals++;
  return formatNumber(value, decimals);
}

const PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [1e-9, 'n'],
  [1e-6, 'µ'],
  [1e-3, 'm'],
  [1, ''],
  [1e3, 'k'],
  [1e6, 'M'],
];

/** En büyük mutlak değere göre eksen birimi (ör. 0,01 A → mA, çarpan 1000; 0,6 s → s). */
export function axisUnit(maxAbs: number, unit: string): { scale: number; unit: string } {
  if (!(maxAbs > 0) || !Number.isFinite(maxAbs)) return { scale: 1, unit };
  let chosen = PREFIXES[0]!;
  for (const p of PREFIXES) if (maxAbs >= p[0] * 0.1) chosen = p;
  return { scale: 1 / chosen[0], unit: `${chosen[1]}${unit}` };
}

export type CsvSeparator = ';' | ',';

/** CSV hücresi: noktalı virgül ayırıcıda ondalık virgül (Türkçe Excel), virgülde ondalık nokta. */
function cell(v: number | string, sep: CsvSeparator): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const s = String(Number(v.toPrecision(10)));
    return sep === ';' ? s.replace('.', ',') : s;
  }
  // Yalnızca ayırıcıyı, tırnağı ya da satır sonunu içeren hücre tırnaklanır.
  const special = sep === ';' ? /[";\n]/ : /[",\n]/;
  return special.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Başlık satırı ve veri satırlarından CSV metni (Excel'in Türkçe karakterleri tanıması için BOM ile). */
export function toCsv(header: readonly string[], rows: readonly (readonly (number | string)[])[], sep: CsvSeparator = ';'): string {
  const lines = [header.map((h) => cell(h, sep)).join(sep), ...rows.map((r) => r.map((v) => cell(v, sep)).join(sep))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * Dosyayı verir: telefonda (share) paylaşım sayfasıyla (navigator.share, dosya paylaşımı
 * destekleniyorsa), yoksa indirme bağlantısıyla.
 */
export async function saveFile(name: string, blob: Blob, share = false): Promise<void> {
  if (share && typeof navigator.share === 'function') {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        // Kullanıcı vazgeçtiyse indirmeye geçilmez.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * SVG grafiğini PNG'ye çevirir: tema belirteçleri (var(--…)) ve yazı tipleri o anki değerleriyle
 * yazılır (resim dosyası CSS bilmez), zemin panel rengi.
 */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob | null> {
  const root = getComputedStyle(document.documentElement);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bg = root.getPropertyValue('--color-panel').trim() || '#ffffff';
  const markup = new XMLSerializer()
    .serializeToString(clone)
    // Yazı tipi adları çift tırnaklı: öznitelik içinde tek tırnağa çevrilir (yoksa XML bozulur).
    .replace(/var\((--[\w-]+)\)/g, (_, name: string) => (root.getPropertyValue(name).trim() || '#000000').replace(/"/g, "'"));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Dosya adına tarih: "grafik-2026-10-30.png". */
export const datedName = (base: string, ext: string): string => `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
