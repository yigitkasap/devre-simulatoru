// Ölçülen Bode paneli (A4, N4): solda giriş ve çıkış, frekans aralığı ve nokta sayısı, ilerleme; sağda
// kazanç (dB) ve faz (°) alt alta, aynı logaritmik frekans ekseninde, ölçüm noktaları nokta olarak.
// Orta bant ve −3 dB noktası kendiliğinden: kesikli −3 dB çizgisi, f_H'de dikey işaret, çipler.

import { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { formatNumber, formatSI } from '../../sim/units';
import { Rich } from '../Rich';
import { useTouchUi } from '../touchUi';
import { bodeSummary, toDb, type BodePoint } from './bode';
import { datedName, saveFile, toCsv, type CsvSeparator } from './format';
import type { BodeApi } from './useBode';
import type { AnalysisApi } from './useAnalysis';
import { valueAt, XYChart } from './XYChart';

const hz = (f: number) => formatSI(f, 'Hz', { digits: 3, trim: true });
/** Frekans kutusundaki yazı: "20", "1k", "2M" (k ve M ile yazılabilir). */
const hzShort = (f: number) => formatSI(f, '', { digits: 3, trim: true }).replace(/\s/g, '');

export function bodeCsv(points: readonly BodePoint[], sep: CsvSeparator): Blob {
  const rows = points.map((p) => [p.f, p.inAmp, p.outAmp, p.gain, toDb(p.gain), p.phase, p.settled ? 1 : 0]);
  return new Blob([toCsv(tr.analysis.bode.csvHeader, rows, sep)], { type: 'text/csv;charset=utf-8' });
}

export function saveBode(bode: BodeApi, sep: CsvSeparator, share: boolean): void {
  if (bode.points.length > 0) void saveFile(datedName(tr.analysis.bode.file, 'csv'), bodeCsv(bode.points, sep), share);
}

/** Orta bant kazancı (kat ve dB) ve −3 dB frekanslarını tabloya aktarır. */
export function bodeToTable(api: AnalysisApi): number {
  const s = bodeSummary(api.bode.points);
  if (!s) return 0;
  const r = tr.analysis.bode.rows;
  const src = tr.analysis.bode.source(hz(s.mid.f));
  const rows = [
    { name: r.mid, formula: 'A_{v}', theory: '', measured: s.mid.gain, unit: '', source: src, lab: '' },
    { name: r.midDb, formula: '20 log A_{v}', theory: '', measured: toDb(s.mid.gain), unit: 'dB', source: src, lab: '' },
    ...(s.fH !== null ? [{ name: r.fH, formula: '', theory: '', measured: s.fH, unit: 'Hz', source: tr.analysis.bode.sourceInterp, lab: '' }] : []),
    ...(s.fL !== null ? [{ name: r.fL, formula: '', theory: '', measured: s.fL, unit: 'Hz', source: tr.analysis.bode.sourceInterp, lab: '' }] : []),
  ];
  api.addRows(rows);
  return rows.length;
}

export function BodePane({ api, compact = false }: { api: AnalysisApi; compact?: boolean }) {
  const t = tr.analysis.bode;
  const bode = api.bode;
  const touch = useTouchUi();
  // Kendiliğinden ölçüm: sekme açılınca ve ayarlar değişince (aynı ayarlarla bir kez).
  // Bağımlılıklar yalnız değerler: simülasyon çalışırken sayfa her karede yeniden çizilir, nesneye
  // bağlı efekt bekleme süresini her karede sıfırlardı (ölçüm hiç başlamazdı).
  const tried = useRef('');
  const runRef = useRef(bode.run);
  runRef.current = bode.run;
  const busy = bode.progress !== null;
  useEffect(() => {
    if (!bode.key || busy || bode.resultKey === bode.key || tried.current === bode.key) return undefined;
    const key = bode.key;
    const timer = window.setTimeout(() => {
      tried.current = key;
      runRef.current();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bode.key, bode.resultKey, busy]);
  const [cursor, setCursor] = useState<number | null>(null);
  const field = `w-0 min-w-0 flex-1 rounded-lg border border-line-2 bg-panel px-2 font-mono text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`;
  const select = `w-full rounded-lg border border-line-2 bg-panel px-2 text-small ${touch ? 'h-11 text-[16px]' : 'h-9'}`;
  if (!bode.input) return <p className="m-0 px-4 py-6 text-small text-muted">{t.noSource}</p>;

  const points = bode.points;
  const s = bodeSummary(points);
  const fresh = bode.resultKey === bode.key;
  const unsettled = points.filter((p) => !p.settled).length;
  const fs = points.map((p) => p.f);
  const cur = points.length > 0 ? Math.min(fs[fs.length - 1]!, Math.max(fs[0]!, cursor ?? s?.mid.f ?? fs[0]!)) : null;
  const gainSeries = [{ id: 'g', color: 0, points: points.map((p) => [p.f, toDb(p.gain)] as const), dots: true }];
  const phaseSeries = [{ id: 'p', color: 3, points: points.map((p) => [p.f, p.phase] as const), dots: true }];
  const target = s ? toDb(s.mid.gain) - 3 : null;
  // Kazanç ekseni sıfırdan değil, ölçülenin biraz altından başlar (tasarım: 20 … 50 dB).
  const dbs = points.map((p) => toDb(p.gain));
  const gainRange = dbs.length > 0 ? ([Math.floor(Math.min(...dbs) - 5), Math.ceil(Math.max(...dbs) + 3)] as const) : undefined;
  const vLines = s?.fH ? [{ x: s.fH }] : [];
  // f_H'nin iki yanındaki ölçüm noktaları (ipucu).
  const around = s?.fH ? (() => {
    const i = fs.findIndex((f) => f > s.fH!);
    return i > 0 ? [hz(fs[i - 1]!), hz(fs[i]!)] : null;
  })() : null;
  const num = (label: string, value: number, onValue: (v: number) => void, text: (v: number) => string = (v) => formatNumber(v, 0)) => (
    <input
      key={`${label}${value}`}
      aria-label={label}
      inputMode="decimal"
      defaultValue={text(value)}
      onBlur={(e) => {
        const raw = e.target.value.trim().replace(',', '.').replace(/k$/i, 'e3').replace(/M$/, 'e6');
        const v = Number(raw);
        if (Number.isFinite(v) && v > 0 && v !== value) onValue(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={field}
    />
  );
  const progress = bode.progress;
  const done = progress ? progress.done : points.length;
  const total = progress ? progress.total : bode.range.points;

  const controls = (
    <div className={`flex flex-col gap-2.5 ${compact ? '' : 'w-[236px] shrink-0 overflow-y-auto overscroll-contain'}`}>
      <label className="flex flex-col gap-1 text-label text-muted">
        {t.input}
        <select value={bode.input.key} onChange={(e) => bode.setInput(e.target.value)} className={`${select} text-ink`}>
          {bode.inputs.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-label text-muted">
        {t.output}
        {bode.output ? (
          <select value={bode.output.key} onChange={(e) => bode.setOutput(e.target.value)} className={`${select} text-ink`}>
            {bode.outputs.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-small text-warn">{t.noOutput}</span>
        )}
      </label>
      <div className="flex flex-col gap-1 text-label text-muted">
        <span>{t.frequency}</span>
        <span className="flex items-center gap-1.5">
          {num(t.from, bode.range.from, (v) => bode.setRange({ from: v }), hzShort)}
          <span aria-hidden="true">→</span>
          {num(t.to, bode.range.to, (v) => bode.setRange({ to: v }), hzShort)}
          <span aria-hidden="true">·</span>
          {num(t.points, bode.range.points, (v) => bode.setRange({ points: Math.max(2, Math.min(60, Math.round(v))) }))}
        </span>
        <span className="font-mono text-ink">{t.rangeText(hz(bode.range.from), hz(bode.range.to), bode.range.points)}</span>
        <span>{t.method}</span>
        {bode.limits && <span>{t.limit(hz(bode.limits.max))}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-label">
          <span className={progress ? 'text-ink' : fresh && points.length > 0 ? 'font-semibold text-ok-ink' : 'text-muted'}>{progress ? t.measuring : fresh && points.length > 0 ? `✓ ${t.done}` : t.stale}</span>
          <span className="font-mono">{`${done} / ${total}`}</span>
        </span>
        <span
          role="progressbar"
          aria-label={t.progressLabel}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="block h-1.5 overflow-hidden rounded-full bg-line"
        >
          <span className={`block h-full rounded-full ${progress ? 'bg-accent' : 'bg-ok'}`} style={{ width: `${(100 * done) / Math.max(1, total)}%` }} />
        </span>
        {unsettled > 0 && <span className="text-label text-warn">{t.notSettled(unsettled)}</span>}
        {bode.error && <span role="alert" className="text-label text-warn">{t.failed}</span>}
      </div>
    </div>
  );

  const chips = s ? (
    <div className="flex flex-wrap items-stretch gap-2 text-label">
      <span className="flex flex-col rounded-lg border border-line bg-panel px-2.5 py-1">
        <span className="text-muted">{t.mid(hz(s.mid.f))}</span>
        <b className="font-mono font-semibold tabular">{t.midValue(formatNumber(s.mid.gain, 1), formatNumber(toDb(s.mid.gain), 1))}</b>
      </span>
      {s.fH !== null && (
        <span className="flex flex-col rounded-lg border border-line bg-panel px-2.5 py-1" title={around ? t.fHNote(around[0]!, around[1]!) : undefined}>
          <span className="text-muted">
            <Rich text={t.fH} />
          </span>
          <b className="font-mono font-semibold text-warn tabular">{`≈ ${hz(s.fH)}`}</b>
        </span>
      )}
      {s.fL !== null && (
        <span className="flex flex-col rounded-lg border border-line bg-panel px-2.5 py-1">
          <span className="text-muted">
            <Rich text={t.fL} />
          </span>
          <b className="font-mono font-semibold text-warn tabular">{`≈ ${hz(s.fL)}`}</b>
        </span>
      )}
      {/* f_H'nin ara değer olduğu: masaüstünde çipin ipucunda, telefonda görünür satırda. */}
      {around && compact && <span className="self-center text-muted">{t.fHNote(around[0]!, around[1]!)}</span>}
    </div>
  ) : null;

  const footer =
    cur !== null && points.length > 0 ? (
      <p className="m-0 mx-auto mt-1 rounded-full border border-line bg-panel px-3 py-1 font-mono text-label">
        {t.cursor(hz(cur), formatNumber(10 ** (valueAt(gainSeries[0]!.points, cur) / 20), 1), formatNumber(valueAt(gainSeries[0]!.points, cur), 2), formatNumber(valueAt(phaseSeries[0]!.points, cur), 1))}
      </p>
    ) : null;

  const charts = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
      {chips}
      <XYChart
        series={gainSeries}
        xLabel=""
        yLabel={t.gain}
        logX
        cursor={cur}
        onCursor={setCursor}
        cursorText={(f) => hz(f)}
        ariaLabel={t.gainLabel(points.length)}
        hLines={target !== null ? [{ y: target, label: t.minus3(formatNumber(target, 1)) }] : []}
        {...(gainRange ? { yRange: gainRange } : {})}
        vLines={vLines}
        compact={compact}
        {...(compact ? { height: 200 } : {})}
      />
      <XYChart
        series={phaseSeries}
        xLabel={t.freqAxis}
        yLabel={t.phase}
        logX
        cursor={cur}
        onCursor={setCursor}
        cursorText={(f) => hz(f)}
        ariaLabel={t.phaseLabel(points.length)}
        vLines={vLines}
        compact={compact}
        footer={footer}
        {...(compact ? { height: 220 } : {})}
      />
    </div>
  );

  return compact ? (
    <div className="flex flex-col gap-3">
      {controls}
      {charts}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 gap-5 px-4 pb-3">
      {controls}
      {charts}
    </div>
  );
}
