// Motor hata taraması: 51 örneğin her biri arayüzdeki gibi kare kare (1/60 s, karede adım sınırı)
// 2 s çalıştırılır; ardından her parçanın her sayısal özelliği uçlara (kaydırıcı aralığı ya da
// değerin 1/1000'i ve 1000 katı, katalog sınırları içinde) çekilip devre yeniden çalıştırılır.
//
// Aranan: istisna, Newton'un yakınsamaması, NaN/∞ ölçüm ya da durum, "hesaplanamıyor"/"—" yazan
// bilgi kutusu satırı, beklenmeyen çalışma anı uyarısı, gerçek zamana yetişemeyen kare.
// Ayrıca örnek başına iş yükü (kabul/ret/olay, Newton yinelemesi, gerçek zaman oranı) ölçülür:
// optimizasyonun girdisi.
//
// Çalıştırma: npm run tarama:motor  (rapor: TARAMA_CIKTI ortam değişkeni ya da tarama-motor.json)
//   TARAMA_HIZLI=1: uç değerler atlanır, yalnızca 2 s'lik çalıştırma ve iş yükü (profil).
//   TARAMA_ORNEK=a,b: yalnızca bu örnekler.

import { it } from 'vitest';
import { LiveWindow, stableReadout } from '../../src/editor/liveReadout';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../../src/examples';
import { CATALOG, type NumberPropDef } from '../../src/model/catalog';
import { buildConnectivity } from '../../src/model/connectivity';
import { updatePart } from '../../src/model/docOps';
import type { CircuitDoc, Part } from '../../src/model/types';
import { CircuitSimulator } from '../../src/sim';
import { flatten } from '../../src/sim/watch';

// Rapor dosyası için Node (projede @types/node yok; yalnızca gereken kadarı).
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
async function writeReport(file: string, data: string): Promise<void> {
  const fsModule = 'node:fs';
  const { writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as { writeFileSync: (path: string, data: string) => void };
  writeFileSync(file, data);
}

const FRAME = 1 / 60;
const MAX_STEPS_PER_FRAME = 6000;

interface Finding {
  readonly example: ExampleId;
  readonly kind: string;
  readonly detail: string;
}

interface Profile {
  readonly example: ExampleId;
  readonly simSeconds: number;
  readonly wallMs: number;
  /** Gerçek zaman oranı: 1 s simülasyonun hesap süresi (ms). Arayüzde kare başına ≈ 16 ms'lik pay var. */
  readonly msPerSimSecond: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly failed: number;
  readonly events: number;
  readonly solves: number;
  readonly laggingFrames: number;
  readonly frames: number;
}

function stepBudget(sim: CircuitSimulator, dt: number): number {
  return Math.min(MAX_STEPS_PER_FRAME, Math.ceil(dt / sim.maxTimeStep) * 8 + 64);
}

/** Bir parçanın ölçüm ve durumundaki sonlu olmayan sayılar. */
function nonFinite(sim: CircuitSimulator, id: string): string[] {
  const bad: string[] = [];
  const visit = (key: string, leaf: number | boolean | string) => {
    if (typeof leaf === 'number' && !Number.isFinite(leaf)) bad.push(`${key}=${leaf}`);
  };
  flatten('m', sim.measure(id), visit);
  flatten('s', sim.status(id), visit);
  return bad;
}

/** Kare kare çalıştırır; bulguları ekler, iş yükünü döndürür. */
function run(example: ExampleId, doc: CircuitDoc, seconds: number, findings: Finding[], label: string) {
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const ids = doc.parts.filter((p) => p.type !== 'ground').map((p) => p.id);
  // Profil kipinde izleme yok (arayüz yalnızca seçili parçayı izler; hepsini izlemek süreyi şişirir).
  if (!process.env.TARAMA_HIZLI) sim.watch(ids);
  const windows = new Map(ids.map((id) => [id, new LiveWindow()]));
  let lagging = 0;
  let frames = 0;
  const start = performance.now();
  const add = (kind: string, detail: string) => findings.push({ example, kind, detail: label ? `${label}: ${detail}` : detail });
  if (!sim.canRun) {
    const errors = sim.topologyDiagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
    if (errors.length > 0) add('çalışmıyor', errors.join(', '));
    return { sim, lagging, frames, wallMs: 0 };
  }
  try {
    while (sim.time < seconds - 1e-9) {
      const budget = stepBudget(sim, FRAME);
      const result = sim.advance(FRAME, budget);
      frames++;
      if (result.steps >= budget) lagging++;
      if (!result.ok) {
        add('newton', `${sim.time.toFixed(3)} s: ${result.error?.code ?? 'bilinmeyen hata'}`);
        break;
      }
      for (const id of ids) windows.get(id)!.add(sim.watchedStats(id), FRAME);
    }
  } catch (e) {
    add('istisna', String(e instanceof Error ? (e.stack ?? e.message).split('\n').slice(0, 3).join(' | ') : e));
  }
  const wallMs = performance.now() - start;
  for (const part of doc.parts) {
    if (part.type === 'ground') continue;
    // Yanmış lamba/sigortanın direnci sonsuzdur (kopuk): bilgi kutusu yalnızca "Yandı" gösterir.
    const bad = sim.status(part.id).burned ? [] : nonFinite(sim, part.id);
    if (bad.length > 0) add('nan', `${part.label}: ${bad.join(', ')}`);
    const m = sim.measure(part.id);
    if (!m) continue;
    const r = stableReadout(part, m, sim.status(part.id), windows.get(part.id)!.summary);
    for (const row of r?.rows ?? []) {
      if (/hesaplanamıyor|NaN|(^|\s)—(\s|$)|∞/.test(row.value)) add('bilgi-kutusu', `${part.label} · ${row.label}: ${row.value}`);
    }
  }
  return { sim, lagging, frames, wallMs };
}

/** Bir sayısal özelliğin sınama değerleri (uçlar). */
function extremes(def: NumberPropDef, value: number): number[] {
  const lo = def.slider ? def.slider.min : value / 1000;
  const hi = def.slider ? def.slider.max : value * 1000;
  const clamp = (v: number) => {
    let x = v;
    if (def.min) x = def.min.exclusive ? Math.max(x, def.min.value + Math.abs(def.min.value) * 1e-6 + 1e-12) : Math.max(x, def.min.value);
    if (def.max !== undefined) x = Math.min(x, def.max);
    return x;
  };
  return [...new Set([clamp(lo), clamp(hi)])].filter((v) => v !== value);
}

it('motor taraması', async () => {
  const findings: Finding[] = [];
  const profiles: Profile[] = [];
  const only = process.env.TARAMA_ORNEK?.split(',') ?? null;
  const ids = only ? EXAMPLE_IDS.filter((id) => only.includes(id)) : EXAMPLE_IDS;
  let stressRuns = 0;
  for (const id of ids) {
    const doc = exampleDoc(id)!;
    const { sim, lagging, frames, wallMs } = run(id, doc, 2, findings, '');
    for (const d of sim.runtimeDiagnostics) findings.push({ example: id, kind: 'uyarı', detail: `${d.code} (${d.severity})` });
    const c = sim.counters;
    profiles.push({
      example: id,
      simSeconds: sim.time,
      wallMs,
      msPerSimSecond: sim.time > 0 ? wallMs / sim.time : 0,
      accepted: c.accepted,
      rejected: c.rejected,
      failed: c.failed,
      events: c.events,
      solves: c.solves,
      laggingFrames: lagging,
      frames,
    });
    if (lagging > 0) findings.push({ example: id, kind: 'yetişemiyor', detail: `${lagging}/${frames} kare adım sınırına takıldı` });

    // Uç değerler: her parçanın her sayısal özelliği.
    if (process.env.TARAMA_HIZLI) continue;
    for (const part of doc.parts) {
      const defs = CATALOG[part.type].propDefs.filter((d): d is NumberPropDef => d.kind === 'number');
      for (const def of defs) {
        const value = part.props[def.key];
        if (typeof value !== 'number') continue;
        for (const v of extremes(def, value)) {
          const changed = updatePart(doc, part.id, { props: { ...part.props, [def.key]: v } as Part['props'] });
          stressRuns++;
          run(id, changed, 0.15, findings, `${part.label}.${def.key}=${v}`);
        }
      }
    }
  }
  const out = process.env.TARAMA_CIKTI ?? 'tarama-motor.json';
  await writeReport(out, JSON.stringify({ date: new Date().toISOString(), stressRuns, findings, profiles }, null, 2));
  const byKind = new Map<string, number>();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  console.log(`örnek: ${ids.length}, uç değer çalıştırması: ${stressRuns}, bulgu: ${findings.length}`, Object.fromEntries(byKind));
  const slow = [...profiles].sort((a, b) => b.msPerSimSecond - a.msPerSimSecond).slice(0, 8);
  console.log('en ağır örnekler (ms / simülasyon saniyesi):');
  for (const p of slow) {
    const total = p.accepted + p.rejected + p.failed + p.events;
    console.log(
      `  ${p.example.padEnd(28)} ${p.msPerSimSecond.toFixed(0).padStart(6)} ms/s  adım ${p.accepted}  ret %${((100 * (p.rejected + p.failed + p.events)) / Math.max(1, total)).toFixed(0)}  Newton ${p.solves}  takılan kare ${p.laggingFrames}`,
    );
  }
  console.log(`rapor: ${out}`);
});
