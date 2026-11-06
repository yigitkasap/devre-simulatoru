// Analiz katmanının durumu (docs/tasarim-v3 → "Analiz katmanı"; analiz v2): devreyle kaydedilen bölüm
// (izler, tablo, grafikler), çekmecenin açıklığı, açık grafik (çip) ya da başlangıç ekranı, ölçüm tablosu
// paneli, "İz ekle" seçimi, şemadaki iz etiketleri.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CsvSeparator } from './format';
import { tr } from '../../i18n/tr';
import { nextTraceColor, pruneTraces, type AnalysisDoc, type FoyGraphRef, type GraphDef, type GraphKind, type Quantity, type SweepSpec, type TableRow, type TraceDef } from '../../model/analysis';
import type { Connectivity } from '../../model/connectivity';
import type { CircuitDoc, Point } from '../../model/types';
import type { CanvasMark, PickTarget } from '../Canvas';
import { foyGraph } from '../../i18n/foyGraphs';
import { sweepParams, type SweepParamOption } from './dcsweep';
import { useDcSweep, type DcSweepApi } from './useDcSweep';
import { quantityOptions, type QuantityOption } from './quantities';
import { liveTraces, netIndex, nodeName, traceColor, traceLabel, type NetIndex, type TraceLabel } from './traces';
import { useBode, type BodeApi } from './useBode';
import { useTracer, type TracerApi } from './useTracer';

/** Analizde açık olan: başlangıç ekranı ("Ne çizmek istiyorsun?") ya da açık grafiğin türü. */
export type AnalysisView = 'start' | GraphKind;

/** "İz ekle": ilk tıklama bekleniyor ya da bir düğüm seçildi, fark için ikincisi bekleniyor. */
export type PickState = { readonly stage: 'first' } | { readonly stage: 'second'; readonly key: string; readonly at: Point; readonly name: string };

let idCounter = 0;
export const newId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export interface AnalysisApi {
  readonly doc: AnalysisDoc;
  readonly setDoc: (next: AnalysisDoc | ((a: AnalysisDoc) => AnalysisDoc)) => void;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  /** Başlangıç ekranı ya da açık grafiğin türü. */
  readonly view: AnalysisView;
  /** Grafikler (çipler) ve açık olan; null: başlangıç ekranı. */
  readonly graphs: readonly GraphDef[];
  readonly active: GraphDef | null;
  readonly setActive: (id: string | null) => void;
  /** Yeni grafik açar (Bode ve aynı parçanın eğri izleyicisi tektir: açıksa ona geçilir). */
  readonly openGraph: (graph: DistributiveOmit<GraphDef, 'id'>) => void;
  /** Seçilen büyüklüklerle zamana göre grafik açar (x verilirse X-Y). */
  readonly openTimeGraph: (quantities: readonly Quantity[], options?: { readonly x?: Quantity; readonly foy?: FoyGraphRef }) => void;
  /** Açık zaman grafiğine bir büyüklük ekler (zaten varsa eklemez). */
  readonly addQuantity: (quantity: Quantity) => void;
  /** Bir değeri tarayarak (DC tarama): açık tarama grafiğinin sonucu, ilerleme, iptal. */
  readonly sweep: DcSweepApi;
  /** Devrede taranabilen değerler. */
  readonly sweepParams: readonly SweepParamOption[];
  /** Açık tarama grafiğinin ayarlarını değiştirir. */
  readonly setSweep: (patch: Partial<SweepSpec>) => void;
  /** Tarama grafiğinin imleci (x ekseninin SI değeri). */
  readonly sweepCursor: number | null;
  readonly setSweepCursor: (x: number | null) => void;
  /** Föy grafiğinin başlığı (çipte); bilinmiyorsa null. */
  readonly foyTitle: (ref: FoyGraphRef) => string | null;
  /** Devre (öneriler ve büyüklük seçici için). */
  readonly circuit: CircuitDoc;
  /** Büyüklük seçicinin seçenekleri (devredeki bütün büyüklükler). */
  readonly quantities: readonly QuantityOption[];
  readonly closeGraph: (id: string) => void;
  /** Ölçüm tablosu paneli (sağdan açılır). */
  readonly tableOpen: boolean;
  readonly setTableOpen: (open: boolean) => void;
  /** Belgede hâlâ karşılığı olan izler (kaydedilenler; bütün zaman grafiklerinin). */
  readonly traces: readonly TraceDef[];
  /** Açık zaman grafiğinin izleri (çizilenler). */
  readonly graphTraces: readonly TraceDef[];
  readonly labels: ReadonlyMap<string, TraceLabel>;
  readonly pick: PickState | null;
  readonly startPick: () => void;
  readonly cancelPick: () => void;
  /** İkinci düğüm beklenirken: ilk düğümün toprağa göre gerilimi. */
  readonly addPendingNode: () => void;
  readonly onPick: (target: PickTarget) => void;
  readonly removeTrace: (id: string) => void;
  readonly marks: readonly CanvasMark[];
  readonly addRows: (rows: readonly Omit<TableRow, 'id'>[]) => void;
  /** Grafiğin imleci (tablo ve uydurma da kullanır); null: kaydın başından altıda bir. */
  readonly cursor: number | null;
  readonly setCursor: (t: number | null) => void;
  /** CSV ayırıcısı (bu tarayıcıda hatırlanır): noktalı virgül (Türkçe Excel) ya da virgül. */
  readonly separator: CsvSeparator;
  readonly setSeparator: (sep: CsvSeparator) => void;
  /** Eğri izleyici (A3). */
  readonly tracer: TracerApi;
  /** Ölçülen Bode (A4). */
  readonly bode: BodeApi;
  /** Devrenin düğüm dizini (görev hedeflerinin adları ve ölçümü). */
  readonly idx: NetIndex;
  /** Görevde tahmin kaydedilmeden (B1) ölçüm yapılmaz: Eğri izleyici ve Bode yerine bu yazı. */
  readonly gate: string | null;
  /** Arıza bulmada (B2) serbest iz eklenmez: Grafik'te "İz ekle" yerine bu yazı. */
  readonly traceGate: string | null;
}

const SEPARATOR_KEY = 'devre-simulatoru:csv-ayirici';

function readSeparator(): CsvSeparator {
  try {
    return window.localStorage.getItem(SEPARATOR_KEY) === ',' ? ',' : ';';
  } catch {
    return ';';
  }
}

export function useAnalysis(
  doc: CircuitDoc,
  connectivity: Connectivity,
  initial: AnalysisDoc,
  notify: (message: string) => void,
  selected: string | null = null,
  gate: string | null = null,
  traceGate: string | null = null,
): AnalysisApi {
  const [analysis, setDoc] = useState(initial);
  const [open, setOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [pick, setPick] = useState<PickState | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [separator, setSeparatorState] = useState<CsvSeparator>(readSeparator);
  const setSeparator = useCallback((sep: CsvSeparator) => {
    setSeparatorState(sep);
    try {
      window.localStorage.setItem(SEPARATOR_KEY, sep);
    } catch {
      // Depolama kapalı: seçim yalnızca bu oturumda.
    }
  }, []);
  const idx = useMemo(() => netIndex(doc, connectivity), [doc, connectivity]);
  const active = analysis.graphs.find((g) => g.id === analysis.active) ?? null;
  const view: AnalysisView = active?.kind ?? 'start';
  const activeId = active?.id ?? null;
  // Eğri grafiği taradığı parçayı hatırlar (yoksa seçili parça ya da ilk aday).
  const curvePart = active?.kind === 'curve' && active.part && doc.parts.some((p) => p.id === active.part) ? active.part : null;
  const tracer = useTracer(doc, connectivity, curvePart ?? selected);
  useEffect(() => {
    if (curvePart && tracer.part?.id !== curvePart) tracer.setPart(curvePart);
  }, [curvePart]);
  // Eğri grafiğinde parça değişince grafik de yeni parçayı hatırlar.
  useEffect(() => {
    const id = tracer.part?.id ?? null;
    if (view !== 'curve' || !id) return;
    setDoc((a) => ({ ...a, graphs: a.graphs.map((g) => (g.id === activeId && g.kind === 'curve' && g.part !== id ? { ...g, part: id } : g)) }));
  }, [view, activeId, tracer.part?.id]);
  const live = useMemo(() => liveTraces(analysis.traces, doc, idx), [analysis.traces, doc, idx]);
  // Kimlikler değişmedikçe aynı dizi (kayıt her belge değişikliğinde yeniden kurulmasın).
  const liveKey = live.map((t) => t.id).join(',');
  const traces = useMemo(() => live, [liveKey]);
  const labels = useMemo(() => new Map(traces.map((t) => [t.id, traceLabel(t, doc, idx)])), [traces, doc, idx]);
  const bode = useBode(doc, connectivity, idx, traces, labels);

  const graphTraces = useMemo(
    () => (active?.kind === 'time' ? active.traces.map((id) => traces.find((t) => t.id === id)).filter((t): t is TraceDef => t !== undefined) : []),
    [active, traces],
  );

  /** İz açık zaman grafiğine eklenir (açık grafik zaman grafiği değilse yeni bir zaman grafiği açılır). */
  const addTrace = useCallback((def: DistributiveOmit<TraceDef, 'id' | 'color'>) => {
    setDoc((a) => {
      const trace = { ...def, id: newId('t'), color: nextTraceColor(a.traces) } as TraceDef;
      const current = a.graphs.find((g) => g.id === a.active);
      if (current?.kind === 'time') return { ...a, traces: [...a.traces, trace], graphs: a.graphs.map((g) => (g === current ? { ...current, traces: [...current.traces, trace.id] } : g)) };
      const graph: GraphDef = { id: newId('g'), kind: 'time', traces: [trace.id], x: null };
      return { ...a, traces: [...a.traces, trace], graphs: [...a.graphs, graph], active: graph.id };
    });
  }, []);

  const setActive = useCallback((id: string | null) => setDoc((a) => (a.active === id ? a : { ...a, active: id })), []);
  const openTimeGraph = useCallback((quantities: readonly Quantity[], options: { readonly x?: Quantity; readonly foy?: FoyGraphRef } = {}) => {
    setDoc((a) => {
      const traces: TraceDef[] = [...a.traces];
      const make = (q: Quantity) => {
        const t = { ...q, id: newId('t'), color: nextTraceColor(traces) } as TraceDef;
        traces.push(t);
        return t.id;
      };
      const ids = quantities.map(make);
      const x = options.x ? make(options.x) : null;
      const graph: GraphDef = { id: newId('g'), kind: 'time', traces: ids, x, ...(options.foy ? { foy: options.foy } : {}) };
      return { ...a, traces, graphs: [...a.graphs, graph], active: graph.id };
    });
  }, []);
  const addQuantity = useCallback((q: Quantity) => addTrace(q as DistributiveOmit<TraceDef, 'id' | 'color'>), [addTrace]);
  const quantities = useMemo(() => quantityOptions(doc, idx), [doc, idx]);
  const params = useMemo(() => sweepParams(doc), [doc]);
  const sweep = useDcSweep(connectivity.netlist, active?.kind === 'sweep' ? active : null);
  const [sweepCursor, setSweepCursor] = useState<number | null>(null);
  useEffect(() => setSweepCursor(null), [activeId]);
  const setSweep = useCallback(
    (patch: Partial<SweepSpec>) => setDoc((a) => ({ ...a, graphs: a.graphs.map((g) => (g.id === a.active && g.kind === 'sweep' ? { ...g, sweep: { ...g.sweep, ...patch } } : g)) })),
    [],
  );
  const openGraph = useCallback((def: DistributiveOmit<GraphDef, 'id'>) => {
    setDoc((a) => {
      const same = a.graphs.find((g) => (def.kind === 'bode' && g.kind === 'bode') || (def.kind === 'curve' && g.kind === 'curve' && g.part === def.part));
      if (same) return { ...a, active: same.id };
      const graph = { ...def, id: newId('g') } as GraphDef;
      return { ...a, graphs: [...a.graphs, graph], active: graph.id };
    });
  }, []);
  const closeGraph = useCallback((id: string) => {
    setDoc((a) => {
      const i = a.graphs.findIndex((g) => g.id === id);
      if (i < 0) return a;
      const graphs = a.graphs.filter((g) => g.id !== id);
      // Kapatılan açıksa yanındaki açılır (sağdaki, yoksa soldaki); hiç kalmadıysa başlangıç ekranı.
      const next = a.active === id ? (graphs[Math.min(i, graphs.length - 1)]?.id ?? null) : a.active;
      return pruneTraces({ ...a, graphs, active: next });
    });
  }, []);

  const onPick = useCallback(
    (target: PickTarget) => {
      if (target.kind === 'part') {
        const part = doc.parts.find((p) => p.id === target.partId);
        if (!part || part.type === 'ground') {
          notify(tr.analysis.graph.noGround);
          return;
        }
        addTrace({ kind: 'current', part: part.id });
        setPick(null);
        return;
      }
      const ground = idx.netOf(target.key) === idx.ground;
      if (pick?.stage === 'second') {
        // İkinci düğüm: fark gerilimi (aynı düğüm ya da toprak seçildiyse toprağa göre).
        const same = idx.netOf(target.key) === idx.netOf(pick.key);
        addTrace(same || ground ? { kind: 'voltage', node: pick.key, at: pick.at, ref: null, refAt: null } : { kind: 'voltage', node: pick.key, at: pick.at, ref: target.key, refAt: target.at });
        setPick(null);
        return;
      }
      if (ground) {
        notify(tr.analysis.graph.noGround);
        return;
      }
      setPick({ stage: 'second', key: target.key, at: target.at, name: nodeName(target.key, idx) });
    },
    [doc.parts, idx, addTrace, notify, pick],
  );

  const addPendingNode = useCallback(() => {
    if (pick?.stage === 'second') addTrace({ kind: 'voltage', node: pick.key, at: pick.at, ref: null, refAt: null });
    setPick(null);
  }, [addTrace, pick]);

  /** İz açık grafikten kaldırılır (başka grafikte kullanılmıyorsa belgeden de). */
  const removeTrace = useCallback(
    (id: string) =>
      setDoc((a) =>
        pruneTraces({
          ...a,
          graphs: a.graphs.map((g) => (g.id === a.active && g.kind === 'time' ? { ...g, traces: g.traces.filter((t) => t !== id), x: g.x === id ? null : g.x } : g)),
        }),
      ),
    [],
  );

  const marks = useMemo(() => {
    const out: CanvasMark[] = [];
    for (const t of graphTraces) {
      const label = labels.get(t.id);
      if (!label) continue;
      const color = traceColor(t.color);
      if (t.kind !== 'voltage') {
        // Parçanın büyüklüğü (akım, okuma, kanal, güç, transistör): etiket parçanın üstünde.
        const part = doc.parts.find((p) => p.id === t.part);
        if (part) out.push({ at: { x: part.x, y: part.y }, text: t.kind === 'current' ? `${label.name} →` : label.name, color, kind: 'pill' });
      } else {
        out.push({ at: t.at, text: label.name, color, kind: 'pill' });
        if (t.refAt) out.push({ at: t.refAt, text: `${label.name}−`, color, kind: 'ring' });
      }
    }
    if (pick?.stage === 'second') out.push({ at: pick.at, text: `pick-${pick.key}`, color: 'var(--color-accent)', kind: 'ring' });
    // Eğri izleyicide taranan parça: kesikli halka ve etiket.
    if (view === 'curve' && tracer.part) {
      const p = tracer.part;
      out.push({ at: { x: p.x, y: p.y }, text: `scan-${p.id}`, color: 'var(--color-accent)', kind: 'ring', r: 30 });
      out.push({ at: { x: p.x, y: p.y - 2 }, text: tr.analysis.curve.scanned(p.label), color: 'var(--color-accent)', kind: 'pill' });
    }
    // Bode: giriş ve çıkış noktaları.
    if (view === 'bode') {
      if (bode.input?.at) out.push({ at: bode.input.at, text: tr.analysis.bode.inputMark, color: traceColor(0), kind: 'pill' });
      if (bode.output?.at) out.push({ at: bode.output.at, text: tr.analysis.bode.outputMark, color: traceColor(3), kind: 'pill' });
    }
    return out;
  }, [graphTraces, labels, doc.parts, pick, view, tracer.part, bode.input?.at, bode.output?.at]);

  const addRows = useCallback((rows: readonly Omit<TableRow, 'id'>[]) => {
    setDoc((a) => ({ ...a, rows: [...a.rows, ...rows.map((r) => ({ ...r, id: newId('r') }))] }));
  }, []);

  return {
    doc: analysis,
    setDoc,
    open,
    setOpen: (o) => {
      setOpen(o);
      if (!o) setPick(null);
    },
    view,
    graphs: analysis.graphs,
    active,
    setActive,
    openGraph,
    openTimeGraph,
    addQuantity,
    sweep,
    sweepParams: params,
    setSweep,
    sweepCursor,
    setSweepCursor,
    foyTitle: (ref) => foyGraph(ref)?.title ?? null,
    circuit: doc,
    quantities,
    closeGraph,
    tableOpen,
    setTableOpen,
    traces,
    graphTraces,
    labels,
    pick,
    startPick: () => setPick({ stage: 'first' }),
    cancelPick: () => setPick(null),
    addPendingNode,
    onPick,
    removeTrace,
    marks,
    addRows,
    cursor,
    setCursor,
    separator,
    setSeparator,
    tracer,
    bode,
    idx,
    gate,
    traceGate,
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
