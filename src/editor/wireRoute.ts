// Masaüstünde kablo çizerken yolun engelleri (parça gövdeleri, yazıları, ölçü aletlerinin ekranları,
// kablolar ve uçlar) ve kablo bitince bildirilen beklenmeyen bağlantının anlatımı.

import { tr } from '../i18n/tr';
import { pinPositions, partBounds, distanceToSegment } from '../model/geometry';
import type { Box } from '../model/catalog';
import type { RouteObstacles } from '../model/route';
import type { CircuitDoc, Part, Point } from '../model/types';
import { METER_DISPLAY, meterDisplayRect, partTextBoxes } from './PartView';

/**
 * Yol bulucunun engelleri. `drawn`: çizilmekte olan kablonun şimdiye kadarki köşeleri (yeni parça
 * kendi üstüne geri dönmesin); `flipped`: ölçü aletinin ekranı öbür tarafa açılmış mı (Canvas'taki gibi).
 */
export function wireObstacles(doc: CircuitDoc, flipped: (part: Part) => boolean, drawn: readonly Point[] = []): RouteObstacles {
  const boxes: Box[] = [];
  const points: Point[] = [];
  const segments: [Point, Point][] = [];
  for (const part of doc.parts) {
    const flip = METER_DISPLAY.has(part.type) && flipped(part);
    boxes.push(partBounds(part), ...partTextBoxes(part, flip));
    if (METER_DISPLAY.has(part.type)) boxes.push(meterDisplayRect(part, flip));
    points.push(...pinPositions(part));
  }
  for (const line of [...doc.wires.map((w) => w.points), drawn]) {
    line.forEach((p, i) => {
      points.push(p);
      if (i > 0) segments.push([line[i - 1]!, p]);
    });
  }
  return { boxes, points, segments };
}

export interface UnexpectedLink {
  /** Bildirimdeki adlar ("B1 − uç"): her beklenmeyen ağdan kabloya en yakın uç. */
  readonly names: readonly string[];
  /** O uçların yerleri (tuvalde yanıp söner). */
  readonly pins: readonly Point[];
  readonly parts: readonly string[];
}

/** unexpectedLinks'in gruplarından (pinKey) bildirim: her gruptan kablonun yoluna en yakın uç. */
export function describeUnexpected(doc: CircuitDoc, path: readonly Point[], groups: readonly (readonly string[])[]): UnexpectedLink {
  const names: string[] = [];
  const pins: Point[] = [];
  const parts: string[] = [];
  const distance = (p: Point) => {
    let d = Infinity;
    for (let i = 1; i < path.length; i++) d = Math.min(d, distanceToSegment(p, path[i - 1]!, path[i]!));
    return d;
  };
  for (const group of groups) {
    let best: { part: Part; index: number; at: Point; d: number } | null = null;
    for (const key of group) {
      const [id, pin] = key.split('#') as [string, string];
      const part = doc.parts.find((p) => p.id === id);
      const at = part ? pinPositions(part)[Number(pin)] : undefined;
      if (!part || !at) continue;
      const d = distance(at);
      if (!best || d < best.d) best = { part, index: Number(pin), at, d };
    }
    if (!best) continue;
    const many = pinPositions(best.part).length > 1;
    names.push(many ? `${best.part.label} ${tr.devices.pinShort[best.part.type][best.index] ?? ''}`.trim() : best.part.label);
    pins.push(best.at);
    parts.push(best.part.id);
  }
  return { names, pins, parts };
}
