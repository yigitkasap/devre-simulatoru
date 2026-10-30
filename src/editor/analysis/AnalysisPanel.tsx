// Analiz çekmecesi (masaüstü, N1–N4) ve alt sayfası (telefon, N9): sekmeler Grafik | Tablo | Eğri
// izleyici | Bode. Masaüstünde tezgâhın altında, üstteki tutamaktan sürüklenerek boyu değişir; sağda
// sekmenin eylemleri, Büyüt ve Kapat. Telefonda başlık, tam genişlik sekmeler, en altta iki sabit düğme.

import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { tr } from '../../i18n/tr';
import { formatSI } from '../../sim/units';
import { Icon, type IconName } from '../icons';
import { TouchUi, useTouchUi } from '../touchUi';
import type { SimFrame, SimStatus } from '../useSimulation';
import { Chart, cursorTime, recordSpan, timeUnit, type ChartTrace } from './Chart';
import { datedName, saveFile, svgToPng, tickText, toCsv } from './format';
import type { TraceRecorder } from './recorder';
import { tableCsv, tableTsv } from './table';
import { TablePane } from './TablePane';
import { traceColor } from './traces';
import { ANALYSIS_TABS, type AnalysisApi, type AnalysisTab } from './useAnalysis';

const ChartMemo = memo(Chart);

export interface AnalysisPanelProps {
  readonly api: AnalysisApi;
  readonly recorder: TraceRecorder;
  readonly status: SimStatus;
  readonly frame: SimFrame | null;
  readonly notify: (message: string) => void;
  /** Devrenin adı (tablonun başlığı). */
  readonly title: string;
}

const TAB_ICONS: Record<AnalysisTab, IconName> = { graph: 'chart', table: 'table', curve: 'curve', bode: 'bode' };

/** Kayıt sürümü: çalışırken en çok saniyede 10 kez (grafik her karede yeniden çizilmesin). */
function useLiveVersion(rec: TraceRecorder, frame: SimFrame | null, status: SimStatus, traces: unknown): number {
  const [version, setVersion] = useState(rec.version);
  const last = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (status !== 'running' || now - last.current >= 100) {
      last.current = now;
      setVersion(rec.version);
    }
  }, [rec, frame, status, traces]);
  return version;
}

/** Grafik sekmesinin ortak mantığı: izler, imleç, PNG, CSV ve tabloya ekleme. */
function useGraph({ api, recorder: rec, status, frame, notify }: AnalysisPanelProps) {
  const version = useLiveVersion(rec, frame, status, api.traces);
  const chartTraces = useMemo<ChartTrace[]>(
    () => api.traces.map((t) => ({ id: t.id, name: api.labels.get(t.id)?.name ?? '?', unit: api.labels.get(t.id)?.unit ?? 'V', color: t.color })),
    [api.traces, api.labels],
  );
  const { cursor: cursorState, setCursor } = api;
  const span = recordSpan(rec);
  const cursor = cursorTime(rec, cursorState);
  const tu = span ? timeUnit(span.t1) : { scale: 1, unit: 's' };
  const timeText = (t: number) => formatSI(t, 's', { digits: 4 });
  const svg = useRef<SVGSVGElement>(null);

  const csvBlob = () => {
    const header = ['t (s)', ...chartTraces.map((t) => `${t.name} (${t.unit})`)];
    const rows: (number | string)[][] = [];
    for (let i = 0; i < rec.count; i++) rows.push([rec.times[i]!, ...chartTraces.map((t) => rec.values.get(t.id)![i]!)]);
    return new Blob([toCsv(header, rows, api.separator)], { type: 'text/csv;charset=utf-8' });
  };
  const csv = (share: boolean) => void saveFile(datedName(tr.analysis.files.graph, 'csv'), csvBlob(), share);
  const png = async () => {
    const el = svg.current;
    if (!el) return;
    const blob = await svgToPng(el);
    if (blob) await saveFile(datedName(tr.analysis.graph.fileName, 'png'), blob);
  };
  const toTable = () => {
    if (cursor === null) return;
    const rows = chartTraces
      .map((t) => ({ t, v: rec.valueAt(t.id, cursor) }))
      .filter(({ v }) => Number.isFinite(v))
      .map(({ t, v }) => ({ name: t.name, formula: '', theory: '', measured: v, unit: t.unit, source: tr.analysis.graph.cursorSource(formatSI(cursor, 's', { digits: 4, trim: true })), lab: '' }));
    if (rows.length === 0) return;
    api.addRows(rows);
    notify(tr.analysis.graph.added(rows.length));
  };
  const statusText = status === 'running' && api.traces.length > 0 ? tr.analysis.graph.status.recording : status === 'stopped' ? tr.analysis.graph.status.idle : tr.analysis.graph.status.paused;
  const info = span
    ? {
        record: `${tickText(span.t0 * tu.scale, 0.1)}–${tickText(span.t1 * tu.scale, 0.1)} ${tu.unit}`,
        interval: `${rec.perFrame ? '' : `${formatSI(rec.interval, 's', { trim: true })} · `}${tr.analysis.graph.points(rec.count)}`,
      }
    : null;
  // Tablo (N2): panoya kopyala, CSV (ayırıcı menüsü; tablo ve grafik verisi ayrı dosya).
  const tableBlob = () => new Blob([tableCsv(api.doc.rows, api.doc.labColumn, api.separator)], { type: 'text/csv;charset=utf-8' });
  const tableFile = (share: boolean) => void saveFile(datedName(tr.analysis.files.table, 'csv'), tableBlob(), share);
  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(tableTsv(api.doc.rows, api.doc.labColumn));
      notify(tr.analysis.table.copied);
    } catch {
      notify(tr.analysis.table.copyFailed);
    }
  };
  return { recCount: rec.count, version, chartTraces, cursor, setCursor, timeText, svg, csv, png, toTable, statusText, info, span, tableFile, copyTable };
}

/** CSV menüsü (N2): ayırıcı (noktalı virgül varsayılan, virgül) ve iki dosya. */
function CsvMenu({ api, g, touch }: { api: AnalysisApi; g: Graph; touch: boolean }) {
  const t = tr.analysis.table;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role=menuitemradio]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const item = `flex w-full items-center gap-2 rounded-lg px-2.5 text-left text-small hover:bg-panel-2 ${touch ? 'h-11' : 'h-9'}`;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.csvMenu}
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-3.5 text-small font-semibold text-white hover:brightness-105 ${touch ? 'h-11' : 'h-9'}`}
      >
        <Icon name="download" className="h-4 w-4" />
        {t.csv}
        <Icon name="chevronDown" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu" aria-label={t.csvMenu} className="absolute top-full right-0 z-30 mt-2 flex w-[264px] flex-col rounded-xl border border-line bg-panel p-1.5 shadow-lg">
          <span className="px-2.5 pt-1 pb-1.5 text-label text-muted">{t.separator}</span>
          {([';', ','] as const).map((sep) => (
            <button key={sep} type="button" role="menuitemradio" aria-checked={api.separator === sep} onClick={() => api.setSeparator(sep)} className={`${item} ${api.separator === sep ? 'bg-accent-soft text-accent-ink' : ''}`}>
              <span className="min-w-0 flex-1">{sep === ';' ? t.semicolon : t.comma}</span>
              {api.separator === sep && <Icon name="check" className="h-4 w-4" />}
            </button>
          ))}
          <span aria-hidden="true" className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={() => { g.tableFile(false); setOpen(false); }} className={`${item} font-medium text-accent-ink`}>
            <Icon name="download" className="h-4 w-4" />
            {t.tableFile(`${tr.analysis.files.table}.csv`)}
          </button>
          <button type="button" role="menuitem" disabled={!g.span} onClick={() => { g.csv(false); setOpen(false); }} className={`${item} disabled:opacity-50`}>
            <Icon name="download" className="h-4 w-4" />
            {t.graphFile(`${tr.analysis.files.graph}.csv`, g.span ? g.recCount : 0)}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Masaüstü çekmecesi -------------------------------------------------------------------------------

export function AnalysisDrawer(
  props: AnalysisPanelProps & {
    readonly height: number;
    readonly maxHeight: number;
    readonly onHeight: (h: number) => void;
    readonly expanded: boolean;
    readonly onExpand: () => void;
  },
) {
  const { api, height, maxHeight, onHeight, expanded, onExpand } = props;
  const touch = useTouchUi();
  const g = useGraph(props);
  const idBase = useId().replace(/:/g, '');
  const drag = useRef<{ y: number; h: number } | null>(null);
  const clamp = (h: number) => Math.round(Math.min(maxHeight, Math.max(MIN_DRAWER, h)));
  const onHandleKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowUp') onHeight(clamp(height + step));
    else if (e.key === 'ArrowDown') onHeight(clamp(height - step));
    else return;
    e.preventDefault();
  };
  const btn = `flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] text-small font-semibold ${touch ? 'h-11' : 'h-9'}`;
  const actions: ReactNode =
    api.tab === 'graph' ? (
      <>
        <span className="mr-1 flex items-center gap-1.5 text-label text-muted">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${props.status === 'running' && api.traces.length > 0 ? 'bg-ok' : 'bg-stopped'}`} />
          {g.statusText}
        </span>
        <button type="button" onClick={() => void g.png()} disabled={!g.span} className={`${btn} border border-line bg-panel px-3 text-ink hover:bg-panel-2 disabled:opacity-50`}>
          <Icon name="camera" className="h-4 w-4" />
          {tr.analysis.graph.png}
        </button>
        <button type="button" onClick={() => g.csv(false)} disabled={!g.span} className={`${btn} bg-accent px-3.5 text-white hover:brightness-105 disabled:opacity-50`}>
          <Icon name="download" className="h-4 w-4" />
          {tr.analysis.graph.csv}
        </button>
      </>
    ) : api.tab === 'table' ? (
      <>
        <button type="button" onClick={() => void g.copyTable()} className={`${btn} border border-line bg-panel px-3 text-ink hover:bg-panel-2`}>
          <Icon name="copy" className="h-4 w-4" />
          {tr.analysis.table.copy}
        </button>
        <CsvMenu api={api} g={g} touch={touch} />
      </>
    ) : null;
  return (
    <section aria-label={tr.analysis.title} className="relative flex shrink-0 flex-col border-t border-line bg-panel" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={tr.analysis.resize}
        aria-valuenow={height}
        aria-valuemin={MIN_DRAWER}
        aria-valuemax={maxHeight}
        tabIndex={0}
        onKeyDown={onHandleKey}
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, h: height };
        }}
        onPointerMove={(e) => {
          if (drag.current) onHeight(clamp(drag.current.h + drag.current.y - e.clientY));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="absolute -top-2 right-0 left-0 z-10 flex h-4 cursor-ns-resize touch-none justify-center"
      >
        <span aria-hidden="true" className="mt-1.5 h-1 w-9 rounded-full bg-line-2" />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
        <Tabs api={api} idBase={idBase} touch={touch} />
        <span className="min-w-0 flex-1" />
        {actions}
        <button type="button" onClick={onExpand} aria-label={expanded ? tr.analysis.shrink : tr.analysis.expand} title={expanded ? tr.analysis.shrink : tr.analysis.expand} className={`${btn} w-10 text-ink hover:bg-panel-2`}>
          <Icon name={expanded ? 'fullscreenExit' : 'fullscreen'} className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={() => api.setOpen(false)} aria-label={tr.analysis.close} title={tr.analysis.close} className={`${btn} w-10 text-ink hover:bg-panel-2`}>
          <Icon name="close" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-${api.tab}`} className="flex min-h-0 flex-1 flex-col">
        {api.tab === 'graph' ? <GraphDesk {...props} g={g} touch={touch} /> : api.tab === 'table' ? <TablePane api={api} recorder={props.recorder} version={g.version} title={props.title} /> : <Soon />}
      </div>
    </section>
  );
}

export const MIN_DRAWER = 220;
export const DEFAULT_DRAWER = 380;

function Tabs({ api, idBase, touch, full = false, short = false }: { api: AnalysisApi; idBase: string; touch: boolean; full?: boolean; short?: boolean }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: ReactKeyboardEvent) => {
    const i = ANALYSIS_TABS.indexOf(api.tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % ANALYSIS_TABS.length;
    else if (e.key === 'ArrowLeft') next = (i + ANALYSIS_TABS.length - 1) % ANALYSIS_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ANALYSIS_TABS.length - 1;
    else return;
    e.preventDefault();
    const tab = ANALYSIS_TABS[next]!;
    api.setTab(tab);
    refs.current[tab]?.focus();
  };
  return (
    <div role="tablist" aria-label={tr.analysis.tabsLabel} onKeyDown={onKey} className={`flex gap-0.5 rounded-[12px] bg-app p-[3px] ${full ? 'w-full' : 'shrink-0'}`}>
      {ANALYSIS_TABS.map((tab) => {
        const on = api.tab === tab;
        return (
          <button
            key={tab}
            ref={(el) => {
              refs.current[tab] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-${tab}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => api.setTab(tab)}
            className={`flex items-center justify-center gap-1.5 rounded-[10px] px-3 text-small font-medium whitespace-nowrap ${touch ? 'h-11' : 'h-9'} ${full ? 'min-w-0 flex-1' : ''} ${
              on ? 'bg-ink font-semibold text-on-ink' : 'text-ink-2 hover:bg-panel-2'
            }`}
          >
            {!short && <Icon name={TAB_ICONS[tab]} className="h-4 w-4" />}
            {short ? tr.analysis.tabsShort[tab] : tr.analysis.tabs[tab]}
          </button>
        );
      })}
    </div>
  );
}

function Soon() {
  return <p className="m-0 px-4 py-6 text-small text-muted">{tr.analysis.soon}</p>;
}

type Graph = ReturnType<typeof useGraph>;

/** İz listesindeki "İz ekle" ve seçim yönergesi. */
function PickControls({ api, touch, compact = false }: { api: AnalysisApi; touch: boolean; compact?: boolean }) {
  const t = tr.analysis.graph;
  const small = `rounded-lg px-3 text-small font-semibold ${touch ? 'h-11' : 'h-9'}`;
  if (!api.pick) {
    return compact ? null : (
      <button type="button" onClick={api.startPick} className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent-line text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-10'}`}>
        <Icon name="plus" className="h-4 w-4" />
        {t.add}
      </button>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-accent-line bg-accent-soft p-2.5 text-small text-accent-ink">
      <span>{api.pick.stage === 'second' ? t.pickSecond(api.pick.name) : t.picking}</span>
      <span className="flex flex-wrap gap-1.5">
        {api.pick.stage === 'second' && (
          <button type="button" onClick={api.addPendingNode} className={`${small} bg-accent text-white`}>
            {t.groundAdd}
          </button>
        )}
        <button type="button" onClick={api.cancelPick} className={`${small} border border-accent-line bg-panel text-ink`}>
          {t.cancel}
        </button>
      </span>
    </div>
  );
}

function GraphDesk({ api, recorder, g, touch }: AnalysisPanelProps & { g: Graph; touch: boolean }) {
  const t = tr.analysis.graph;
  return (
    <div className="flex min-h-0 flex-1 gap-5 px-4 pb-3">
      <div className="flex w-[216px] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain">
        <h3 className="m-0 text-small font-semibold tracking-[0.02em] text-muted">{t.traces}</h3>
        {api.traces.map((tr0) => {
          const label = api.labels.get(tr0.id);
          return (
            <div key={tr0.id} className="flex items-center gap-1 rounded-lg bg-panel-2 py-1.5 pr-1 pl-3" style={{ boxShadow: `inset 3px 0 0 ${traceColor(tr0.color)}` }}>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate font-mono text-small font-semibold">{label?.name}</b>
                <span className="truncate text-label text-muted">{label?.detail}</span>
              </span>
              <button type="button" onClick={() => api.removeTrace(tr0.id)} aria-label={t.remove(label?.name ?? '')} title={t.remove(label?.name ?? '')} className={`flex shrink-0 items-center justify-center rounded-md text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <PickControls api={api} touch={touch} />
        {!api.pick && <p className="m-0 text-label leading-snug text-muted">{api.traces.length === 0 ? t.empty : t.picking}</p>}
        {recorder.perFrame && api.traces.length > 0 && <p className="m-0 text-label leading-snug text-warn">{t.perFrame}</p>}
        {g.info && (
          <dl className="m-0 mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-2 text-label">
            <dt className="text-muted">{t.record}</dt>
            <dd className="m-0 text-right font-mono">{g.info.record}</dd>
            <dt className="text-muted">{t.interval}</dt>
            <dd className="m-0 text-right font-mono">{g.info.interval}</dd>
          </dl>
        )}
      </div>
      <ChartMemo recorder={recorder} traces={g.chartTraces} version={g.version} cursor={g.cursor} onCursor={g.setCursor} onToTable={g.toTable} svgRef={g.svg} />
    </div>
  );
}

// --- Telefon alt sayfası (N9) ---------------------------------------------------------------------------

export function AnalysisSheetBody(props: AnalysisPanelProps & { readonly onClose: () => void; readonly onPlay: () => void; readonly onPause: () => void }) {
  const { api, recorder } = props;
  const g = useGraph(props);
  const idBase = useId().replace(/:/g, '');
  const t = tr.analysis.graph;
  return (
    <TouchUi.Provider value>
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-sheet-grab="" className="flex shrink-0 touch-none items-center gap-2 pr-2 pl-4">
        <h2 className="m-0 min-w-0 flex-1 truncate text-[18px] font-semibold">{tr.analysis.title}</h2>
        {/* Alt sayfa açıkken Oynat düğmesi (sağ alt) gizli: kayıt buradan başlatılır. */}
        <button
          type="button"
          onClick={props.status === 'running' ? props.onPause : props.onPlay}
          aria-label={props.status === 'running' ? tr.analysis.pause : tr.analysis.play}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${props.status === 'running' ? 'bg-panel-2 text-ink' : 'bg-ok text-white'}`}
        >
          <Icon name={props.status === 'running' ? 'pause' : 'play'} />
        </button>
        <button type="button" onClick={props.onClose} aria-label={tr.analysis.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted active:bg-app">
          <Icon name="close" />
        </button>
      </div>
      <div className="shrink-0 px-4 pt-1 pb-3">
        <Tabs api={api} idBase={idBase} touch full short />
      </div>
      <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-${api.tab}`} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pb-3">
        {api.tab === 'graph' ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {api.traces.map((tr0) => {
                const name = api.labels.get(tr0.id)?.name ?? '';
                return (
                  <span key={tr0.id} className="flex h-11 items-center gap-1 rounded-full bg-accent-soft pl-3 font-mono text-small font-semibold">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: traceColor(tr0.color) }} />
                    {name}
                    <button type="button" onClick={() => api.removeTrace(tr0.id)} aria-label={t.remove(name)} className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-app">
                      <Icon name="close" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
              {!api.pick && (
                <button type="button" onClick={api.startPick} aria-label={t.add} className="flex h-11 items-center gap-1 rounded-full border border-line px-3.5 text-small font-semibold text-accent-ink">
                  <Icon name="plus" className="h-4 w-4" />
                  {t.addShort}
                </button>
              )}
            </div>
            <PickControls api={api} touch compact />
            {api.traces.length === 0 && !api.pick && <p className="m-0 text-small text-muted">{t.empty}</p>}
            <div className="flex h-[210px] shrink-0">
              <ChartMemo recorder={recorder} traces={g.chartTraces} version={g.version} cursor={g.cursor} onCursor={g.setCursor} compact svgRef={g.svg} />
            </div>
            {g.cursor !== null && <p className="m-0 font-mono text-label text-muted">{t.cursorPhone(g.timeText(g.cursor))}</p>}
            {g.cursor !== null && (
              <div className="grid grid-cols-2 gap-2">
                {g.chartTraces.map((ct) => {
                  const v = recorder.valueAt(ct.id, g.cursor!);
                  return (
                    <div key={ct.id} className="flex flex-col rounded-lg bg-panel-2 px-3 py-2" style={{ boxShadow: `inset 3px 0 0 ${traceColor(ct.color)}` }}>
                      <span className="font-mono text-label text-muted">{ct.name}</span>
                      <b className="font-mono text-[17px] font-semibold tabular">{Number.isFinite(v) ? formatSI(v, ct.unit, { digits: 4 }) : '—'}</b>
                    </div>
                  );
                })}
              </div>
            )}
            {recorder.perFrame && api.traces.length > 0 && <p className="m-0 text-label text-warn">{t.perFrame}</p>}
          </>
        ) : api.tab === 'table' ? (
          <TablePane api={api} recorder={recorder} version={g.version} title={props.title} compact />
        ) : (
          <Soon />
        )}
      </div>
      {api.tab === 'table' && (
        <div className="flex shrink-0 gap-2 border-t border-line px-4 pt-3" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={() => void g.copyTable()} disabled={api.doc.rows.length === 0} className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-line-2 bg-panel text-[15px] font-semibold disabled:opacity-50">
            <Icon name="copy" className="h-4 w-4" />
            {tr.analysis.table.copy}
          </button>
          <button type="button" onClick={() => g.tableFile(true)} disabled={api.doc.rows.length === 0} className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[15px] font-semibold text-white disabled:opacity-50">
            <Icon name="share" className="h-4 w-4" />
            {tr.analysis.graph.csvShare}
          </button>
        </div>
      )}
      {api.tab === 'graph' && (
        <div className="flex shrink-0 gap-2 border-t border-line px-4 pt-3" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={g.toTable} disabled={!g.span} className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-line-2 bg-panel text-[15px] font-semibold disabled:opacity-50">
            <Icon name="plus" className="h-4 w-4" />
            {t.toTable}
          </button>
          <button type="button" onClick={() => g.csv(true)} disabled={!g.span} className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[15px] font-semibold text-white disabled:opacity-50">
            <Icon name="share" className="h-4 w-4" />
            {t.csvShare}
          </button>
        </div>
      )}
    </div>
    </TouchUi.Provider>
  );
}
