// Zaman grafiğinde X-Y (analiz v2): yatay eksen zaman yerine bir büyüklük (osiloskobun X-Y kipi gibi).
// Kayıttaki son örnekler (en çok 4000) y'ye karşı x olarak çizilir; çalışırken kayıtla birlikte güncellenir.

import { useMemo } from 'react';
import { formatSI } from '../../sim/units';
import { svgSub } from './CurvePane';
import { axisUnit } from './format';
import type { TraceRecorder } from './recorder';
import type { AnalysisApi } from './useAnalysis';
import { XYChart, type XYSeries } from './XYChart';

const MAX_POINTS = 4000;

export function TimeXY({ api, recorder: rec, version, compact = false }: { api: AnalysisApi; recorder: TraceRecorder; version: number; compact?: boolean }) {
  const graph = api.active?.kind === 'time' ? api.active : null;
  const xId = graph?.x ?? null;
  const xLabel = xId ? api.labels.get(xId) : undefined;
  const view = useMemo(() => {
    const xs = xId ? rec.values.get(xId) : undefined;
    if (!xId || !xs) return null;
    const from = Math.max(0, rec.count - MAX_POINTS);
    let maxX = 0;
    let maxY = 0;
    for (let i = from; i < rec.count; i++) if (Number.isFinite(xs[i]!)) maxX = Math.max(maxX, Math.abs(xs[i]!));
    const ys = api.graphTraces.map((t) => ({ t, v: rec.values.get(t.id) }));
    for (const { v } of ys) if (v) for (let i = from; i < rec.count; i++) if (Number.isFinite(v[i]!)) maxY = Math.max(maxY, Math.abs(v[i]!));
    const xu = axisUnit(maxX, xLabel?.unit ?? 'V');
    const yu = axisUnit(maxY, api.labels.get(api.graphTraces[0]?.id ?? '')?.unit ?? 'V');
    const series: XYSeries[] = ys.map(({ t, v }) => {
      const points: (readonly [number, number])[] = [];
      if (v) for (let i = from; i < rec.count; i++) if (Number.isFinite(xs[i]!) && Number.isFinite(v[i]!)) points.push([xs[i]! * xu.scale, v[i]!]);
      return { id: t.id, color: t.color, points, dots: false };
    });
    return { series, xu, yu };
  }, [xId, rec, version, api.graphTraces, api.labels, xLabel?.unit]);
  if (!view) return null;
  const yNames = api.graphTraces.map((t) => api.labels.get(t.id)?.name ?? '?').join(', ');
  const xText = `${xLabel?.name ?? '?'} (${view.xu.unit})`;
  const yText = `${yNames} (${view.yu.unit})`;
  return (
    <XYChart
      series={view.series}
      xLabel={svgSub(xText)}
      yLabel={svgSub(yText)}
      yScale={view.yu.scale}
      cursor={null}
      cursorText={(x) => formatSI(x / view.xu.scale, xLabel?.unit ?? 'V', { digits: 3 })}
      ariaLabel={`${yText} – ${xText}`}
      compact={compact}
      {...(compact ? { height: 260 } : {})}
    />
  );
}
