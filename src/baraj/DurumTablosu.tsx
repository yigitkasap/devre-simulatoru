// Durum tablosu: her seviyenin probu, transistörü ve LED'i (prob → transistör → LED), canlı. Satırlar
// yukarıdan aşağı Seviye 3, 2, 1; çalışan katın (transistör aktif ya da doyumda) satırı seviye
// renginin açık tonuyla boyanır. Transistör durumu yazıyla (kesim / aktif / doyum), LED durumu
// yazıyla ve noktayla; renk tek başına anlam taşımaz.

import { tr } from '../i18n/tr';
import { formatNumber } from '../sim/units';
import { LEVEL_COLORS, milliamps, type DurumRow, type LedState, type Region } from './seviye';
import { DropIcon, LevelBadge } from './simgeler';

export type TableVariant = 'desktop' | 'tablet' | 'phone' | 'landscape';

const GRID: Readonly<Record<TableVariant, string>> = {
  desktop: '118px 96px minmax(0,1fr) 184px',
  tablet: '34px 74px minmax(0,1fr) 150px',
  phone: '30px 72px minmax(0,1fr) 98px',
  landscape: '28px 62px minmax(0,1fr) 90px',
};

const REGION_CLASS: Readonly<Record<Region, string>> = {
  saturation: 'bg-ink text-on-ink border-ink',
  active: 'bg-accent-soft text-accent-ink border-accent/45',
  cutoff: 'bg-panel text-muted border-line-2',
};

/**
 * Satır yükseklikleri (normal, büyük yazı). Yatay telefonda not ikinci satıra iner: iki satırlık yer
 * baştan ayrılır.
 */
const ROW_HEIGHT: Readonly<Record<TableVariant, readonly [string, string]>> = {
  desktop: ['h-[46px]', 'h-[48px]'],
  tablet: ['h-[46px]', 'h-[48px]'],
  phone: ['h-[46px]', 'h-[48px]'],
  landscape: ['h-[58px]', 'h-[66px]'],
};

function LedDot({ state, level, size }: { state: LedState; level: 1 | 2 | 3; size: number }) {
  const c = LEVEL_COLORS[level];
  const style =
    state === 'on'
      ? { background: c.lamp, boxShadow: `0 0 0 1.5px ${c.badge}, 0 0 10px ${c.lamp}` }
      : state === 'off'
        ? { background: 'var(--color-face)', boxShadow: 'inset 0 0 0 1.5px var(--color-rack-line)' }
        : { background: c.lamp, opacity: 0.45, boxShadow: `inset 0 0 0 1.5px ${c.badge}` };
  return <span aria-hidden="true" className="shrink-0 rounded-full" style={{ width: size, height: size, ...style }} />;
}

export interface DurumTablosuProps {
  readonly rows: readonly DurumRow[];
  readonly variant: TableVariant;
  /** Projeksiyon: yazılar en az 16 px. */
  readonly big?: boolean;
}

export function DurumTablosu({ rows, variant, big = false }: DurumTablosuProps) {
  const narrow = variant !== 'desktop';
  const showCurrent = variant === 'desktop' || variant === 'tablet';
  const cols = GRID[variant];
  const pad = variant === 'desktop' ? 'px-4' : variant === 'tablet' ? 'px-3.5' : variant === 'phone' ? 'px-3' : 'px-2.5';
  const text = big ? 'text-[16px]' : variant === 'landscape' ? 'text-[13.5px]' : 'text-body';
  const badgeSize = big ? 24 : 22;
  return (
    <div role="table" aria-label={tr.baraj.durum.tableLabel} className={`flex flex-col ${text}`}>
      <div
        role="row"
        className={`grid items-center gap-2.5 border-b border-line ${pad} font-semibold text-muted ${big ? 'h-[30px] text-[13.5px]' : 'h-[29px] text-[11.5px]'}`}
        style={{ gridTemplateColumns: cols }}
      >
        <span role="columnheader">{narrow ? <span className="sr-only">{tr.baraj.durum.columns.level}</span> : tr.baraj.durum.columns.level}</span>
        <span role="columnheader">{tr.baraj.durum.columns.probe}</span>
        <span role="columnheader">{tr.baraj.durum.columns.transistor}</span>
        <span role="columnheader">{tr.baraj.durum.columns.led}</span>
      </div>
      {rows.map((row) => {
        const c = LEVEL_COLORS[row.level];
        const mA = row.current !== null ? milliamps(row.current) : null;
        return (
          <div
            key={row.level}
            role="row"
            // Sabit satır yüksekliği: transistör durumu, akım ya da not gelip gidince tablo boy değiştirmesin.
            className={`grid items-center gap-2.5 overflow-hidden border-b border-app ${pad} ${ROW_HEIGHT[variant][big ? 1 : 0]}`}
            style={{ gridTemplateColumns: cols, background: row.working ? c.soft : undefined }}
          >
            <span role="cell" className="inline-flex items-center gap-2 font-semibold">
              <LevelBadge level={row.level} size={badgeSize} />
              {narrow ? <span className="sr-only">{tr.baraj.level(row.level)}</span> : tr.baraj.level(row.level)}
            </span>
            <span role="cell" className="inline-flex items-center gap-1.5">
              <DropIcon wet={row.wet} size={big ? 18 : 16} />
              {row.wet ? tr.baraj.durum.wet : tr.baraj.durum.dry}
            </span>
            <span role="cell" className={`flex min-w-0 items-center gap-x-2 gap-y-0.5 ${variant === 'landscape' ? 'flex-wrap' : 'flex-nowrap'}`}>
              <span className="font-mono font-semibold">{row.transistor}</span>
              {row.region ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 font-semibold whitespace-nowrap ${REGION_CLASS[row.region]} ${
                    big ? 'h-7 text-[16px]' : 'h-6 text-[12.5px]'
                  }`}
                >
                  {tr.baraj.durum.regions[row.region]}
                </span>
              ) : (
                <span className="text-muted">{tr.baraj.durum.noSim}</span>
              )}
              {row.note && (
                <span className={`min-w-0 truncate text-muted ${big ? 'text-[16px]' : 'text-small'} ${variant === 'landscape' ? 'basis-full' : ''}`}>
                  {row.note.kind === 'silenced' ? tr.baraj.durum.silenced(row.note.by) : tr.baraj.durum.discharging(row.note.capacitor)}
                </span>
              )}
            </span>
            <span role="cell" className="inline-flex items-center gap-[7px] whitespace-nowrap">
              <LedDot state={row.led} level={row.level} size={big ? 19 : 17} />
              <span>{tr.baraj.durum.led[row.led]}</span>
              {showCurrent && mA && (
                <span className={`font-mono text-muted tabular ${big ? 'text-[16px]' : 'text-small'}`}>
                  {`${formatNumber(mA.value, mA.decimals)} mA`}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
