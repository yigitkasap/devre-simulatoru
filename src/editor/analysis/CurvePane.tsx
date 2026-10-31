// Eğri izleyici paneli (A3, N3): solda parça, eğri türü (FET'te Çıkış ailesi | Transfer), taranan
// büyüklüğün aralığı ve adımı, basamak çipleri (renkli; + ile eklenir), yük doğrusu anahtarı (yalnız
// devrede yük direnci varsa; yoksa soluk ve nedeni yazılı). Sağda eğriler (adları sağ uçta) ve imleç
// değerleri altta tek satırda. Parametre değişince kendiliğinden yeniden taranır.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../../i18n/tr';
import { formatNumber, formatSI } from '../../sim/units';
import { Icon } from '../icons';
import { Rich } from '../Rich';
import { useTouchUi } from '../touchUi';
import { axisUnit, datedName, saveFile, toCsv, type CsvSeparator } from './format';
import { FAMILY, isP, sweepValues, type Curve } from './sweep';
import { traceColor } from './traces';
import type { TracerApi } from './useTracer';
import { valueAt, XYChart } from './XYChart';
import { SettingsSummary, useSettingsEditing } from './SettingsSummary';

/** Eksen ve basamak adları (alt simgeli: "V_{DS}"); P tipinde başında eksi. */
export function quantities(tracer: TracerApi): { x: string; y: string; step: string; stepUnit: 'V' | 'A'; load: string } {
  const type = tracer.part?.type;
  const family = type ? FAMILY[type] : undefined;
  const neg = type && isP(type) ? '−' : '';
  if (family === 'diode') return { x: 'V_{D}', y: 'I_{D}', step: '', stepUnit: 'V', load: 'R' };
  if (family === 'bjt') return { x: `${neg}V_{CE}`, y: `${neg}I_{C}`, step: `${neg}I_{B}`, stepUnit: 'A', load: 'R_{C}' };
  if (tracer.params?.mode === 'transfer') return { x: `${neg}V_{GS}`, y: `${neg}I_{D}`, step: `${neg}V_{DS}`, stepUnit: 'V', load: 'R_{D}' };
  return { x: `${neg}V_{DS}`, y: `${neg}I_{D}`, step: `${neg}V_{GS}`, stepUnit: 'V', load: 'R_{D}' };
}

/** SVG içinde alt simge: "V_{DS}" → V ve küçük, aşağıda DS. */
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

const plain = (text: string) => text.replace(/_\{([^}]*)\}/g, '$1');

/** Basamağın yazısı: gerilim volt cinsinden ("−0,2 V"), akım önekli ("10 µA"; BJT'de ölçülen). */
export function stepValueText(v: number, unit: 'V' | 'A'): string {
  if (unit === 'A') return formatSI(v, 'A', { trim: true, digits: 3 });
  return `${formatNumber(v, 3).replace(/,?0+$/, '').replace(/^-/, '−')} V`;
}

export function stepText(curve: Curve, unit: 'V' | 'A'): string {
  const text = stepValueText(curve.measuredStep ?? curve.step, unit);
  return curve.q ? `${tr.analysis.curve.q} · ${text}` : text;
}

/** Eğrilerin CSV'si: x ve her basamağın akımı. */
export function curvesCsv(tracer: TracerApi, sep: CsvSeparator): Blob | null {
  const r = tracer.result;
  const p = tracer.params;
  if (!r || !p) return null;
  const q = quantities(tracer);
  const xs = sweepValues(p.from, r.to, p.step);
  const header = [`${plain(q.x)} (V)`, ...r.curves.map((c) => `${plain(q.y)} (A)${q.step ? ` [${plain(q.step)} = ${stepText(c, q.stepUnit)}]` : ''}`)];
  const rows = xs.map((x, i) => [x, ...r.curves.map((c) => c.points[i]?.[1] ?? '')]);
  return new Blob([toCsv(header, rows, sep)], { type: 'text/csv;charset=utf-8' });
}

export function saveCurves(tracer: TracerApi, sep: CsvSeparator, share: boolean): void {
  const blob = curvesCsv(tracer, sep);
  if (blob) void saveFile(datedName(tr.analysis.curve.file, 'csv'), blob, share);
}

export function CurvePane({ tracer, compact = false }: { tracer: TracerApi; compact?: boolean }) {
  const t = tr.analysis.curve;
  const touch = useTouchUi();
  const { part, params, result, progress } = tracer;
  const q = quantities(tracer);
  // Kendiliğinden tarama: parametreler değişince (kısa bir beklemeyle), aynı parametrelerle bir kez.
  // Bağımlılıklar yalnız değerler (simülasyon çalışırken her karede yeniden çizilir; bkz. BodePane).
  const tried = useRef('');
  const runRef = useRef(tracer.run);
  runRef.current = tracer.run;
  const busy = progress !== null;
  const [editing, setEditing] = useSettingsEditing(busy);
  const partId = part?.id ?? null;
  useEffect(() => {
    if (!partId || busy || result?.key === tracer.key || tried.current === tracer.key) return undefined;
    const key = tracer.key;
    const timer = window.setTimeout(() => {
      tried.current = key;
      runRef.current();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [partId, busy, result?.key, tracer.key]);
  const [cursor, setCursor] = useState<number | null>(null);
  const showLoad = params?.load ?? true;
  const [adding, setAdding] = useState(false);
  if (!part || !params) return <p className="m-0 px-4 py-6 text-small text-muted">{t.none}</p>;

  const fresh = result && result.key === tracer.key ? result : null;
  const curves = fresh?.curves ?? result?.curves ?? [];
  const family = FAMILY[part.type];
  let maxI = 0;
  for (const c of curves) for (const [, y] of c.points) maxI = Math.max(maxI, Math.abs(y));
  const unit = axisUnit(maxI, 'A');
  // Taramanın gerçek üst sınırı: yük doğrusu açıkken beslemeye uzamış olabilir (analiz düzeltmeleri, 9).
  const to = fresh?.to ?? params.to;
  // Gösterilen basamaklar taranan basamaklardır (MOSFET'te Q'nun çevresinde seçilmiş olabilir).
  const shownSteps = fresh?.steps ?? params.steps;
  const lo = Math.min(params.from, to);
  const hi = Math.max(params.from, to);
  const cur = Math.min(hi, Math.max(lo, cursor ?? lo + ((hi - lo) * 2) / 3));
  const series = curves.map((c, i) => ({ id: `c${i}`, color: i % 6, points: c.points, ...(q.step ? { label: stepText(c, q.stepUnit) } : {}), ...(c.q ? { strong: true } : {}) }));
  const load = fresh?.load ?? null;
  const loadAllowed = family !== 'diode' && params.mode === 'output';
  const field = `w-0 min-w-0 flex-1 rounded-lg border border-line-2 bg-panel px-2 font-mono text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`;
  const num = (label: string, value: number, onValue: (v: number) => void) => (
    <input
      key={`${label}${value}`}
      aria-label={label}
      inputMode="decimal"
      defaultValue={formatNumber(value, 3).replace(/,?0+$/, '')}
      onBlur={(e) => {
        const v = Number(e.target.value.replace(',', '.').replace('−', '-'));
        if (Number.isFinite(v) && v !== value) onValue(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={field}
    />
  );
  const footer =
    curves.length > 0 ? (
      <p className="m-0 mx-auto mt-1 flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-line bg-panel px-3 py-1 font-mono text-label">
        <span className="text-muted">
          <Rich text={`İmleç ${q.x} = ${formatNumber(cur, 2).replace(/,?0+$/, '')} V · ${q.y} (${unit.unit})`} />
        </span>
        {curves.map((c, i) => {
          const v = valueAt(c.points, cur);
          return (
            <span key={i} className="flex items-center gap-1 font-semibold">
              <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: traceColor(i % 6) }} />
              {Number.isFinite(v) ? formatNumber(v * unit.scale, 2) : '—'}
            </span>
          );
        })}
      </p>
    ) : null;

  const controls = (
    <div className={`flex flex-col gap-2.5 ${compact ? '' : 'min-h-0 w-[236px] shrink-0 overflow-y-auto overscroll-contain'}`}>
      <label className="flex flex-col gap-1 text-label text-muted">
        {t.part}
        <select value={part.id} onChange={(e) => tracer.setPart(e.target.value)} className={`${field} w-full flex-none font-sans text-ink`}>
          {tracer.candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {t.partOption(p.label, typeof p.props.model === 'string' ? p.props.model : '', tr.devices.names[p.type])}
            </option>
          ))}
        </select>
      </label>
      {family === 'fet' && (
        <div role="radiogroup" aria-label={t.modeLabel} className="flex gap-0.5 rounded-[10px] bg-app p-[3px]">
          {(['output', 'transfer'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={params.mode === mode}
              onClick={() => tracer.setMode(mode)}
              className={`min-w-0 flex-1 rounded-lg text-small font-medium ${touch ? 'h-11' : 'h-8'} ${params.mode === mode ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2'}`}
            >
              {t.modes[mode]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1 text-label text-muted">
        <span>
          {t.swept}: <Rich text={q.x} />
        </span>
        <span className="flex items-center gap-1.5">
          {num(t.from, params.from, (v) => tracer.setParams({ from: v }))}
          <span aria-hidden="true">→</span>
          {num(t.to, to, (v) => tracer.setParams({ to: v, toAuto: false }))}
          <span aria-hidden="true">·</span>
          {num(t.step, params.step, (v) => v > 0 && tracer.setParams({ step: v }))}
        </span>
      </div>
      {q.step && (
        <div className="flex flex-col gap-1.5 text-label text-muted">
          <span>
            {t.stepsLabel}: <Rich text={q.step} />
          </span>
          <span className="flex flex-wrap gap-1.5">
            {shownSteps.map((s, i) => {
              const text = stepValueText(s, q.stepUnit);
              return (
                <span key={`${s}${i}`} className={`flex items-center gap-1 rounded-full border border-line bg-panel pl-2.5 font-mono text-small text-ink ${touch ? 'h-11' : 'h-8'}`}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: traceColor(i % 6) }} />
                  {text}
                  <button
                    type="button"
                    disabled={shownSteps.length <= 1}
                    onClick={() => tracer.setParams({ steps: shownSteps.filter((_, j) => j !== i), stepsAuto: false })}
                    aria-label={t.removeStep(text)}
                    className={`flex items-center justify-center rounded-full text-muted hover:bg-app disabled:opacity-40 ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
                  >
                    <Icon name="close" className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            {adding ? (
              <input
                autoFocus
                aria-label={t.addStepLabel}
                inputMode="decimal"
                placeholder={q.stepUnit === 'A' ? '50µ' : '−0,8'}
                onBlur={() => setAdding(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setAdding(false);
                  if (e.key !== 'Enter') return;
                  const raw = (e.target as HTMLInputElement).value.trim().replace(',', '.').replace('−', '-').replace(/µ$/, 'e-6').replace(/u$/, 'e-6').replace(/m$/, 'e-3');
                  const v = Number(raw);
                  if (Number.isFinite(v) && shownSteps.length < 6) tracer.setParams({ steps: [...shownSteps, v], stepsAuto: false });
                  setAdding(false);
                }}
                className={`${field} w-24 flex-none`}
              />
            ) : (
              shownSteps.length < 6 && (
                <button type="button" onClick={() => setAdding(true)} aria-label={t.addStep} title={t.addStep} className={`flex items-center justify-center rounded-full border border-line text-ink hover:bg-panel-2 ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}>
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              )
            )}
          </span>
        </div>
      )}
      {loadAllowed && (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(load) && showLoad}
          disabled={!load}
          onClick={() => tracer.setParams({ load: !showLoad })}
          className={`flex w-full items-center gap-2 rounded-lg text-left ${touch ? 'min-h-11' : 'min-h-9'} ${load ? '' : 'opacity-60'}`}
        >
          <span className="flex min-w-0 flex-1 flex-col text-small">
            <span>{t.load}</span>
            <span className="text-label text-muted">{load ? t.loadInfo(load.label, formatSI(load.supply, 'V', { digits: 3 })) : <Rich text={t.noLoad(q.load)} />}</span>
          </span>
          <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${load && showLoad ? 'bg-accent' : 'bg-line-2'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow transition-all ${load && showLoad ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </button>
      )}
      {tracer.error && <p role="alert" className="m-0 text-small text-warn">{t.failed}</p>}
    </div>
  );

  const chart = (
    <XYChart
      series={series}
      xLabel={svgSub(`${q.x} (V)`)}
      yLabel={svgSub(`${q.y} (${unit.unit})`)}
      yScale={unit.scale}
      cursor={curves.length > 0 ? cur : null}
      onCursor={setCursor}
      cursorText={(x) => `${plain(q.x)} = ${formatNumber(x, 2)} V`}
      ariaLabel={t.chartLabel(part.label, curves.length)}
      compact={compact}
      footer={footer}
      {...(compact ? { height: 260 } : {})}
      overlay={(X, Y) =>
        load && showLoad && loadAllowed ? (
          <g pointerEvents="none">
            <line x1={X(Math.min(load.supply, hi))} y1={Y(Math.max(0, (load.supply - Math.min(load.supply, hi)) / load.r) * unit.scale)} x2={X(Math.max(lo, 0))} y2={Y(((load.supply - Math.max(lo, 0)) / load.r) * unit.scale)} stroke="var(--color-ink-2)" strokeWidth={1.5} strokeDasharray="6 4" />
            <circle cx={X(load.q[0])} cy={Y(load.q[1] * unit.scale)} r={5.5} fill="var(--color-warn)" stroke="var(--color-panel)" strokeWidth={1.5} />
            <text x={X(load.q[0]) + 8} y={Y(load.q[1] * unit.scale) - 6} fontSize={11} fontWeight={700} fill="var(--color-warn)">
              {t.q}
            </text>
          </g>
        ) : null
      }
    />
  );

  // Telefonda tarama bitince ayarlar tek satırlık özete kapanır, grafik öne çıkar (analiz düzeltmeleri, 7).
  const collapsed = compact && !editing && !busy && fresh !== null && curves.length > 0;
  const summary = t.settingsSummary(
    part.label,
    t.modes[params.mode],
    q.x,
    formatNumber(params.from, 3).replace(/,?0+$/, ''),
    formatNumber(params.to, 3).replace(/,?0+$/, ''),
    family === 'diode' ? 0 : curves.length,
  );
  return compact ? (
    <div className="flex flex-col gap-3">
      {collapsed ? <SettingsSummary text={summary} onEdit={() => setEditing(true)} /> : controls}
      {chart}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 gap-5 px-4 pb-3">
      {controls}
      {/* Grafik en az 140 px: çekmece daha alçaksa bu sütun kayar. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">{chart}</div>
    </div>
  );
}

/** Çekmecenin başlığındaki eylemler: özet, Yeniden tara / İptal, CSV. */
export function curveSummary(tracer: TracerApi): string {
  const t = tr.analysis.curve;
  if (tracer.progress) return t.progress(tracer.progress.done, tracer.progress.total);
  const p = tracer.params;
  if (!p || !tracer.result) return '';
  return t.summary(tracer.result.curves.length, sweepValues(p.from, tracer.result.to, p.step).length);
}
