// Performans taraması (motor, Node): her örnek devre için simülasyon saniyesi başına hesap süresi;
// Arduino'lu örneklerde işlemci öykünmesinin (avr8js) ve analog çözümün payı ayrı ölçülür.
//
// Çalıştırma: npm run tarama:performans:motor  (çıktı: tarama-performans/motor.json)
// Bulgu ölçütü: hesap süresi simülasyon süresinin %50'sinden fazla (arayüzün çizimine pay kalmaz).

import { it } from 'vitest';
import { EXAMPLE_IDS, exampleDoc } from '../../src/examples';
import { buildConnectivity } from '../../src/model/connectivity';
import { CircuitSimulator } from '../../src/sim';
import '../../src/sim/arduino/load';
import { Atmega328 } from '../../src/sim/arduino/mcu';

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const OUT = process.env.TARAMA_CIKTI ?? 'tarama-performans';
/** Her örnek için ölçülen simülasyon süresi (s) ve tekrar sayısı (ortanca alınır). */
const SIM_TIME = Number(process.env.TARAMA_SURE ?? 1);
const REPEAT = Number(process.env.TARAMA_TEKRAR ?? 3);
const BUDGET = 0.5;

interface Row {
  id: string;
  arduino: boolean;
  /** Simülasyon saniyesi başına hesap süresi (ms), ortanca. */
  msPerSimSecond: number;
  /** Bunun işlemci öykünmesine düşen payı (ms). */
  mcuMs: number;
  steps: number;
  solves: number;
  ok: boolean;
}

// İşlemcinin koştuğu süreyi ölçmek için run() sarılır.
let mcuTime = 0;
const run = Atmega328.prototype.run;
Atmega328.prototype.run = function (this: Atmega328, cycles: number) {
  const t0 = performance.now();
  run.call(this, cycles);
  mcuTime += performance.now() - t0;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

it('performans: örnekler', async () => {
  const rows: Row[] = [];
  for (const id of EXAMPLE_IDS) {
    const doc = exampleDoc(id)!;
    const arduino = doc.parts.some((p) => p.type === 'arduino');
    const totals: number[] = [];
    const mcus: number[] = [];
    let steps = 0;
    let solves = 0;
    let ok = true;
    for (let k = 0; k < REPEAT; k++) {
      const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
      mcuTime = 0;
      const t0 = performance.now();
      // Arayüz gibi: 60 karelik dilimlerle (her biri 1/60 s).
      for (let f = 0; f < SIM_TIME * 60; f++) ok = sim.advance(1 / 60).ok && ok;
      totals.push((performance.now() - t0) / SIM_TIME);
      mcus.push(mcuTime / SIM_TIME);
      steps = sim.counters.accepted / SIM_TIME;
      solves = sim.counters.solves / SIM_TIME;
    }
    rows.push({ id, arduino, msPerSimSecond: median(totals), mcuMs: median(mcus), steps, solves, ok });
  }
  const findings = rows
    .filter((r) => r.msPerSimSecond > BUDGET * 1000 || !r.ok)
    .map((r) => ({
      kind: r.ok ? 'yavaş' : 'hata',
      where: r.id,
      detail: r.ok
        ? `${r.msPerSimSecond.toFixed(0)} ms / simülasyon saniyesi (bütçe ${BUDGET * 1000} ms)` +
          (r.arduino ? `; işlemci ${r.mcuMs.toFixed(0)} ms, analog ${(r.msPerSimSecond - r.mcuMs).toFixed(0)} ms, ${Math.round(r.steps)} adım/s` : `; ${Math.round(r.steps)} adım/s`)
        : 'simülasyon hata verdi',
    }));
  // @types/node olmadan: fs dinamik içe aktarılır.
  const fsModule = 'node:fs';
  const { mkdirSync, writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
    mkdirSync: (path: string, options: { recursive: boolean }) => void;
    writeFileSync: (path: string, data: string) => void;
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/motor.json`, JSON.stringify({ simTime: SIM_TIME, repeat: REPEAT, budgetMs: BUDGET * 1000, rows, findings }, null, 2));
  const total = rows.reduce((s, r) => s + r.msPerSimSecond, 0);
  console.log(`${rows.length} örnek, toplam ${total.toFixed(0)} ms/s; bulgu ${findings.length}`);
  for (const f of findings) console.log(`BULGU ${f.where}: ${f.detail}`);
});
