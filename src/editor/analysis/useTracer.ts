// Eğri izleyicinin durumu (A3, N3): taranan parça, eğri türü, aralık ve basamaklar; tarama Web
// Worker'da (sweep.worker.ts) yapılır, ilerleme bildirilir, İptal iş parçacığını sonlandırır.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connectivity } from '../../model/connectivity';
import type { CircuitDoc, Part } from '../../model/types';
import { defaultRequest, FAMILY, type Curve, type LoadLine, type SweepRequest, type TracerMode } from './sweep';
import type { WorkerReply, WorkerRequest } from './sweep.worker';

export interface TracerParams {
  readonly mode: TracerMode;
  readonly from: number;
  readonly to: number;
  readonly step: number;
  readonly steps: readonly number[];
  /** Yük doğrusu ve Q noktası açık mı (varsayılan açık; açıkken Q basamağı eklenir). */
  readonly load?: boolean;
  /** Bitiş kullanıcı değiştirmedikçe yük doğrusu açıkken beslemeye uzar (varsayılan). */
  readonly toAuto?: boolean;
  /** Basamaklar kullanıcı değiştirmedikçe MOSFET'te yük doğrusu açıkken Q'nun çevresinde (varsayılan). */
  readonly stepsAuto?: boolean;
}

export interface TracerResult {
  /** Sonucun ait olduğu parça ve parametreler (değişince sonuç eskir, yeniden taranır). */
  readonly key: string;
  readonly curves: readonly Curve[];
  readonly load: LoadLine | null;
  /** Taramanın gerçek üst sınırı (yük doğrusu açıkken beslemeye uzamış olabilir). */
  readonly to: number;
  /** Taranan basamaklar (MOSFET'te Q'nun çevresinde seçilmiş olabilir; Q eğrisi hariç). */
  readonly steps: readonly number[];
}

export interface TracerApi {
  /** Taranabilen parçalar (diyot, zener, LED, JFET, MOSFET, BJT). */
  readonly candidates: readonly Part[];
  readonly part: Part | null;
  readonly setPart: (id: string) => void;
  readonly params: TracerParams | null;
  readonly setParams: (patch: Partial<TracerParams>) => void;
  readonly setMode: (mode: TracerMode) => void;
  readonly result: TracerResult | null;
  /** Şu anki parametrelerin anahtarı (sonuç eski mi?). */
  readonly key: string;
  readonly progress: { readonly done: number; readonly total: number } | null;
  readonly error: string | null;
  readonly run: () => void;
  readonly cancel: () => void;
}

const keyOf = (part: Part | null, p: TracerParams | null) => (part && p ? JSON.stringify([part.id, part.type, part.props, p]) : '');

export function useTracer(doc: CircuitDoc, connectivity: Connectivity, selected: string | null): TracerApi {
  const candidates = doc.parts.filter((p) => FAMILY[p.type] !== undefined);
  const [partId, setPartId] = useState<string | null>(null);
  /** Seçilen parametreler ve ait oldukları parça (parça değişince varsayılana dönülür). */
  const [chosen, setChosen] = useState<{ readonly partId: string; readonly params: TracerParams } | null>(null);
  const [result, setResult] = useState<TracerResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  // Varsayılan parça: seçili parça taranabiliyorsa o, yoksa ilk taranabilen parça.
  const preferred = candidates.find((p) => p.id === selected) ?? null;
  const part = candidates.find((p) => p.id === partId) ?? preferred ?? candidates[0] ?? null;
  const effective = part && chosen?.partId === part.id ? chosen.params : part ? defaultRequest(part.type, part.props, FAMILY[part.type] === 'diode' ? 'diode' : 'output') : null;
  const key = keyOf(part, effective);

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }, []);
  useEffect(() => () => worker.current?.terminate(), []);

  const latest = useRef({ part, effective, key, connectivity, doc });
  latest.current = { part, effective, key, connectivity, doc };
  const run = useCallback(() => {
    const { part: p, effective: e, key: k, connectivity: conn, doc: d } = latest.current;
    worker.current?.terminate();
    if (!p || !e) return;
    setError(null);
    const w = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setProgress({ done: 0, total: 1 });
    w.onmessage = (ev: MessageEvent<WorkerReply>) => {
      const reply = ev.data;
      if (reply.type === 'progress') setProgress({ done: reply.done, total: reply.total });
      else {
        if (reply.type === 'curves') setResult({ key: k, curves: reply.curves, load: reply.load, to: reply.to, steps: reply.steps });
        else if (reply.type === 'error') setError(reply.message);
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
    const { load, toAuto, stepsAuto, ...sweep } = e as TracerParams;
    const request: SweepRequest = { type: p.type, props: p.props, ...sweep };
    const labels = Object.fromEntries(d.parts.map((x) => [x.id, x.label]));
    w.postMessage({ kind: 'curve', request, netlist: conn.netlist, dutId: p.id, labels, load: load ?? true, toAuto: toAuto ?? true, stepsAuto: stepsAuto ?? true } satisfies WorkerRequest);
  }, []);

  const setPart = useCallback((id: string) => {
    cancel();
    setPartId(id);
    setChosen(null);
  }, [cancel]);
  const setParams = useCallback((patch: Partial<TracerParams>) => {
    const { part: p, effective: e } = latest.current;
    if (p && e) setChosen({ partId: p.id, params: { ...e, ...patch } });
  }, []);
  const setMode = useCallback((mode: TracerMode) => {
    const p = latest.current.part;
    if (p) setChosen({ partId: p.id, params: defaultRequest(p.type, p.props, mode) });
  }, []);

  return { candidates, part, setPart, params: effective, setParams, setMode, result, key, progress, error, run, cancel };
}
