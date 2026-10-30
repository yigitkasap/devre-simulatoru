// Analiz katmanının durumu (docs/tasarim-v3 → "Analiz katmanı"): devreyle kaydedilen bölüm (izler,
// tablo), çekmecenin açıklığı ve sekmesi, "İz ekle" seçimi, şemadaki iz etiketleri.

import { useCallback, useMemo, useState } from 'react';
import type { CsvSeparator } from './format';
import { tr } from '../../i18n/tr';
import { nextTraceColor, type AnalysisDoc, type TableRow, type TraceDef } from '../../model/analysis';
import type { Connectivity } from '../../model/connectivity';
import type { CircuitDoc, Point } from '../../model/types';
import type { CanvasMark, PickTarget } from '../Canvas';
import { liveTraces, netIndex, nodeName, traceColor, traceLabel, type NetIndex, type TraceLabel } from './traces';
import { useBode, type BodeApi } from './useBode';
import { useTracer, type TracerApi } from './useTracer';

export type AnalysisTab = 'graph' | 'table' | 'curve' | 'bode';
export const ANALYSIS_TABS: readonly AnalysisTab[] = ['graph', 'table', 'curve', 'bode'];

/** "İz ekle": ilk tıklama bekleniyor ya da bir düğüm seçildi, fark için ikincisi bekleniyor. */
export type PickState = { readonly stage: 'first' } | { readonly stage: 'second'; readonly key: string; readonly at: Point; readonly name: string };

let idCounter = 0;
export const newId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export interface AnalysisApi {
  readonly doc: AnalysisDoc;
  readonly setDoc: (next: AnalysisDoc | ((a: AnalysisDoc) => AnalysisDoc)) => void;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly tab: AnalysisTab;
  readonly setTab: (tab: AnalysisTab) => void;
  /** Belgede hâlâ karşılığı olan izler (kaydedilenler). */
  readonly traces: readonly TraceDef[];
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
}

const SEPARATOR_KEY = 'devre-simulatoru:csv-ayirici';

function readSeparator(): CsvSeparator {
  try {
    return window.localStorage.getItem(SEPARATOR_KEY) === ',' ? ',' : ';';
  } catch {
    return ';';
  }
}

export function useAnalysis(doc: CircuitDoc, connectivity: Connectivity, initial: AnalysisDoc, notify: (message: string) => void, selected: string | null = null): AnalysisApi {
  const [analysis, setDoc] = useState(initial);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AnalysisTab>('graph');
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
  const tracer = useTracer(doc, connectivity, selected);
  const live = useMemo(() => liveTraces(analysis.traces, doc, idx), [analysis.traces, doc, idx]);
  // Kimlikler değişmedikçe aynı dizi (kayıt her belge değişikliğinde yeniden kurulmasın).
  const liveKey = live.map((t) => t.id).join(',');
  const traces = useMemo(() => live, [liveKey]);
  const labels = useMemo(() => new Map(traces.map((t) => [t.id, traceLabel(t, doc, idx)])), [traces, doc, idx]);
  const bode = useBode(doc, connectivity, idx, traces, labels);

  const addTrace = useCallback((def: DistributiveOmit<TraceDef, 'id' | 'color'>) => {
    setDoc((a) => ({ ...a, traces: [...a.traces, { ...def, id: newId('t'), color: nextTraceColor(a.traces) } as TraceDef] }));
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

  const removeTrace = useCallback((id: string) => setDoc((a) => ({ ...a, traces: a.traces.filter((t) => t.id !== id) })), []);

  const marks = useMemo(() => {
    const out: CanvasMark[] = [];
    for (const t of traces) {
      const label = labels.get(t.id);
      if (!label) continue;
      const color = traceColor(t.color);
      if (t.kind === 'current') {
        const part = doc.parts.find((p) => p.id === t.part);
        if (part) out.push({ at: { x: part.x, y: part.y }, text: `${label.name} →`, color, kind: 'pill' });
      } else {
        out.push({ at: t.at, text: label.name, color, kind: 'pill' });
        if (t.refAt) out.push({ at: t.refAt, text: `${label.name}−`, color, kind: 'ring' });
      }
    }
    if (pick?.stage === 'second') out.push({ at: pick.at, text: `pick-${pick.key}`, color: 'var(--color-accent)', kind: 'ring' });
    // Eğri izleyicide taranan parça: kesikli halka ve etiket.
    if (tab === 'curve' && tracer.part) {
      const p = tracer.part;
      out.push({ at: { x: p.x, y: p.y }, text: `scan-${p.id}`, color: 'var(--color-accent)', kind: 'ring', r: 30 });
      out.push({ at: { x: p.x, y: p.y - 2 }, text: tr.analysis.curve.scanned(p.label), color: 'var(--color-accent)', kind: 'pill' });
    }
    // Bode: giriş ve çıkış noktaları.
    if (tab === 'bode') {
      if (bode.input?.at) out.push({ at: bode.input.at, text: tr.analysis.bode.inputMark, color: traceColor(0), kind: 'pill' });
      if (bode.output?.at) out.push({ at: bode.output.at, text: tr.analysis.bode.outputMark, color: traceColor(3), kind: 'pill' });
    }
    return out;
  }, [traces, labels, doc.parts, pick, tab, tracer.part, bode.input?.at, bode.output?.at]);

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
    tab,
    setTab,
    traces,
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
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
