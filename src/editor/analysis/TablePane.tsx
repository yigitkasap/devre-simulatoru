// Ölçüm tablosu (A2, N2): Büyüklük (altında formül), Teorik (öğrenci yazar), Ölçülen (simülasyon;
// altında kaynağı), isteğe bağlı Laboratuvar sütunu, % Hata. Sağda (telefonda altta) doğru uydurma:
// x ve y seçilir (y'ye ln(a − y) dönüşümü), noktalar ve doğru çizilir; eğim, τ = −1 / eğim ve R².

import { useMemo, type ReactNode } from 'react';
import { tr } from '../../i18n/tr';
import type { FitSpec, TableRow } from '../../model/analysis';
import { formatNumber, formatSI } from '../../sim/units';
import { Icon } from '../icons';
import { Rich } from '../Rich';
import { useTouchUi } from '../touchUi';
import { cursorTime } from './Chart';
import { niceTicks, tickText } from './format';
import type { TraceRecorder } from './recorder';
import { errorText, fitPoints, fitTau, linearFit, measuredText, parseTheory, percentError } from './table';
import { newId, type AnalysisApi } from './useAnalysis';

export interface TablePaneProps {
  readonly api: AnalysisApi;
  readonly recorder: TraceRecorder;
  /** Kaydın sürümü (uydurma ve imleç seçenekleri yenilensin). */
  readonly version: number;
  readonly title: string;
  readonly compact?: boolean;
}

export function TablePane({ api, recorder, version, title, compact = false }: TablePaneProps) {
  const touch = useTouchUi();
  const t = tr.analysis.table;
  const rows = api.doc.rows;
  const lab = api.doc.labColumn;
  const setRows = (fn: (rows: readonly TableRow[]) => readonly TableRow[]) => api.setDoc((a) => ({ ...a, rows: fn(a.rows) }));
  const update = (id: string, patch: Partial<TableRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: newId('r'), name: t.newRow, formula: '', theory: '', measured: null, unit: '', source: '', lab: '' }]);

  // Ölçülen seçenekleri: imleçteki iz değerleri ve uydurmanın sonuçları.
  const fit = useFit(api, recorder, version);
  const cursor = cursorTime(recorder, api.cursor);
  const options = useMemo(() => {
    const out: { key: string; text: string; measured: number; unit: string; source: string }[] = [];
    if (cursor !== null) {
      const at = formatSI(cursor, 's', { digits: 4, trim: true });
      for (const trace of api.traces) {
        const v = recorder.valueAt(trace.id, cursor);
        const label = api.labels.get(trace.id);
        if (Number.isFinite(v) && label) out.push({ key: `c${trace.id}`, text: t.cursorOption(label.name, at), measured: v, unit: label.unit, source: tr.analysis.graph.cursorSource(at) });
      }
    }
    if (fit.result) {
      const source = tr.analysis.fit.source(formatNumber(fit.result.r2, 4));
      if (fit.tau !== null) out.push({ key: 'tau', text: t.fitOption('τ'), measured: fit.tau, unit: 's', source });
      out.push({ key: 'slope', text: t.fitOption(tr.analysis.fit.slope.toLocaleLowerCase('tr')), measured: fit.result.slope, unit: '', source });
    }
    return out;
  }, [cursor, api.traces, api.labels, fit, recorder, t]);

  const field = `w-full min-w-0 rounded-lg border border-line-2 bg-panel px-2.5 font-mono text-small focus:border-accent ${touch ? 'h-11 text-[16px]' : 'h-9'}`;
  const iconBtn = `flex shrink-0 items-center justify-center rounded-md text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-8 w-8'}`;

  const measuredCell = (r: TableRow) =>
    r.measured !== null ? (
      <div className="flex items-start gap-1">
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="font-mono text-small font-semibold tabular">{measuredText(r)}</b>
          <span className="truncate text-label text-muted">{r.source}</span>
        </span>
        <button type="button" onClick={() => update(r.id, { measured: null, source: '' })} aria-label={t.pickMeasuredLabel(r.name)} title={t.pickMeasured} className={iconBtn}>
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
    ) : (
      <select
        aria-label={t.pickMeasuredLabel(r.name)}
        value=""
        disabled={options.length === 0}
        onChange={(e) => {
          const o = options.find((x) => x.key === e.target.value);
          if (o) update(r.id, { measured: o.measured, unit: r.unit || o.unit, source: o.source });
        }}
        className={`${field} font-sans text-muted`}
      >
        <option value="">{t.pickMeasured}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.text}
          </option>
        ))}
      </select>
    );

  const errorCell = (r: TableRow) => {
    const e = percentError(r.measured, parseTheory(r.theory, r.unit));
    return <span className={`font-mono text-small font-semibold tabular ${e === null ? 'text-muted' : e < 5 ? 'text-ok-ink' : 'text-warn'}`}>{errorText(e)}</span>;
  };

  const nameCell = (r: TableRow) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <input aria-label={t.nameLabel} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} className={`${field} border-transparent bg-transparent px-1 font-sans font-semibold hover:border-line`} />
      <input aria-label={t.formulaLabel} placeholder={t.formula} value={r.formula} onChange={(e) => update(r.id, { formula: e.target.value })} className={`${field} h-7 border-transparent bg-transparent px-1 text-label text-muted hover:border-line`} />
    </div>
  );

  const table = (
    <section aria-label={t.title(title)} className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="m-0 min-w-0 flex-1 truncate text-small font-semibold tracking-[0.02em] text-muted">{t.title(title)}</h3>
        <button
          type="button"
          aria-pressed={lab}
          onClick={() => api.setDoc((a) => ({ ...a, labColumn: !a.labColumn }))}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-small font-medium ${touch ? 'h-11' : 'h-8'} ${lab ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-2 text-ink hover:bg-panel-2'}`}
        >
          <Icon name={lab ? 'check' : 'plus'} className="h-3.5 w-3.5" />
          {t.labColumn}
        </button>
      </div>
      {rows.length === 0 && <p className="m-0 text-small text-muted">{t.empty}</p>}
      {compact ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
              <div className="flex items-start gap-1">
                {nameCell(r)}
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={t.removeRow(r.name)} className={iconBtn}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <label className="flex flex-col gap-1 text-label text-muted">
                {t.theoryHint}
                <input aria-label={t.theoryLabel(r.name)} value={r.theory} placeholder={r.unit} onChange={(e) => update(r.id, { theory: e.target.value })} className={field} />
              </label>
              <div className="flex flex-col gap-1 text-label text-muted">
                {t.measuredHint}
                {measuredCell(r)}
              </div>
              {lab && (
                <label className="flex flex-col gap-1 text-label text-muted">
                  {t.lab}
                  <input aria-label={t.labLabel(r.name)} value={r.lab} placeholder={r.unit} onChange={(e) => update(r.id, { lab: e.target.value })} className={field} />
                </label>
              )}
              <span className="flex items-center justify-between text-label text-muted">
                {t.error}
                {errorCell(r)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="min-h-0 overflow-auto">
          <table className="w-full border-collapse text-left text-small">
            <thead className="text-label text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-1.5 pr-3 font-medium">{t.name}</th>
                <th scope="col" className="w-[120px] py-1.5 pr-3 font-medium">{t.theoryHint}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{t.measuredHint}</th>
                {lab && <th scope="col" className="w-[110px] py-1.5 pr-3 font-medium">{t.lab}</th>}
                <th scope="col" className="w-[64px] py-1.5 pr-2 text-right font-medium">{t.error}</th>
                <th scope="col" className="w-9 py-1.5"><span className="sr-only">{t.removeColumn}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <td className="py-1.5 pr-3">{nameCell(r)}</td>
                  <td className="py-1.5 pr-3"><input aria-label={t.theoryLabel(r.name)} value={r.theory} placeholder={r.unit} onChange={(e) => update(r.id, { theory: e.target.value })} className={field} /></td>
                  <td className="py-1.5 pr-3">{measuredCell(r)}</td>
                  {lab && <td className="py-1.5 pr-3"><input aria-label={t.labLabel(r.name)} value={r.lab} placeholder={r.unit} onChange={(e) => update(r.id, { lab: e.target.value })} className={field} /></td>}
                  <td className="py-2.5 pr-2 text-right">{errorCell(r)}</td>
                  <td className="py-1.5">
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={t.removeRow(r.name)} title={t.removeRow(r.name)} className={iconBtn}>
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={addRow} className={`flex items-center gap-1.5 rounded-lg px-2 text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-8'}`}>
          <Icon name="plus" className="h-4 w-4" />
          {t.addRow}
        </button>
        <span className="text-label text-muted">{t.errorNote}</span>
      </div>
    </section>
  );

  return compact ? (
    <div className="flex flex-col gap-4">
      {table}
      <FitPanel api={api} fit={fit} touch={touch} cursor={cursor} compact />
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 gap-5 overflow-hidden px-4 pb-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">{table}</div>
      <div className="w-[320px] shrink-0 overflow-y-auto overscroll-contain">
        <FitPanel api={api} fit={fit} touch={touch} cursor={cursor} />
      </div>
    </div>
  );
}

// --- Doğru uydurma ---------------------------------------------------------------------------------

interface FitState {
  readonly spec: FitSpec | null;
  readonly xs: number[];
  readonly ys: number[];
  readonly result: ReturnType<typeof linearFit>;
  readonly tau: number | null;
  /** y izinin kayıttaki en büyük değeri (ln(a − y)'de a'nın varsayılanı için). */
  readonly yMax: number;
}

/** Uydurmanın tanımı (kayıtlı ya da varsayılan: ilk gerilim izi, t'ye göre) ve sonucu. */
function useFit(api: AnalysisApi, rec: TraceRecorder, version: number): FitState {
  const first = api.traces.find((tr0) => api.labels.get(tr0.id)?.unit === 'V') ?? api.traces[0];
  const saved = api.doc.fit;
  const valid = saved && api.traces.some((tr0) => tr0.id === saved.y) && (saved.x === 't' || api.traces.some((tr0) => tr0.id === saved.x));
  const spec: FitSpec | null = valid ? saved : first ? { x: 't', y: first.id, lnOffset: null } : null;
  const key = spec ? `${spec.x}|${spec.y}|${spec.lnOffset}|${spec.from}|${spec.to}` : '';
  return useMemo(() => {
    if (!spec) return { spec, xs: [], ys: [], result: null, tau: null, yMax: 0 };
    const { xs, ys } = fitPoints(rec, spec);
    const result = linearFit(xs, ys);
    const yv = rec.values.get(spec.y);
    let yMax = 0;
    for (let i = 0; yv && i < rec.count; i++) if (Number.isFinite(yv[i]!) && Math.abs(yv[i]!) > Math.abs(yMax)) yMax = yv[i]!;
    return { spec, xs, ys, result, tau: fitTau(spec, result), yMax };
  }, [rec, key, version]);
}

function FitPanel({ api, fit, touch, cursor, compact = false }: { api: AnalysisApi; fit: FitState; touch: boolean; cursor: number | null; compact?: boolean }) {
  const f = tr.analysis.fit;
  const spec = fit.spec;
  const field = `min-w-0 rounded-lg border border-line-2 bg-panel px-2 text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`;
  const setSpec = (patch: Partial<FitSpec>) => spec && api.setDoc((a) => ({ ...a, fit: { ...spec, ...patch } }));
  const nameOf = (id: string) => (id === 't' ? 't' : (api.labels.get(id)?.name ?? '?'));
  const yName = spec ? (spec.lnOffset !== null ? `ln(${formatNumber(spec.lnOffset, 3).replace(/,?0+$/, '')} − ${nameOf(spec.y)})` : nameOf(spec.y)) : '';
  const r = fit.result;
  const row = (label: ReactNode, value: string) => (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 text-right font-mono font-semibold tabular">{value}</dd>
    </>
  );
  return (
    <section aria-label={f.title} className="flex flex-col gap-2">
      <h3 className="m-0 text-small font-semibold tracking-[0.02em] text-muted">{f.title.toLocaleUpperCase('tr')}</h3>
      {!spec ? (
        <p className="m-0 text-small text-muted">{f.noData}</p>
      ) : (
        <>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-small">
            <label htmlFor="fit-y">{f.y}</label>
            <span className="flex gap-1.5">
              <select id="fit-y" aria-label={f.transform} value={spec.lnOffset === null ? 'none' : 'ln'} onChange={(e) => setSpec({ lnOffset: e.target.value === 'ln' ? defaultOffset(fit.yMax) : null })} className={`${field} w-[96px]`}>
                <option value="none">{f.none}</option>
                <option value="ln">{f.ln('a')}</option>
              </select>
              <select aria-label={f.y} value={spec.y} onChange={(e) => setSpec({ y: e.target.value })} className={`${field} flex-1 font-mono`}>
                {api.traces.map((tr0) => (
                  <option key={tr0.id} value={tr0.id}>
                    {nameOf(tr0.id)}
                  </option>
                ))}
              </select>
            </span>
            {spec.lnOffset !== null && (
              <>
                <label htmlFor="fit-a">{f.offset}</label>
                <input
                  id="fit-a"
                  aria-label={f.offsetLabel}
                  inputMode="decimal"
                  defaultValue={formatNumber(spec.lnOffset, 3)}
                  onBlur={(e) => {
                    const v = Number(e.target.value.replace(',', '.'));
                    if (Number.isFinite(v)) setSpec({ lnOffset: v });
                  }}
                  className={`${field} font-mono`}
                />
              </>
            )}
            <span>{f.range}</span>
            <span className="flex gap-1.5">
              <RangeInput label={f.from} value={spec.from ?? null} field={field} onValue={(v) => setSpec({ from: v })} />
              <RangeInput label={f.to} value={spec.to ?? null} field={field} onValue={(v) => setSpec({ to: v })} />
              {spec.x === 't' && cursor !== null && (
                <button type="button" onClick={() => setSpec({ from: cursor })} aria-label={f.fromCursorLabel} title={f.fromCursorLabel} className={`${field} shrink-0 border-accent-line px-2 font-semibold text-accent-ink`}>
                  {f.fromCursor}
                </button>
              )}
            </span>
            <label htmlFor="fit-x">{f.x}</label>
            <select id="fit-x" value={spec.x} onChange={(e) => setSpec({ x: e.target.value })} className={`${field} font-mono`}>
              <option value="t">{f.time}</option>
              {api.traces
                .filter((tr0) => tr0.id !== spec.y)
                .map((tr0) => (
                  <option key={tr0.id} value={tr0.id}>
                    {nameOf(tr0.id)}
                  </option>
                ))}
            </select>
          </div>
          <FitChart fit={fit} yName={yName} xName={nameOf(spec.x)} height={compact ? 170 : 150} />
          {r ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
              {row(f.slope, formatNumber(r.slope, 4))}
              {row(f.intercept, formatNumber(r.intercept, 4))}
              {fit.tau !== null && row(<Rich text={f.tau} />, formatSI(fit.tau, 's', { digits: 4 }))}
              {row(f.r2, `${formatNumber(r.r2, 4)} · ${f.points(r.n)}`)}
            </dl>
          ) : (
            <p className="m-0 text-small text-muted">{f.noData}</p>
          )}
          {r && (
            <button
              type="button"
              onClick={() =>
                api.addRows([
                  fit.tau !== null
                    ? { name: f.tauRow, formula: 'R·C', theory: '', measured: fit.tau, unit: 's', source: f.source(formatNumber(r.r2, 4)), lab: '' }
                    : { name: f.slopeRow, formula: '', theory: '', measured: r.slope, unit: '', source: f.source(formatNumber(r.r2, 4)), lab: '' },
                ])
              }
              className={`flex items-center justify-center gap-1.5 rounded-lg bg-accent-soft text-small font-semibold text-accent-ink hover:brightness-95 ${touch ? 'h-11' : 'h-9'}`}
            >
              <Icon name="plus" className="h-4 w-4" />
              {fit.tau !== null ? f.toTable : f.slopeToTable}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Uydurma aralığının bir ucu (x biriminde; boş: sınır yok). */
function RangeInput({ label, value, field, onValue }: { label: string; value: number | null; field: string; onValue: (v: number | null) => void }) {
  return (
    <input
      key={value ?? 'yok'}
      aria-label={label}
      placeholder={label}
      inputMode="decimal"
      defaultValue={value === null ? '' : formatNumber(value, 4)}
      onBlur={(e) => {
        const text = e.target.value.trim().replace(',', '.');
        if (text === '') onValue(null);
        else if (Number.isFinite(Number(text))) onValue(Number(text));
      }}
      className={`${field} w-0 flex-1 font-mono`}
    />
  );
}

/** ln(a − y) için a: y'nin en büyük değeri iki anlamlı basamağa yukarı yuvarlanır (9,99 V → 10). */
export function defaultOffset(yMax: number): number {
  if (!(Math.abs(yMax) > 0)) return 1;
  const step = 10 ** Math.floor(Math.log10(Math.abs(yMax))) / 10;
  return Math.sign(yMax) * Math.ceil(Math.abs(yMax) / step - 1e-9) * step;
}

function FitChart({ fit, yName, xName, height }: { fit: FitState; yName: string; xName: string; height: number }) {
  const w = 300;
  const m = { l: 34, r: 8, t: 8, b: 22 };
  const pw = w - m.l - m.r;
  const ph = height - m.t - m.b;
  const { xs, ys, result } = fit;
  if (xs.length < 2) return <div style={{ height }} className="rounded-lg border border-dashed border-line" />;
  const xt = niceTicks(Math.min(...xs), Math.max(...xs), 4);
  const yt = niceTicks(Math.min(...ys), Math.max(...ys), 3);
  const x0 = xt.ticks[0]!;
  const x1 = xt.ticks[xt.ticks.length - 1]!;
  const y0 = yt.ticks[0]!;
  const y1 = yt.ticks[yt.ticks.length - 1]!;
  const X = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * pw;
  const Y = (y: number) => m.t + ph - ((y - y0) / (y1 - y0 || 1)) * ph;
  const stride = Math.max(1, Math.ceil(xs.length / 120));
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="block w-full" role="img" aria-label={tr.analysis.fit.chartLabel(yName, xName, xs.length)} style={{ fontFamily: 'var(--font-mono)' }}>
      <rect x={m.l} y={m.t} width={pw} height={ph} fill="var(--color-panel)" stroke="var(--color-line)" />
      {yt.ticks.map((v) => (
        <g key={`y${v}`}>
          <line x1={m.l} x2={m.l + pw} y1={Y(v)} y2={Y(v)} stroke="var(--color-line)" strokeWidth={0.6} />
          <text x={m.l - 4} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)">
            {tickText(v, yt.step)}
          </text>
        </g>
      ))}
      {xt.ticks.map((v) => (
        <text key={`x${v}`} x={X(v)} y={m.t + ph + 12} textAnchor="middle" fontSize={9} fill="var(--color-muted)">
          {tickText(v, xt.step)}
        </text>
      ))}
      {xs.map((x, i) => (i % stride === 0 ? <circle key={i} cx={X(x)} cy={Y(ys[i]!)} r={2.2} fill="var(--color-tr-1)" /> : null))}
      {result && <line x1={X(x0)} y1={Y(result.slope * x0 + result.intercept)} x2={X(x1)} y2={Y(result.slope * x1 + result.intercept)} stroke="var(--color-tr-2)" strokeWidth={1.6} strokeDasharray="5 3" />}
    </svg>
  );
}
