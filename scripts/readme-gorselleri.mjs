// README görselleri (docs/readme/*.png): banner (açık ve koyu), sosyal önizleme, ana ekran (açık ve koyu)
// ve özellik görselleri. Dev sunucusundaki uygulamanın ekran görüntülerinden üretilir; her çalıştırmada
// dosyaların üzerine yazar.
//
//   npm run dev                                          (ayrı bir terminalde)
//   node scripts/readme-gorselleri.mjs [<adres>] [<ad> ...]
//
// <ad> verilirse yalnızca o görseller üretilir (ör. `banner ozellik-3b`; `banner` iki temayı ve sosyal
// önizlemeyi birlikte üretir). ios-kontrol gibi Edge ve playwright-core kullanır: playwright-core bu
// projeye kurulu değildir, yolu PLAYWRIGHT_CORE ile verilir (varsayılan: thejarrus-site'takiler).
// PNG'ler sharp ile paletli (libimagequant) kaydedilir: sharp astro'nun isteğe bağlı bağımlılığı olarak
// node_modules'ta bulunur, package.json'da yoktur. Dosya boyut sınırını aşarsa renk sayısı azaltılır.
//
// Ölçüler: banner 1280 × 360 (2×: 2560 × 720), sosyal önizleme 1280 × 640 (1×), ana ekran 1440 × 900
// (2×), özellik görselleri 2400 × 1500 px (1200 × 750, 2×). Özellik görsellerinde README'nin iki sütunlu
// tablosunda da okunsun diye arayüzün ilgili bölgesi kırpılıp bu ölçüye getirilir.
// Banner'daki işaret "düğüm dalgası" logosudur (yalnızca README görsellerinde); sağdaki soluk şema, baraj
// örneğinin (Örnekler penceresindeki) CircuitView çizimidir.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'readme');
const PW = process.env.PLAYWRIGHT_CORE ?? 'C:/dev/thejarrus-site/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp bulunamadı (astro ile gelen isteğe bağlı bağımlılık): npm install ile kurulmuş olmalı.');
  process.exit(1);
}

const args = process.argv.slice(2);
const URL0 = args[0]?.startsWith('http') ? args.shift() : 'http://localhost:4321/devre-simulatoru/';
const ONLY = new Set(args);
const want = (name) => ONLY.size === 0 || ONLY.has(name);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const problems = [];

// --- Yardımcılar ---------------------------------------------------------------------------------

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Uygulamayı yeni bir bağlamda açar; hoş geldin penceresi kapalı sayılır. */
async function openApp({ width = 1440, height = 900, dpr = 2, scheme = 'light', phone = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    locale: 'tr-TR',
    colorScheme: scheme,
    ...(phone ? { isMobile: true, hasTouch: true, userAgent: IPHONE_UA } : {}),
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('devre-simulatoru:hosgeldin', '1');
    } catch {
      /* yok */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(URL0, { waitUntil: 'networkidle' });
  return { ctx, page };
}

/** Masaüstünde Örnekler penceresinden bir örneği açar (`?ornek=` yalnızca /embed/ sayfasında çalışır). */
async function openExample(page, title) {
  await page.getByRole('button', { name: 'Örnekler', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Örnekler' });
  await dialog.getByRole('button', { name: title, exact: true }).click();
  await page.waitForTimeout(800);
}

/** Telefonda ⋯ → Örnekler → arama ile bir örneği açar. */
async function openExamplePhone(page, title) {
  await page.getByRole('button', { name: /^Daha fazla/ }).tap();
  await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Örnekler', exact: true }).tap();
  await page.getByRole('searchbox', { name: 'Örnek ara' }).fill(title);
  await page.getByRole('button', { name: title, exact: true }).tap();
  await page.waitForTimeout(800);
}

const play = (page) => page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click();
const notebook = (page) => page.getByRole('complementary', { name: /^Defter/ });

/** "Örnek yüklendi · Geri al" bildirimi kapanana kadar bekler (görüntüye girmesin). */
async function noToast(page) {
  await page.getByText('Örnek yüklendi.').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => problems.push('bildirim kapanmadı'));
}

/**
 * Masaüstünde şemayla defteri birlikte içine alan 16:10 kırpma. Şema sol alttaki kablo gerilimi
 * göstergesinin hizasına taşıyorsa görünüm uzaklaştırılır; kırpma göstergenin sağından başlar.
 */
async function schematicClip(page) {
  const legendRight = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('div')].filter((el) => el.innerText?.startsWith('Kablo gerilimi')).map((el) => el.getBoundingClientRect());
    return boxes.length ? Math.min(...boxes.map((r) => r.right)) : 0;
  });
  const contentLeft = () =>
    page.evaluate(() => Math.min(...[...document.querySelectorAll('svg.schematic :is(polyline, path, text, circle)')].map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height).map((r) => r.left)));
  for (let i = 0; i < 4 && (await contentLeft()) < legendRight + 32; i++) {
    await page.getByRole('button', { name: 'Uzaklaştır', exact: true }).click();
    await page.waitForTimeout(300);
  }
  const x = Math.ceil(legendRight) + 4;
  const width = page.viewportSize().width - x;
  return { x, y: 60, width, height: width / 1.6 };
}

/**
 * PNG'yi paletli kaydeder; `limitKB` aşılırsa renk sayısını azaltır. `size` verilirse görüntü tam bu
 * ölçüye getirilir (kesirli ölçekten kalan yuvarlama farkı ya da şema kırpmasının değişen genişliği).
 */
async function save(name, png, limitKB, size) {
  if (size) {
    const { width, height } = await sharp(png).metadata();
    if (width !== size[0] || height !== size[1]) png = await sharp(png).resize(size[0], size[1], { fit: 'fill' }).png().toBuffer();
  }
  let best = null;
  for (const colors of [256, 192, 128, 96, 64]) {
    const out = await sharp(png).png({ palette: true, colors, dither: 1, effort: 10, compressionLevel: 9 }).toBuffer();
    best = out;
    if (out.length <= limitKB * 1024) break;
  }
  const meta = await sharp(best).metadata();
  writeFileSync(path.join(OUT, `${name}.png`), best);
  const kb = Math.round(best.length / 1024);
  console.log(`${name}.png  ${meta.width} × ${meta.height}  ${kb} KB${kb > limitKB ? `  (sınır ${limitKB} KB aşıldı)` : ''}`);
  if (kb > limitKB) problems.push(`${name}.png ${kb} KB (sınır ${limitKB} KB)`);
}

const fontUrl = (file) => `data:font/woff2;base64,${readFileSync(path.join(ROOT, 'src', 'assets', 'fonts', file)).toString('base64')}`;
const FONTS = `
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 100 700; src: url(${fontUrl('plex-sans-var-latin.woff2')}) format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2212; }
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 100 700; src: url(${fontUrl('plex-sans-var-latin-ext.woff2')}) format('woff2');
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F; }
  @font-face { font-family: 'IBM Plex Mono'; font-weight: 400; src: url(${fontUrl('plex-mono-400-latin.woff2')}) format('woff2'); }
`;

/** Ayrı bir sayfada (uygulamanın dışında) HTML'i çizip ekran görüntüsünü alır. */
async function renderHtml(html, { width, height, dpr }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const png = await page.screenshot();
  await ctx.close();
  return png;
}

/** Kırpılmış parçaları (PNG, kendi ölçeğinde) bir çerçevenin ortasına yan yana dizer. */
async function compose(items, { width = 1200, height = 750, dpr = 2, background, gap = 32, pad = 28, itemStyle = '' }) {
  const totalW = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1);
  const maxH = Math.max(...items.map((it) => it.h));
  const scale = Math.min(1, (width - 2 * pad) / totalW, (height - 2 * pad) / maxH);
  const imgs = items
    .map((it) => `<img src="data:image/png;base64,${it.png.toString('base64')}" style="width:${it.w * scale}px;height:${it.h * scale}px;${itemStyle}">`)
    .join('');
  const html = `<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;background:${background};display:flex;align-items:center;justify-content:center;gap:${gap * scale}px">${imgs}</body></html>`;
  return renderHtml(html, { width, height, dpr });
}

// --- Banner ve sosyal önizleme -------------------------------------------------------------------

/** "Düğüm dalgası" işareti; koyu temada karenin 1 birimlik kenarı ve daha açık turuncu düğümler. */
function logoSvg(dark) {
  const node = dark ? '#f26a3d' : '#f05a28';
  const rect = dark
    ? '<rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="#1d2733" stroke="#3b4754" stroke-width="1"/>'
    : '<rect width="32" height="32" rx="8" fill="#1d2733"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${rect}<path d="M8 16C10.5 8.5 13.5 8.5 16 16S21.5 23.5 24 16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="8" cy="16" r="2.6" fill="${node}"/><circle cx="24" cy="16" r="2.6" fill="${node}"/></svg>`;
}

/**
 * Örnekler penceresindeki bir kartın küçük şeması (CircuitView), tek renkli motif olarak: çizgiler ve
 * dolgular `--motif`, kâğıt rengindeki gövdeler `--bg` (arkadaki kablolar yine örtülür).
 */
async function circuitMotif(title) {
  const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 1 });
  await page.getByRole('button', { name: 'Örnekler', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Örnekler' });
  await dialog.getByRole('searchbox', { name: 'Örnek ara' }).fill(title);
  const button = dialog.getByRole('button', { name: title, exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.locator('[data-preview="drawn"] svg').waitFor();
  const svg = await button.evaluate((b) => {
    const src = b.querySelector('[data-preview] svg');
    const copy = src.cloneNode(true);
    const from = src.querySelectorAll('*');
    const to = copy.querySelectorAll('*');
    const light = (c) => {
      const m = c.match(/[\d.]+/g);
      return m && m.length >= 3 && Number(m[0]) > 235 && Number(m[1]) > 235 && Number(m[2]) > 235 && (m[3] === undefined || Number(m[3]) > 0.5);
    };
    const none = (c) => c === 'none' || /rgba\(.*,\s*0\)$/.test(c);
    for (let i = 0; i < from.length; i++) {
      const cs = getComputedStyle(from[i]);
      const el = to[i];
      el.removeAttribute('class');
      if (!none(cs.stroke)) el.style.stroke = 'var(--motif)';
      else el.style.stroke = 'none';
      if (!none(cs.fill)) el.style.fill = light(cs.fill) ? 'var(--bg)' : 'var(--motif)';
      else el.style.fill = 'none';
      for (const p of ['stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-family', 'font-size', 'font-weight', 'opacity', 'display']) {
        el.style.setProperty(p, cs.getPropertyValue(p));
      }
    }
    copy.removeAttribute('class');
    copy.removeAttribute('role');
    copy.removeAttribute('aria-label');
    copy.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return copy.outerHTML;
  });
  await ctx.close();
  return svg;
}

function bannerHtml({ dark, width, height, motif, social = false }) {
  const t = dark
    ? { bg: '#0e1318', ink: '#e6ebf0', muted: '#9aa6b3', dot: '#1f2831', motif: '#9aa6b3', motifOpacity: 0.22 }
    : { bg: '#ffffff', ink: '#1d2733', muted: '#5f6b7a', dot: '#dde1e6', motif: '#1d2733', motifOpacity: 0.15 };
  const s = social
    ? { pad: 96, logo: 148, gap: 40, title: 74, sub: 28, motifH: 640, motifRight: -110, motifTop: 0, maskStop: 48 }
    : { pad: 80, logo: 120, gap: 34, title: 60, sub: 22, motifH: 470, motifRight: -40, motifTop: -55, maskStop: 38 };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${FONTS}
    :root { --motif: ${t.motif}; --bg: ${t.bg}; }
    html, body { margin: 0; }
    body { width: ${width}px; height: ${height}px; overflow: hidden; position: relative; background: ${t.bg};
      background-image: radial-gradient(circle at 1px 1px, ${t.dot} 1.1px, transparent 1.6px); background-size: 24px 24px; background-position: 12px 12px;
      font-family: 'IBM Plex Sans', sans-serif; -webkit-font-smoothing: antialiased; }
    .motif { position: absolute; right: ${s.motifRight}px; top: ${s.motifTop}px; height: ${s.motifH}px; width: ${s.motifH * 1.25}px; opacity: ${t.motifOpacity};
      -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 ${s.maskStop}%); mask-image: linear-gradient(to right, transparent 0%, #000 ${s.maskStop}%); }
    .motif svg { width: 100%; height: 100%; display: block; }
    .lockup { position: absolute; left: ${s.pad}px; top: 0; bottom: 0; display: flex; align-items: center; gap: ${s.gap}px; }
    .mark { width: ${s.logo}px; height: ${s.logo}px; flex: none; }
    .mark svg { width: 100%; height: 100%; display: block; }
    h1 { margin: 0; font-weight: 600; font-size: ${s.title}px; line-height: 1.05; letter-spacing: -0.015em; color: ${t.ink}; }
    p { margin: ${s.sub * 0.55}px 0 0; font-weight: 400; font-size: ${s.sub}px; line-height: 1.3; color: ${t.muted}; }
  </style></head><body>
    <div class="motif">${motif}</div>
    <div class="lockup"><div class="mark">${logoSvg(dark)}</div><div><h1>Devre Simülatörü</h1><p>Tarayıcıda çalışan, Türkçe, eğitsel devre simülatörü</p></div></div>
  </body></html>`;
}

// --- Görseller -----------------------------------------------------------------------------------

const FET = 'BF245A ile ortak kaynaklı yükselteç (kazanç 10)';
const FEATURE = [2400, 1500];

try {
  if (want('banner')) {
    const motif = await circuitMotif('Baraj uyarısı: çubuk gösterge');
    for (const dark of [false, true]) {
      const png = await renderHtml(bannerHtml({ dark, width: 1280, height: 360, motif }), { width: 1280, height: 360, dpr: 2 });
      await save(dark ? 'banner-dark' : 'banner-light', png, 600);
    }
    const social = await renderHtml(bannerHtml({ dark: false, width: 1280, height: 640, motif, social: true }), { width: 1280, height: 640, dpr: 1 });
    await save('sosyal-onizleme', social, 400);
  }

  // Ana ekran: Deney 6 (BF245A yükselteç) çalışırken, osiloskop kartı açık, kablolar gerilim renkli.
  for (const scheme of ['light', 'dark']) {
    if (!want(`ana-ekran-${scheme}`) && !want('ana-ekran')) continue;
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2, scheme });
    await openExample(page, FET);
    await play(page);
    await page.waitForTimeout(1500);
    await notebook(page).getByRole('button', { name: /^OSC1 ·/ }).click();
    await noToast(page);
    await page.waitForTimeout(1500);
    await save(`ana-ekran-${scheme}`, await page.screenshot(), 600);
    await ctx.close();
  }

  // Şema ve canlı ölçüm: LED ve ön direnç çalışırken, direncin kartı açık (gerilim, akım, güç).
  if (want('ozellik-sema')) {
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2 });
    await openExample(page, 'LED ve ön direnç');
    await play(page);
    await page.waitForTimeout(2000);
    await notebook(page).getByRole('button', { name: /^R1 ·/ }).click();
    await noToast(page);
    await page.waitForTimeout(800);
    await save('ozellik-sema', await page.screenshot({ clip: await schematicClip(page) }), 400, FEATURE);
    await ctx.close();
  }

  // Laboratuvar cihazları: BC107 yükseltecinde (Deney 7) osiloskop ve fonksiyon üreteci kartları yan yana.
  if (want('ozellik-cihazlar')) {
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2 });
    await openExample(page, 'BC107 ile ortak emetörlü yükselteç');
    await play(page);
    await page.waitForTimeout(1500);
    const cards = [];
    for (const [button, region] of [
      [/^OSC1 ·/, 'OSC1 · Osiloskop'],
      [/^FG1 ·/, 'FG1 · Fonksiyon üreteci'],
    ]) {
      await notebook(page).getByRole('button', { name: button }).click();
      await page.waitForTimeout(1500);
      const card = notebook(page).getByRole('region', { name: region });
      const box = await card.boundingBox();
      cards.push({ png: await card.screenshot(), w: box.width, h: box.height });
    }
    const background = await page.locator('#defter').evaluate((el) => getComputedStyle(el).backgroundColor);
    await save('ozellik-cihazlar', await compose(cards, { background, gap: 28, pad: 24 }), 400, FEATURE);
    await ctx.close();
  }

  // 3B tezgâh: transistör anahtar (Deney 9) çalışırken, LED yanıyor; etiketler kapalı.
  if (want('ozellik-3b')) {
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2400 / 880 });
    await openExample(page, 'Transistör anahtar: LED kollektörde');
    await play(page);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '3B', exact: true }).first().click();
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /^Etiketler/ }).click();
    await noToast(page);
    await page.waitForTimeout(1500);
    await save('ozellik-3b', await page.screenshot({ clip: { x: 40, y: 140, width: 880, height: 550 } }), 400, FEATURE);
    await ctx.close();
  }

  // Tahtada kur: LED devresi tahtada; LED ters takılı, artı raydan dirence giden kablo eksik; Denetle sonrası.
  if (want('ozellik-tahtada-kur')) {
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2400 / 1130 });
    await openExample(page, 'LED ve ön direnç: tahtada kur');
    await page.waitForTimeout(800);
    const field = page.getByRole('textbox', { name: /Delik adı yaz/ });
    const plug = async (button, holes) => {
      await page.getByRole('button', { name: button, exact: true }).click();
      for (const hole of holes) {
        await field.fill(hole);
        await field.press('Enter');
        await page.waitForTimeout(200);
      }
    };
    await plug('B1 + kablosunu tak', ['üst + rayı (2. sütun hizası)']);
    await plug('B1 − kablosunu tak', ['üst − rayı (2. sütun hizası)']);
    await plug('R1: tahtaya tak', ['5c', '10c']);
    await plug('A1 + kablosunu tak', ['10a']);
    await plug('A1 − kablosunu tak', ['15a']);
    await plug('LED1: tahtaya tak', ['17c', '15c']);
    await page.getByRole('button', { name: /^Kablo/ }).first().click();
    for (const hole of ['17a', 'üst − rayı (17. sütun hizası)']) {
      await field.fill(hole);
      await field.press('Enter');
      await page.waitForTimeout(200);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Denetle', exact: true }).click();
    await page.waitForTimeout(1000);
    for (let i = 0; i < 6; i++) {
      const next = page.getByRole('button', { name: /^(Yerini göster|Açıklamayı göster)$/ });
      if (!(await next.count())) break;
      await next.first().click();
      await page.waitForTimeout(400);
    }
    await noToast(page);
    await page.waitForTimeout(500);
    await save('ozellik-tahtada-kur', await page.screenshot({ clip: { x: 310, y: 60, width: 1130, height: 706.25 } }), 400, FEATURE);
    await ctx.close();
  }

  // Analiz: BC107 yükseltecinde eğri izleyici (çıkış ailesi, yük doğrusu ve Q noktası).
  if (want('ozellik-analiz')) {
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2400 / 912 });
    await openExample(page, 'BC107 ile ortak emetörlü yükselteç');
    await page.getByRole('button', { name: 'Analiz', exact: true }).click();
    await page.getByRole('tab', { name: /Eğri izleyici/ }).click();
    await noToast(page);
    await page.waitForTimeout(3000);
    await save('ozellik-analiz', await page.screenshot({ clip: { x: 8, y: 330, width: 912, height: 570 } }), 400, FEATURE);
    await ctx.close();
  }

  // Arduino: NTC termometre çalışırken Seri ekran; sıcaklık çalışma sırasında değiştirilir.
  if (want('ozellik-arduino')) {
    const { ctx, page } = await openApp({ width: 1440, height: 900, dpr: 2 });
    await openExample(page, 'Arduino: termometre (NTC)');
    await play(page);
    await page.waitForTimeout(800);
    await notebook(page).getByRole('button', { name: /^ARD1 ·/ }).click();
    await page.waitForTimeout(2500);
    const slider = notebook(page).getByRole('slider').first();
    for (let i = 0; i < 6; i++) {
      await slider.press('ArrowRight');
      await slider.press('ArrowRight');
      await page.waitForTimeout(700);
    }
    await noToast(page);
    await page.waitForTimeout(1500);
    await save('ozellik-arduino', await page.screenshot({ clip: await schematicClip(page) }), 400, FEATURE);
    await ctx.close();
  }

  // Karta aktar: transistör anahtar devresi baskı devre (PCB) olarak.
  if (want('ozellik-pcb')) {
    const { ctx, page } = await openApp({ width: 1200, height: 750, dpr: 2 });
    await openExample(page, 'Transistör anahtar: LED kollektörde');
    await page.getByRole('button', { name: '3B', exact: true }).first().click();
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: /^Karta aktar/ }).click();
    await page.getByRole('tab', { name: /Baskı devre/ }).click();
    await noToast(page);
    await page.waitForTimeout(6000);
    await save('ozellik-pcb', await page.screenshot(), 400, FEATURE);
    await ctx.close();
  }

  // Telefon: 390 × 844, BF245A yükselteç çalışırken şema ve altında açık osiloskop kartı; çerçevenin ortasında.
  if (want('ozellik-telefon')) {
    const { ctx, page } = await openApp({ width: 390, height: 844, dpr: 3, phone: true });
    await openExamplePhone(page, FET);
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^OSC1 · Osiloskop/ }).tap();
    await page.waitForTimeout(600);
    // Kart açılınca şema bir şeride iner; şeride dokununca şema kutusu geri gelir, kart açık kalır.
    await page.getByRole('button', { name: /^Şemayı aç/ }).tap();
    await noToast(page);
    await page.waitForTimeout(1500);
    const shot = await page.screenshot();
    await ctx.close();
    const png = await compose([{ png: shot, w: 390, h: 844 }], {
      background: '#eef0f3',
      pad: 28,
      itemStyle: 'border-radius:34px;border:1px solid #c4cad2;box-shadow:0 18px 40px rgba(29,39,51,.16)',
    });
    await save('ozellik-telefon', png, 400, FEATURE);
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\nSorunlar:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exitCode = 1;
}
