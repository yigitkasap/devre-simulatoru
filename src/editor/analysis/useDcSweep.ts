// "Bir değeri tarayarak" grafiğinin taraması (analiz v2): Web Worker'da (sweep.worker.ts), ilerleme
// bildirilir, İptal iş parçacığını sonlandırır. Sonuçlar ayarlar ve devrenin anahtarıyla saklanır: açık
// tarama grafiğinin sonucu yoksa (ya da ayar veya devre değiştiyse) kendiliğinden taranır.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SweepSpec } from '../../model/analysis';
import type { Netlist } from '../../sim';
import type { DcSweepCurve } from './dcsweep';
import type { WorkerReply, WorkerRequest } from './sweep.worker';

export interface DcSweepResult {
  readonly key: string;
  /** Sonucun ait olduğu grafik (ayar değişince eski sonuç yeni tarama bitene kadar gösterilir). */
  readonly graph: string;
  readonly curves: readonly DcSweepCurve[];
}

export interface DcSweepApi {
  /** Açık tarama grafiğinin sonucu (eskiyse de son sonuç; `fresh` güncel mi). */
  readonly result: DcSweepResult | null;
  readonly fresh: boolean;
  readonly progress: { readonly done: number; readonly total: number } | null;
  readonly error: string | null;
  readonly run: () => void;
  readonly cancel: () => void;
}

export function useDcSweep(netlist: Netlist, graph: { readonly id: string; readonly sweep: SweepSpec } | null): DcSweepApi {
  const spec = graph?.sweep ?? null;
  const graphId = graph?.id ?? '';
  const netKey = useMemo(() => JSON.stringify(netlist), [netlist]);
  const key = spec ? `${JSON.stringify(spec)}|${netKey}` : '';
  const cache = useRef(new Map<string, DcSweepResult>());
  const [, setVersion] = useState(0);
  const [last, setLast] = useState<DcSweepResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const running = useRef('');

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    running.current = '';
    setProgress(null);
  }, []);
  useEffect(() => () => worker.current?.terminate(), []);

  const latest = useRef({ spec, key, netlist, graphId });
  latest.current = { spec, key, netlist, graphId };
  const run = useCallback(() => {
    const { spec: s, key: k, netlist: n, graphId: g } = latest.current;
    worker.current?.terminate();
    worker.current = null;
    if (!s || s.y.length === 0) return;
    setError(null);
    const w = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    running.current = k;
    setProgress({ done: 0, total: 1 });
    const finish = () => {
      setProgress(null);
      w.terminate();
      if (worker.current === w) worker.current = null;
      running.current = '';
    };
    w.onmessage = (ev: MessageEvent<WorkerReply>) => {
      const reply = ev.data;
      if (reply.type === 'progress') setProgress({ done: reply.done, total: reply.total });
      else {
        if (reply.type === 'dcsweep') {
          const result = { key: k, graph: g, curves: reply.curves };
          cache.current.set(k, result);
          setLast(result);
          setVersion((v) => v + 1);
        } else if (reply.type === 'error') setError(reply.message);
        finish();
      }
    };
    w.onerror = (ev) => {
      setError(ev.message || 'worker');
      finish();
    };
    w.postMessage({ kind: 'dcsweep', request: { netlist: n, param: s.param, ranges: s.ranges, family: s.family, x: s.x, y: s.y } } satisfies WorkerRequest);
  }, []);

  // Açık grafiğin sonucu yoksa ya da ayar/devre değiştiyse kendiliğinden taranır (çift tarama olmasın diye
  // aynı anahtar taranırken yeniden başlatılmaz).
  useEffect(() => {
    if (!spec || spec.y.length === 0 || cache.current.has(key) || running.current === key) return;
    const timer = window.setTimeout(run, 150);
    return () => window.clearTimeout(timer);
  }, [key, run]);

  const cached = cache.current.get(key) ?? null;
  return { result: cached ?? (last?.graph === graphId ? last : null), fresh: cached !== null, progress, error, run, cancel };
}
