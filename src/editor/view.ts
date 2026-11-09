// Tuval görünümü: kaydırma ve yakınlaştırma. ekran = dünya·ölçek + (x, y); dünya = ızgara·GRID.

import type { Box } from '../model/catalog';
import { GRID, type Point } from '../model/types';

export interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
/**
 * Telefonda okunur yakınlık: parçaların adları ve değerleri (11 px) ekranda ≈ 10 px. Altında değerler gizlenir;
 * devre açılınca (örnek, paylaşım, dosya, tam ekrana geçiş) yakınlık bunun altına inmez, sığmayan devre
 * ortalanır ve kaydırılabilir kalır (yalnızca Sığdır bütün devreyi gösterir).
 */
export const PHONE_READABLE_SCALE = 0.9;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Ekran (SVG içi) koordinatından ızgara koordinatına (ondalıklı). */
export function screenToGrid(view: View, sx: number, sy: number): Point {
  return { x: (sx - view.x) / view.scale / GRID, y: (sy - view.y) / view.scale / GRID };
}

export function snap(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** (sx, sy) ekran noktası sabit kalacak şekilde yakınlaştırır. */
export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k };
}

/** Izgara biriminde verilen kutuyu ekrana sığdıran görünüm. */
export function fitView(box: Box, width: number, height: number, padding = 48, maxScale = 2): View {
  const w = Math.max(box.w * GRID, 1);
  const h = Math.max(box.h * GRID, 1);
  const scale = clampScale(Math.min((width - 2 * padding) / w, (height - 2 * padding) / h, maxScale));
  const cx = (box.x + box.w / 2) * GRID;
  const cy = (box.y + box.h / 2) * GRID;
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
}

/**
 * Okunur sığdırma: `fitted` (sığdırılmış görünüm) okunur yakınlığın altındaysa yakınlık `min` olur, kutunun
 * ortası (top px'ten aşağısı ayrılmış) alanın ortasına gelir. Izgara birimindeki kutu, ekran pikselinde alan.
 */
export function readableFit(fitted: View, box: Box, width: number, height: number, top: number, min: number): View {
  if (fitted.scale >= min) return fitted;
  const cx = (box.x + box.w / 2) * GRID;
  const cy = (box.y + box.h / 2) * GRID;
  return { scale: min, x: width / 2 - cx * min, y: top + (height - top) / 2 - cy * min };
}
