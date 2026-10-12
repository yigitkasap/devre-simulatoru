// Tuvaldeki bir parça: döndürülmüş sembol, dik duran ad/değer yazıları, seçim çerçevesi.

import { memo } from 'react';
import { CATALOG } from '../model/catalog';
import { rotatedBox } from '../model/geometry';
import { GRID, type Part } from '../model/types';
import { tr } from '../i18n/tr';
import { numProp, strProp } from '../sim/netlist';
import { formatSI } from '../sim/units';
import type { ResistorStyle } from './settings';
import { PartSymbol, type LiveVisual } from './symbols';

/** Parçanın tuvalde adının altında görünen değeri (ör. "4,7 kΩ"). */
export function partValueText(part: Part): string {
  const p = part.props;
  switch (part.type) {
    case 'battery':
      return formatSI(numProp(p, 'voltage', 0), 'V', { trim: true, digits: 4 });
    case 'resistor':
      return formatSI(numProp(p, 'resistance', 0), 'Ω', { trim: true, digits: 4 });
    case 'capacitor':
      return formatSI(numProp(p, 'capacitance', 0), 'F', { trim: true, digits: 4 });
    case 'led':
      return tr.devices.ledColors[strProp(p, 'color', ['red', 'green', 'blue'] as const, 'red')] ?? '';
    default:
      return '';
  }
}

export type PartTone = 'normal' | 'selected' | 'hover' | 'error' | 'warning';

const TONE_COLORS: Record<PartTone, string> = {
  normal: 'var(--color-symbol)',
  selected: 'var(--color-select)',
  hover: '#3d63b8',
  error: 'var(--color-danger)',
  warning: 'var(--color-warn)',
};

export interface PartViewProps {
  readonly part: Part;
  readonly tone: PartTone;
  readonly resistorStyle: ResistorStyle;
  readonly live?: LiveVisual;
  /** Ölçü aletlerinin ekranındaki metin; null ise boş ekran gösterilir. */
  readonly meterText?: string | null;
  /** Kırmızı yanıp sönen çerçeve (ör. kısa devre). */
  readonly alarm?: boolean;
}

const LABEL_STYLE = { fontFamily: 'var(--font-sans)', fontSize: 11 } as const;

export const PartView = memo(function PartView({ part, tone, resistorStyle, live, meterText, alarm }: PartViewProps) {
  const def = CATALOG[part.type];
  const box = rotatedBox(def.bounds, part.rotation, { x: 0, y: 0 });
  const left = box.x * GRID;
  const top = box.y * GRID;
  const right = (box.x + box.w) * GRID;
  const bottom = (box.y + box.h) * GRID;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const horizontal = part.rotation % 180 === 0;
  const isMeter = part.type === 'voltmeter' || part.type === 'ammeter';
  const value = partValueText(part);
  const color = TONE_COLORS[tone];

  // Yazıların konumu: yatay parçada ad üstte, değer altta; dikey parçada ikisi de sağda.
  const display = isMeter ? meterDisplay(part.type === 'voltmeter' ? 'V' : 'A', meterText ?? null) : null;
  let nameX: number;
  let nameY: number;
  let valueY: number;
  let anchor: 'middle' | 'start';
  let displayX: number;
  let displayY: number;
  if (horizontal) {
    anchor = 'middle';
    nameX = cx;
    nameY = isMeter ? bottom + 13 : top - 5;
    valueY = bottom + 13;
    displayX = cx - DISPLAY_W / 2;
    displayY = top - DISPLAY_H - 6;
  } else {
    anchor = 'start';
    nameX = right + 6;
    nameY = isMeter ? cy + DISPLAY_H / 2 + 14 : cy - 3;
    valueY = cy + 11;
    displayX = right + 6;
    displayY = cy - DISPLAY_H / 2;
  }

  return (
    <g transform={`translate(${part.x * GRID} ${part.y * GRID})`} style={{ color }}>
      {tone === 'selected' && (
        <rect
          x={left - 4}
          y={top - 4}
          width={right - left + 8}
          height={bottom - top + 8}
          rx={3}
          fill="var(--color-accent-soft)"
          fillOpacity={0.55}
          stroke="var(--color-select)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
      {alarm && (
        <rect
          x={left - 6}
          y={top - 6}
          width={right - left + 12}
          height={bottom - top + 12}
          rx={4}
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth={2.5}
          className="alarm-blink"
        />
      )}
      <g transform={part.rotation ? `rotate(${part.rotation})` : undefined}>
        <PartSymbol
          type={part.type}
          props={part.props}
          resistorStyle={resistorStyle}
          rotation={part.rotation}
          {...(live ? { live } : {})}
        />
      </g>
      {display && <g transform={`translate(${displayX} ${displayY})`}>{display}</g>}
      {def.showLabel && (
        <text x={nameX} y={nameY} textAnchor={anchor} style={LABEL_STYLE} fontWeight={600} fill="var(--color-ink)">
          {part.label}
        </text>
      )}
      {value && !isMeter && (
        <text x={nameX} y={valueY} textAnchor={anchor} style={LABEL_STYLE} fill="var(--color-muted)" className="tabular">
          {value}
        </text>
      )}
    </g>
  );
});

const DISPLAY_W = 70;
const DISPLAY_H = 19;

/** Ölçü aletinin küçük ekranı. */
function meterDisplay(unit: string, text: string | null) {
  return (
    <g>
      <rect width={DISPLAY_W} height={DISPLAY_H} rx={3} fill="#1e2a25" stroke="#0f1512" strokeWidth={1} />
      <text
        x={DISPLAY_W - 6}
        y={DISPLAY_H / 2 + 0.5}
        textAnchor="end"
        dominantBaseline="central"
        fill={text ? '#a6f4bd' : '#5e7a68'}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
        className="tabular"
      >
        {text ?? `– – – ${unit}`}
      </text>
    </g>
  );
}
