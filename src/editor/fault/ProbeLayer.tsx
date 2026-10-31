// Multimetrenin uçları şemada (B2, R1): halka ve etiket ("Kırmızı uç · RC alt bacağı"), uçlardan
// paneline giden kablolar; uç koyulurken altta yönerge. Tuvalin üstünde ekran koordinatlarında çizilir
// (yakınlaştırınca yazılar büyümez). Halkaya tıklayınca o uç taşınır.

import { tr } from '../../i18n/tr';
import type { Point } from '../../model/types';
import { Icon } from '../icons';
import type { ProbeColor } from './meter';

export interface ProbeMark {
  readonly at: Point;
  readonly label: string;
}

export interface ProbeView {
  readonly red: ProbeMark | null;
  readonly black: ProbeMark | null;
  /** Koyulan uç: şemada bir bacağa ya da kabloya tıklanınca yerleşir. */
  readonly placing: ProbeColor | null;
  /** Kabloların bağlandığı nokta (panelin üst kenarı; tuvalin sol alt köşesine göre, px). */
  readonly anchor?: { readonly x: number; readonly bottom: number } | null;
  readonly onPick: (color: ProbeColor) => void;
}

const INK: Record<ProbeColor, string> = { red: 'var(--color-danger)', black: 'var(--color-ink)' };

export function ProbeLayer({ probes, toScreen, size, touch }: { probes: ProbeView; toScreen: (g: Point) => { x: number; y: number }; size: { width: number; height: number }; touch: boolean }) {
  const t = tr.fault.meter;
  const marks = (['black', 'red'] as const).flatMap((color) => {
    const mark = probes[color];
    return mark ? [{ color, mark, p: toScreen(mark.at) }] : [];
  });
  const anchor = probes.anchor;
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {anchor &&
          marks.map(({ color, p }) => {
            const ax = anchor.x + (color === 'red' ? 18 : -18);
            const ay = size.height - anchor.bottom;
            return <path key={color} d={`M ${p.x} ${p.y} C ${p.x} ${p.y + (ay - p.y) * 0.6}, ${ax} ${ay - 90}, ${ax} ${ay}`} fill="none" stroke={INK[color]} strokeWidth={3} strokeLinecap="round" opacity={0.85} />;
          })}
      </svg>
      {marks.map(({ color, mark, p }) => (
        <span key={color} className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
          <button
            type="button"
            aria-label={t.move(color === 'red' ? t.red : t.black, mark.label)}
            onClick={() => probes.onPick(color)}
            className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}
          >
            <span
              className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-[3px] bg-panel ${probes.placing === color ? 'ring-4 ring-accent/40' : ''}`}
              style={{ borderColor: INK[color] }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: INK[color] }} />
            </span>
          </button>
          <span
            className={`absolute top-0 left-4 -translate-y-1/2 rounded-full px-2.5 py-1 text-label font-semibold whitespace-nowrap shadow-sm ${color === 'red' ? 'bg-danger text-white' : 'bg-ink text-panel'}`}
          >
            {`${color === 'red' ? t.redTip : t.blackTip} · ${mark.label}`}
          </span>
        </span>
      ))}
      {probes.placing && (
        // Masaüstünde panel sol altta: yönerge panelin sağında; telefonda ortada.
        <p className={`pointer-events-none absolute bottom-4 m-0 flex items-center gap-2 ${anchor ? 'left-[336px]' : 'left-1/2 -translate-x-1/2'} rounded-full bg-ink px-4 py-2 text-small font-medium whitespace-nowrap text-panel shadow-md`}>
          <Icon name="multimeter" className="h-4 w-4" />
          {t.placing(probes.placing === 'red' ? t.red : t.black, touch)}
        </p>
      )}
    </>
  );
}

/** Şemada bir yerin halkası: bildirimde seçilen yer (mavi) ya da bulunan arıza (yeşil; R2, R3). */
export interface PlaceMark {
  readonly at: Point;
  readonly label: string;
  readonly tone: 'accent' | 'ok';
}

export function PlaceMarks({ marks, hint, toScreen }: { marks: readonly PlaceMark[]; hint: string | null; toScreen: (g: Point) => { x: number; y: number } }) {
  return (
    <>
      {marks.map((m) => {
        const p = toScreen(m.at);
        const ok = m.tone === 'ok';
        return (
          <span key={`${m.at.x},${m.at.y},${m.tone}`} className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
            <span className={`absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${ok ? 'border-ok bg-ok/15' : 'border-accent bg-accent/15'}`} />
            <span className={`absolute top-0 left-7 flex -translate-y-1/2 items-center gap-1.5 rounded-full px-2.5 py-1 text-label font-semibold whitespace-nowrap text-white shadow-sm ${ok ? 'bg-ok' : 'bg-accent'}`}>
              {ok && <Icon name="check" className="h-3.5 w-3.5" />}
              {m.label}
            </span>
          </span>
        );
      })}
      {hint && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 m-0 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-small font-medium whitespace-nowrap text-panel shadow-md">
          <Icon name="flag" className="h-4 w-4" />
          {hint}
        </p>
      )}
    </>
  );
}
