// Zaman grafiği (A1, N1, N9): solda gerilim, sağda akım ekseni (yazıları izin renginde), sürüklenebilir
// dikey imleç ve imlecin yanındaki değer kutusu. SVG piksel boyunda çizilir (yazılar ölçeklenmez);
// çok örnekte her piksel sütununa en küçük ve en büyük değer düşer.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { tr } from '../../i18n/tr';
import { formatSI } from '../../sim/units';
import { axisUnit, niceTicks, tickText } from './format';
import type { TraceRecorder } from './recorder';
import { traceColor } from './traces';

export interface ChartTrace {
  readonly id: string;
  readonly name: string;
  readonly unit: 'V' | 'A';
  readonly color: number;
}

export interface ChartProps {
  readonly recorder: TraceRecorder;
  readonly traces: readonly ChartTrace[];
  /** Kaydın sürümü: değişince yeniden çizilir. */
  readonly version: number;
  readonly cursor: number | null;
  readonly onCursor: (t: number) => void;
  /** Telefon: dar kenar boşlukları, değer kutusu grafiğin altında (ayrı). */
  readonly compact?: boolean;
  /** Masaüstü değer kutusundaki "Tabloya ekle". */
  readonly onToTable?: () => void;
  readonly svgRef?: Ref<SVGSVGElement>;
}

/** Zaman ekseni birimi: 0,1 s'den uzun kayıtta s, sonra ms, µs. */
export function timeUnit(span: number): { scale: number; unit: string } {
  return axisUnit(span, 's');
}

/** Gösterilen imleç: seçilen zaman ya da kaydın başından altıda bir (kaydın içinde tutulur). */
export function cursorTime(rec: TraceRecorder, cursor: number | null): number | null {
  const span = recordSpan(rec);
  if (!span) return null;
  return Math.min(span.t1, Math.max(span.t0, cursor ?? span.t0 + (span.t1 - span.t0) / 6));
}

/** Kaydın zaman aralığı; örnek yoksa null. */
export function recordSpan(rec: TraceRecorder): { t0: number; t1: number } | null {
  if (rec.count < 2) return null;
  return { t0: rec.times[0]!, t1: rec.times[rec.count - 1]! };
}

export function Chart({ recorder: rec, traces, version, cursor, onCursor, compact = false, onToTable, svgRef }: ChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  void version;

  const span = recordSpan(rec);
  const volts = traces.filter((t) => t.unit === 'V');
  const amps = traces.filter((t) => t.unit === 'A');
  const m = compact ? { l: 34, r: amps.length > 0 ? 34 : 12, t: 18, b: 30 } : { l: 46, r: amps.length > 0 ? 46 : 16, t: 22, b: 40 };
  const pw = Math.max(10, size.w - m.l - m.r);
  const ph = Math.max(10, size.h - m.t - m.b);

  const range = (list: readonly ChartTrace[]) => {
    let lo = 0;
    let hi = 0;
    for (const t of list) {
      const v = rec.values.get(t.id);
      if (!v) continue;
      for (let i = 0; i < rec.count; i++) {
        const x = v[i]!;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    return { lo, hi };
  };
  const axis = (list: readonly ChartTrace[], unit: string) => {
    const { lo, hi } = range(list);
    const u = axisUnit(Math.max(Math.abs(lo), Math.abs(hi)), unit);
    const { ticks, step } = niceTicks(lo * u.scale, hi * u.scale, compact ? 2 : 5);
    return { ...u, ticks, step, min: ticks[0]!, max: ticks[ticks.length - 1]! };
  };
  const vAxis = volts.length > 0 ? axis(volts, 'V') : null;
  const aAxis = amps.length > 0 ? axis(amps, 'A') : null;
  const tu = span ? timeUnit(span.t1) : { scale: 1, unit: 's' };
  const xt = span ? niceTicks(span.t0 * tu.scale, span.t1 * tu.scale, compact ? 3 : 6) : null;
  const tMin = xt ? xt.ticks[0]! / tu.scale : 0;
  const tMax = xt ? xt.ticks[xt.ticks.length - 1]! / tu.scale : 1;
  const X = (t: number) => m.l + ((t - tMin) / (tMax - tMin || 1)) * pw;
  const tOf = (x: number) => tMin + ((x - m.l) / pw) * (tMax - tMin);
  const Y = (v: number, a: { scale: number; min: number; max: number }) => m.t + ph - ((v * a.scale - a.min) / (a.max - a.min || 1)) * ph;

  const path = (t: ChartTrace) => {
    const v = rec.values.get(t.id);
    const a = t.unit === 'V' ? vAxis : aAxis;
    if (!v || !a || rec.count === 0) return '';
    const parts: string[] = [];
    let pen = false;
    const bucket = rec.count > pw * 2;
    let col = -1;
    let lo = 0;
    let hi = 0;
    const flush = () => {
      if (col < 0) return;
      parts.push(`${pen ? 'L' : 'M'}${col} ${Y(lo, a).toFixed(1)}`, `L${col} ${Y(hi, a).toFixed(1)}`);
      pen = true;
    };
    for (let i = 0; i < rec.count; i++) {
      const y = v[i]!;
      if (!Number.isFinite(y)) {
        if (bucket) flush();
        col = -1;
        pen = false;
        continue;
      }
      const x = X(rec.times[i]!);
      if (!bucket) {
        parts.push(`${pen ? 'L' : 'M'}${x.toFixed(1)} ${Y(y, a).toFixed(1)}`);
        pen = true;
        continue;
      }
      const c = Math.round(x);
      if (c !== col) {
        flush();
        col = c;
        lo = y;
        hi = y;
      } else {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    if (bucket) flush();
    return parts.join('');
  };

  // İmleç: sürükleyerek ya da oklarla.
  const dragging = useRef(false);
  const fromPointer = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    onCursor(Math.min(span?.t1 ?? 0, Math.max(span?.t0 ?? 0, tOf(e.clientX - rect.left))));
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (!span || cursor === null) return;
    const stepT = (span.t1 - span.t0) / (e.shiftKey ? 10 : 100);
    let next = cursor;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += stepT;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= stepT;
    else if (e.key === 'Home') next = span.t0;
    else if (e.key === 'End') next = span.t1;
    else return;
    e.preventDefault();
    onCursor(Math.min(span.t1, Math.max(span.t0, next)));
  };

  const cx = cursor !== null && span ? X(cursor) : null;
  const timeText = (t: number) => formatSI(t, 's', { digits: 4 });
  const label = tr.analysis.graph.chartLabel(traces.map((t) => t.name).join(', ') || '—', span ? `${timeText(span.t0)} – ${timeText(span.t1)}` : tr.analysis.graph.noData);
  const boxLeft = cx !== null && cx + 230 > size.w ? cx - 222 : (cx ?? 0) + 14;

  return (
    <div ref={box} className="relative min-h-0 min-w-0 flex-1">
      {size.w > 0 && (
        <svg ref={svgRef} width={size.w} height={size.h} role="img" aria-label={label} className="absolute inset-0 block select-none" style={{ fontFamily: 'var(--font-mono)' }}>
          <rect x={m.l} y={m.t} width={pw} height={ph} fill="var(--color-panel)" stroke="var(--color-line)" />
          {xt?.ticks.map((v) => (
            <g key={`x${v}`}>
              <line x1={X(v / tu.scale)} x2={X(v / tu.scale)} y1={m.t} y2={m.t + ph} stroke="var(--color-line)" strokeWidth={0.75} />
              <text x={X(v / tu.scale)} y={m.t + ph + 14} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
                {tickText(v, xt.step)}
              </text>
            </g>
          ))}
          {(vAxis ?? aAxis)?.ticks.map((v) => {
            const a = (vAxis ?? aAxis)!;
            return <line key={`g${v}`} x1={m.l} x2={m.l + pw} y1={Y(v / a.scale, a)} y2={Y(v / a.scale, a)} stroke="var(--color-line)" strokeWidth={0.75} />;
          })}
          {vAxis && (
            <g fill={traceColor(volts[0]!.color)} fontSize={10.5}>
              {vAxis.ticks.map((v) => (
                <text key={`v${v}`} x={m.l - 6} y={Y(v / vAxis.scale, vAxis) + 3.5} textAnchor="end">
                  {tickText(v, vAxis.step)}
                </text>
              ))}
              <text x={m.l} y={m.t - 8} textAnchor={compact ? 'end' : 'start'} style={{ fontFamily: 'var(--font-sans)' }} fontSize={12}>
                {compact ? vAxis.unit : `V (${vAxis.unit})`}
              </text>
            </g>
          )}
          {aAxis && (
            <g fill={traceColor(amps[0]!.color)} fontSize={10.5}>
              {aAxis.ticks.map((v) => (
                <text key={`a${v}`} x={m.l + pw + 6} y={Y(v / aAxis.scale, aAxis) + 3.5}>
                  {tickText(v, aAxis.step)}
                </text>
              ))}
              <text x={m.l + pw} y={m.t - 8} textAnchor="end" style={{ fontFamily: 'var(--font-sans)' }} fontSize={12}>
                {compact ? aAxis.unit : `I (${aAxis.unit})`}
              </text>
            </g>
          )}
          <text x={m.l + pw} y={m.t + ph + 30} textAnchor="end" fontSize={11} fill="var(--color-muted)" style={{ fontFamily: 'var(--font-sans)' }}>
            {tr.analysis.graph.timeAxis(tu.unit)}
          </text>
          <g fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
            {traces.map((t) => (
              <path key={t.id} d={path(t)} stroke={traceColor(t.color)} />
            ))}
          </g>
          {!span && (
            <text x={m.l + pw / 2} y={m.t + ph / 2} textAnchor="middle" fontSize={12} fill="var(--color-muted)" style={{ fontFamily: 'var(--font-sans)' }}>
              {tr.analysis.graph.noData}
            </text>
          )}
          {cx !== null && cursor !== null && (
            <g pointerEvents="none">
              <line x1={cx} x2={cx} y1={m.t} y2={m.t + ph} stroke="var(--color-ink)" strokeDasharray="4 3" />
              {traces.map((t) => {
                const a = t.unit === 'V' ? vAxis : aAxis;
                const v = rec.valueAt(t.id, cursor);
                return a && Number.isFinite(v) ? <circle key={t.id} cx={cx} cy={Y(v, a)} r={4.5} fill={traceColor(t.color)} stroke="var(--color-panel)" strokeWidth={1.5} /> : null;
              })}
              {!compact && (
                <g>
                  <rect x={cx - 30} y={m.t + ph + 3} width={60} height={16} rx={3} fill="var(--color-ink)" />
                  <text x={cx} y={m.t + ph + 14.5} textAnchor="middle" fontSize={10.5} fill="var(--color-panel)">
                    {tickText(cursor * tu.scale, (xt?.step ?? 1) / 10)}
                  </text>
                </g>
              )}
            </g>
          )}
          {span && (
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
      {span && cursor !== null && cx !== null && (
        <div
          role="slider"
          tabIndex={0}
          aria-label={tr.analysis.graph.cursorSlider}
          aria-valuemin={span.t0}
          aria-valuemax={span.t1}
          aria-valuenow={cursor}
          aria-valuetext={timeText(cursor)}
          onKeyDown={onKey}
          className="pointer-events-none absolute w-px opacity-0 focus-visible:opacity-100"
          style={{ left: cx, top: m.t, height: ph, outline: '2px solid var(--color-accent)' }}
        />
      )}
      {!compact && span && cursor !== null && cx !== null && traces.length > 0 && (
        <div
          className="absolute z-10 flex w-[208px] flex-col gap-1.5 rounded-xl border border-line bg-panel p-3 shadow-lg"
          style={{ left: Math.max(m.l + 4, boxLeft), top: m.t + 8 }}
        >
          <span className="font-mono text-label text-muted">{tr.analysis.graph.cursor(timeText(cursor))}</span>
          {traces.map((t) => {
            const v = rec.valueAt(t.id, cursor);
            return (
              <span key={t.id} className="flex items-center gap-2 text-small">
                <span aria-hidden="true" className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: traceColor(t.color) }} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <b className="font-mono font-semibold tabular">{Number.isFinite(v) ? formatSI(v, t.unit, { digits: 4 }) : '—'}</b>
              </span>
            );
          })}
          {onToTable && (
            <button type="button" onClick={onToTable} className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent-soft text-small font-semibold text-accent-ink hover:brightness-95">
              <span aria-hidden="true" className="text-[16px] leading-none">+</span>
              {tr.analysis.graph.toTable}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
