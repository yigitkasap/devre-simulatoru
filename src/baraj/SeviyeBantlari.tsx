// Şemadaki seviye bantları (CircuitView alt katmanı): her katın parçalarını (RBn, Cn, RPn, Qn, LEDn,
// RCn) çevreleyen kutu. Çalışan kat (transistör aktif ya da doyumda) seviye renginin açık tonuyla ve
// kenarlıkla, kesimdeki kat kesik gri kenarlıkla çizilir; sol altta "Seviye n · renk".

import { tr } from '../i18n/tr';
import type { Box } from '../model/catalog';
import { GRID } from '../model/types';
import { LEVEL_COLORS, type LevelNo } from './seviye';

export function SeviyeBantlari({ bands, working }: { bands: ReadonlyArray<{ level: LevelNo; box: Box }>; working: (level: LevelNo) => boolean }) {
  return (
    <g aria-hidden="true">
      {bands.map(({ level, box }) => {
        const on = working(level);
        const c = LEVEL_COLORS[level];
        const x = box.x * GRID;
        const y = box.y * GRID;
        const w = box.w * GRID;
        const h = box.h * GRID;
        return (
          <g key={level}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={10}
              fill={on ? c.soft : 'none'}
              stroke={on ? c.badge : '#c4cad2'}
              strokeWidth={on ? 2 : 1.4}
              strokeDasharray={on ? undefined : '6 5'}
            />
            <text x={x + 9} y={y + h - 8} fontSize={15} fontWeight={600} fill={c.text} style={{ fontFamily: 'var(--font-sans)' }}>
              {tr.baraj.bandLabel(level)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Devre kartının başlığındaki küçük lejant. */
export function BantLejanti() {
  return (
    <span className="flex items-center gap-3.5 text-[12.5px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 w-[22px] rounded-[4px] border-[1.5px] border-ok bg-ok-soft" />
        {tr.baraj.devre.legendWorking}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 w-[22px] rounded-[4px] border-[1.2px] border-dashed border-line-2" />
        {tr.baraj.devre.legendCutoff}
      </span>
    </span>
  );
}
