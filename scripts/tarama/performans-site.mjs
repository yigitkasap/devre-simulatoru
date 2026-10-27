// Performans ve hata taraması (tarayıcıda) ve optimizasyon raporu.
//
// Ölçülenler:
//   1. Paketler: dist/_astro'daki her JS parçası (ham ve gzip); ilk açılışta indirilen JS; three'nin
//      yalnızca 3B açılınca indirilmesi.
//   2. Kare hızı ve uzun görevler (> 50 ms): şemada ve 3B'de Arduino örneği çalışırken, 3B'de büyük bir
//      örnek (baraj) ve bütün parça türlerinin dizildiği vitrin devresi (döndürülürken).
//   3. 3B sahne: çizim çağrısı, üçgen, geometri ve doku sayısı, kare çizim süresi.
//   4. Bellek sızıntısı: Şema ↔ 3B sekiz kez; geometri/doku sayısı ve JS yığını.
//   5. Hatalar: sayfa ve konsol hataları (ANGLE derleyicisinin X4122 uyarısı dışında).
// Motor taraması (npm run tarama:performans:motor) önce çalıştırıldıysa onun bulguları da rapora girer.
//
// Çalıştırma: npm run tarama:performans:site -- <adres> [çıktı klasörü]
//   adres: ör. http://localhost:4322/devre-simulatoru/ (npm run build; npx astro preview --port 4322)
// Çıktı: <çıktı>/performans.md ve site.json

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PW = process.env.PLAYWRIGHT_CORE ?? 'C:/dev/thejarrus-site/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const BASE = process.argv[2] ?? 'http://localhost:4322/devre-simulatoru/';
const OUT = process.argv[3] ?? 'tarama-performans';
mkdirSync(OUT, { recursive: true });

/** Bulgu ölçütleri. */
const LIMIT = {
  initialJsGzip: 250 * 1024,
  fps: 50,
  longTasks: 3,
  drawCalls: 300,
  triangles: 300_000,
  leakObjects: 5,
  leakHeapMb: 20,
};

const findings = [];
const add = (area, where, detail) => findings.push({ area, where, detail });
const report = { bundles: [], load: {}, scenarios: [], leak: {}, errors: [] };

// --- 1. Paketler ---------------------------------------------------------------------------------------
const assets = path.join(ROOT, 'dist/_astro');
for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  const buf = readFileSync(path.join(assets, file));
  report.bundles.push({ file, raw: buf.length, gzip: gzipSync(buf).length, three: /WebGLRenderer|THREE\./.test(buf.toString('latin1').slice(0, 2_000_000)) });
}
report.bundles.sort((a, b) => b.gzip - a.gzip);

// --- Tarayıcı ------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('devre-simulatoru:hosgeldin', '1');
    // Görünüm yalnızca ilk açılışta şemaya döner (yeniden yüklemede seçilen görünüm kalır).
    if (!sessionStorage.getItem('tarama')) {
      localStorage.removeItem('devre-simulatoru:gorunum');
      sessionStorage.setItem('tarama', '1');
    }
  } catch {
    /* yok */
  }
  window.__long = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__long.push(e.duration);
  }).observe({ type: 'longtask', buffered: true });
});
const page = await ctx.newPage();
const scripts = new Map();
page.on('response', async (res) => {
  if (res.request().resourceType() !== 'script') return;
  const url = res.url();
  const file = url.split('/').pop();
  scripts.set(file, (await res.body().catch(() => Buffer.alloc(0))).length);
});
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  const text = m.text();
  if (/X4122|Program Info Log/.test(text)) return;
  report.errors.push(`${m.type()}: ${text.slice(0, 240)}`);
});
page.on('pageerror', (e) => report.errors.push(`sayfa: ${String(e).slice(0, 240)}`));
const cdp = await ctx.newCDPSession(page);

const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'networkidle' });
report.load.ms = Date.now() - t0;
report.load.initial = [...scripts.entries()].map(([file, bytes]) => ({ file, bytes, gzip: report.bundles.find((b) => b.file === file)?.gzip ?? 0 }));
report.load.initialGzip = report.load.initial.reduce((s, x) => s + x.gzip, 0);
report.load.threeInitially = report.load.initial.some((x) => report.bundles.find((b) => b.file === x.file)?.three);
if (report.load.initialGzip > LIMIT.initialJsGzip) add('paket', 'ilk açılış', `${(report.load.initialGzip / 1024).toFixed(0)} KB gzip JS (sınır ${LIMIT.initialJsGzip / 1024} KB)`);
if (report.load.threeInitially) add('paket', 'ilk açılış', 'three (3B) ilk açılışta indiriliyor; yalnızca 3B açılınca yüklenmeli');
const bigInitial = report.load.initial.filter((x) => x.gzip > 100 * 1024);
for (const b of bigInitial) add('paket', b.file, `ilk açılışta ${(b.gzip / 1024).toFixed(0)} KB gzip`);

async function openExample(name) {
  await page.getByRole('button', { name: 'Örnekler', exact: true }).first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(400);
}
async function play() {
  await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click();
}
async function stop() {
  const b = page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Durdur' });
  if (await b.count()) await b.click();
}
async function view(mode) {
  const before = new Set(scripts.keys());
  await page.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: mode === 'bench' ? '3B' : 'Şema' }).click();
  await page.waitForTimeout(mode === 'bench' ? 1200 : 300);
  return [...scripts.keys()].filter((k) => !before.has(k));
}
/** Simülasyon çubuğundaki zaman (s); simülasyon çalışmıyorsa null. */
async function simTime() {
  const text = await page.getByRole('region', { name: 'Simülasyon' }).innerText().catch(() => '');
  const m = /Zaman:\s*([\d.,]+)\s*(µs|ms|s)(?![a-zçğıöşü])/i.exec(text);
  if (!m || !text.includes('Çalışıyor')) return null;
  const scale = { µs: 1e-6, ms: 1e-3, s: 1 }[m[2]];
  return Number(m[1].replace(/\./g, '').replace(',', '.')) * scale;
}

/** `seconds` boyunca kare sayısı, en uzun kare ve uzun görevler; isteğe bağlı sürükleme. */
async function measure(label, seconds = 3, drag = false) {
  await page.evaluate(() => (window.__long = []));
  const sim0 = await simTime();
  const wall0 = Date.now();
  const box = await page.locator('main').first().boundingBox();
  const sampler = page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const f = (t) => {
          times.push(t);
          if (t - start < ms) requestAnimationFrame(f);
          else {
            const gaps = times.slice(1).map((x, i) => x - times[i]);
            resolve({ fps: (times.length - 1) / ((times[times.length - 1] - times[0]) / 1000), worst: Math.max(...gaps), p95: gaps.sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)] });
          }
        };
        requestAnimationFrame(f);
      }),
    seconds * 1000,
  );
  if (drag && box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(cx + Math.sin(i / 8) * 200, cy + Math.cos(i / 10) * 60);
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
  }
  const r = await sampler;
  const sim1 = await simTime();
  const realtime = sim0 !== null && sim1 !== null ? (sim1 - sim0) / ((Date.now() - wall0) / 1000) : null;
  const long = await page.evaluate(() => window.__long);
  const scene = await page.evaluate(() => {
    const s = window.__tezgah;
    return s ? { ...s.info, renderMs: s.stats.renderMs } : null;
  });
  const row = {
    label,
    fps: Number(r.fps.toFixed(1)),
    worstMs: Math.round(r.worst),
    p95Ms: Math.round(r.p95),
    longTasks: long.length,
    longestTaskMs: Math.round(Math.max(0, ...long)),
    realtime: realtime === null ? null : Number(realtime.toFixed(2)),
    scene,
  };
  report.scenarios.push(row);
  if (row.realtime !== null && row.realtime < 0.95) add('gerçek zaman', label, `simülasyon gerçek zamanın %${Math.round(row.realtime * 100)}'i hızında (×1'de en az %95 olmalı)`);
  if (row.fps < LIMIT.fps) add('kare hızı', label, `${row.fps} fps (sınır ${LIMIT.fps}); en uzun kare ${row.worstMs} ms`);
  if (row.longTasks > LIMIT.longTasks) add('uzun görev', label, `${row.longTasks} uzun görev (> 50 ms), en uzunu ${row.longestTaskMs} ms`);
  if (scene && scene.calls > LIMIT.drawCalls) add('3B', label, `${scene.calls} çizim çağrısı (sınır ${LIMIT.drawCalls})`);
  if (scene && scene.triangles > LIMIT.triangles) add('3B', label, `${scene.triangles} üçgen (sınır ${LIMIT.triangles})`);
  return row;
}

// --- 2. Senaryolar -------------------------------------------------------------------------------------
await openExample('Arduino: yanıp sönen LED');
await play();
await page.waitForTimeout(800);
await measure('şema · Arduino Blink çalışıyor');
await stop();
await openExample('Arduino: nefes alan LED (PWM)');
await play();
await page.waitForTimeout(800);
await measure('şema · Arduino PWM çalışıyor');
await stop();
await openExample('LED ve ön direnç');
await play();
await page.waitForTimeout(500);
await measure('şema · LED ve ön direnç çalışıyor');
await stop();

const threeChunks = await view('bench');
report.load.benchChunks = threeChunks.map((file) => ({ file, gzip: report.bundles.find((b) => b.file === file)?.gzip ?? 0 }));
await openExample('Arduino: yanıp sönen LED');
await page.waitForTimeout(600);
await measure('3B · Arduino Blink durmuş, döndürülüyor', 3, true);
await play();
await page.waitForTimeout(800);
await measure('3B · Arduino Blink çalışıyor');
await stop();
await openExample('Baraj uyarısı: çubuk gösterge');
await play();
await page.waitForTimeout(800);
await measure('3B · Baraj çalışıyor');
await stop();

// Vitrin: bütün parça türleri tek devrede (kablosuz).
const TYPES = ['battery', 'acsource', 'funcgen', 'dcsupply', 'ground', 'resistor', 'capacitor', 'inductor', 'transformer', 'relay', 'motor', 'potentiometer', 'ldr', 'ntc', 'lamp', 'speaker', 'buzzer', 'fuse', 'opamp', 'timer555', 'arduino', 'diode', 'zener', 'led', 'npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos', 'switch', 'tank', 'voltmeter', 'ammeter', 'oscilloscope'];
const showcase = {
  version: 1,
  parts: TYPES.map((type, i) => ({
    id: `p${i + 1}`,
    type,
    label: `${type.toUpperCase().slice(0, 3)}${i + 1}`,
    x: (i % 7) * 24,
    y: Math.floor(i / 7) * 34,
    rotation: 0,
    props: type === 'arduino' ? { program: 'blink' } : {},
  })),
  wires: [],
};
await page.evaluate((doc) => {
  localStorage.setItem('devre-simulatoru:devre', JSON.stringify(doc));
  localStorage.setItem('devre-simulatoru:gorunum', 'bench');
}, showcase);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const showcaseRow = await measure('3B · vitrin (35 parça türü), döndürülüyor', 3, true);
await page.screenshot({ path: path.join(OUT, 'vitrin.png') });
report.showcase = showcaseRow;

// --- 4. Sızıntı ---------------------------------------------------------------------------------------
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
};
const baseInfo = await page.evaluate(() => window.__tezgah?.info ?? null);
const heap0 = await heap();
for (let k = 0; k < 8; k++) {
  await view('schematic');
  await view('bench');
}
await page.waitForTimeout(800);
const endInfo = await page.evaluate(() => window.__tezgah?.info ?? null);
const heap1 = await heap();
report.leak = { before: baseInfo, after: endInfo, heapMb: Number(((heap1 - heap0) / 1048576).toFixed(1)) };
if (baseInfo && endInfo && (endInfo.geometries > baseInfo.geometries + LIMIT.leakObjects || endInfo.textures > baseInfo.textures + LIMIT.leakObjects)) {
  add('bellek', 'Şema ↔ 3B ×8', `geometri ${baseInfo.geometries} → ${endInfo.geometries}, doku ${baseInfo.textures} → ${endInfo.textures}`);
}
if (report.leak.heapMb > LIMIT.leakHeapMb) add('bellek', 'Şema ↔ 3B ×8', `JS yığını ${report.leak.heapMb} MB büyüdü`);

for (const e of report.errors) add('hata', 'konsol', e);
await browser.close();

// --- Rapor ----------------------------------------------------------------------------------------------
const motorPath = path.join(OUT, 'motor.json');
const motor = existsSync(motorPath) ? JSON.parse(readFileSync(motorPath, 'utf8')) : null;
if (motor) for (const f of motor.findings) add('motor', f.where, f.detail);
writeFileSync(path.join(OUT, 'site.json'), JSON.stringify({ report, findings }, null, 2));

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const lines = [
  `# Performans ve hata raporu`,
  '',
  `Adres: ${BASE} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  '',
  `## Bulgular (${findings.length})`,
  '',
  ...(findings.length ? findings.map((f) => `- **${f.area}** · ${f.where}: ${f.detail}`) : ['Bulgu yok.']),
  '',
  '## Paketler (en büyük 8, gzip)',
  '',
  '| Dosya | Ham | gzip | three |',
  '|---|---:|---:|:-:|',
  ...report.bundles.slice(0, 8).map((b) => `| ${b.file} | ${kb(b.raw)} | ${kb(b.gzip)} | ${b.three ? '✓' : ''} |`),
  '',
  `İlk açılışta indirilen JS: ${kb(report.load.initialGzip)} gzip (${report.load.initial.length} dosya), sayfa ${report.load.ms} ms. 3B açılınca: ${report.load.benchChunks.map((c) => `${c.file} (${kb(c.gzip)})`).join(', ') || '—'}.`,
  '',
  '## Senaryolar',
  '',
  '| Senaryo | fps | gerçek zaman | en uzun kare | p95 | uzun görev | çizim çağrısı | üçgen | kare çizimi |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...report.scenarios.map((s) => `| ${s.label} | ${s.fps} | ${s.realtime === null ? '—' : `%${Math.round(s.realtime * 100)}`} | ${s.worstMs} ms | ${s.p95Ms} ms | ${s.longTasks} (${s.longestTaskMs} ms) | ${s.scene?.calls ?? '—'} | ${s.scene?.triangles ?? '—'} | ${s.scene ? `${s.scene.renderMs.toFixed(2)} ms` : '—'} |`),
  '',
  `## Bellek (Şema ↔ 3B ×8)`,
  '',
  `Geometri ${report.leak.before?.geometries ?? '—'} → ${report.leak.after?.geometries ?? '—'}, doku ${report.leak.before?.textures ?? '—'} → ${report.leak.after?.textures ?? '—'}, JS yığını ${report.leak.heapMb} MB.`,
  '',
];
if (motor) {
  lines.push(
    `## Motor (simülasyon saniyesi başına hesap, ${motor.repeat} tekrarın ortancası; bütçe ${motor.budgetMs} ms)`,
    '',
    '| Örnek | ms / s | işlemci | adım / s | çözüm / s |',
    '|---|---:|---:|---:|---:|',
    ...[...motor.rows].sort((a, b) => b.msPerSimSecond - a.msPerSimSecond).slice(0, 15).map((r) => `| ${r.id} | ${r.msPerSimSecond.toFixed(0)} | ${r.arduino ? r.mcuMs.toFixed(0) : '—'} | ${Math.round(r.steps)} | ${Math.round(r.solves)} |`),
    '',
  );
}
writeFileSync(path.join(OUT, 'performans.md'), lines.join('\n'));
console.log(lines.slice(0, 6 + findings.length + 2).join('\n'));
