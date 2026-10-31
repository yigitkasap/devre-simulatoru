// Ölçülen Bode'un durumu (A4, N4): giriş (fonksiyon üreteci ya da AC kaynak), çıkış (osiloskop kanalı
// ya da grafikteki bir gerilim izi), frekans aralığı ve nokta sayısı. Ölçüm Web Worker'da; noktalar
// geldikçe gösterilir, İptal iş parçacığını sonlandırır.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import type { TraceDef } from '../../model/analysis';
import { pinKey, type Connectivity } from '../../model/connectivity';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc, Point } from '../../model/types';
import { sourceLimits, type BodePoint, type Probe } from './bode';
import type { TraceLabel } from './traces';
import { nodeName, type NetIndex } from './traces';
import type { WorkerReply, WorkerRequest } from './sweep.worker';
import type { TheoryResult } from './bodeTheory';

export interface BodeOption {
  readonly key: string;
  readonly label: string;
  readonly probe: Probe;
  /** Şemadaki etiketin yeri. */
  readonly at: Point | null;
}

export interface BodeRange {
  readonly from: number;
  readonly to: number;
  readonly points: number;
}

export interface BodeApi {
  readonly inputs: readonly (BodeOption & { readonly source: string })[];
  readonly outputs: readonly BodeOption[];
  readonly input: (BodeOption & { readonly source: string }) | null;
  readonly output: BodeOption | null;
  readonly setInput: (key: string) => void;
  readonly setOutput: (key: string) => void;
  readonly range: BodeRange;
  readonly setRange: (patch: Partial<BodeRange>) => void;
  /** Kaynağın verebildiği frekans aralığı. */
  readonly limits: { readonly min: number; readonly max: number } | null;
  readonly points: readonly BodePoint[];
  /** Sonucun ait olduğu ayarlar ve şu anki ayarlar (farklıysa sonuç eski). */
  readonly resultKey: string | null;
  readonly key: string;
  readonly progress: { readonly done: number; readonly total: number } | null;
  readonly error: string | null;
  /** Teori eğrisi (küçük sinyal AC, A5): ölçümle aynı çalıştırmada, ölçümden önce gelir. */
  readonly theory: TheoryResult | null;
  readonly showTheory: boolean;
  readonly setShowTheory: (on: boolean) => void;
  readonly run: () => void;
  readonly cancel: () => void;
}

export function useBode(doc: CircuitDoc, connectivity: Connectivity, idx: NetIndex, traces: readonly TraceDef[], labels: ReadonlyMap<string, TraceLabel>): BodeApi {
  const t = tr.analysis.bode;
  const inputs = useMemo(
    () =>
      doc.parts
        .filter((p) => p.type === 'funcgen' || p.type === 'acsource')
        .map((p) => ({
          key: p.id,
          source: p.id,
          label: p.type === 'funcgen' ? t.funcgenInput(p.label) : t.acInput(p.label),
          probe: { a: pinKey(p.id, 0), b: pinKey(p.id, p.type === 'funcgen' ? 2 : 1) },
          at: pinPositions(p)[0] ?? null,
        })),
    [doc.parts, t],
  );
  const outputs = useMemo(() => {
    const out: BodeOption[] = [];
    // Osiloskopta önce B kanalı (laboratuvar düzeninde A giriş, B çıkış).
    for (const osc of doc.parts.filter((p) => p.type === 'oscilloscope')) {
      ([['B', 1], ['A', 0]] as const).forEach(([ch, i]) => {
        const key = pinKey(osc.id, i);
        if (idx.netOf(key) === undefined || idx.netOf(key) === idx.ground || connectivity.unconnectedPins.has(key)) return;
        out.push({ key: `${osc.id}:${ch}`, label: t.scopeOutput(nodeName(key, idx), osc.label, ch), probe: { a: key, b: pinKey(osc.id, 2) }, at: pinPositions(osc)[i] ?? null });
      });
    }
    for (const tr0 of traces) {
      if (tr0.kind !== 'voltage') continue;
      out.push({ key: `trace:${tr0.id}`, label: labels.get(tr0.id)?.name ?? '?', probe: { a: tr0.node, b: tr0.ref }, at: tr0.at });
    }
    return out;
  }, [doc.parts, idx, connectivity, traces, labels, t]);

  const [inputKey, setInput] = useState<string | null>(null);
  const [outputKey, setOutput] = useState<string | null>(null);
  const input = inputs.find((o) => o.key === inputKey) ?? inputs[0] ?? null;
  const inNet = input ? idx.netOf(input.probe.a) : undefined;
  const output = outputs.find((o) => o.key === outputKey) ?? outputs.find((o) => idx.netOf(o.probe.a) !== inNet) ?? outputs[0] ?? null;
  const sourceType = input ? doc.parts.find((p) => p.id === input.source)?.type : undefined;
  const limits = sourceType ? sourceLimits(sourceType) : null;
  const [rangeState, setRangeState] = useState<BodeRange>({ from: 20, to: 2e6, points: 16 });
  const range = limits ? { ...rangeState, from: Math.max(limits.min, Math.min(rangeState.from, limits.max)), to: Math.min(limits.max, Math.max(rangeState.to, limits.min)) } : rangeState;
  const circuit = useMemo(() => JSON.stringify(connectivity.netlist.elements.map((e) => [e.id, e.props])), [connectivity]);
  const key = input && output ? JSON.stringify([input.key, output.key, range, circuit]) : '';

  const [points, setPoints] = useState<readonly BodePoint[]>([]);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theory, setTheory] = useState<TheoryResult | null>(null);
  const [showTheory, setShowTheory] = useState(true);
  const worker = useRef<Worker | null>(null);
  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  const latest = useRef({ input, output, range, key, connectivity });
  latest.current = { input, output, range, key, connectivity };
  const run = useCallback(() => {
    const { input: i, output: o, range: r, key: k, connectivity: conn } = latest.current;
    worker.current?.terminate();
    if (!i || !o) return;
    setError(null);
    setPoints([]);
    setTheory(null);
    setResultKey(k);
    setProgress({ done: 0, total: r.points });
    const w = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const collected: BodePoint[] = [];
    w.onmessage = (ev: MessageEvent<WorkerReply>) => {
      const reply = ev.data;
      if (reply.type === 'theory') {
        setTheory(reply.result);
      } else if (reply.type === 'bodePoint') {
        collected.push(reply.point);
        setPoints([...collected]);
        setProgress({ done: reply.done, total: reply.total });
      } else if (reply.type === 'bodeDone' || reply.type === 'error') {
        if (reply.type === 'error') setError(reply.message);
        setProgress(null);
        w.terminate();
        if (worker.current === w) worker.current = null;
      }
    };
    w.onerror = (ev) => {
      setError(ev.message || 'worker');
      setProgress(null);
      w.terminate();
      if (worker.current === w) worker.current = null;
    };
    w.postMessage({ kind: 'bode', request: { netlist: conn.netlist, source: i.source, input: i.probe, output: o.probe, from: r.from, to: r.to, points: r.points } } satisfies WorkerRequest);
  }, []);
  const setRange = useCallback((patch: Partial<BodeRange>) => setRangeState((r) => ({ ...r, ...patch })), []);
  return { inputs, outputs, input, output, setInput, setOutput, range, setRange, limits, points, resultKey, key, progress, error, theory, showTheory, setShowTheory, run, cancel };
}
