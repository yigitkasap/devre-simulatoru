// Analizin uzun taramaları (eğri izleyici, Bode) ayrı iş parçacığında: arayüz donmaz; iptal, iş
// parçacığı sonlandırılarak yapılır (tarama yarıda kalır, sonuç gönderilmez).

import type { Netlist } from '../../sim';
import { logFrequencies, measureBode, sourceLimits, type BodePoint, type BodeRequest } from './bode';
import { theoryAt, type TheoryResult } from './bodeTheory';
import { loadLine, qSteps, runSweep, supplyTo, type SweepRequest } from './sweep';

export type WorkerRequest =
  | {
      readonly kind: 'curve';
      readonly request: SweepRequest;
      readonly netlist: Netlist | null;
      readonly dutId: string;
      readonly labels: Readonly<Record<string, string>>;
      /** Yük doğrusu açık: Q basamağı eklenir; toAuto ise aralık beslemeye kadar. */
      readonly load: boolean;
      readonly toAuto: boolean;
      /** Basamaklar varsayılan (kullanıcı değiştirmedi): MOSFET'te Q'nun çevresinde seçilir. */
      readonly stepsAuto: boolean;
    }
  | { readonly kind: 'bode'; readonly request: BodeRequest };

export type WorkerReply =
  | { readonly type: 'progress'; readonly done: number; readonly total: number }
  | { readonly type: 'curves'; readonly curves: ReturnType<typeof runSweep>; readonly load: ReturnType<typeof loadLine>; readonly to: number; readonly steps: readonly number[] }
  | { readonly type: 'theory'; readonly result: TheoryResult }
  | { readonly type: 'bodePoint'; readonly point: BodePoint; readonly done: number; readonly total: number }
  | { readonly type: 'bodeDone'; readonly points: readonly BodePoint[] }
  | { readonly type: 'error'; readonly message: string };

/**
 * Teorinin frekansları: ölçümünkiler (CSV'de aynı satırda) ve aralığı sık örnekleyen 80 nokta;
 * ölçülenle aynı aralık (kaynağın sınırına kırpılmış).
 */
function theoryFrequencies(req: BodeRequest): number[] {
  const type = req.netlist.elements.find((e) => e.id === req.source)?.type ?? 'funcgen';
  const { min, max } = sourceLimits(type);
  const clamp = (f: number) => Math.min(max, Math.max(min, f));
  const [from, to] = [clamp(req.from), clamp(req.to)];
  const all = [...logFrequencies(from, to, req.points), ...logFrequencies(from, to, 80)].sort((a, b) => a - b);
  return all.filter((f, i) => i === 0 || f / all[i - 1]! > 1 + 1e-9);
}

const post = (reply: WorkerReply) => (self as unknown as { postMessage: (m: WorkerReply) => void }).postMessage(reply);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const msg = e.data;
    if (msg.kind === 'curve') {
      // Yük doğrusu (çalışma noktası) önce: açıksa Q'daki basamak eklenir ve aralık beslemeye uzar
      // (analiz düzeltmeleri, 9).
      const load = msg.netlist && msg.request.mode === 'output' ? loadLine(msg.netlist, msg.dutId, msg.labels) : null;
      let request = msg.request;
      if (msg.load && load) {
        request = {
          ...request,
          ...(load.qStep !== null ? { qStep: load.qStep } : {}),
          ...(msg.toAuto ? { to: supplyTo(load.supply, request.step) } : {}),
          ...(msg.stepsAuto && load.qStep !== null && load.threshold !== null ? { steps: qSteps(load.qStep, load.threshold) } : {}),
        };
      }
      let last = 0;
      const curves = runSweep(request, (done, total) => {
        const now = Date.now();
        if (now - last > 50 || done === total) {
          last = now;
          post({ type: 'progress', done, total });
        }
      });
      post({ type: 'curves', curves, load, to: request.to, steps: request.steps });
    } else if (msg.kind === 'bode') {
      // Teori (küçük sinyal, A5): ölçüm DC'de oturur oturmaz aynı simülatörden; ölçülen noktalar üstüne gelir.
      const request = msg.request;
      let theory = false;
      const points = measureBode(
        request,
        (point, i, total) => post({ type: 'bodePoint', point, done: i + 1, total }),
        undefined,
        (sim) => {
          theory = true;
          post({ type: 'theory', result: theoryAt(sim, request, theoryFrequencies(request)) });
        },
      );
      if (!theory) post({ type: 'theory', result: { ok: false, reason: 'run' } });
      post({ type: 'bodeDone', points });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
