// Salt görüntüleyen devre çizimi (baraj sayfası gibi tanıtım sayfaları için): simülatörün parça
// sembolleri ve gerilim renkleri, ama seçme, taşıma ve kablo çizme yok. Devre kendi kutusuna sığar;
// `minWidth` verilirse daha dar kutuda kendi içinde kayar (telefonda büyük devre okunabilsin).

import { memo } from 'react';
import type { Connectivity } from '../model/connectivity';
import { partBounds } from '../model/geometry';
import { GRID, type CircuitDoc } from '../model/types';
import { UNKNOWN_WIRE_COLOR, UNKNOWN_WIRE_DASH, voltageColor } from './colors';
import { PartView } from './PartView';
import type { Settings } from './settings';
import type { SimFrame } from './useSimulation';

export interface CircuitViewProps {
  readonly doc: CircuitDoc;
  readonly connectivity: Connectivity;
  readonly frame: SimFrame | null;
  readonly settings: Pick<Settings, 'resistorStyle' | 'wireScale'>;
  /** Erişilebilir ad (çizimin kısa anlatımı). */
  readonly label: string;
  /** Çizimin en küçük genişliği (px); kutu daha darsa yatay kaydırılır. */
  readonly minWidth?: number;
}

/** Devrenin sınırları (ızgara birimi), kenar boşluğuyla. */
function bounds(doc: CircuitDoc) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const part of doc.parts) {
    const b = partBounds(part);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  for (const wire of doc.wires) {
    for (const p of wire.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  // Ad ve değer yazıları sembollerin biraz dışına taşar.
  const pad = 4;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad + 6, h: y1 - y0 + 2 * pad };
}

export const CircuitView = memo(function CircuitView({ doc, connectivity, frame, settings, label, minWidth }: CircuitViewProps) {
  const b = bounds(doc);
  return (
    <div className="h-full w-full overflow-auto overscroll-contain">
      <svg
        role="img"
        aria-label={label}
        viewBox={`${b.x * GRID} ${b.y * GRID} ${b.w * GRID} ${b.h * GRID}`}
        className="schematic block h-full w-full"
        style={minWidth ? { minWidth, minHeight: (minWidth * b.h) / b.w } : undefined}
        preserveAspectRatio="xMidYMid meet"
      >
        {doc.wires.map((wire) => {
          let stroke = 'var(--color-symbol)';
          let dash: string | undefined;
          if (frame) {
            const v = frame.wireVoltages.get(wire.id);
            stroke = v === undefined ? UNKNOWN_WIRE_COLOR : voltageColor(v / frame.vmax, settings.wireScale);
            if (v === undefined) dash = UNKNOWN_WIRE_DASH;
          }
          return (
            <polyline
              key={wire.id}
              points={wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={frame ? 3 : 2}
              strokeDasharray={dash}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {connectivity.junctions.map((p) => (
          <circle key={`j${p.x},${p.y}`} cx={p.x * GRID} cy={p.y * GRID} r={3.2} fill="var(--color-symbol)" />
        ))}
        {doc.parts.map((part) => {
          const live = frame?.live.get(part.id);
          return <PartView key={part.id} part={part} tone="normal" resistorStyle={settings.resistorStyle} {...(live ? { live } : {})} />;
        })}
      </svg>
    </div>
  );
});
