// Motor kıyası (optimizasyonun öncesi/sonrası): her örnek arayüz gibi kare kare (1/60 s) 3 s
// çalıştırılır; simülasyon saniyesi başına hesap süresi ve iş yükü (sayaçlar varsa) yazdırılır.
// İzleme ve tarama yükü yok: arayüzdeki gerçek motor maliyeti.
//
// Çalıştırma (paketleyip Node'da; tarayıcı ve vitest yükü olmadan):
//   npx esbuild scripts/tarama/kiyas.ts --bundle --platform=node --format=esm --outfile=kiyas.mjs
//   node kiyas.mjs [tekrar] > kiyas.json
// Eski bir sürümle kıyas için aynı dosya `git worktree` ile açılan sürümde paketlenir.

import { EXAMPLE_IDS, exampleDoc } from '../../src/examples';
import { buildConnectivity } from '../../src/model/connectivity';
import { CircuitSimulator } from '../../src/sim';

declare const process: { readonly argv: readonly string[] };

const SECONDS = 3;
const repeat = Number(process.argv[2] ?? 3);
const rows: Array<Record<string, number | string>> = [];
for (const id of EXAMPLE_IDS) {
  let best = Number.POSITIVE_INFINITY;
  let counters: Record<string, number> = {};
  for (let r = 0; r < repeat; r++) {
    const sim = new CircuitSimulator(buildConnectivity(exampleDoc(id)!).netlist);
    if (!sim.canRun) break;
    const t0 = performance.now();
    while (sim.time < SECONDS - 1e-9) {
      const result = sim.advance(1 / 60, 20000);
      if (!result.ok) break;
    }
    best = Math.min(best, (performance.now() - t0) / Math.max(sim.time, 1e-9));
    counters = { ...((sim as unknown as { counters?: Record<string, number> }).counters ?? {}) };
  }
  rows.push({ id, msPerSimSecond: Number(best.toFixed(2)), ...counters });
}
console.log(JSON.stringify(rows));
