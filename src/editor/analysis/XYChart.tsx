// x–y grafiği (eğri izleyici N3, Bode N4, tarama): doğrusal ya da logaritmik x ekseni, eğri adları sağ uçta
// (sığmıyorsa ya da telefonda grafiğin altında açıklama satırlarında), sürüklenebilir dikey imleç
// (klavyeyle de), isteğe bağlı noktalar, yatay ve dikey işaret çizgileri (yazıları çizgilerle, eğrilerle ve
// birbirleriyle çakışmayan yerde), ek katman (yük doğrusu, Q noktası). SVG piksel boyunda çizilir; PNG'ye
// açıklama satırları da girer. Yazılarda alt simge `_{...}` (svgSub).

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { formatNumber } from '../../sim/units';
import { legendLayout, pickSpot, textWidth, type Box, type Segment } from './chartText';
import { niceTicks, tickText } from './format';
import { traceColor } from './traces';

/** SVG yazısında alt simgeler: "I_{C}" → I ve aşağıda küçük C. */
export function svgSub(text: string): ReactNode {
  const parts = text.split(/_\{([^}]*)\}/);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <tspan key={i} fontSize="0.75em" dy="0.3em">
        {p}
        <tspan dy="-0.3em"> </tspan>
      </tspan>
    ) : (
      p
    ),
  );
}

export interface XYSeries {
  readonly id: string;
  readonly color: number;
  readonly points: readonly (readonly [number, number])[];
  /** Sağ uçta (ya da altta açıklamada) yazan ad ("0 V", "10 µA", "V_{GS} = −0,2 V"). */
  readonly label?: string;
  /** Ölçüm noktaları ayrıca nokta olarak (Bode). */
  readonly dots?: boolean;
  /** Kesikli ve ince (Bode'un Teori eğrisi). */
  readonly dashed?: boolean;
  /** Rengin yerine (tema belirteci): Teori eğrisi gri, Q basamağı uyarı renginde. */
  readonly stroke?: string;
  /** Kalın çizgi (eğri izleyicide Q noktasının basamağı). */
  readonly strong?: boolean;
}

/** Bir grafiğin en az yüksekliği (px): daha alçakta eksen yazıları üst üste biner. */
export const MIN_CHART = 140;

export interface XYChartProps {
  readonly series: readonly XYSeries[];
  readonly xLabel: ReactNode;
  readonly yLabel: ReactNode;
  /** y değerlerinin çizimde çarpanı (A → mA: 1000). */
  readonly yScale?: number;
  readonly logX?: boolean;
  readonly cursor: number | null;
  readonly onCursor?: (x: number) => void;
  readonly cursorText?: (x: number) => string;
  readonly ariaLabel: string;
  /** Yatay işaret çizgileri (−3 dB) ve dikey işaretler (f_H), çizim biriminde. */
  readonly hLines?: readonly { readonly y: number; readonly label?: string }[];
  readonly vLines?: readonly { readonly x: number; readonly label?: string }[];
  /** Ek katman: X ve Y (çizim biriminde) dönüşümleriyle çizilir. */
  readonly overlay?: (X: (x: number) => number, Y: (y: number) => number) => ReactNode;
  /** Grafiğin altındaki satır (imleç değerleri). */
  readonly footer?: ReactNode;
  readonly compact?: boolean;
  /** Sabit y aralığı (çizim biriminde); verilmezse verilerden. */
  readonly yRange?: readonly [number, number];
  /** Çizim alanının yüksekliği; açıklama satırları buna eklenir. */
  readonly height?: number;
  /**
   * Eğri adlarının yeri: 'auto' sağ uçta (genişliğin üçte birine sığmıyorsa altta), 'below' her zaman
   * altta (telefon: grafik tam genişlik). Verilmezse compact'ta altta.
   */
  readonly legend?: 'auto' | 'below';
}

/** İşaret yazılarının boyu (px) ve kutusunun yüksekliği. */
const MARK_FONT = 10.5;
const MARK_BOX = 13;
const LABEL_FONT = 11;
const LEGEND_ROW = 18;

export function XYChart({ series, xLabel, yLabel, yScale = 1, logX = false, cursor, onCursor, cursorText, ariaLabel, hLines = [], vLines = [], overlay, footer, compact = false, yRange, height, legend }: XYChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const clipId = `xy-${useId().replace(/:/g, '')}`;
  // Eğri adları ölçülen genişlikleriyle: sağda yer genişliğin üçte birine sığıyorsa sağ uçta, yoksa altta.
  const named = series.filter((s) => s.label);
  const widths = named.map((s) => textWidth(s.label!, LABEL_FONT));
  const base = compact ? { l: 36, r: 16, t: 18, b: 32 } : { l: 48, r: 16, t: 22, b: 40 };
  const rightWidth = Math.max(0, ...widths) + 12;
  const right = named.length > 0 && (legend ?? (compact ? 'below' : 'auto')) === 'auto' && rightWidth <= size.w / 3;
  const rows = named.length > 0 && !right ? legendLayout(widths, Math.max(40, size.w - base.l - base.r)) : null;
  const legendHeight = rows ? rows.rows * LEGEND_ROW + 4 : 0;
  const m = { ...base, r: right ? Math.max(compact ? 48 : 64, rightWidth) : base.r, b: base.b + legendHeight };
  const pw = Math.max(10, size.w - m.l - m.r);
  const ph = Math.max(10, size.h - m.t - m.b);

  const all = series.flatMap((s) => s.points);
  const fx = (x: number) => (logX ? Math.log10(Math.max(1e-30, x)) : x);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of all) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, fx(x));
    x1 = Math.max(x1, fx(x));
    y0 = Math.min(y0, y * yScale);
    y1 = Math.max(y1, y * yScale);
  }
  const empty = !Number.isFinite(x0);
  if (empty) {
    x0 = 0;
    x1 = 1;
    y0 = 0;
    y1 = 1;
  }
  if (yRange) [y0, y1] = yRange;
  // Doğrusal eksen sıfırdan başlar; küçük negatif taşma (doyumdaki ters akım) ekseni uzatmaz.
  else if (!logX) y0 = y0 < 0 && -y0 > 0.05 * Math.abs(y1) ? y0 : 0;
  const xt = logX ? { ticks: decades(x0, x1), step: 1 } : niceTicks(x0, x1, compact ? 4 : 6);
  // Bölme sayısı çizimin yüksekliğine göre (alçak grafikte yazılar üst üste binmesin).
  const yt = niceTicks(y0, y1, Math.max(2, Math.min(compact ? 3 : 5, Math.floor(ph / 28))));
  const xa = logX ? Math.floor(x0) : xt.ticks[0]!;
  const xb = logX ? Math.ceil(x1) : xt.ticks[xt.ticks.length - 1]!;
  const ya = yt.ticks[0]!;
  const yb = yt.ticks[yt.ticks.length - 1]!;
  const X = (x: number) => m.l + ((fx(x) - xa) / (xb - xa || 1)) * pw;
  const Y = (y: number) => m.t + ph - ((y - ya) / (yb - ya || 1)) * ph;
  const xOf = (px: number) => {
    const v = xa + ((px - m.l) / pw) * (xb - xa);
    return logX ? 10 ** v : v;
  };
  const lo = logX ? 10 ** x0 : x0;
  const hi = logX ? 10 ** x1 : x1;

  const dragging = useRef(false);
  const fromPointer = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    onCursor?.(Math.min(hi, Math.max(lo, xOf(e.clientX - rect.left))));
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (cursor === null || !onCursor) return;
    const f = e.shiftKey ? 10 : 50;
    let next = cursor;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = logX ? cursor * 10 ** ((x1 - x0) / f) : cursor + (hi - lo) / f;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = logX ? cursor / 10 ** ((x1 - x0) / f) : cursor - (hi - lo) / f;
    else if (e.key === 'Home') next = lo;
    else if (e.key === 'End') next = hi;
    else return;
    e.preventDefault();
    onCursor(Math.min(hi, Math.max(lo, next)));
  };
  const cx = cursor !== null && !empty ? X(cursor) : null;
  // Sağ uçtaki adlar üst üste binmesin (en az 14 px aralık) ve grafiğin boyunu aşmasın (alttaki x
  // bölmesinin yazısına da değmesin).
  const ends = right
    ? named
        .filter((s) => s.points.length > 0)
        .map((s) => ({ s, y: Math.min(m.t + ph - 4, Math.max(m.t + 4, Y(s.points[s.points.length - 1]![1] * yScale))) }))
        .sort((a, b) => a.y - b.y)
    : [];
  for (let i = 1; i < ends.length; i++) if (ends[i]!.y - ends[i - 1]!.y < 14) ends[i]!.y = ends[i - 1]!.y + 14;
  for (let i = ends.length - 1; i >= 0; i--) {
    const limit = i === ends.length - 1 ? m.t + ph - 4 : ends[i + 1]!.y - 14;
    if (ends[i]!.y > limit) ends[i]!.y = limit;
  }

  // İşaret yazıları: önce yatay çizgilerinki (uzun), sonra dikeylerinki; her biri adaylardan çizgilerle,
  // eğrilerle ve öncekilerle en az çakışana.
  const marks: { key: string; text: string; box: Box }[] = [];
  if (!empty && size.w > 0 && [...hLines, ...vLines].some((l) => l.label)) {
    const plot: Box = { x: m.l, y: m.t, w: pw, h: ph };
    const lines: Segment[] = [...hLines.map((h): Segment => [m.l, Y(h.y), m.l + pw, Y(h.y)]), ...vLines.map((v): Segment => [X(v.x), m.t, X(v.x), m.t + ph])];
    const curves: Segment[] = [];
    for (const s of series) {
      for (let i = 1; i < s.points.length; i++) {
        const [xa, ya] = s.points[i - 1]!;
        const [xb, yb] = s.points[i]!;
        if ([xa, ya, xb, yb].every(Number.isFinite)) curves.push([X(xa), Y(ya * yScale), X(xb), Y(yb * yScale)]);
      }
    }
    const boxes: Box[] = [];
    const box = (x: number, baseline: number, w: number): Box => ({ x, y: baseline - 10, w, h: MARK_BOX });
    for (const h of hLines) {
      if (!h.label) continue;
      const w = textWidth(h.label, MARK_FONT);
      const y = Y(h.y);
      const xs = [m.l + 6, ...vLines.map((v) => X(v.x) + 6), m.l + pw - 6 - w, ...vLines.map((v) => X(v.x) - 6 - w)];
      const spot = pickSpot(xs.flatMap((x) => [box(x, y + 13, w), box(x, y - 4, w)]), { lines, curves, boxes }, plot);
      boxes.push(spot);
      marks.push({ key: `h${h.y}`, text: h.label, box: spot });
    }
    for (const v of vLines) {
      if (!v.label) continue;
      const w = textWidth(v.label, MARK_FONT);
      const x = X(v.x);
      const ys = [m.t + 12, m.t + ph - 4, ...hLines.flatMap((h) => [Y(h.y) + 13, Y(h.y) - 4])];
      const spot = pickSpot(ys.flatMap((y) => [box(x + 4, y, w), box(x - 4 - w, y, w)]), { lines, curves, boxes }, plot);
      boxes.push(spot);
      marks.push({ key: `v${v.x}`, text: v.label, box: spot });
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={height ? { height: height + legendHeight, flex: 'none' } : undefined}>
      <div ref={box} className="relative min-h-0 flex-1" style={{ minHeight: MIN_CHART }}>
        {size.w > 0 && (
          <svg width={size.w} height={size.h} role="img" aria-label={ariaLabel} className="absolute inset-0 block select-none" style={{ fontFamily: 'var(--font-mono)' }}>
            <rect x={m.l} y={m.t} width={pw} height={ph} fill="var(--color-panel)" stroke="var(--color-line)" />
            {xt.ticks.map((v) => (
              <g key={`x${v}`}>
                <line x1={m.l + ((v - xa) / (xb - xa || 1)) * pw} x2={m.l + ((v - xa) / (xb - xa || 1)) * pw} y1={m.t} y2={m.t + ph} stroke="var(--color-line)" strokeWidth={0.75} />
                <text x={m.l + ((v - xa) / (xb - xa || 1)) * pw} y={m.t + ph + 14} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
                  {logX ? decadeText(v) : tickText(v, xt.step)}
                </text>
              </g>
            ))}
            {yt.ticks.map((v) => (
              <g key={`y${v}`}>
                <line x1={m.l} x2={m.l + pw} y1={Y(v)} y2={Y(v)} stroke="var(--color-line)" strokeWidth={0.75} />
                <text x={m.l - 6} y={Y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--color-muted)">
                  {tickText(v, yt.step)}
                </text>
              </g>
            ))}
            <text x={m.l} y={m.t - 8} fontSize={12} fill="var(--color-ink-2)" style={{ fontFamily: 'var(--font-sans)' }}>
              {yLabel}
            </text>
            <text x={m.l + pw} y={m.t + ph + 30} textAnchor="end" fontSize={11.5} fill="var(--color-ink-2)" style={{ fontFamily: 'var(--font-sans)' }}>
              {xLabel}
            </text>
            {hLines.map((h) => (
              <line key={`h${h.y}`} x1={m.l} x2={m.l + pw} y1={Y(h.y)} y2={Y(h.y)} stroke="var(--color-warn)" strokeDasharray="6 4" />
            ))}
            {vLines.map((v) => (
              <line key={`v${v.x}`} x1={X(v.x)} x2={X(v.x)} y1={m.t} y2={m.t + ph} stroke="var(--color-warn)" strokeDasharray="3 3" />
            ))}
            <defs>
              <clipPath id={clipId}>
                <rect x={m.l} y={m.t} width={pw} height={ph} />
              </clipPath>
            </defs>
            <g fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId})`}>
              {series.map((s) => (
                <path
                  key={s.id}
                  d={s.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${X(x).toFixed(1)} ${Y(y * yScale).toFixed(1)}`).join('')}
                  stroke={s.stroke ?? traceColor(s.color)}
                  {...(s.dashed ? { strokeDasharray: '6 4', strokeWidth: 1.75 } : s.strong ? { strokeWidth: 3.5 } : {})}
                />
              ))}
            </g>
            {series
              .filter((s) => s.dots)
              .map((s) => (
                <g key={`d${s.id}`} fill={traceColor(s.color)}>
                  {s.points.map(([x, y]) => (
                    <circle key={x} cx={X(x)} cy={Y(y * yScale)} r={3} />
                  ))}
                </g>
              ))}
            {overlay?.(X, Y)}
            {marks.map((k) => (
              // Zeminli: çizgiye yakın düşse de okunur.
              <text key={k.key} x={k.box.x} y={k.box.y + 10} fontSize={MARK_FONT} fill="var(--color-warn)" stroke="var(--color-panel)" strokeWidth={3} paintOrder="stroke" data-mark="">
                {svgSub(k.text)}
              </text>
            ))}
            {ends.map(({ s, y }) => (
              <text key={`e${s.id}`} x={m.l + pw + 6} y={y + 3.5} fontSize={LABEL_FONT} fontWeight={s.strong ? 700 : undefined} fill={s.stroke ?? traceColor(s.color)} data-label="">
                {svgSub(s.label!)}
              </text>
            ))}
            {rows &&
              named.map((s, i) => {
                const item = rows.items[i]!;
                const x = m.l + item.x;
                const y = m.t + ph + base.b + 4 + item.row * LEGEND_ROW + 9;
                const color = s.stroke ?? traceColor(s.color);
                return (
                  <g key={`l${s.id}`} data-legend="">
                    <line x1={x} x2={x + 12} y1={y - 3.5} y2={y - 3.5} stroke={color} strokeWidth={s.strong ? 3.5 : 2.5} strokeLinecap="round" {...(s.dashed ? { strokeDasharray: '4 3' } : {})} />
                    <text x={x + 18} y={y} fontSize={LABEL_FONT} fontWeight={s.strong ? 700 : undefined} fill={color} data-label="">
                      {svgSub(s.label!)}
                    </text>
                  </g>
                );
              })}
            {cx !== null && cursor !== null && (
              <g pointerEvents="none">
                <line x1={cx} x2={cx} y1={m.t} y2={m.t + ph} stroke="var(--color-ink)" strokeDasharray="4 3" />
                {series.map((s) => {
                  const v = valueAt(s.points, cursor);
                  return Number.isFinite(v) ? <circle key={s.id} cx={cx} cy={Y(v * yScale)} r={4} fill={s.stroke ?? traceColor(s.color)} stroke="var(--color-panel)" strokeWidth={1.5} /> : null;
                })}
              </g>
            )}
            {!empty && onCursor && (
              <rect
                x={m.l}
                y={m.t}
                width={pw}
                height={ph}
                fill="transparent"
                style={{ cursor: 'ew-resize', touchAction: 'pan-y' }}
                onPointerDown={(e) => {
                  dragging.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  fromPointer(e);
                }}
                onPointerMove={(e) => {
                  if (dragging.current) fromPointer(e);
                }}
                onPointerUp={() => (dragging.current = false)}
                onPointerCancel={() => (dragging.current = false)}
              />
            )}
          </svg>
        )}
        {cx !== null && cursor !== null && onCursor && (
          <div
            role="slider"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={cursor}
            aria-valuetext={cursorText?.(cursor) ?? formatNumber(cursor, 3)}
            onKeyDown={onKey}
            className="pointer-events-none absolute w-px opacity-0 focus-visible:opacity-100"
            style={{ left: cx, top: m.t, height: ph, outline: '2px solid var(--color-accent)' }}
          />
        )}
      </div>
      {footer}
    </div>
  );
}

/** Eğrinin x'teki değeri (doğrusal ara değer); dışarıdaysa NaN. */
export function valueAt(points: readonly (readonly [number, number])[], x: number): number {
  if (points.length === 0 || x < points[0]![0] || x > points[points.length - 1]![0]) return Number.NaN;
  for (let i = 1; i < points.length; i++) {
    const [xa, ya] = points[i - 1]!;
    const [xb, yb] = points[i]!;
    if (x <= xb) return xb === xa ? yb : ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return points[points.length - 1]![1];
}

function decades(a: number, b: number): number[] {
  const out: number[] = [];
  for (let d = Math.floor(a); d <= Math.ceil(b); d++) out.push(d);
  return out;
}

/** 10'un kuvveti: 10, 100, 1k, 10k, 1M. */
function decadeText(d: number): string {
  const v = 10 ** d;
  if (v >= 1e6) return `${v / 1e6}M`;
  if (v >= 1e3) return `${v / 1e3}k`;
  return String(v);
}
