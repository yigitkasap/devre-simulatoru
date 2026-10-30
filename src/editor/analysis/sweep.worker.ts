// Analizin uzun taramaları (eğri izleyici, Bode) ayrı iş parçacığında: arayüz donmaz; iptal, iş
// parçacığı sonlandırılarak yapılır (tarama yarıda kalır, sonuç gönderilmez).

import type { Netlist } from '../../sim';
import { loadLine, runSweep, type SweepRequest } from './sweep';

export type WorkerRequest =
  | { readonly kind: 'curve'; readonly request: SweepRequest; readonly netlist: Netlist | null; readonly dutId: string; readonly labels: Readonly<Record<string, string>> };

export type WorkerReply =
  | { readonly type: 'progress'; readonly done: number; readonly total: number }
  | { readonly type: 'curves'; readonly curves: ReturnType<typeof runSweep>; readonly load: ReturnType<typeof loadLine> }
  | { readonly type: 'error'; readonly message: string };

const post = (reply: WorkerReply) => (self as unknown as { postMessage: (m: WorkerReply) => void }).postMessage(reply);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const msg = e.data;
    if (msg.kind === 'curve') {
      let last = 0;
      const curves = runSweep(msg.request, (done, total) => {
        const now = Date.now();
        if (now - last > 50 || done === total) {
          last = now;
          post({ type: 'progress', done, total });
        }
      });
      const load = msg.netlist && msg.request.mode === 'output' ? loadLine(msg.netlist, msg.dutId, msg.labels) : null;
      post({ type: 'curves', curves, load });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
