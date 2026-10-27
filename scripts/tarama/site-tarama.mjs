// Site hata taraması (tarayıcıda): iki sayfa (simülatör, baraj) masaüstü ve telefon boyutunda;
// simülatörde 51 örneğin her biri açılır, oynatılır, her parçası seçilip canlı ölçümleri okunur.
//
// Aranan: sayfa hatası ve konsol hatası, başarısız ağ isteği, sayfanın kayması ya da yatay taşma,
// adı olmayan düğme, telefonda 44 px'ten küçük dokunma alanı, bilgi kutusunda NaN / ∞ / "—" /
// "hesaplanamıyor", "yetişemiyor" uyarısı, tetiklenmeyen osiloskop, kare hızı (en uzun kare).
//
// Çalıştırma: npm run tarama:site -- <adres> <çıktı klasörü> [örnek1,örnek2]
//   adres: ör. http://localhost:4322/devre-simulatoru/ (npx astro preview --port 4322)
// Playwright, thejarrus-site'ın playwright-core'undan (PLAYWRIGHT_CORE ile değiştirilebilir).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PW = process.env.PLAYWRIGHT_CORE ?? 'C:/dev/thejarrus-site/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const BASE = process.argv[2] ?? 'http://localhost:4322/devre-simulatoru/';
const OUT = process.argv[3] ?? 'tarama-site';
const ONLY = process.argv[4]?.split(',') ?? null;
mkdirSync(OUT, { recursive: true });

const findings = [];
const perf = [];
const add = (where, kind, detail) => findings.push({ where, kind, detail });

const browser = await chromium.launch({ channel: 'msedge' });
async function context(kind) {
  const options =
    kind === 'telefon'
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        }
      : { viewport: { width: 1440, height: 900 } };
  const ctx = await browser.newContext({ ...options, locale: 'tr-TR' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('devre-simulatoru:hosgeldin', '1');
    } catch {
      /* yok */
    }
  });
  return ctx;
}

/** Sayfayı izler: hatalar ve başarısız istekler `where` ile kaydedilir. */
function watch(page, where) {
  const state = { where };
  page.on('pageerror', (e) => add(state.where, 'sayfa-hatası', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') add(state.where, 'konsol-hatası', m.text().slice(0, 300));
  });
  page.on('requestfailed', (r) => add(state.where, 'istek-başarısız', `${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) add(state.where, 'istek-başarısız', `${r.status()} ${r.url()}`);
  });
  return state;
}

/** Düzen denetimleri: sayfa kayması, yatay taşma, adsız düğme, küçük dokunma alanı. */
async function layout(page, where, phone) {
  const r = await page.evaluate((isPhone) => {
    const vw = innerWidth;
    const vh = innerHeight;
    const doc = document.scrollingElement ?? document.documentElement;
    const visible = (el) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // Ekran okuyucuya özel (sr-only) öğe kırpılmıştır: görünmez.
      const clipped = s.clipPath === 'inset(50%)' || s.getPropertyValue('clip') === 'rect(0px, 0px, 0px, 0px)';
      return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !clipped;
    };
    const overflow = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.right > vw + 1 || b.left < -1) {
        // Kaydırılan bir kapsayıcının içindeyse taşma sayılmaz.
        let p = el.parentElement;
        let clipped = false;
        while (p && p !== document.body) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
            clipped = true;
            break;
          }
          p = p.parentElement;
        }
        if (!clipped) overflow.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].slice(0, 2).join('.')} (${Math.round(b.left)}–${Math.round(b.right)})`);
      }
    }
    const unnamed = [];
    const small = [];
    for (const el of document.querySelectorAll('button, [role="button"], a[href], input, select, [role="tab"]')) {
      if (!visible(el)) continue;
      const name = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '').trim() || (el.labels?.[0]?.textContent ?? '').trim() || el.getAttribute('aria-labelledby');
      if (!name && el.tagName !== 'INPUT') unnamed.push(el.outerHTML.slice(0, 120));
      if (isPhone) {
        const b = el.getBoundingClientRect();
        const onScreen = b.bottom > 0 && b.top < vh && b.right > 0 && b.left < vw;
        if (onScreen && (b.width < 44 || b.height < 44) && b.width * b.height > 0 && el.getAttribute('tabindex') !== '-1') small.push(`${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)} ${Math.round(b.width)}×${Math.round(b.height)}`);
      }
    }
    return {
      scrolls: doc.scrollHeight > vh + 1,
      scrollsX: doc.scrollWidth > vw + 1,
      overflow: overflow.slice(0, 10),
      unnamed: unnamed.slice(0, 10),
      small: small.slice(0, 15),
      smallCount: small.length,
    };
  }, phone);
  if (r.scrollsX) add(where, 'yatay-kayma', 'sayfa yatayda kayıyor');
  if (phone && r.scrolls) add(where, 'sayfa-kayması', 'telefonda sayfa dikeyde kayıyor (kural: kaymaz)');
  for (const o of r.overflow) add(where, 'taşma', o);
  for (const u of r.unnamed) add(where, 'adsız-denetim', u);
  if (r.smallCount > 0) add(where, 'küçük-dokunma-alanı', `${r.smallCount} denetim: ${r.small.join('; ')}`);
}

/** 1 s boyunca kare hızı ve en uzun kare. */
const frameRate = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        let worst = 0;
        let last = performance.now();
        const t0 = last;
        const f = (t) => {
          n++;
          worst = Math.max(worst, t - last);
          last = t;
          if (t - t0 < 1000) requestAnimationFrame(f);
          else resolve({ fps: Math.round((n * 1000) / (t - t0)), worst: Math.round(worst) });
        };
        requestAnimationFrame(f);
      }),
  );

async function loadTiming(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'));
    return {
      domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      load: Math.round(nav?.loadEventEnd ?? 0),
      jsBytes: js.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0),
      totalBytes: res.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) + (nav?.encodedBodySize ?? 0),
    };
  });
}

// --- 1. Sayfalar: masaüstü ve telefon ----------------------------------------------------
for (const kind of ['masaüstü', 'telefon']) {
  for (const page0 of ['', 'baraj/']) {
    const ctx = await context(kind);
    const page = await ctx.newPage();
    const where = `${kind} /${page0}`;
    watch(page, where);
    await page.goto(BASE + page0, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    perf.push({ where, ...(await loadTiming(page)) });
    await layout(page, where, kind === 'telefon');
    await page.screenshot({ path: path.join(OUT, `${kind}-${page0.replace('/', '') || 'simulator'}.png`) });
    await ctx.close();
  }
}

// --- 2. Örnekler (masaüstü): oynat, kare hızı, her parçanın canlı ölçümü ----------------------
const ctx = await context('masaüstü');
const page = await ctx.newPage();
const state = watch(page, 'örnekler');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Örnekler', exact: true }).click();
await page.waitForTimeout(200);
// Örnek listesi: diyalogdaki örnek düğmelerinin adları (başlık).
const titles = await page.$$eval('[role="dialog"] li button[aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')).filter(Boolean));
await page.keyboard.press('Escape');
const docOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre') ?? '{"parts":[]}'));
let index = 0;
for (const title of titles) {
  index++;
  if (ONLY && !ONLY.some((o) => title.includes(o))) continue;
  const where = `örnek ${index}: ${title}`;
  state.where = where;
  try {
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Oynat' }).first().click();
    await page.waitForTimeout(1200);
    const fr = await frameRate(page);
    const lag = await page.getByText(/yetişemiyor/).count();
    const untriggered = await page.getByText(/Tetiklenmiyor/).count();
    perf.push({ where, fps: fr.fps, worstFrameMs: fr.worst });
    if (fr.worst > 100) add(where, 'uzun-kare', `en uzun kare ${fr.worst} ms (${fr.fps} fps)`);
    if (lag > 0) add(where, 'yetişemiyor', 'hız uyarısı görünüyor');
    if (untriggered > 0) add(where, 'tetiklenmiyor', `${untriggered} osiloskop tetiklenmiyor`);
    const doc = await docOf();
    const labels = doc.parts.filter((p) => p.type !== 'ground').map((p) => p.label).slice(0, 14);
    for (const label of labels) {
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: 'İncele' }).click().catch(() => {});
      const button = page.getByRole('button', { name: new RegExp(`^${label}\\b`) }).first();
      if ((await button.count()) === 0) continue;
      await button.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(450);
      const text = ((await page.getByRole('region', { name: 'Canlı ölçüm' }).innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ');
      const bad = /hesaplanamıyor|NaN|(^|\s)—(\s|$)|∞/.exec(text);
      if (bad) add(where, 'bilgi-kutusu', `${label}: "${bad[0].trim()}" · ${text.slice(0, 160)}`);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Durdur', exact: true }).click().catch(() => {});
    await page.waitForTimeout(150);
  } catch (e) {
    add(where, 'tarama-hatası', String(e.message ?? e).split('\n')[0]);
    await page.keyboard.press('Escape').catch(() => {});
  }
}
await ctx.close();
await browser.close();

const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
writeFileSync(path.join(OUT, 'tarama-site.json'), JSON.stringify({ date: new Date().toISOString(), base: BASE, examples: titles.length, byKind, findings, perf }, null, 2));
console.log(`örnek: ${titles.length}, bulgu: ${findings.length}`, byKind);
for (const f of findings.slice(0, 60)) console.log(`  [${f.kind}] ${f.where} — ${f.detail}`);
const pages = perf.filter((p) => p.jsBytes !== undefined);
for (const p of pages) console.log(`  ${p.where}: DOMContentLoaded ${p.domContentLoaded} ms, load ${p.load} ms, JS ${(p.jsBytes / 1024).toFixed(0)} kB, toplam ${(p.totalBytes / 1024).toFixed(0)} kB`);
const slow = perf.filter((p) => p.fps !== undefined).sort((a, b) => b.worstFrameMs - a.worstFrameMs).slice(0, 6);
for (const p of slow) console.log(`  ${p.where}: ${p.fps} fps, en uzun kare ${p.worstFrameMs} ms`);
console.log(`rapor: ${path.join(OUT, 'tarama-site.json')}`);
