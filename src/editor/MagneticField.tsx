// "Manyetik alanı göster": akım taşıyan kabloların çevresindeki alan (⊙ sayfadan dışarı, ⊗ sayfaya
// doğru; sağ el kuralı) ve bobinlerin içinden geçen alan çizgileri (N ve S kutuplarıyla). Alan,
// geleneksel akımın yönünden çizilir (elektron akışı seçeneğinden bağımsız). Büyüklük akımın
// logaritmasıyla: 1 µA'de görünmez, 1 A'de en yoğun; kablodaki işaretler akım arttıkça sıklaşır.

import { CATALOG } from '../model/catalog';
import type { FlowGraph } from '../model/flow';
import { GRID, type CircuitDoc, type Part, type Point } from '../model/types';
import { MIN_ANIMATED_CURRENT, type SimFrame } from './useSimulation';

/** Alan çizimlerinin rengi (kablo gerilimi ölçeklerinde ve akım noktalarında olmayan bir mor). */
export const FIELD_COLOR = '#7c3aed';

/** Akımın alan çizimindeki ağırlığı (0..1): 1 µA → 0, 1 mA → 0,5, 1 A → 1. */
export function fieldStrength(current: number): number {
  const abs = Math.abs(current);
  if (abs < MIN_ANIMATED_CURRENT) return 0;
  return Math.min(1, Math.max(0, Math.log10(abs / 1e-6) / 6));
}

/** Kablodan uzaklık (px) ve işaret yarıçapı. */
const OFFSET = 9;
const MARK = 3;

function circleMark(x: number, y: number, r: number): string {
  return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
}

function crossMark(x: number, y: number, r: number): string {
  const c = r * 0.62;
  return `M${x - c},${y - c}L${x + c},${y + c}M${x + c},${y - c}L${x - c},${y + c}`;
}

/**
 * Bir kablo parçasının çevresindeki alan işaretleri (piksel). Akım a'dan b'ye (pozitif) akarken,
 * akıma bakınca solda alan sayfadan dışarı (⊙, `out`), sağda sayfaya doğrudur (⊗): B = I·dl × r̂.
 * Ekran koordinatlarında (y aşağı) akımın solu (dy, −dx) yönündedir. Akım büyüdükçe işaretler sıklaşır.
 */
export function wireMarks(a: Point, b: Point, current: number): Array<{ x: number; y: number; out: boolean }> {
  const s = fieldStrength(current);
  const len = Math.hypot((b.x - a.x) * GRID, (b.y - a.y) * GRID);
  if (s <= 0 || len < 14) return [];
  const sign = Math.sign(current);
  const dx = ((b.x - a.x) * GRID) / len;
  const dy = ((b.y - a.y) * GRID) / len;
  const lx = dy * sign;
  const ly = -dx * sign;
  const spacing = 40 - 22 * s;
  const count = Math.max(1, Math.floor((len - 8) / spacing));
  const start = (len - (count - 1) * spacing) / 2;
  const marks: Array<{ x: number; y: number; out: boolean }> = [];
  for (let k = 0; k < count; k++) {
    const px = a.x * GRID + dx * (start + k * spacing);
    const py = a.y * GRID + dy * (start + k * spacing);
    marks.push({ x: px + lx * OFFSET, y: py + ly * OFFSET, out: true });
    marks.push({ x: px - lx * OFFSET, y: py - ly * OFFSET, out: false });
  }
  return marks;
}

function wireField(key: string, a: Point, b: Point, current: number) {
  const marks = wireMarks(a, b, current);
  if (marks.length === 0) return null;
  let rings = '';
  let dots = '';
  for (const m of marks) {
    rings += circleMark(m.x, m.y, MARK) + (m.out ? '' : crossMark(m.x, m.y, MARK));
    if (m.out) dots += circleMark(m.x, m.y, 0.9);
  }
  return (
    <g key={key} opacity={0.3 + 0.6 * fieldStrength(current)}>
      <path d={rings} fill="none" stroke={FIELD_COLOR} strokeWidth={1.1} />
      <path d={dots} fill={FIELD_COLOR} stroke={FIELD_COLOR} strokeWidth={0.8} />
    </g>
  );
}

/** Ok başı: (x, y) ucunda, (dx, dy) yönünde. */
function arrowHead(x: number, y: number, dx: number, dy: number, size = 4.5): string {
  const px = -dy;
  const py = dx;
  return `M${x - dx * size + px * size * 0.6},${y - dy * size + py * size * 0.6}L${x},${y}L${x - dx * size - px * size * 0.6},${y - dy * size - py * size * 0.6}`;
}

/**
 * Bobinin (sargının) alanı, parçanın yerel koordinatlarında: içeride eksen boyunca, dışarıda
 * dönen iki kapalı çizgi; alan sargının içinde akımın girdiği uçtan çıktığı uca doğrudur (sağ el:
 * parmaklar akımla dönerken başparmak). `axis`: sargının ekseni boyunca −1 → +1 yönü; `half`:
 * sargının yarı boyu; `center`: sargının ortası.
 */
function coilField(current: number, center: Point, axis: Point, half: number, rotation: number) {
  const s = fieldStrength(current);
  if (s <= 0) return null;
  const sign = Math.sign(current);
  const ux = axis.x * sign;
  const uy = axis.y * sign;
  const nx = -axis.y;
  const ny = axis.x;
  const loops = [11];
  const paths: string[] = [];
  const heads: string[] = [];
  // İçerideki çizgi (eksen boyunca, N ucunda ok).
  paths.push(`M${center.x - ux * (half + 6)},${center.y - uy * (half + 6)}L${center.x + ux * (half + 6)},${center.y + uy * (half + 6)}`);
  heads.push(arrowHead(center.x + ux * (half + 6), center.y + uy * (half + 6), ux, uy));
  for (const w of loops) {
    // N ucundan çıkıp dışarıdan S ucuna dönen iki yay (iki yanda).
    for (const side of [1, -1]) {
      const sx = center.x + ux * (half + 6);
      const sy = center.y + uy * (half + 6);
      const ex = center.x - ux * (half + 6);
      const ey = center.y - uy * (half + 6);
      const cx1 = sx + ux * w + nx * side * w * 1.5;
      const cy1 = sy + uy * w + ny * side * w * 1.5;
      const cx2 = ex - ux * w + nx * side * w * 1.5;
      const cy2 = ey - uy * w + ny * side * w * 1.5;
      paths.push(`M${sx},${sy}C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`);
      // Yayın ortasında, S'ye doğru ok.
      const mx = 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * ex;
      const my = 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ey;
      heads.push(arrowHead(mx - ux * 2, my - uy * 2, -ux, -uy, 4));
    }
  }
  const nX = center.x + ux * (half + 14);
  const nY = center.y + uy * (half + 14);
  const sX = center.x - ux * (half + 14);
  const sY = center.y - uy * (half + 14);
  return (
    <g opacity={0.3 + 0.6 * s}>
      <path d={paths.join('')} fill="none" stroke={FIELD_COLOR} strokeWidth={1.2} strokeDasharray="5 3" />
      <path d={heads.join('')} fill="none" stroke={FIELD_COLOR} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {(
        [
          ['N', nX, nY],
          ['S', sX, sY],
        ] as const
      ).map(([pole, x, y]) => (
        <text
          key={pole}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fontWeight={700}
          fill={FIELD_COLOR}
          transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {pole}
        </text>
      ))}
    </g>
  );
}

/** Transformatörün çekirdeğindeki akı: çekirdek çizgilerinin iki yanında, yönü mıknatıslanma akımından. */
function coreFlux(current: number) {
  const s = fieldStrength(current);
  if (s <= 0) return null;
  const dir = Math.sign(current);
  const heads = [-11, 11].flatMap((x) => [-14, 6].map((y) => arrowHead(x, y + dir * 6, 0, dir, 4.5)));
  return (
    <g opacity={0.3 + 0.6 * s}>
      <path d="M-11,-26V26M11,-26V26" fill="none" stroke={FIELD_COLOR} strokeWidth={1.2} strokeDasharray="5 3" />
      <path d={heads.join('')} fill="none" stroke={FIELD_COLOR} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Parçanın yerel koordinatlarındaki alan çizimi (yoksa null). */
function partField(part: Part, field: number) {
  switch (part.type) {
    case 'inductor':
      return coilField(field, { x: 0, y: -3 }, { x: 1, y: 0 }, 24, part.rotation);
    case 'relay':
      return coilField(field, { x: -22, y: 0 }, { x: 0, y: 1 }, 16, part.rotation);
    case 'transformer':
      return coreFlux(field);
    default:
      return null;
  }
}

export function MagneticField({ doc, graph, frame }: { doc: CircuitDoc; graph: FlowGraph; frame: SimFrame }) {
  const wires = [];
  for (let i = 0; i < graph.segments.length; i++) {
    const segment = graph.segments[i]!;
    if (segment.earth) continue;
    const mark = wireField(segment.key, segment.a, segment.b, frame.segmentFlows[i] ?? 0);
    if (mark) wires.push(mark);
  }
  const coils = [];
  for (const part of doc.parts) {
    const field = frame.live.get(part.id)?.field;
    if (field === undefined || !CATALOG[part.type]) continue;
    const drawing = partField(part, field);
    if (!drawing) continue;
    coils.push(
      <g key={part.id} transform={`translate(${part.x * GRID} ${part.y * GRID}) rotate(${part.rotation})`}>
        {drawing}
      </g>,
    );
  }
  return (
    <g pointerEvents="none" aria-hidden="true">
      {wires}
      {coils}
    </g>
  );
}
