// Analiz çekmecesi (masaüstü, N1–N4) ve alt sayfası (telefon, N9); analiz v2: grafikler üstte çip
// (föy grafiğinde "FÖY" ön eki), kapatılabilir; "+ Yeni grafik" başlangıç ekranını ("Ne çizmek
// istiyorsun?") açar. Boş grafik hiç gösterilmez: grafik yoksa başlangıç ekranı. Ölçüm tablosu ayrı
// sekme değil, üstteki "Ölçüm tablosu" düğmesiyle sağdan açılan panel (telefonda sayfanın yerine).
// Masaüstünde çekmece tezgâhın altında, üstteki tutamaktan sürüklenerek boyu değişir; sağda grafiğin
// eylemleri (PNG ve CSV her grafikte), Büyüt ve Kapat.

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { tr } from '../../i18n/tr';
import type { GraphDef } from '../../model/analysis';
import { formatSI } from '../../sim/units';
import { Icon, type IconName } from '../icons';
import { TouchUi, useTouchUi } from '../touchUi';
import type { SimFrame, SimStatus } from '../useSimulation';
import { Chart, cursorTime, recordSpan, timeUnit, type ChartTrace } from './Chart';
import { datedName, saveFile, svgsToPng, svgToPng, tickText, toCsv } from './format';
import type { TraceRecorder } from './recorder';
import { tableCsv, tableTsv } from './table';
import { BodePane, bodeToTable, saveBode } from './BodePane';
import { CurvePane, curveSummary, saveCurves } from './CurvePane';
import { QuantityPicker } from './QuantityPicker';
import { quantityKey } from './quantities';
import { StartScreen } from './StartScreen';
import { saveSweep, sweepAxes, SweepPane, sweepToTable } from './SweepPane';
import { TablePane } from './TablePane';
import { TimeXY } from './TimeXY';
import { Fold } from './Fold';
import { PickControls } from './PickControls';
import { traceColor } from './traces';
import type { AnalysisApi } from './useAnalysis';

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

const KIND_ICONS: Record<GraphDef['kind'], IconName> = { time: 'chart', sweep: 'measure', curve: 'curve', bode: 'bode' };

/** Çipin adı: zaman grafiğinde izlerin adları (X-Y'de "y – x"), Bode, "D1 karakteristiği"; föy grafiğinde föydeki başlık. */
export function graphTitle(graph: GraphDef, api: AnalysisApi): string {
  const t = tr.analysis.graphName;
  if (graph.foy) return api.foyTitle(graph.foy) ?? t.time;
  if (graph.kind === 'bode') return t.bode;
  if (graph.kind === 'sweep') {
    const a = sweepAxes(api, graph.sweep);
    return t.sweep(a.ys.map((y) => y.name).join(', ') || '?', a.x.name);
  }
  if (graph.kind === 'curve') {
    const part = api.circuit.parts.find((p) => p.id === graph.part);
    return part ? t.curve(part.label) : t.curveEmpty;
  }
  const names = graph.traces.map((id) => api.labels.get(id)?.name).filter((n): n is string => Boolean(n));
  if (graph.x) {
    const x = api.labels.get(graph.x)?.name;
    if (x && names.length > 0) return `${names.join(', ')} – ${x}`;
  }
  if (names.length === 0) return t.time;
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

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

/** Zaman grafiğinin ortak mantığı: açık grafiğin izleri, imleç, PNG, CSV ve tabloya ekleme; tablo dosyaları. */
function useGraph({ api, recorder: rec, status, frame, notify }: AnalysisPanelProps) {
  const version = useLiveVersion(rec, frame, status, api.traces);
  const chartTraces = useMemo<ChartTrace[]>(
    () => api.graphTraces.map((t) => ({ id: t.id, name: api.labels.get(t.id)?.name ?? '?', unit: api.labels.get(t.id)?.unit ?? 'V', color: t.color })),
    [api.graphTraces, api.labels],
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
    for (let i = 0; i < rec.count; i++) rows.push([rec.times[i]!, ...chartTraces.map((t) => rec.values.get(t.id)?.[i] ?? Number.NaN)]);
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
  const recording = status === 'running' && api.graphTraces.length > 0;
  const statusText = recording ? tr.analysis.graph.status.recording : status === 'stopped' ? tr.analysis.graph.status.idle : tr.analysis.graph.status.paused;
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
  return { recCount: rec.count, version, chartTraces, cursor, setCursor, timeText, svg, csv, png, toTable, recording, statusText, info, span, tableFile, copyTable };
}

type Graph = ReturnType<typeof useGraph>;

/** Eğri izleyicinin ve Bode'un grafikleri (bölmedeki çizimler) alt alta tek PNG'de. */
async function panePng(pane: RefObject<HTMLDivElement | null>, name: string) {
  const svgs = [...(pane.current?.querySelectorAll<SVGSVGElement>('svg[role=img]') ?? [])];
  if (svgs.length === 0) return;
  const blob = await svgsToPng(svgs);
  if (blob) await saveFile(datedName(name, 'png'), blob);
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
        className={`flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-small font-semibold text-white hover:brightness-105 ${touch ? 'h-11' : 'h-9'}`}
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

/** Görevde tahminler kaydedilmeden ölçüm grafiklerinin yerine (B1). */
function GateNote({ text }: { text: string }) {
  return (
    <p className="m-0 flex items-center gap-2 px-4 py-6 text-small text-ink-2">
      <Icon name="target" className="h-4 w-4 shrink-0 text-accent-ink" />
      {text}
    </p>
  );
}

// --- Grafik çipleri -------------------------------------------------------------------------------------

/** Grafikler sekme gibi: her biri bir çip (seçmek için tıkla, ✕ ile kapat); "+ Yeni grafik" başlangıç ekranı. */
function GraphChips({ api, touch }: { api: AnalysisApi; touch: boolean }) {
  const t = tr.analysis;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: ReactKeyboardEvent) => {
    const ids = api.graphs.map((g) => g.id);
    const i = api.active ? ids.indexOf(api.active.id) : -1;
    let next = i;
    if (e.key === 'ArrowRight') next = Math.min(ids.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    else return;
    e.preventDefault();
    const id = ids[next];
    if (!id) return;
    api.setActive(id);
    refs.current[id]?.focus();
  };
  const h = touch ? 'h-11' : 'h-8';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-contain [scrollbar-width:none]">
      {api.graphs.length > 0 && (
        <div role="tablist" aria-label={t.chipsLabel} onKeyDown={onKey} className="flex shrink-0 items-center gap-1.5">
          {api.graphs.map((graph) => {
            const on = api.active?.id === graph.id;
            const name = graphTitle(graph, api);
            return (
              <div key={graph.id} className={`flex shrink-0 items-center rounded-lg border ${on ? 'border-ink bg-ink text-on-ink' : 'border-line bg-panel text-ink-2'}`}>
                <button
                  ref={(el) => {
                    refs.current[graph.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  tabIndex={on || (!api.active && graph === api.graphs[0]) ? 0 : -1}
                  onClick={() => api.setActive(graph.id)}
                  className={`flex max-w-[240px] items-center gap-1.5 rounded-l-lg pl-2.5 text-small font-medium whitespace-nowrap ${h} ${on ? 'font-semibold' : 'hover:text-ink'}`}
                >
                  {graph.foy && <span className={`rounded-[4px] px-1 font-mono text-[10px] font-bold tracking-[0.06em] ${on ? 'bg-on-ink/15' : 'bg-accent-soft text-accent-ink'}`}>{t.foyPrefix}</span>}
                  {!graph.foy && <Icon name={KIND_ICONS[graph.kind]} className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => api.closeGraph(graph.id)}
                  aria-label={t.chipClose(name)}
                  title={t.chipClose(name)}
                  className={`flex shrink-0 items-center justify-center rounded-r-lg ${touch ? 'w-11' : 'w-7'} ${h} ${on ? 'hover:bg-on-ink/10' : 'hover:bg-panel-2'}`}
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => api.setActive(null)}
        aria-pressed={api.view === 'start'}
        className={`flex shrink-0 items-center gap-1 rounded-lg border border-dashed px-2.5 text-small font-semibold whitespace-nowrap ${h} ${api.view === 'start' ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-2 text-accent-ink hover:bg-accent-soft'}`}
      >
        <Icon name="plus" className="h-4 w-4" />
        {t.newGraph}
      </button>
    </div>
  );
}

// --- Zaman grafiği --------------------------------------------------------------------------------------

/** "İz ekle": büyüklük seçici (açık grafikte olanlar işaretli; tıklanan eklenir, işaretliye tıklanınca kalkar). */
function AddQuantity({ api, touch, phone = false, onClose }: { api: AnalysisApi; touch: boolean; phone?: boolean; onClose: () => void }) {
  const inGraph = useMemo(() => {
    const keys = new Map<string, string>();
    for (const t of api.graphTraces) {
      // Düğüm gerilimi seçicide ağın anahtarıyla.
      const key = t.kind === 'voltage' && t.ref === null ? `n:${api.idx.netOf(t.node)}` : quantityKey(t);
      keys.set(key, t.id);
    }
    return keys;
  }, [api.graphTraces, api.idx]);
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="m-0 min-w-0 flex-1 text-small font-semibold">{tr.analysis.picker.title}</h3>
        <button type="button" onClick={onClose} aria-label={tr.analysis.graph.cancel} className={`flex shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}>
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <QuantityPicker
        options={api.quantities}
        selected={new Set(inGraph.keys())}
        onToggle={(o) => {
          const existing = inGraph.get(o.key);
          if (existing) api.removeTrace(existing);
          else api.addQuantity(o.quantity);
        }}
        {...(phone
          ? {}
          : {
              onFromSchematic: () => {
                onClose();
                api.startPick();
              },
            })}
        touch={touch}
        autoFocus={!touch}
        maxHeight={touch ? 320 : undefined}
      />
    </div>
  );
}

/** Zaman grafiğinin yatay ekseni: Zaman ya da bir büyüklük (X-Y). */
function XAxisSelect({ api, touch }: { api: AnalysisApi; touch: boolean }) {
  const t = tr.analysis.picker;
  const graph = api.active?.kind === 'time' ? api.active : null;
  const x = graph?.x ? api.traces.find((tr0) => tr0.id === graph.x) : undefined;
  const value = x ? (x.kind === 'voltage' && x.ref === null ? `n:${api.idx.netOf(x.node)}` : quantityKey(x)) : '';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label font-semibold text-muted">{t.xAxis}</span>
      <select
        value={value}
        onChange={(e) => api.setTimeX(api.quantities.find((o) => o.key === e.target.value)?.quantity ?? null)}
        className={`w-full rounded-lg border border-line-2 bg-panel px-2 text-small ${touch ? 'h-11 text-[16px]' : 'h-8'}`}
      >
        <option value="">{t.xTime}</option>
        {api.quantities.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GraphDesk({ api, recorder, g, touch }: AnalysisPanelProps & { g: Graph; touch: boolean }) {
  const t = tr.analysis.graph;
  const [adding, setAdding] = useState(false);
  const xy = api.active?.kind === 'time' && api.active.x !== null;
  return (
    <div className="flex min-h-0 flex-1 gap-5 px-4 pb-3">
      <div className="flex w-[232px] shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain">
        {adding ? (
          <AddQuantity api={api} touch={touch} onClose={() => setAdding(false)} />
        ) : (
          <>
            <XAxisSelect api={api} touch={touch} />
            <h3 className="m-0 text-small font-semibold tracking-[0.02em] text-muted">{t.traces}</h3>
            {api.graphTraces.map((tr0) => {
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
            {!api.pick &&
              (api.traceGate ? (
                <p className="m-0 rounded-lg bg-panel-2 px-3 py-2.5 text-small leading-snug text-ink-2">{api.traceGate}</p>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent-line text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-10'}`}>
                  <Icon name="plus" className="h-4 w-4" />
                  {t.add}
                </button>
              ))}
            {recorder.perFrame && api.graphTraces.length > 0 && <p className="m-0 text-label leading-snug text-warn">{t.perFrame}</p>}
            {g.info && (
              <dl className="m-0 mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-2 text-label">
                <dt className="text-muted">{t.record}</dt>
                <dd className="m-0 text-right font-mono">{g.info.record}</dd>
                <dt className="text-muted">{t.interval}</dt>
                <dd className="m-0 text-right font-mono">{g.info.interval}</dd>
              </dl>
            )}
          </>
        )}
      </div>
      {xy ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TimeXY api={api} recorder={recorder} version={g.version} />
        </div>
      ) : (
        <ChartMemo recorder={recorder} traces={g.chartTraces} version={g.version} cursor={g.cursor} onCursor={g.setCursor} onToTable={g.toTable} svgRef={g.svg} />
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
  const pane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const clamp = (h: number) => Math.round(Math.min(maxHeight, Math.max(MIN_DRAWER, h)));
  const onHandleKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowUp') onHeight(clamp(height + step));
    else if (e.key === 'ArrowDown') onHeight(clamp(height - step));
    else return;
    e.preventDefault();
  };
  const btn = `flex shrink-0 items-center justify-center gap-1.5 rounded-md text-small font-semibold ${touch ? 'h-11' : 'h-9'}`;
  // Grafiğin eylemleri çiplerin altındaki ince satırda (32 px düğmeler).
  const act = `flex shrink-0 items-center justify-center gap-1.5 rounded-md text-small font-semibold ${touch ? 'h-11' : 'h-8'}`;
  const ghost = `${act} border border-line bg-panel px-3 text-ink hover:bg-panel-2 disabled:opacity-50`;
  const solid = `${act} bg-accent px-3 text-white hover:brightness-105 disabled:opacity-50`;
  const pngButton = (onClick: () => void, disabled: boolean) => (
    <button type="button" onClick={onClick} disabled={disabled} className={ghost}>
      <Icon name="camera" className="h-4 w-4" />
      {tr.analysis.graph.png}
    </button>
  );
  const gated = api.gate && (api.view === 'curve' || api.view === 'bode');
  const actions: ReactNode =
    api.view === 'time' ? (
      <>
        <span className="mr-auto flex items-center gap-1.5 text-label whitespace-nowrap text-muted">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${g.recording ? 'bg-ok' : 'bg-stopped'}`} />
          {g.statusText}
        </span>
        {pngButton(() => void (api.active?.kind === 'time' && api.active.x !== null ? panePng(pane, tr.analysis.graph.fileName) : g.png()), !g.span)}
        <button type="button" onClick={() => g.csv(false)} disabled={!g.span} className={solid}>
          <Icon name="download" className="h-4 w-4" />
          {tr.analysis.graph.csv}
        </button>
      </>
    ) : api.view === 'sweep' && api.active?.kind === 'sweep' ? (
      <SweepActions api={api} notify={props.notify} pane={pane} ghost={ghost} solid={solid} pngButton={pngButton} />
    ) : gated ? null : api.view === 'curve' ? (
      <>
        <span className="mr-auto min-w-0 truncate text-label text-muted" aria-live="polite">{curveSummary(api.tracer)}</span>
        {api.tracer.progress ? (
          <button type="button" onClick={api.tracer.cancel} className={ghost}>
            <Icon name="stop" className="h-4 w-4" />
            {tr.analysis.curve.cancel}
          </button>
        ) : (
          <button type="button" onClick={api.tracer.run} disabled={!api.tracer.part} className={ghost}>
            <Icon name="undo" className="h-4 w-4" />
            {tr.analysis.curve.rerun}
          </button>
        )}
        {pngButton(() => void panePng(pane, tr.analysis.graph.fileName), !api.tracer.result)}
        <button type="button" onClick={() => saveCurves(api.tracer, api.separator, false)} disabled={!api.tracer.result} className={solid}>
          <Icon name="download" className="h-4 w-4" />
          {tr.analysis.curve.csv}
        </button>
      </>
    ) : api.view === 'bode' ? (
      <>
        <span className="mr-auto" />
        {api.bode.progress ? (
          <button type="button" onClick={api.bode.cancel} className={ghost}>
            <Icon name="stop" className="h-4 w-4" />
            {tr.analysis.bode.cancel}
          </button>
        ) : (
          <button type="button" onClick={api.bode.run} disabled={!api.bode.input || !api.bode.output} className={ghost}>
            <Icon name="undo" className="h-4 w-4" />
            {tr.analysis.bode.rerun}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const n = bodeToTable(api);
            if (n > 0) props.notify(tr.analysis.bode.added(n));
          }}
          disabled={api.bode.points.length === 0 || Boolean(api.bode.progress)}
          className={ghost}
        >
          <Icon name="plus" className="h-4 w-4" />
          {tr.analysis.bode.toTable}
        </button>
        {pngButton(() => void panePng(pane, tr.analysis.graph.fileName), api.bode.points.length === 0)}
        <button type="button" onClick={() => saveBode(api.bode, api.separator, false)} disabled={api.bode.points.length === 0} className={solid}>
          <Icon name="download" className="h-4 w-4" />
          {tr.analysis.bode.csv}
        </button>
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
        <GraphChips api={api} touch={touch} />
        <button
          type="button"
          onClick={() => api.setTableOpen(!api.tableOpen)}
          aria-pressed={api.tableOpen}
          className={`${btn} border px-3 ${api.tableOpen ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-panel text-ink hover:bg-panel-2'}`}
        >
          <Icon name="table" className="h-4 w-4" />
          {tr.analysis.tableButton}
          {api.doc.rows.length > 0 && <span className="rounded-full bg-panel-2 px-1.5 font-mono text-label text-ink-2">{api.doc.rows.length}</span>}
        </button>
        <button type="button" onClick={onExpand} aria-label={expanded ? tr.analysis.shrink : tr.analysis.expand} title={expanded ? tr.analysis.shrink : tr.analysis.expand} className={`${btn} w-10 text-ink hover:bg-panel-2`}>
          <Icon name={expanded ? 'fullscreenExit' : 'fullscreen'} className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={() => api.setOpen(false)} aria-label={tr.analysis.close} title={tr.analysis.close} className={`${btn} w-10 text-ink hover:bg-panel-2`}>
          <Icon name="close" className="h-[18px] w-[18px]" />
        </button>
      </div>
      {actions && <div className="flex shrink-0 items-center justify-end gap-2 px-4 pb-2">{actions}</div>}
      <div className="flex min-h-0 flex-1">
        <div ref={pane} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {api.view === 'start' ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
              <StartScreen api={api} foy={api.foy} touch={touch} />
            </div>
          ) : api.view === 'time' ? (
            <GraphDesk {...props} g={g} touch={touch} />
          ) : api.view === 'sweep' ? (
            <SweepPane api={api} cursor={api.sweepCursor} onCursor={api.setSweepCursor} />
          ) : gated ? (
            <GateNote text={api.gate!} />
          ) : api.view === 'curve' ? (
            <CurvePane tracer={api.tracer} />
          ) : (
            <BodePane api={api} />
          )}
        </div>
        {api.tableOpen && (
          <aside aria-label={tr.analysis.tableButton} className="flex w-[560px] max-w-[60%] shrink-0 flex-col border-l border-line">
            <div className="flex shrink-0 items-center justify-end gap-2 px-3 pb-2">
              <button type="button" onClick={() => void g.copyTable()} className={ghost}>
                <Icon name="copy" className="h-4 w-4" />
                {tr.analysis.table.copy}
              </button>
              <CsvMenu api={api} g={g} touch={touch} />
              <button type="button" onClick={() => api.setTableOpen(false)} aria-label={tr.analysis.tableClose} title={tr.analysis.tableClose} className={`${act} w-8 text-ink hover:bg-panel-2`}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <TablePane api={api} recorder={props.recorder} version={g.version} title={props.title} stacked />
          </aside>
        )}
      </div>
    </section>
  );
}

/** Tarama grafiğinin eylemleri: ilerleme ve İptal ya da Yeniden tara, Tabloya ekle, PNG, CSV. */
function SweepActions({ api, notify, pane, ghost, solid, pngButton }: { api: AnalysisApi; notify: (m: string) => void; pane: RefObject<HTMLDivElement | null>; ghost: string; solid: string; pngButton: (onClick: () => void, disabled: boolean) => ReactNode }) {
  const t = tr.analysis.sweep;
  const spec = api.active?.kind === 'sweep' ? api.active.sweep : null;
  const result = api.sweep.result;
  const points = result?.curves.reduce((n, c) => n + c.points.length, 0) ?? 0;
  if (!spec) return null;
  return (
    <>
      <span className="mr-auto min-w-0 truncate text-label text-muted" aria-live="polite">
        {api.sweep.progress ? t.progress(api.sweep.progress.done, api.sweep.progress.total) : result && api.sweep.fresh ? t.done(points) : ''}
      </span>
      {api.sweep.progress ? (
        <button type="button" onClick={api.sweep.cancel} className={ghost}>
          <Icon name="stop" className="h-4 w-4" />
          {t.cancel}
        </button>
      ) : (
        <button type="button" onClick={api.sweep.run} disabled={spec.y.length === 0} className={ghost}>
          <Icon name="undo" className="h-4 w-4" />
          {t.rerun}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          const n = api.sweepCursor !== null && result ? sweepToTable(api, spec, result.curves, api.sweepCursor) : 0;
          if (n > 0) notify(t.added(n));
        }}
        disabled={api.sweepCursor === null || !result}
        className={ghost}
      >
        <Icon name="plus" className="h-4 w-4" />
        {t.toTable}
      </button>
      {pngButton(() => void panePng(pane, t.fileName), !result)}
      <button type="button" onClick={() => result && saveSweep(api, spec, result.curves, false)} disabled={!result} className={solid}>
        <Icon name="download" className="h-4 w-4" />
        {t.csv}
      </button>
    </>
  );
}

export const MIN_DRAWER = 220;
export const DEFAULT_DRAWER = 380;
/** Eğri izleyici ve Bode'da çekmecenin en az boyu (kullanıcı tutamakla boy vermediyse). */
export const TALL_DRAWER = 560;

// --- Telefon alt sayfası (N9) ---------------------------------------------------------------------------

export function AnalysisSheetBody(props: AnalysisPanelProps & { readonly onClose: () => void; readonly onPlay: () => void; readonly onPause: () => void }) {
  const { api, recorder } = props;
  const g = useGraph(props);
  const pane = useRef<HTMLDivElement>(null);
  const t = tr.analysis.graph;
  const [adding, setAdding] = useState(false);
  const gated = api.gate && (api.view === 'curve' || api.view === 'bode');
  const sweepSpec = api.active?.kind === 'sweep' ? api.active.sweep : null;
  const bar = 'flex shrink-0 gap-2 border-t border-line px-4 pt-3';
  const barStyle = { paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' };
  const ghost = 'flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-2 bg-panel text-[15px] font-semibold disabled:opacity-50';
  const solid = 'flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-[15px] font-semibold text-white disabled:opacity-50';
  return (
    <TouchUi.Provider value>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 pr-2 pl-4">
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
          <button
            type="button"
            onClick={() => api.setTableOpen(!api.tableOpen)}
            aria-pressed={api.tableOpen}
            aria-label={tr.analysis.tableButton}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${api.tableOpen ? 'bg-accent-soft text-accent-ink' : 'text-ink active:bg-app'}`}
          >
            <Icon name="table" />
          </button>
          <button type="button" onClick={props.onClose} aria-label={tr.analysis.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted active:bg-app">
            <Icon name="close" />
          </button>
        </div>
        {!api.tableOpen && (
          <div className="flex shrink-0 px-4 pt-1 pb-3">
            <GraphChips api={api} touch />
          </div>
        )}
        <div ref={pane} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pb-3">
          {api.tableOpen ? (
            <>
              <h3 className="m-0 text-small font-semibold">{tr.analysis.tableButton}</h3>
              <TablePane api={api} recorder={recorder} version={g.version} title={props.title} compact />
            </>
          ) : api.view === 'start' ? (
            <StartScreen api={api} foy={api.foy} touch phone />
          ) : api.view === 'time' ? (
            adding ? (
              <AddQuantity api={api} touch phone onClose={() => setAdding(false)} />
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {api.graphTraces.map((tr0) => {
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
                </div>
                <PickControls api={api} touch />
                {api.active?.kind === 'time' && api.active.x !== null ? (
                  <TimeXY api={api} recorder={recorder} version={g.version} compact />
                ) : (
                  <div className="flex h-[210px] shrink-0">
                    <ChartMemo recorder={recorder} traces={g.chartTraces} version={g.version} cursor={g.cursor} onCursor={g.setCursor} compact svgRef={g.svg} />
                  </div>
                )}
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
                {recorder.perFrame && api.graphTraces.length > 0 && <p className="m-0 text-label text-warn">{t.perFrame}</p>}
                {/* Ayarlar grafiğin altında katlı: büyüklük ekle, yatay eksen. */}
                <Fold title={tr.analysis.picker.settings}>
                  {!api.pick && !api.traceGate && (
                    <button type="button" onClick={() => setAdding(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent-line text-small font-semibold text-accent-ink">
                      <Icon name="plus" className="h-4 w-4" />
                      {t.add}
                    </button>
                  )}
                  {api.traceGate && <p className="m-0 text-small text-ink-2">{api.traceGate}</p>}
                  <XAxisSelect api={api} touch />
                </Fold>
              </>
            )
          ) : api.view === 'sweep' ? (
            <SweepPane api={api} cursor={api.sweepCursor} onCursor={api.setSweepCursor} compact />
          ) : gated ? (
            <GateNote text={api.gate!} />
          ) : api.view === 'curve' ? (
            <CurvePane tracer={api.tracer} compact />
          ) : (
            <BodePane api={api} compact />
          )}
        </div>
        {api.tableOpen ? (
          <div className={bar} style={barStyle}>
            <button type="button" onClick={() => void g.copyTable()} disabled={api.doc.rows.length === 0} className={ghost}>
              <Icon name="copy" className="h-4 w-4" />
              {tr.analysis.table.copy}
            </button>
            <button type="button" onClick={() => g.tableFile(true)} disabled={api.doc.rows.length === 0} className={solid}>
              <Icon name="share" className="h-4 w-4" />
              {t.csvShare}
            </button>
          </div>
        ) : sweepSpec ? (
          <div className={bar} style={barStyle}>
            {api.sweep.progress ? (
              <button type="button" onClick={api.sweep.cancel} className={ghost}>
                <Icon name="stop" className="h-4 w-4" />
                {`${tr.analysis.sweep.cancel} · ${api.sweep.progress.done} / ${api.sweep.progress.total}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const n = api.sweepCursor !== null && api.sweep.result ? sweepToTable(api, sweepSpec, api.sweep.result.curves, api.sweepCursor) : 0;
                  if (n > 0) props.notify(tr.analysis.sweep.added(n));
                }}
                disabled={api.sweepCursor === null || !api.sweep.result}
                className={ghost}
              >
                <Icon name="plus" className="h-4 w-4" />
                {tr.analysis.sweep.toTable}
              </button>
            )}
            <button type="button" onClick={() => api.sweep.result && saveSweep(api, sweepSpec, api.sweep.result.curves, true)} disabled={!api.sweep.result} className={solid}>
              <Icon name="share" className="h-4 w-4" />
              {t.csvShare}
            </button>
          </div>
        ) : api.view === 'bode' && !gated ? (
          <div className={bar} style={barStyle}>
            {api.bode.progress ? (
              <button type="button" onClick={api.bode.cancel} className={ghost}>
                <Icon name="stop" className="h-4 w-4" />
                {`${tr.analysis.bode.cancel} · ${api.bode.progress.done} / ${api.bode.progress.total}`}
              </button>
            ) : (
              <button type="button" onClick={api.bode.run} disabled={!api.bode.input || !api.bode.output} className={ghost}>
                <Icon name="undo" className="h-4 w-4" />
                {tr.analysis.bode.rerun}
              </button>
            )}
            <button type="button" onClick={() => saveBode(api.bode, api.separator, true)} disabled={api.bode.points.length === 0} className={solid}>
              <Icon name="share" className="h-4 w-4" />
              {t.csvShare}
            </button>
          </div>
        ) : api.view === 'curve' && !gated ? (
          <div className={bar} style={barStyle}>
            {api.tracer.progress ? (
              <button type="button" onClick={api.tracer.cancel} className={ghost}>
                <Icon name="stop" className="h-4 w-4" />
                {`${tr.analysis.curve.cancel} · ${api.tracer.progress.done} / ${api.tracer.progress.total}`}
              </button>
            ) : (
              <button type="button" onClick={api.tracer.run} disabled={!api.tracer.part} className={ghost}>
                <Icon name="undo" className="h-4 w-4" />
                {tr.analysis.curve.rerun}
              </button>
            )}
            <button type="button" onClick={() => saveCurves(api.tracer, api.separator, true)} disabled={!api.tracer.result} className={solid}>
              <Icon name="share" className="h-4 w-4" />
              {t.csvShare}
            </button>
          </div>
        ) : api.view === 'time' && !adding ? (
          <div className={bar} style={barStyle}>
            <button type="button" onClick={g.toTable} disabled={!g.span} className={ghost}>
              <Icon name="plus" className="h-4 w-4" />
              {t.toTable}
            </button>
            <button type="button" onClick={() => g.csv(true)} disabled={!g.span} className={solid}>
              <Icon name="share" className="h-4 w-4" />
              {t.csvShare}
            </button>
          </div>
        ) : null}
      </div>
    </TouchUi.Provider>
  );
}
