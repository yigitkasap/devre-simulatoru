// "Bir değeri tarayarak" grafiği (analiz v2): solda tek sütun ayarlar (değiştirilen değer ve aralıkları,
// her eğri için ikinci değer, yatay ve düşey eksen), sağda eğriler. İmleç o x'teki bütün eğrilerin
// değerlerini gösterir; "Tabloya ekle" eylem satırında.

import { useMemo, useState, type ReactNode } from 'react';
import { foyGraph } from '../../i18n/foyGraphs';
import { tr } from '../../i18n/tr';
import type { FoyGraphRef, Quantity, SweepRange, SweepSpec } from '../../model/analysis';
import type { CircuitDoc } from '../../model/types';
import { formatNumber, formatSI, parseValue } from '../../sim/units';
import { Icon } from '../icons';
import { plainText, Rich } from '../Rich';
import { useTouchUi } from '../touchUi';
import { stepValueText } from './CurvePane';
import { dcPointValue, MAX_SWEEP_POINTS, sweepValues, type DcSweepCurve } from './dcsweep';
import { Fold } from './Fold';
import { axisUnit, datedName, saveFile, toCsv, type CsvSeparator } from './format';
import { foyNames, resolveFoyQuantity, sameParam } from './foyPlan';
import { QuantityPicker } from './QuantityPicker';
import { quantityKey } from './quantities';
import { traceLabel } from './traces';
import type { AnalysisApi } from './useAnalysis';
import { svgSub, XYChart, type XYSeries } from './XYChart';

const editable = (v: number) => formatNumber(v, 6).replace(/,?0+$/, '').replace(/,$/, '');

/** Bir eğrinin x'teki değeri (doğrusal ara değer; eğrinin dışındaysa NaN). Noktalar x'e göre sıralı olmayabilir. */
export function sweepAt(points: readonly (readonly number[])[], col: number, x: number): number {
  for (let i = 1; i < points.length; i++) {
    const [xa, ya] = [points[i - 1]![1]!, points[i - 1]![col]!];
    const [xb, yb] = [points[i]![1]!, points[i]![col]!];
    if ((x >= xa && x <= xb) || (x <= xa && x >= xb)) return xb === xa ? yb : ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return points.length === 1 && points[0]![1] === x ? points[0]![col]! : Number.NaN;
}

/**
 * Eksen ve sütun adları; birimler. Föy grafiğinde föy planındaki büyüklükler ve değerler föydeki adlarıyla
 * (I_{D}, V_{DS}, V_{GS} = −V_{GG}: işaret −1); kullanıcının değiştirdikleri devredeki adlarıyla.
 */
export function sweepAxes(api: NamesApi, spec: SweepSpec, foy?: FoyGraphRef) {
  const names = foyNames(foy, api.circuit);
  const found = api.sweepParams.find((p) => p.param.part === spec.param.part && p.param.prop === spec.param.prop);
  const param = found ? { ...found, name: sameParam(spec.param, names?.param ?? null) ? names!.param!.name : found.name } : undefined;
  const label = (q: Quantity) => {
    const l = traceLabel(q, api.circuit, api.idx);
    return { name: names?.quantities.get(quantityKey(q)) ?? l.name, unit: l.unit as string };
  };
  const x = spec.x ? label(spec.x) : { name: param?.name ?? '?', unit: param?.unit ?? '' };
  const ys = spec.y.map(label);
  const familyParam = spec.family ? api.sweepParams.find((p) => p.param.part === spec.family!.param.part && p.param.prop === spec.family!.param.prop) : null;
  const foyFamily = spec.family && sameParam(spec.family.param, names?.family ?? null) ? names!.family! : null;
  const family = familyParam ? { name: foyFamily?.name ?? familyParam.name, unit: familyParam.unit, sign: foyFamily?.sign ?? 1, foy: foyFamily !== null } : null;
  return { param, x, ys, family };
}

export type SweepAxes = ReturnType<typeof sweepAxes>;

/** Adlar için gereken: taranabilen değerler, devre ve düğüm dizini. */
type NamesApi = Pick<AnalysisApi, 'sweepParams' | 'circuit' | 'idx'>;

/** Eğrinin ikinci değeri ("V_{GS} = −0,2 V" için −0,2 V): föyde volt cinsinden, işaretiyle; yoksa önekli. */
export function familyText(family: NonNullable<SweepAxes['family']>, step: number): string {
  const v = family.sign * step;
  return family.foy && family.unit === 'V' ? stepValueText(v, 'V') : formatSI(v, family.unit, { trim: true });
}

/** Eğrinin adı: föyde "V_{GS} = −0,2 V", devrede "PS1 2. çıkış = 200 mV". */
function curveName(family: NonNullable<SweepAxes['family']>, step: number): string {
  return tr.analysis.sweep.curveLabel(family.foy ? family.name : family.name.replace(' · ', ' '), familyText(family, step));
}

/** V_{GS} = 0 işaretinin yazısı: "I_{D} (V_{GS} = 0, V_{DS} ≈ 9,6 V) = 4,12 mA". */
export function zeroMark(axes: SweepAxes, zero: NonNullable<FoyMarks['zero']>): string {
  const at = Number.isFinite(zero.at) ? `${zero.atName} ≈ ${formatSI(zero.at, 'V', { digits: 2 })}` : null;
  return tr.analysis.sweep.zeroMark(axes.ys[0]?.name ?? '?', axes.x.name, at, formatSI(zero.value, axes.ys[0]?.unit ?? 'A', { digits: 3 }));
}

/** Taramanın CSV'si: her eğri ve her düşey büyüklük bir sütun çifti değil, satır başına [eğri, taranan, x, y…]. */
export function sweepCsv(api: NamesApi, spec: SweepSpec, curves: readonly DcSweepCurve[], sep: CsvSeparator, foy?: FoyGraphRef): Blob {
  const a = sweepAxes(api, spec, foy);
  const col = (name: string, unit: string) => `${plainText(name)} (${unit})`;
  const head = [...(a.family ? [col(a.family.name, a.family.unit)] : []), col(a.param?.name ?? '?', a.param?.unit ?? ''), ...(spec.x ? [col(a.x.name, a.x.unit)] : []), ...a.ys.map((y) => col(y.name, y.unit))];
  const rows: (number | string)[][] = [];
  for (const c of curves) for (const p of c.points) rows.push([...(a.family ? [c.step === null ? '' : a.family.sign * c.step] : []), p[0]!, ...(spec.x ? [p[1]!] : []), ...p.slice(2)]);
  return new Blob([toCsv(head, rows, sep)], { type: 'text/csv;charset=utf-8' });
}

export function saveSweep(api: AnalysisApi, spec: SweepSpec, curves: readonly DcSweepCurve[], share: boolean, foy?: FoyGraphRef): void {
  void saveFile(datedName(tr.analysis.sweep.fileName, 'csv'), sweepCsv(api, spec, curves, api.separator, foy), share);
}

/** İmleçteki değerler tabloya (her eğri ve büyüklük bir satır). */
export function sweepToTable(api: AnalysisApi, spec: SweepSpec, curves: readonly DcSweepCurve[], x: number, foy?: FoyGraphRef): number {
  const a = sweepAxes(api, spec, foy);
  const xText = `${plainText(a.x.name)} = ${formatSI(x, a.x.unit, { digits: 4, trim: true })}`;
  const rows = curves.flatMap((c) =>
    spec.y.map((_, k) => ({
      name: `${a.ys[k]!.name}${c.step !== null && a.family ? ` (${a.family.name} = ${familyText(a.family, c.step)})` : ''}`,
      formula: '',
      theory: '',
      measured: sweepAt(c.points, k + 2, x),
      unit: a.ys[k]!.unit,
      source: tr.analysis.sweep.cursorSource(xText),
      lab: '',
    })),
  );
  const valid = rows.filter((r) => Number.isFinite(r.measured));
  if (valid.length > 0) api.addRows(valid);
  return valid.length;
}

export interface FoyMarks {
  readonly vp?: number;
  /** V_{GS} = 0'daki akım (I_{DSS} değil) ve o noktada ölçülen gerilim (V_{DS}; ölçülemediyse NaN). */
  readonly zero?: { readonly value: number; readonly at: number; readonly atName: string };
}

/**
 * Föy grafiğinin işaretleri (Deney 5 transfer): V_P, akımın sıfırlandığı V_GS (sıfırdan önceki son iki
 * noktadan √I_D doğrusal uzatılarak; doyumda I_D ∝ (V_GS − V_P)²) ve V_GS = 0'daki akım, yanında o
 * noktadaki V_DS (measure: tek noktanın çözümü). Bu akım I_DSS değildir: kanal boyu modülasyonu yüzünden
 * V_DS ile artar; föy kartındaki I_DSS doyum doğrusunun V_DS = 0'a uzatılmasıyla bulunur.
 */
export function foyMarks(ref: FoyGraphRef, curves: readonly DcSweepCurve[], doc?: CircuitDoc, measure?: (q: Quantity, value: number, step: number | null) => number): FoyMarks | null {
  const def = foyGraph(ref);
  if (!def || def.plan.kind !== 'sweep' || !def.plan.marks) return null;
  const marks = def.plan.marks;
  const curve = curves[0];
  const pts = curve?.points ?? [];
  const out: { vp?: number; zero?: FoyMarks['zero'] } = {};
  if (marks.zero) {
    // V_GS'si sıfıra en yakın nokta (kapı akımı yüzünden tam sıfır olmayabilir).
    const zero = pts.reduce<readonly number[] | null>((best, p) => (best === null || Math.abs(p[1]!) < Math.abs(best[1]!) ? p : best), null);
    if (zero && Math.abs(zero[1]!) < 1e-3 && Number.isFinite(zero[2]!)) {
      const q = doc ? resolveFoyQuantity(marks.zero, doc) : null;
      out.zero = { value: zero[2]!, at: q && measure ? measure(q, zero[0]!, curve?.step ?? null) : Number.NaN, atName: marks.zero.name };
    }
  }
  if (marks.vp) {
    const i = pts.findIndex((p) => Math.abs(p[2]!) <= 1e-9);
    if (i >= 2) {
      const [x1, y1] = [pts[i - 2]![1]!, Math.sqrt(Math.abs(pts[i - 2]![2]!))];
      const [x2, y2] = [pts[i - 1]![1]!, Math.sqrt(Math.abs(pts[i - 1]![2]!))];
      if (y1 !== y2) out.vp = x2 + ((x2 - x1) * y2) / (y1 - y2);
    }
  }
  return out;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-semibold text-muted">{label}</span>
      {children}
    </div>
  );
}

export function SweepPane({ api, cursor, onCursor, compact = false }: { api: AnalysisApi; cursor: number | null; onCursor: (x: number) => void; compact?: boolean }) {
  const t = tr.analysis.sweep;
  const graph = api.active?.kind === 'sweep' ? api.active : null;
  const [addingY, setAddingY] = useState(false);
  const [familyDraft, setFamilyDraft] = useState('');
  const touch = useTouchUi();
  const spec = graph?.sweep ?? null;
  const axes = spec ? sweepAxes(api, spec, graph?.foy) : null;
  const result = api.sweep.result;
  const curves = result?.curves ?? [];
  // İşaretler (föyde): V_{GS} = 0 noktasındaki V_{DS} o noktanın çözümüyle (tarama sonucu değişince bir kez).
  const marks = useMemo(
    () => (graph?.foy && spec ? foyMarks(graph.foy, curves, api.circuit, (q, v, step) => dcPointValue(api.netlist, spec, v, step, q)) : null),
    [curves, graph?.foy?.example, graph?.foy?.key],
  );
  const points = spec ? sweepValues(spec.ranges).length * (spec.family?.values.length ?? 1) : 0;

  const { series, xScale, xUnit, yScale, yUnit } = useMemo(() => {
    if (!spec || !axes) return { series: [] as XYSeries[], xScale: 1, xUnit: '', yScale: 1, yUnit: '' };
    let maxX = 0;
    let maxY = 0;
    for (const c of curves) for (const p of c.points) {
      maxX = Math.max(maxX, Math.abs(p[1]!));
      for (const v of p.slice(2)) if (Number.isFinite(v)) maxY = Math.max(maxY, Math.abs(v));
    }
    const xu = axisUnit(maxX, axes.x.unit);
    const yu = axisUnit(maxY, axes.ys[0]?.unit ?? '');
    const out: XYSeries[] = [];
    curves.forEach((c, ci) =>
      spec.y.forEach((_, k) => {
        const step = c.step !== null && axes.family ? familyText(axes.family, c.step) : null;
        const label = spec.y.length > 1 ? (step ? `${axes.ys[k]!.name} · ${step}` : axes.ys[k]!.name) : step && c.step !== null ? curveName(axes.family!, c.step) : undefined;
        out.push({ id: `${ci}-${k}`, color: (spec.y.length > 1 ? k : ci) % 6, points: c.points.filter((p) => Number.isFinite(p[k + 2]!)).map((p) => [p[1]! * xu.scale, p[k + 2]!] as const), ...(label ? { label } : {}) });
      }),
    );
    return { series: out, xScale: xu.scale, xUnit: xu.unit, yScale: yu.scale, yUnit: yu.unit };
  }, [curves, spec, axes]);

  if (!graph || !spec || !axes) return null;
  if (api.sweepParams.length === 0) return <p className="m-0 px-4 py-6 text-small text-muted">{t.none}</p>;

  const set = (patch: Partial<SweepSpec>) => api.setSweep(patch);
  const field = `w-0 min-w-0 flex-1 rounded-lg border border-line-2 bg-panel px-2 font-mono text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`;
  const select = `w-full rounded-lg border border-line-2 bg-panel px-2 text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`;
  const small = `flex shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 ${touch ? 'h-11 w-11' : 'h-8 w-8'}`;
  const num = (label: string, value: number, onValue: (v: number) => void) => (
    <input
      key={`${label}${value}`}
      aria-label={label}
      inputMode="decimal"
      defaultValue={editable(value)}
      onBlur={(e) => {
        const r = parseValue(e.target.value.replace('−', '-'));
        if (r.ok && r.value !== value) onValue(r.value);
        else e.target.value = editable(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={field}
    />
  );
  const setRange = (i: number, patch: Partial<SweepRange>) => set({ ranges: spec.ranges.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const paramKey = (p: { part: string; prop: string }) => `${p.part}:${p.prop}`;
  const yKeys = new Set(spec.y.map(quantityKey));
  const cur = cursor;

  const settings = (
    <div className={`flex shrink-0 flex-col gap-3 ${compact ? '' : 'w-[264px] overflow-y-auto overscroll-contain pr-1'}`}>
      <Field label={t.param}>
        <select
          aria-label={t.param}
          value={paramKey(spec.param)}
          onChange={(e) => {
            const p = api.sweepParams.find((o) => paramKey(o.param) === e.target.value);
            if (!p) return;
            const to = p.value > 0 ? p.value : p.param.prop === 'position' ? 100 : 10;
            set({ param: p.param, ranges: [{ from: 0, to, step: to / 20 }] });
          }}
          className={select}
        >
          {api.sweepParams.map((p) => (
            <option key={paramKey(p.param)} value={paramKey(p.param)}>
              {`${p.name}${p.unit ? ` (${p.unit})` : ''}`}
            </option>
          ))}
        </select>
        {spec.ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {num(`${t.from} ${i + 1}`, r.from, (v) => setRange(i, { from: v }))}
            <span aria-hidden="true" className="text-muted">→</span>
            {num(`${t.to} ${i + 1}`, r.to, (v) => setRange(i, { to: v }))}
            <span aria-hidden="true" className="text-muted">·</span>
            {num(`${t.step} ${i + 1}`, r.step, (v) => v !== 0 && setRange(i, { step: v }))}
            {spec.ranges.length > 1 && (
              <button type="button" onClick={() => set({ ranges: spec.ranges.filter((_, k) => k !== i) })} aria-label={t.removeRange(i + 1)} title={t.removeRange(i + 1)} className={small}>
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const last = spec.ranges[spec.ranges.length - 1]!;
              set({ ranges: [...spec.ranges, { from: last.to, to: last.to + (last.to - last.from || 1), step: last.step * 5 }] });
            }}
            className={`flex items-center gap-1 rounded-md text-small font-medium text-accent-ink hover:underline ${touch ? 'h-11' : 'h-8'}`}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t.addRange}
          </button>
          <span className="ml-auto font-mono text-label text-muted">{t.points(points)}</span>
        </div>
        {points > MAX_SWEEP_POINTS && <p className="m-0 text-label leading-snug text-warn">{t.tooMany(MAX_SWEEP_POINTS)}</p>}
      </Field>
      <Field label={t.family}>
        <select
          aria-label={t.family}
          value={spec.family ? paramKey(spec.family.param) : ''}
          onChange={(e) => {
            const p = api.sweepParams.find((o) => paramKey(o.param) === e.target.value);
            set({ family: p ? { param: p.param, values: [p.value] } : null });
          }}
          className={select}
        >
          <option value="">{t.familyNone}</option>
          {api.sweepParams
            .filter((p) => paramKey(p.param) !== paramKey(spec.param))
            .map((p) => (
              <option key={paramKey(p.param)} value={paramKey(p.param)}>
                {`${p.name}${p.unit ? ` (${p.unit})` : ''}`}
              </option>
            ))}
        </select>
        {spec.family && (
          <div className="flex flex-wrap items-center gap-1.5">
            {spec.family.values.map((v, i) => (
              <span key={`${v}-${i}`} className="flex items-center gap-0.5 rounded-full bg-panel-2 pl-2.5 font-mono text-small">
                {formatSI(v, axes.family?.unit ?? '', { trim: true })}
                <button
                  type="button"
                  onClick={() => set({ family: spec.family!.values.length > 1 ? { ...spec.family!, values: spec.family!.values.filter((_, k) => k !== i) } : null })}
                  aria-label={t.familyRemove(formatSI(v, axes.family?.unit ?? '', { trim: true }))}
                  className={`flex items-center justify-center rounded-full ${touch ? 'h-11 w-11' : 'h-7 w-7'} hover:bg-app`}
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              aria-label={t.familyValue}
              placeholder={t.familyValue}
              inputMode="decimal"
              value={familyDraft}
              onChange={(e) => setFamilyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const r = parseValue(familyDraft.replace('−', '-'));
                if (r.ok && spec.family) {
                  set({ family: { ...spec.family, values: [...spec.family.values, r.value].sort((a, b) => a - b) } });
                  setFamilyDraft('');
                }
              }}
              className={`w-24 rounded-lg border border-line-2 bg-panel px-2 font-mono text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`}
            />
          </div>
        )}
      </Field>
      <Field label={t.xAxis}>
        <select
          aria-label={t.xAxis}
          value={spec.x ? quantityKey(spec.x) : ''}
          onChange={(e) => {
            const o = api.quantities.find((q) => quantityKey(q.quantity) === e.target.value);
            set({ x: o ? o.quantity : null });
          }}
          className={select}
        >
          <option value="">{t.xParam(plainText(axes.param?.name ?? '?'))}</option>
          {api.quantities.map((o) => (
            <option key={o.key} value={quantityKey(o.quantity)}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.yAxis}>
        {spec.y.map((q, k) => (
          <div key={quantityKey(q)} className="flex items-center gap-1 rounded-lg bg-panel-2 py-1 pr-1 pl-3" style={{ boxShadow: `inset 3px 0 0 var(--color-tr-${(k % 6) + 1})` }}>
            <b className="min-w-0 flex-1 truncate font-mono text-small font-semibold">
              <Rich text={axes.ys[k]!.name} />
            </b>
            <button type="button" onClick={() => set({ y: spec.y.filter((_, i) => i !== k) })} aria-label={t.yRemove(plainText(axes.ys[k]!.name))} className={small}>
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {spec.y.length === 0 && <p className="m-0 text-label text-warn">{t.yEmpty}</p>}
        {addingY ? (
          <QuantityPicker
            options={api.quantities}
            selected={yKeys}
            onToggle={(o) => {
              set({ y: yKeys.has(quantityKey(o.quantity)) ? spec.y.filter((q) => quantityKey(q) !== quantityKey(o.quantity)) : [...spec.y, o.quantity] });
              setAddingY(false);
            }}
            touch={touch}
            autoFocus={!touch}
            maxHeight={240}
          />
        ) : (
          <button type="button" onClick={() => setAddingY(true)} className={`flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent-line text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-9'}`}>
            <Icon name="plus" className="h-4 w-4" />
            {t.yAdd}
          </button>
        )}
      </Field>
      <p className="m-0 text-label leading-snug text-muted">{t.note}</p>
    </div>
  );

  const xLabel = `${axes.x.name} (${xUnit || axes.x.unit})`;
  const yLabel = `${axes.ys.map((y) => y.name).join(', ')} (${yUnit || (axes.ys[0]?.unit ?? '')})`;
  const chart =
    series.length > 0 ? (
      <XYChart
        series={series}
        xLabel={svgSub(xLabel)}
        yLabel={svgSub(yLabel)}
        yScale={yScale}
        cursor={cur !== null ? cur * xScale : null}
        onCursor={(x) => onCursor(x / xScale)}
        cursorText={(x) => `${plainText(axes.x.name)} = ${formatNumber(x, 3).replace(/,?0+$/, '').replace(/,$/, '')} ${xUnit}`}
        ariaLabel={plainText(yLabel)}
        compact={compact}
        {...(marks?.vp !== undefined ? { vLines: [{ x: marks.vp * xScale, label: t.vpMark(formatSI(marks.vp, 'V', { digits: 3 })) }] } : {})}
        {...(marks?.zero ? { hLines: [{ y: marks.zero.value * yScale, label: zeroMark(axes, marks.zero) }] } : {})}
        {...(compact ? { height: 260, grow: true } : {})}
        footer={
          cur !== null ? (
            <p className="m-0 mx-auto mt-1 flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-line bg-panel px-3 py-1 font-mono text-label">
              {curves.flatMap((c, ci) =>
                spec.y.map((_, k) => {
                  const v = sweepAt(c.points, k + 2, cur);
                  return (
                    <span key={`${ci}-${k}`} className="flex items-center gap-1">
                      <i aria-hidden="true" className="block h-2 w-2 rounded-[2px]" style={{ background: `var(--color-tr-${((spec.y.length > 1 ? k : ci) % 6) + 1})` }} />
                      {Number.isFinite(v) ? formatSI(v, axes.ys[k]!.unit, { digits: 4 }) : '—'}
                    </span>
                  );
                }),
              )}
            </p>
          ) : null
        }
      />
    ) : (
      <div className="flex min-h-[200px] flex-1 items-center justify-center text-small text-muted">{api.sweep.progress ? t.progress(api.sweep.progress.done, api.sweep.progress.total) : spec.y.length === 0 ? t.yEmpty : ''}</div>
    );

  return compact ? (
    <div className="flex flex-1 flex-col gap-3">
      {/* Sütun yönlü: satır yönlü kapta XYChart'ın genişliği 0 kalırdı. Telefonda grafik ekranın tam
          genişliğinde (sayfanın kenar boşluğu dışında), adlar altında; boş yeri doldurur. */}
      <div className="-mx-4 flex flex-1 flex-col">{chart}</div>
      <Fold title={tr.analysis.picker.settings}>{settings}</Fold>
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 gap-5 px-4 pb-3">
      {settings}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chart}</div>
    </div>
  );
}
