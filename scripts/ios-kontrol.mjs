// iOS / dokunmatik kontrol listesi. Tuvale, alt sayfalara ya da olay işleyicilerine dokunan her
// değişiklikten sonra çalıştırılır (docs/KARARLAR.md → "Dokunmatik ekran ve iOS Safari").
//
//   npm run dev                          (ayrı bir terminalde)
//   npm run ios-kontrol [-- <adres> [<ekran-görüntüsü-klasörü>]]
//
// Chromium'un iPhone öykünmesiyle (CDP dokunma olayları) çalışır; Edge kullanır. playwright-core bu
// projeye kurulu değildir: yolu PLAYWRIGHT_CORE ile verilir (varsayılan: thejarrus-site'takiler).
// Uyarı: öykünme gerçek iOS Safari'nin her davranışını yakalamaz (ör. dokunma alanı hatası burada
// görünmüyordu); bu yüzden ilk bölüm iOS için konan kuralların yerinde durduğunu doğrudan denetler.
// Dokunmatik davranışı değiştiren işlerde gerçek bir iPhone'da da denenmelidir.
//
// Yavaş cihaz: IOS_CPU=4 ile her sayfanın işlemcisi 4 kat yavaşlatılır (CDP Emulation.setCPUThrottlingRate);
// bütün liste yavaş bir telefondaki gibi koşar. Betiğin sabit beklemeleri (waitForTimeout) ve zaman aşımları da
// aynı kat uzar: maddeler betiğin acelesinden değil, uygulamanın davranışından kalsın.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PW = process.env.PLAYWRIGHT_CORE ?? 'C:/dev/thejarrus-site/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const URL0 = process.argv[2] ?? 'http://localhost:4321/devre-simulatoru/';
const OUT = process.argv[3];
const shot = (page, name) => (OUT ? page.screenshot({ path: path.join(OUT, name) }) : Promise.resolve());

const browser = await chromium.launch({ channel: 'msedge' });
// Hoş geldin penceresi yalnızca ilk ziyarette açılır; denetimler onu kapatılmış sayar ({ welcome: true }
// verilen bağlam hariç).
const rawNewContext = browser.newContext.bind(browser);
const CPU_RATE = Number(process.env.IOS_CPU ?? 1);
browser.newContext = async ({ welcome = false, ...options } = {}) => {
  const ctx = await rawNewContext(options);
  if (!welcome) await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
  if (CPU_RATE > 1) {
    ctx.setDefaultTimeout(30000 * CPU_RATE);
    ctx.on('page', (p) => {
      const wait = p.waitForTimeout.bind(p);
      p.waitForTimeout = (ms) => wait(ms * CPU_RATE);
      ctx.newCDPSession(p).then((s) => s.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE })).catch(() => {});
    });
  }
  return ctx;
};
const results = [];
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  results.push(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}${extra ? ' — ' + extra : ''}`);
};
const problems = [];

/** Masaüstünde Simülasyon bölgesindeki süre (s); okunamazsa null. */
async function simTime(page) {
  const text = await page.getByRole('region', { name: 'Simülasyon' }).first().innerText().catch(() => '');
  const m = /(\d[\d.,]*)\s*(µs|ms|s)\b/.exec(text);
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) * (m[2] === 's' ? 1 : m[2] === 'ms' ? 1e-3 : 1e-6) : null;
}
/**
 * Simülasyon zamanı en az `seconds` olana dek bekler (gerçek zamanla; IOS_CPU beklemeyi uzatmaz). Ölçüm
 * pencereleri simülasyon zamanında dolar (DISPLAY_WINDOW × hız): yavaş işlemcide simülasyon gerçek zamanın
 * gerisinde kalınca okuma ancak o kadar simülasyon süresinden sonra gelir. Normal hızda hemen döner.
 */
async function waitSimTime(page, seconds, timeoutMs = 300000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const t = await simTime(page);
    if ((t !== null && t >= seconds) || Date.now() > end) return t;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function phone(width = 390, height = 844) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(URL0, { waitUntil: 'networkidle' });
  return { page, cdp };
}
const touch = (cdp) => ({
  start: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }),
  move: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }),
  end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
});
async function drag(page, cdp, from, to, holdMs = 30) {
  const t = touch(cdp);
  await t.start(from.x, from.y); await page.waitForTimeout(holdMs);
  for (let i = 1; i <= 10; i++) { await t.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10); await page.waitForTimeout(16); }
  await t.end(); await page.waitForTimeout(200);
}
async function tap(page, cdp, p, holdMs = 40) { const t = touch(cdp); await t.start(p.x, p.y); await page.waitForTimeout(holdMs); await t.end(); await page.waitForTimeout(150); }
/**
 * Çift dokunuş: dört dokunma olayı açık zaman damgalarıyla (40 ms bas, 80 ms ara, 40 ms bas). Uygulama süreyi
 * olayların zaman damgasından ölçer; makinenin yükü ya da CDP'nin gecikmesi aradaki süreyi değiştirmez.
 */
async function doubleTap(page, cdp, p) {
  const t0 = Date.now() / 1000;
  const at = (type, dt) => cdp.send('Input.dispatchTouchEvent', { type, timestamp: t0 + dt, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y }] });
  await at('touchStart', 0); await at('touchEnd', 0.04); await at('touchStart', 0.12); await at('touchEnd', 0.16);
  await page.waitForTimeout(150);
}
const screen = (page, gx, gy) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('svg.schematic'); const g = svg.querySelector('g[transform]');
  const m = g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/); const r = svg.getBoundingClientRect();
  return { x: r.left + Number(m[1]) + x * 10 * Number(m[3]), y: r.top + Number(m[2]) + y * 10 * Number(m[3]), scale: Number(m[3]) };
}, [gx, gy]);
const doc = async (page) => { await page.waitForTimeout(500); return page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre'))); };
const part = async (page, label) => (await doc(page)).parts.find((p) => p.label === label);
/** Örnekler penceresinde bir örneğin (ya da arıza görevinin) düğmesi (masaüstünde bütün gruplar tek listede). */
async function pickExample(p, locate) {
  return locate(p);
}
/** Telefonun üst çubuğundaki Örnekler (v4); arayıp örneğe dokunarak açar. */
async function openExample(page, name) {
  await phoneExamples(page);
  // Ana ekrandaki arama bütün grupları arar.
  await page.getByRole('searchbox', { name: 'Örnek ara' }).fill(name); await page.waitForTimeout(200);
  await page.getByRole('button', { name, exact: true }).tap(); await page.waitForTimeout(600);
}
/** Telefon (v4): üst çubuktaki Örnekler düğmesi (eskiden ⋯ → Örnekler). */
async function phoneExamples(page) {
  await page.locator('header').getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
}
/** Föy kartındaki "Adımlar ve sorular": her adımın numarası, cevabı varsa "+" (düğme adımın içinde), yoksa "-". */
const labRows = (region) => region.locator('ol > li').evaluateAll((lis) =>
  lis.map((li) => `${li.querySelector(':scope > span')?.textContent ?? ''}${li.querySelector('button[aria-expanded]') ? '+' : '-'}`).join('|'));
/**
 * Telefonun üst çubuğundaki durum satırı ("Kur · kaydedildi", "Çalışıyor · 2,58 s"; v4: devrenin adının
 * düğmesinde, "<ad>, <durum>: devre sayfası"); kablo bağlarken "Kablo bağla".
 */
const mode = async (page) => {
  if ((await page.getByRole('button', { name: 'Bitti' }).count()) > 0) return 'Kablo bağla';
  const label = (await page.locator('header').getByRole('button', { name: /: devre sayfası$/ }).getAttribute('aria-label').catch(() => '')) ?? '';
  return label.replace(/: devre sayfası$/, '').split(', ').at(-1) ?? '';
};
/** Telefonun alttaki sabit çubuğu (v4): Parça, Kablo, Oynat; çalışırken Duraklat, Durdur, süre. */
const phoneBar = (page) => page.getByRole('navigation', { name: 'Simülasyon ve düzenleme' });
/** Alttaki çubuğun görünen düğmelerinin adları ("Parça|Kablo|Oynat"). */
const phoneBarButtons = (page) => phoneBar(page).getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()).join('|'));
/** Telefonda alttaki çubuğun Parça düğmesi → "<ad> ekle" (sayfa açık kalır). */
async function addPart(page, name) {
  if ((await page.getByRole('dialog', { name: 'Parça ekle' }).count()) === 0) {
    await phoneBar(page).getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: `${name} ekle` }).tap(); await page.waitForTimeout(500);
}
/** Telefon (v4): Daha fazla sayfasındaki bir kutu (Analiz, Geri al, Yinele, Sığdır); Geri al ve Yinele sayfayı kapatmaz. */
async function phoneMoreTile(page, name, { close = false } = {}) {
  await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(350);
  const sheet = page.getByRole('dialog', { name: 'Daha fazla' });
  await sheet.getByRole('button', { name, exact: true }).tap(); await page.waitForTimeout(300);
  if (close && (await sheet.count()) > 0) { await sheet.getByRole('button', { name: 'Kapat', exact: true }).first().tap(); await page.waitForTimeout(300); }
}
/** Telefon (v4): devrenin adına dokununca devre sayfası (eskiden ⋯ → Dosya). */
async function phoneFileSheet(page) {
  await page.locator('header').getByRole('button', { name: /: devre sayfası$/ }).tap(); await page.waitForTimeout(400);
}
/** Masaüstü (v4): üst çubukta devrenin adı ▾ (devre menüsü). */
const circuitButton = (page) => page.locator('header').getByRole('button', { name: /: devre menüsü$/ });
/** Masaüstü (v4): Daha fazla menüsünü açar; menüyü döndürür. */
async function openMore(page) {
  await page.locator('header').getByRole('button', { name: 'Daha fazla', exact: true }).click(); await page.waitForTimeout(150);
  return page.getByRole('menu', { name: 'Daha fazla' });
}
/** Masaüstü (v4): üst çubuğun ortasındaki Şema / 3B tezgâh seçiminin 3B düğmesi (dar pencerede "3B"). */
const benchButton = (page) => page.locator('header').getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: /^3B/ });
/** Masaüstü (v4): defterin "Parçalar" başlığındaki Parça ekle arama kutusu (kapalıysa düğmeyle açılır). */
async function deskAdd(page) {
  const box = notebook(page).getByRole('combobox', { name: /Parça ekle/ });
  if ((await box.count()) === 0) { await notebook(page).getByRole('button', { name: 'Parça ekle', exact: true }).click(); await page.waitForTimeout(150); }
  return box;
}
/** Telefonda şema kutusunun altındaki defter (v3). */
const phoneNotebook = (page) => page.getByRole('region', { name: /^Defter/ });
const selectedCount = (page) => page.locator('svg.schematic rect[data-selected]').count();
/** Masaüstünde sağdaki defter (v3). */
const notebook = (page) => page.getByRole('complementary', { name: /^Defter/ });
/**
 * Analiz v2: grafiği başlangıç ekranından açar (eski sekmeler yerine). kind 'curve' (Parçanın karakteristiği;
 * birden çok aday varsa `part` adlı parça) ya da 'bode' (Frekansa göre).
 */
async function openAnalysisGraph(region, kind, { touch = false, part } = {}) {
  const act = (l) => (touch ? l.tap() : l.click());
  const start = region.getByRole('button', { name: 'Yeni grafik' });
  if ((await start.getAttribute('aria-pressed')) !== 'true') await act(start);
  await region.page().waitForTimeout(150);
  if (kind === 'bode') await act(region.getByRole('button', { name: /^Frekansa göre/ }));
  else {
    await act(region.getByRole('button', { name: /^Parçanın karakteristiği/ }));
    await region.page().waitForTimeout(150);
    if (part) {
      const choice = region.getByRole('button', { name: new RegExp(`^${part} ·`) });
      if (await choice.count()) await act(choice.first());
    }
  }
  await region.page().waitForTimeout(200);
}
/** Sayfa (belge) kayıyor mu (dikey ya da yatay). */
/**
 * Arıza bulma görevi bağlantısı (B2): BC107 yükselteç, verilen gizli arızalarla. Örnek devre
 * src/examples'tan okunur; bağlantı uygulamanınkiyle aynı biçimde (lz-string, #g=).
 */
const lz = createRequire(import.meta.url)('lz-string');
const faultUrl = (fault = {}, base = URL0) => {
  const devre = JSON.parse(readFileSync(new URL('../src/examples/bjt-yukseltec-kuplajli.json', import.meta.url), 'utf8'));
  const gorev = {
    // Görev oluştur'daki gibi: ampermetre eklenebiliyorsa yeni parça (yalnızca ampermetre) ve kablo açık.
    name: 'Deney 7 · arıza bul', instruction: '', editable: [], allowNew: fault.tools?.ammeter === true, targets: [], predict: false, circuit: 'BC107 ile ortak emetörlü yükselteç',
    fault: { symptom: 'Osiloskobun B kanalında sinyal yok.', faults: [{ kind: 'open', at: { part: 'p3', pin: 1 } }], tools: { voltage: true, resistance: true, scope: true, ammeter: false }, hideIndicators: true, askExpected: false, ...fault },
  };
  return `${base.split('#')[0]}#g=${lz.compressToEncodedURIComponent(JSON.stringify({ format: 1, gorev, devre }))}`;
};
const pageScrolls = (pg) => pg.evaluate(() => document.scrollingElement.scrollHeight > window.innerHeight + 1 || document.scrollingElement.scrollWidth > window.innerWidth + 1);
/**
 * Bir yazının ekrandaki kontrastı (WCAG): öğenin ekran görüntüsünde en sık görülen renk zemin,
 * yazı rengi hesaplanmış `color`. Zemin WebGL sahnesi olabildiği için piksellerden ölçülür.
 */
async function contrastOf(page, locator) {
  const box = await locator.boundingBox();
  const png = await page.screenshot({ clip: box });
  const color = await locator.evaluate((el) => getComputedStyle(el).color);
  return page.evaluate(async ([b64, color]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = `${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`;
      const b = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n += 1; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      buckets.set(k, b);
    }
    const bg = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    const [r, gg, b] = color.match(/[\d.]+/g).map(Number);
    const L1 = lum(r, gg, b);
    const L2 = lum(bg.r / bg.n, bg.g / bg.n, bg.b / bg.n);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }, [png.toString('base64'), color]);
}
/** Bir nesneye doğrudan bağlı olay dinleyicileri (CDP). */
async function listeners(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression });
  const { listeners: list } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  return list;
}

try {
  // --- iOS kuralları (öykünmenin yakalayamadığı hatalara karşı) ------------------------
  {
    const { page, cdp } = await phone();
    const head = await page.locator('header').first().boundingBox();
    const box = await page.locator('main').boundingBox();
    const nb = await phoneNotebook(page).boundingBox();
    check('telefon (v3, DP1): 56 px üst çubuk, ≈ 270 px şema kutusu, altında defter', head !== null && head.height >= 56 && head.height <= 57.5 && box !== null && Math.round(box.height) === 270 && nb !== null && nb.y >= box.y + box.height - 1, `çubuk ${Math.round(head?.height ?? 0)}, şema ${Math.round(box?.height ?? 0)} px`);
    await addPart(page, 'Direnç');
    // React dinleyicileri display: contents ada öğesinde durur; iOS o alanı dokunma alanı saymaz.
    const onDoc = await listeners(cdp, 'document');
    const passiveTypes = ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup'];
    const missing = passiveTypes.filter((t) => !onDoc.some((l) => l.type === t && l.passive));
    check('belgede bütün dokunma/işaretçi türleri için pasif dinleyici var', missing.length === 0, missing.length ? `eksik: ${missing.join(', ')}` : '');
    // Safari'nin kendi kaydırma/yakınlaştırması işaretçi akışını kesmesin.
    const onSvg = await listeners(cdp, "document.querySelector('svg.schematic')");
    const blocking = ['touchstart', 'touchmove'].filter((t) => onSvg.some((l) => l.type === t && !l.passive));
    check('tuvalde varsayılanı engelleyen touchstart/touchmove dinleyicileri var', blocking.length === 2, blocking.join(', '));
    // WebKit touch-action: none bölgesini üstüne binen katmana da uygulayabiliyor: alt sayfa tuvalin
    // üstüne binmemeli (tuval sayfanın üst kenarında biter).
    const sheet = await page.getByRole('dialog', { name: 'Parça ekle' }).boundingBox();
    const svgBox = await page.locator('svg.schematic').boundingBox();
    check('alt sayfa tuvalin üstüne binmiyor', sheet !== null && svgBox.y + svgBox.height <= sheet.y + 1, sheet ? `tuval altı ${Math.round(svgBox.y + svgBox.height)} · sayfa ${Math.round(sheet.y)}` : 'sayfa yok');
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('tuvalin touch-action değeri none', ta === 'none', ta);
    // Çizimin hiçbir parçası olay almaz; hedef her zaman SVG (örtük yakalama sürüklemeyi koparmasın).
    const r1 = await part(page, 'R1');
    const at = await screen(page, r1.x, r1.y);
    const target = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class') ?? '', [at.x, at.y]);
    check('parçanın üstündeki dokunma hedefi SVG’nin kendisi', target.split(' ').includes('schematic'), target);
    // Zincirle ekle: seçili parçanın boştaki ucuna bağlanır.
    const banner = (await page.getByRole('dialog', { name: 'Parça ekle' }).textContent()) ?? '';
    await page.getByRole('button', { name: 'LED ekle' }).tap(); await page.waitForTimeout(400);
    const chained = await doc(page);
    check('Parça ekle sayfasında "Zincirle ekle" yeni parçayı kabloyla bağlıyor', banner.includes('R1’in 1. ucuna bağlanır') && chained.wires.length === 1 && chained.parts.length === 2, banner.slice(0, 60));
    await page.getByRole('dialog', { name: 'Parça ekle' }).getByRole('button', { name: 'Kapat', exact: true }).tap(); await page.waitForTimeout(400);
    const sizes = [];
    for (const loc of [page.locator('header button'), page.locator('main').getByRole('group', { name: 'Görünüm' }).getByRole('button'), page.getByRole('button', { name: 'Şemayı tam ekran aç' }), phoneBar(page).getByRole('button')]) {
      for (const b of await loc.all()) { const r = await b.boundingBox(); if (r) sizes.push(Math.min(r.width, r.height)); }
    }
    const barHeights = await phoneBar(page).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check('telefon (v4): üst çubuk, şema kutusu (Şema | 3B, tam ekran) ve alttaki çubuk en az 44 px; alttaki çubukta Parça, Kablo, Oynat 52 px',
      sizes.length >= 9 && Math.min(...sizes) >= 43.5 && (await phoneBarButtons(page)) === 'Parça|Kablo|Oynat' && barHeights.every((h) => h === 52),
      `${sizes.length} düğme, en küçüğü ${Math.round(Math.min(...sizes))} px · çubuk ${await phoneBarButtons(page)} ${barHeights.join('/')}`);
    await shot(page, 'ios-1-telefon.png');
    await page.context().close();
  }

  // --- Parça ekle sayfası: liste kayar, sayfa kaymaz, arama 16 px -------------------------
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const { page, cdp } = await phone(w, h);
    await phoneBar(page).getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(400);
    const grid = page.getByRole('dialog', { name: 'Parça ekle' }).locator('.overflow-y-auto').first();
    const box = await grid.boundingBox();
    await drag(page, cdp, { x: box.x + box.width / 2, y: box.y + box.height - 12 }, { x: box.x + box.width / 2, y: box.y + 4 });
    await page.waitForTimeout(300);
    const top = await grid.evaluate((el) => el.scrollTop);
    const pageTop = await page.evaluate(() => document.scrollingElement.scrollTop);
    check(`parça listesi parmakla kayıyor, sayfa kaymıyor (${w}x${h}, liste ${Math.round(box.height)} px)`, top > 0 && pageTop === 0, `scrollTop ${top}`);
    const fs = await page.getByRole('searchbox', { name: 'Parça ara' }).evaluate((el) => getComputedStyle(el).fontSize);
    check(`parça arama alanı 16 px (${w}x${h})`, fs === '16px', fs);
    const sheet = await page.getByRole('dialog', { name: 'Parça ekle' }).boundingBox();
    const svgBox = await page.locator('svg.schematic').boundingBox();
    check(`Parça ekle sayfası şema kutusunun üstüne binmiyor, kutu kısalıyor (${w}x${h})`, sheet !== null && svgBox !== null && svgBox.y + svgBox.height <= sheet.y + 1, `tuval ${Math.round(svgBox?.height ?? 0)} px`);
    if (w === 390) await shot(page, 'ios-2-parca.png');
    await page.waitForTimeout(800);
    const last = page.getByRole('button', { name: 'Ampermetre ekle' });
    await last.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await last.tap(); await page.waitForTimeout(500);
    check(`listenin sonundaki parçaya ulaşılıp ekleniyor (${w}x${h})`, (await doc(page)).parts.some((p) => p.type === 'ammeter'));
    await page.context().close();
  }

  // --- Örnekler (tam ekran) -------------------------------------------------------------
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const { page, cdp } = await phone(w, h);
    await phoneExamples(page);
    const list = page.getByRole('dialog', { name: 'Örnekler' }).locator('.overflow-y-auto');
    const box = await list.boundingBox();
    await drag(page, cdp, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, { x: box.x + box.width / 2, y: box.y + 40 });
    await page.waitForTimeout(300);
    const top = await list.evaluate((el) => el.scrollTop);
    check(`örnekler parmakla kaydırılıyor (${w}x${h})`, top > 0, `scrollTop ${top}`);
    const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('örnekler açıkken tuvalin touch-action değeri none değil', touchAction !== 'none', touchAction);
    await page.waitForTimeout(1000);
    const group = page.getByRole('button', { name: /^Baraj projesi,/ });
    await group.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await group.tap(); await page.waitForTimeout(300);
    const last = page.getByRole('button', { name: 'Baraj uyarısı: tek ışık', exact: true });
    await last.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await last.tap(); await page.waitForTimeout(600);
    const exampleCard = phoneNotebook(page).getByRole('region', { name: /^Örnek ·/ });
    await exampleCard.getByRole('button').first().tap(); await page.waitForTimeout(300);
    const example = (await exampleCard.textContent().catch(() => '')) ?? '';
    check(`son gruptaki son örneğe ulaşılıp açılıyor; ne işe yaradığı defterin örnek kartında (${w}x${h})`, (await doc(page)).parts.some((p) => p.type === 'tank') && (await doc(page)).parts.some((p) => p.label === 'Q5') && example.includes('Ne işe yarar?') && example.includes('Günlük hayatta'));
    await page.context().close();
  }

  // --- Örnekler penceresi (masaüstü): yan liste, tek kayan liste, kartlarda küçük şema, arama -----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const openDialog = async () => { await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(400); };
    await openDialog();
    const dlg = page.getByRole('dialog', { name: 'Örnekler' });
    const nav = dlg.getByRole('navigation', { name: 'Örnek grupları' });
    const list = dlg.locator('nav + div');
    const search = dlg.getByRole('searchbox', { name: 'Örnek ara' });
    const rows = nav.locator('button[data-row]');
    const row = (short) => nav.getByRole('button', { name: new RegExp(`^${short},`) });
    const currentRow = async () => ((await nav.locator('button[aria-current="true"]').getAttribute('aria-label').catch(() => '')) ?? '').split(',')[0];
    /** Listenin üstündeki grup: başı listenin üstünü geçmiş son grup. */
    const topSection = () => list.evaluate((el) => {
      const top = el.getBoundingClientRect().top; let key = '';
      for (const s of el.querySelectorAll('[data-section]')) if (s.getBoundingClientRect().top - top <= 24) key = s.dataset.section;
      return key;
    });

    // 1. Pencere, başlık satırı, yan liste.
    const box = await dlg.boundingBox();
    const radius = await dlg.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    const header = await dlg.locator('header').boundingBox();
    const headerText = (await dlg.locator('header').textContent()) ?? '';
    const searchBox = await dlg.locator('header label').boundingBox();
    const placeholder = await search.getAttribute('placeholder');
    const focusedSearch = await search.evaluate((el) => document.activeElement === el);
    const oldHint = await dlg.getByText(/^Bir örneğe tıkla/).count();
    check('masaüstü (Örnekler): pencere ≈ 1160 px, ekrana sığan yükseklik, köşe 16 px; 68 px başlık satırında "Örnekler", arama (en çok 520 px, yer tutucu, açılışta odakta), toplam devre sayısı ve kapat; eski açıklama satırı yok',
      box !== null && Math.abs(box.width - 1160) <= 1 && box.height <= 900 - 40 && box.height >= 900 - 60 && radius === '16px' && Math.round(header?.height ?? 0) === 68 &&
        headerText.startsWith('Örnekler') && /\d+ devre/.test(headerText) && searchBox !== null && searchBox.width <= 520 && searchBox.width >= 480 &&
        placeholder === 'Devre, parça ya da deney ara' && focusedSearch && (await dlg.getByRole('button', { name: 'Örnekler penceresini kapat' }).count()) === 1 && oldHint === 0,
      `${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)} · ${radius} · başlık ${Math.round(header?.height ?? 0)} px · arama ${Math.round(searchBox?.width ?? 0)} px · odak ${focusedSearch}`);
    const navBox = await nav.boundingBox();
    const navBg = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
    const panel2 = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'bg-panel-2'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    const logo = nav.locator('img');
    const logoW = Math.round((await logo.boundingBox())?.width ?? 0);
    const navText = (await nav.textContent()) ?? '';
    const marks = await rows.evaluateAll((bs) => bs.map((b) => b.querySelector('span')?.textContent ?? ''));
    const labels = await rows.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? ''));
    const folderShorts = labels.slice(0, 11).map((l) => l.split(',')[0]);
    const navHeights = await rows.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
    check('masaüstü (Örnekler): solda 264 px yan liste (panel-2 zemini, nav): 36 px Akdeniz logosu, "Akdeniz Üniversitesi" / "Fizik · Elektronik Lab föyü"; gruplar tek satır (numara 1–9, P, !; kısa ad; sayı), çizgi, "Genel" ve genel gruplar',
      Math.round(navBox?.width ?? 0) === 264 && navBg === panel2 && logoW === 36 && (await logo.getAttribute('alt')) === 'Akdeniz Üniversitesi logosu' &&
        navText.includes('Akdeniz Üniversitesi') && navText.includes('Fizik · Elektronik Lab föyü') && navText.includes('Genel') && (await nav.locator('hr').count()) === 1 &&
        marks.slice(0, 11).join('') === '123456789P!' &&
        folderShorts.join('|') === 'Diyot karakteristikleri|Doğrultucular|Kenetleyici ve katlayıcı|Kırpıcılar|FET karakteristikleri|FET yükselteci|BJT’li yükselteç|MOSFET’li yükselteç|Transistör anahtar|Baraj projesi|Arıza bulma' &&
        labels.slice(11).some((l) => l.startsWith('Temel devreler,')) && labels.every((l) => /, \d+ devre$/.test(l)) && navHeights.every((h) => h === 36),
      `${Math.round(navBox?.width ?? 0)} px · ${navBg}/${panel2} · logo ${logoW} · ${marks.join('')} · ${labels.length} satır`);

    // Şemalar yalnızca görünür olunca çizilir.
    const states = await dlg.locator('[data-preview]').evaluateAll((ps) => ps.map((p) => p.dataset.preview));
    const waiting = states.filter((s) => s === 'waiting').length;
    const arduino = dlg.locator('section[data-section="arduino"] [data-preview]').last();
    const arduinoBefore = await arduino.getAttribute('data-preview');
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight })); await page.waitForTimeout(600);
    const arduinoAfter = await arduino.getAttribute('data-preview');
    check('masaüstü (Örnekler): kartların şeması görünür olunca çiziliyor (açılışta uzaktakiler bekliyor, kaydırınca çiziliyor)',
      waiting > 20 && arduinoBefore === 'waiting' && arduinoAfter === 'drawn', `${states.length} kart · ${waiting} bekliyor · son ${arduinoBefore} → ${arduinoAfter}`);
    // 2. Yan listeden gruba git; kaydırınca vurgu görünen gruba geçer.
    await row('Kırpıcılar').click(); await page.waitForTimeout(400);
    const afterClick = await topSection();
    const clickCurrent = await currentRow();
    const clickAria = await row('Kırpıcılar').getAttribute('aria-current');
    const clickBg = await row('Kırpıcılar').evaluate((el) => getComputedStyle(el).backgroundColor);
    const accentSoft = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'bg-accent-soft'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    check('masaüstü (Örnekler): yan listede "Kırpıcılar"a tıklayınca içerik o gruba kayıyor; satır vurgulu (accent-soft zemin, aria-current)',
      afterClick === 'kirpici' && clickCurrent === 'Kırpıcılar' && clickAria === 'true' && clickBg === accentSoft, `${afterClick} · ${clickCurrent} · ${clickBg}`);
    const lb = await list.boundingBox();
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 420); await page.waitForTimeout(120); }
    await page.waitForTimeout(400);
    const scrolledTop = await topSection();
    const scrolledCurrent = await currentRow();
    const scrolledKey = (await nav.locator('button[aria-current="true"]').count()) === 1 ? scrolledTop : '';
    const keyShort = labels[(await list.evaluate((el) => [...el.querySelectorAll('[data-section]')].map((s) => s.dataset.section))).indexOf(scrolledTop)]?.split(',')[0];
    check('masaüstü (Örnekler): fareyle kaydırınca yan listedeki vurgu o an görünen gruba geçiyor (tek satır aria-current)',
      scrolledTop !== 'kirpici' && scrolledKey !== '' && scrolledCurrent === keyShort, `${scrolledTop} · ${scrolledCurrent}`);
    // En alta inince son grup vurgulu.
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight })); await page.waitForTimeout(300);
    const bottomCurrent = await currentRow();
    check('masaüstü (Örnekler): listenin sonunda son grup vurgulu', bottomCurrent === labels[labels.length - 1].split(',')[0], bottomCurrent);

    // 3. Grup başlığı ve kartlar.
    await row('Diyot karakteristikleri').click(); await page.waitForTimeout(400);
    const first = dlg.locator('section[data-section="diyot-karakteristigi"]');
    const overline = (await first.locator('p').first().textContent()) ?? '';
    const h3 = first.locator('h3');
    const h3Size = await h3.evaluate((el) => getComputedStyle(el).fontSize);
    const firstHead = (await first.locator(':scope > div').first().textContent()) ?? '';
    const cols = await first.locator('ul').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    const gap = await first.locator('ul').evaluate((el) => getComputedStyle(el).rowGap + '/' + getComputedStyle(el).columnGap);
    const general = dlg.locator('section[data-section="temel"]');
    const generalOverline = await general.locator(':scope > div p.font-mono').count();
    check('masaüstü (Örnekler): grup başlığında mono üst yazı (DENEY 1), föydeki tam ad (19 px), amaç cümlesi ve sağda "N devre"; genel gruplarda üst yazı yok; kartlar 3 sütun, aralık 16 px',
      overline === 'DENEY 1' && (await h3.textContent()) === 'Diyot karakteristiklerinin incelenmesi' && h3Size === '19px' &&
        firstHead.includes('Diyodun akımının gerilimle nasıl değiştiğini (I-V eğrisini) ölçüp incelemek.') && /\d+ devre$/.test(firstHead) &&
        generalOverline === 0 && cols === 3 && gap === '16px/16px',
      `${overline} · ${h3Size} · ${cols} sütun · ${gap} · genel üst yazı ${generalOverline}`);
    const zenerCard = first.locator('li').filter({ has: page.getByRole('button', { name: 'Zener diyot (5,6 V): X-Y’de karakteristik', exact: true }) });
    const zenerOpen = zenerCard.getByRole('button', { name: 'Zener diyot (5,6 V): X-Y’de karakteristik', exact: true });
    const zenerText = (await zenerCard.textContent()) ?? '';
    const preview = zenerCard.locator('[data-preview]');
    const previewH = Math.round((await preview.boundingBox())?.height ?? 0);
    const drawn = (await preview.getAttribute('data-preview')) === 'drawn' && (await preview.locator('svg').count()) > 0;
    const previewInOpen = await zenerOpen.locator('[data-preview]').count();
    const cardRadius = await zenerCard.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    const titleStyle = await zenerOpen.locator('span.leading-snug.font-semibold').evaluate((el) => `${getComputedStyle(el).fontSize}/${getComputedStyle(el).fontWeight}`);
    const cueSize = await zenerOpen.locator('span.text-muted').last().evaluate((el) => getComputedStyle(el).fontSize);
    const shape = await zenerCard.locator('span.font-mono').first().textContent().catch(() => '');
    const description = 'diyodun yerinde 5,6 V’luk bir zener';
    const board = zenerCard.getByRole('button', { name: 'Zener diyot (5,6 V): X-Y’de karakteristik: tahtada kur' });
    const boardBox = await board.boundingBox();
    const cardBox = await zenerCard.boundingBox();
    const boardBg = await board.evaluate((el) => getComputedStyle(el).backgroundColor);
    check('masaüstü (Örnekler): kart (köşe 12 px): üstte 128 px küçük şema (kartın "aç" düğmesinin içinde, çizilmiş), mono "Şekil-3" çipi, başlık 15 px yarı kalın, altında 13 px cümle; uzun açıklama ve numaralı daire yok; altta sağda zeminsiz "Tahtada kur" ayrı düğme',
      cardRadius === '12px' && previewH === 128 && drawn && previewInOpen === 1 && shape === 'Şekil-3' && titleStyle === '15px/600' && cueSize === '13px' &&
        !zenerText.includes(description) && (await zenerCard.locator('span.rounded-full').count()) === 0 &&
        boardBox !== null && cardBox !== null && boardBox.x + boardBox.width >= cardBox.x + cardBox.width - 16 && boardBox.y + boardBox.height >= cardBox.y + cardBox.height - 12 &&
        boardBg === 'rgba(0, 0, 0, 0)' && ((await board.textContent()) ?? '').includes('Tahtada kur'),
      `${cardRadius} · şema ${previewH} px ${drawn} · ${shape} · ${titleStyle} · ${cueSize} · tahta ${boardBg}`);
    const extraCard = (await dlg.getByRole('button', { name: 'Schottky ile 1N4001’in ileri gerilimi', exact: true }).textContent()) ?? '';
    const plainCard = (await dlg.getByRole('button', { name: 'Yarım dalga doğrultmaç', exact: true }).textContent()) ?? '';
    const generalCard = (await dlg.getByRole('button', { name: 'Gerilim bölücü', exact: true }).textContent()) ?? '';
    check('masaüstü (Örnekler): föyde olmayan ek örnekte "Föyde yok · ek" (Schottky), föy örneğinde şekil çipi (Yarım dalga: Şekil-4), genel örnekte çip yok',
      extraCard.includes('Föyde yok · ek') && !extraCard.includes('Şekil-') && /Şekil-\d/.test(plainCard) && !plainCard.includes('Föyde yok') && !generalCard.includes('Şekil-') && !generalCard.includes('Föyde yok'),
      `${extraCard.slice(0, 40)} · ${plainCard.slice(0, 40)}`);
    // Baraj grubunun başlığının yanında sayfa bağlantısı; arıza görevleri aynı kartla.
    const barajLink = dlg.locator('section[data-section="baraj"] > div').first().getByRole('link', { name: /Baraj sayfası/ });
    const barajHref = await barajLink.getAttribute('href').catch(() => '');
    const faults = dlg.getByRole('button', { name: /^Arıza bul: / });
    const faultText = (await faults.filter({ hasText: 'Yükselteçte çıkış yok' }).textContent()) ?? '';
    const faultPreview = await faults.first().locator('[data-preview]').count();
    check('masaüstü (Örnekler): baraj grubunun başlığının yanında küçük "Baraj sayfası" bağlantısı; arıza görevleri aynı kartla (şema, "Arıza" çipi, deney adı, belirti)',
      (await barajLink.count()) === 1 && /baraj\/$/.test(barajHref ?? '') && (await faults.count()) === 5 && faultPreview === 1 &&
        faultText.includes('Arıza') && faultText.includes('Deney 7') && faultText.includes('Osiloskobun B kanalında sinyal yok'),
      `${barajHref} · ${await faults.count()} arıza · ${faultText.slice(0, 60)}`);

    // 4. Arama.
    await search.fill('zener'); await page.waitForTimeout(400);
    const zenerResults = (await list.locator(':scope > p').first().textContent()) ?? '';
    const zenerShown = await list.locator('li').count();
    const mark = await dlg.locator('li mark').first().textContent().catch(() => '');
    const markBg = await dlg.locator('li mark').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
    const warnSoft = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'bg-warn-soft'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    const disabledRows = await nav.locator('button[data-row]:disabled').count();
    const diodeRow = (await row('Diyot karakteristikleri').getAttribute('aria-label')) ?? '';
    const disabledClick = await nav.locator('button[data-row]:disabled').first().evaluate((el) => getComputedStyle(el).opacity);
    check('masaüstü (Örnekler): "zener" araması: üstte "“zener” için N sonuç", başlıktaki eşleşme warn-soft zeminle işaretli; yan listede sayılar eşleşmeye dönüyor, eşleşmeyenler soluk ve tıklanamaz',
      zenerResults === `“zener” için ${zenerShown} sonuç` && zenerShown >= 1 && mark?.toLowerCase() === 'zener' && markBg === warnSoft &&
        disabledRows > 10 && /, [1-9]\d* devre$/.test(diodeRow) && Number(disabledClick) < 0.5,
      `${zenerResults} · ${mark} ${markBg} · ${disabledRows} soluk · ${diodeRow}`);
    await search.fill('555'); await page.waitForTimeout(400);
    const has555 = await dlg.getByRole('button', { name: '555 ile yanıp sönen LED (astabil)', exact: true }).count();
    await search.fill('DOGRULTMAC'); await page.waitForTimeout(400);
    const hasBridge = await dlg.getByRole('button', { name: 'Köprü tipi tam dalga doğrultmaç', exact: true }).count();
    check('masaüstü (Örnekler): arama parça adlarında da ("555") ve Türkçe karakterlere duyarsız ("DOGRULTMAC" → Köprü tipi tam dalga doğrultmaç)', has555 === 1 && hasBridge === 1, `${has555} · ${hasBridge}`);
    await search.fill('qqqzzz'); await page.waitForTimeout(300);
    const empty = (await list.textContent()) ?? '';
    await dlg.getByRole('button', { name: 'Aramayı temizle' }).click(); await page.waitForTimeout(300);
    const cleared = (await search.inputValue()) === '' && (await search.evaluate((el) => document.activeElement === el)) && (await list.locator('li').count()) > 60;
    check('masaüstü (Örnekler): sonuç yoksa kısa boş durum ve "Aramayı temizle"; temizleyince bütün liste geri geliyor, odak aramada', empty.includes('Bu aramayla eşleşen devre yok.') && cleared, `${empty.slice(0, 40)} · ${cleared}`);

    // 5. Klavye: "/" aramaya gider, Tab sırası, yan listede ok tuşları.
    await zenerOpen.focus(); await page.keyboard.press('/'); await page.waitForTimeout(100);
    const slash = await search.evaluate((el) => document.activeElement === el);
    await page.keyboard.press('Tab');
    const tab1 = (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '';
    await page.keyboard.press('Tab');
    const tab2 = (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '';
    await page.keyboard.press('ArrowDown');
    const down = (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '';
    await page.keyboard.press('End');
    const end = (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '';
    await page.keyboard.press('Home');
    const home = (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '';
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const enterTop = await topSection();
    check('masaüstü (Örnekler): "/" aramaya gidiyor; Tab: arama → kapat → yan liste; yan listede ↓, End, Home odağı taşıyor, Enter gruba kaydırıyor',
      slash && tab1 === 'Örnekler penceresini kapat' && tab2.startsWith('Diyot karakteristikleri,') && down.startsWith('Doğrultucular,') &&
        end === labels[labels.length - 1] && home === labels[0] && enterTop === 'kenetleyici',
      `${slash} · ${tab1} · ${tab2} · ${down} · ${end} · ${home} · ${enterTop}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const closed = (await page.getByRole('dialog', { name: 'Örnekler' }).count()) === 0;

    // 6. Açık örnek: liste ona kayar, kartta "Açık", 2 px accent kenarlık ve accent-soft halka; yan listede grubu.
    await openDialog();
    await dlg.getByRole('button', { name: 'BC107 ile ortak emetörlü yükselteç', exact: true }).click(); await page.waitForTimeout(600);
    await openDialog();
    const active = dlg.locator('li[data-active]');
    const activeBox = await active.boundingBox();
    const listBox = await list.boundingBox();
    const inView = activeBox !== null && listBox !== null && activeBox.y >= listBox.y && activeBox.y + activeBox.height <= listBox.y + listBox.height;
    const activeText = (await active.textContent()) ?? '';
    const ring = await active.evaluate((el) => `${getComputedStyle(el).borderTopWidth} ${getComputedStyle(el).boxShadow}`);
    const activeCurrent = await active.getByRole('button', { name: 'BC107 ile ortak emetörlü yükselteç', exact: true }).getAttribute('aria-current');
    check('masaüstü (Örnekler): Esc kapatıyor; açık örnekle (BC107) açılınca liste ona kayıyor; kartında mavi "Açık" çipi, accent kenarlık + accent-soft halka, aria-current; yan listede grubu vurgulu',
      closed && inView && activeText.includes('Açık') && /1px/.test(ring) && /0px 0px 0px 1px/.test(ring) && /0px 0px 0px 4px/.test(ring) && activeCurrent === 'true' && (await currentRow()) === 'BJT’li yükselteç',
      `${closed} · görünür ${inView} · ${ring.slice(0, 80)} · ${await currentRow()}`);
    await shot(page, 'ios-ornekler-masaustu.png');
    // Açık arıza görevi de işaretli, liste ona kayar.
    await dlg.getByRole('button', { name: 'Arıza bul: JFET’ten akım geçmiyor' }).click(); await page.waitForTimeout(800);
    await openDialog();
    const activeFault = dlg.locator('li[data-active]');
    const faultBox = await activeFault.boundingBox();
    const faultInView = faultBox !== null && listBox !== null && faultBox.y >= listBox.y && faultBox.y + faultBox.height <= listBox.y + listBox.height;
    check('masaüstü (Örnekler): açık arıza görevi (JFET) işaretli, liste ona kayıyor, yan listede "Arıza bulma"',
      faultInView && ((await activeFault.textContent()) ?? '').includes('Açık') && (await currentRow()) === 'Arıza bulma', `${faultInView} · ${await currentRow()}`);
    // Ek örneğin defterdeki örnek kartında da etiket; kartı eski düzende.
    await dlg.getByRole('button', { name: 'Schottky ile 1N4001’in ileri gerilimi', exact: true }).click(); await page.waitForTimeout(500);
    // v4: örnek şeridi; grubun adı bölgenin adında, şeritte büyük harfli mono üst yazı.
    const exampleCard = (await notebook(page).getByRole('region', { name: /^Örnek ·/ }).textContent()) ?? '';
    const exampleName = (await notebook(page).getByRole('region', { name: /^Örnek ·/ }).getAttribute('aria-label')) ?? '';
    check('masaüstü (Örnekler): ek örneğin defterdeki örnek şeridinde de "Föyde yok · ek"; grup adı aynı (Örnek · Deney 1 · …; üst yazı DENEY 1 · …)',
      exampleCard.includes('Föyde yok · ek') && exampleName === 'Örnek · Deney 1 · Diyot karakteristiklerinin incelenmesi' && exampleCard.startsWith('DENEY 1 · DİYOT KARAKTERİSTİKLERİNİN İNCELENMESİ'),
      `${exampleName} · ${exampleCard.slice(0, 80)}`);
    const extraRegion = notebook(page).getByRole('region', { name: /^Örnek ·/ });
    await extraRegion.getByRole('button').first().click(); await page.waitForTimeout(300);
    const extraText = (await extraRegion.textContent()) ?? '';
    check('masaüstü (Örnekler): ek örneğin (Schottky) kartı eski düzende: "Ne işe yarar?" ve "Günlük hayatta" var; Amaç, Teorik bilgi, Adımlar yok',
      extraText.includes('Ne işe yarar?') && extraText.includes('Günlük hayatta') && !extraText.includes('Amaç') && (await extraRegion.getByRole('button', { name: 'Teorik bilgi' }).count()) === 0 && !extraText.includes('Simülasyonda:'),
      extraText.slice(0, 60));
    // Dar pencerede 2 sütun.
    await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(300);
    await openDialog();
    const narrowCols = await dlg.locator('section[data-section] ul').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    const narrowBox = await dlg.boundingBox();
    check('masaüstü (Örnekler): dar pencerede (1024 px) kartlar 2 sütun, pencere ekrana sığıyor', narrowCols === 2 && narrowBox !== null && narrowBox.width <= 1024 - 40 && narrowBox.height <= 768, `${narrowCols} sütun · ${Math.round(narrowBox?.width ?? 0)}x${Math.round(narrowBox?.height ?? 0)}`);
    await ctx.close();
  }

  // --- Örnekler penceresi (telefon): iki adımlı gezinme ------------------------------------------------------
  {
    const { page } = await phone();
    const openList = async () => { await phoneExamples(page); await page.waitForTimeout(100); };
    await openList();
    const dlg = page.getByRole('dialog', { name: 'Örnekler' });
    const title = async () => ((await dlg.locator('h2').textContent()) ?? '').trim();
    const headCount = async () => Number(((await dlg.locator('div.h-14 > span.font-mono').textContent()) ?? '').trim());
    const groups = dlg.locator('button[data-group]');
    const search = dlg.getByRole('searchbox', { name: 'Örnek ara' });
    /** Penceredeki bütün düğme ve bağlantıların en küçük yüksekliği. */
    const minTarget = () => dlg.locator('button, a').evaluateAll((els) => Math.min(...els.filter((e) => e.getClientRects().length > 0).map((e) => Math.round(e.getBoundingClientRect().height))));
    // 1. Ana ekran.
    const closeBtn = await dlg.getByRole('button', { name: 'Örnekler penceresini kapat' }).boundingBox();
    const searchH = Math.round((await dlg.locator('label').boundingBox())?.height ?? 0);
    const folderBox = dlg.getByRole('region', { name: 'Akdeniz Üniversitesi' });
    const folderText = (await folderBox.locator(':scope > div').first().textContent()) ?? '';
    const logoW = Math.round((await folderBox.locator('img').boundingBox())?.width ?? 0);
    const folderRadius = await folderBox.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    const rowHeights = await groups.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
    const rowLabels = await groups.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? ''));
    const firstRow = groups.first();
    const firstRowText = (await firstRow.textContent()) ?? '';
    const chevrons = await groups.evaluateAll((bs) => bs.every((b) => b.querySelector('svg') !== null));
    const folderRows = await folderBox.locator('button[data-group]').count();
    const generalRows = await dlg.getByRole('region', { name: 'Genel' }).locator('button[data-group]').count();
    const homeTotal = await headCount();
    const activeRows = await dlg.getByRole('button', { name: /^Açık örneğin grubuna git:/ }).count();
    check('telefon (Örnekler): ana ekran: başlıkta Kapat (44 px), "Örnekler", toplam sayı; 48 px arama; yuvarlak köşeli Akdeniz kutusu (40 px logo, "Akdeniz Üniversitesi", "Fizik · Elektronik Lab föyü · 31 devre") ve 11 grup satırı; "Genel" ve genel gruplar; satırlar ≥ 48 px (numara, kısa ad, sayı, ok); açık örnek yokken açık satırı yok',
      Math.round(closeBtn?.height ?? 0) === 44 && Math.round(closeBtn?.width ?? 0) === 44 && (await title()) === 'Örnekler' && homeTotal === rowLabels.reduce((n, l) => n + Number(l.match(/, (\d+) devre$/)?.[1] ?? 0), 0) && searchH === 48 &&
        logoW === 40 && folderText.includes('Akdeniz Üniversitesi') && folderText.includes('Fizik · Elektronik Lab föyü · 31 devre') && folderRadius === '16px' &&
        folderRows === 11 && generalRows >= 6 && rowHeights.every((h) => h >= 48) && chevrons && firstRowText.startsWith('1Diyot karakteristikleri') &&
        rowLabels[0].startsWith('Diyot karakteristikleri,') && activeRows === 0,
      `kapat ${Math.round(closeBtn?.height ?? 0)} · arama ${searchH} · logo ${logoW} · ${folderRadius} · ${folderRows}+${generalRows} satır · en kısa ${Math.min(...rowHeights)} · toplam ${homeTotal}`);
    // 2. Grup ekranı.
    await dlg.getByRole('button', { name: /^Kırpıcılar,/ }).tap(); await page.waitForTimeout(500);
    const back = dlg.getByRole('button', { name: 'Gruplara dön' });
    const backBox = await back.boundingBox();
    const overline = (await dlg.locator('div.h-14 p').textContent().catch(() => '')) ?? '';
    const groupTitle = await title();
    const headingFocused = await dlg.locator('h2').evaluate((el) => document.activeElement === el);
    const listText = (await dlg.locator('.overflow-y-auto').textContent()) ?? '';
    const cards = dlg.locator('li');
    const cardBoxes = await cards.evaluateAll((ls) => ls.map((l) => { const r = l.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)]; }));
    const groupCount = await headCount();
    const searchHidden = (await search.count()) === 0;
    const first = cards.first();
    const fBox = await first.boundingBox();
    const chipBox = await first.locator('span.font-mono').first().boundingBox();
    const previewH = Math.round((await first.locator('[data-preview]').boundingBox())?.height ?? 0);
    const boardH = Math.round((await first.getByRole('button', { name: /: tahtada kur$/ }).boundingBox())?.height ?? 0);
    const groupMin = await minTarget();
    const buttonsPerCard = await cards.evaluateAll((ls) => ls.map((l) => l.querySelectorAll('button').length));
    check('telefon (Örnekler): gruba dokununca grup ekranı: geri oku (44 px), üst yazı DENEY 4, föydeki ad, sağda sayı, odak başlıkta; amaç cümlesi; kartlar tek sütun (112 px şema, sağ üstte Şekil çipi, 44 px "Tahtada kur"); kart başına iki düğme (aç, Tahtada kur); bütün hedefler ≥ 44 px',
      Math.round(backBox?.height ?? 0) === 44 && overline === 'DENEY 4' && groupTitle === 'Kırpıcı devreler' && headingFocused && searchHidden &&
        listText.includes('Kırpıcı') && groupCount === cardBoxes.length && cardBoxes.length === 4 && cardBoxes.every(([x, w]) => x === cardBoxes[0][0] && w === cardBoxes[0][1]) &&
        previewH === 112 && chipBox !== null && fBox !== null && chipBox.y - fBox.y <= 12 && fBox.x + fBox.width - (chipBox.x + chipBox.width) <= 12 && boardH === 44 &&
        buttonsPerCard.every((n) => n === 2) && groupMin >= 44,
      `${overline} · ${groupTitle} · odak ${headingFocused} · ${cardBoxes.length} kart · şema ${previewH} · tahta ${boardH} · en küçük hedef ${groupMin}`);
    const aim = (await dlg.locator('.overflow-y-auto > p').first().textContent().catch(() => '')) ?? '';
    check('telefon (Örnekler): grup ekranında başlığın altında föyün amaç cümlesi', aim.length > 20 && aim.endsWith('.'), aim.slice(0, 60));
    await shot(page, 'ios-ornekler-telefon-grup.png');
    // 3. Geri: ana ekran, odak grubun satırında.
    await back.tap(); await page.waitForTimeout(400);
    const backFocus = (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '';
    check('telefon (Örnekler): geri oku ana ekrana döndürüyor, odak grubun satırında', (await title()) === 'Örnekler' && backFocus.startsWith('Kırpıcılar,'), backFocus);
    const homeMin = await minTarget();
    check('telefon (Örnekler): ana ekranda bütün hedefler ≥ 44 px', homeMin >= 44, `${homeMin} px`);
    // 4. Arama her şeyi arar; sonuçlar grup başlıklarıyla.
    await search.fill('555'); await page.waitForTimeout(400);
    const resultLine = (await dlg.locator('.overflow-y-auto > p').first().textContent()) ?? '';
    const resultCards = await dlg.locator('li').count();
    const resultHeads = await dlg.locator('section h3').allTextContents();
    const searchCount = await headCount();
    check('telefon (Örnekler): ana ekrandaki arama ("555") sonuçları grup başlıklarıyla kart listesi olarak gösteriyor; başlıktaki sayı eşleşme sayısı',
      resultLine === `“555” için ${resultCards} sonuç` && resultCards >= 3 && resultHeads.length >= 1 && searchCount === resultCards && (await groups.count()) === 0,
      `${resultLine} · ${resultHeads.join(' | ')}`);
    await search.fill('kenetleyici'); await page.waitForTimeout(300);
    const deneyHead = await dlg.getByText('DENEY 3', { exact: true }).count();
    const negatif = await dlg.getByRole('button', { name: 'Negatif kenetleyici', exact: true }).count();
    await search.fill('qqqzzz'); await page.waitForTimeout(300);
    const emptyText = (await dlg.locator('.overflow-y-auto').textContent()) ?? '';
    const clear = dlg.getByRole('button', { name: 'Aramayı temizle' });
    const clearH = Math.round((await clear.boundingBox())?.height ?? 0);
    await clear.tap(); await page.waitForTimeout(300);
    check('telefon (Örnekler): klasördeki deney de bulunuyor (kenetleyici → DENEY 3 başlığı altında); boş durumda 44 px "Aramayı temizle" ana ekrana döndürüyor',
      deneyHead === 1 && negatif === 1 && emptyText.includes('Bu aramayla eşleşen devre yok.') && clearH === 44 && (await groups.count()) > 15,
      `${deneyHead} · ${negatif} · ${clearH} px · ${await groups.count()} satır`);
    // 5. Açık örnek: ana ekranın üstünde accent-soft satır; dokununca grubu, kart işaretli.
    await dlg.getByRole('button', { name: /^Doğrultucular,/ }).tap(); await page.waitForTimeout(400);
    await dlg.getByRole('button', { name: 'Köprü tipi tam dalga doğrultmaç', exact: true }).tap(); await page.waitForTimeout(800);
    await openList();
    const activeRow = dlg.getByRole('button', { name: /^Açık örneğin grubuna git:/ });
    const activeText = (await activeRow.textContent().catch(() => '')) ?? '';
    const activeBg = await activeRow.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
    const accentSoft = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'bg-accent-soft'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    const activeFirst = await dlg.locator('.overflow-y-auto > *').first().evaluate((el) => el.getAttribute('aria-label') ?? '');
    await activeRow.tap(); await page.waitForTimeout(500);
    const card = dlg.locator('li[data-active]');
    const cardText = (await card.textContent().catch(() => '')) ?? '';
    const current = await card.getByRole('button', { name: 'Köprü tipi tam dalga doğrultmaç', exact: true }).getAttribute('aria-current').catch(() => null);
    check('telefon (Örnekler): açık örnek varken en üstte accent-soft satır ("Açık · Köprü tipi tam dalga doğrultmaç · Deney 2"); dokununca grubu, kart "Açık" çipli ve aria-current',
      activeText === 'AçıkKöprü tipi tam dalga doğrultmaç · Deney 2' && activeBg === accentSoft && activeFirst.startsWith('Açık örneğin grubuna git:') && (await title()) === 'Doğrultucular' && cardText.includes('Açık') && current === 'true',
      `${activeText} · ${activeBg} · ${await title()} · ${current}`);
    await page.context().close();
  }

  // --- Föy kartı (örnek kartı): Deney N · Şekil-M, amaç, teorik bilgi (katlı), adımlar, föydeki sorular -------
  // Klasörde deney gruplarının başlığının altında tek satırlık amaç. LAB_AIMS: amacı yazılmış deney sayısı.
  {
    const LAB_AIMS = 9;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(300);
    const zener = await pickExample(page, (p) => p.getByRole('button', { name: 'Zener diyot (5,6 V): X-Y’de karakteristik', exact: true }));
    const dlg = page.getByRole('dialog', { name: 'Örnekler' });
    // Deney gruplarının başlığı: üst yazı DENEY N, föydeki ad, altında amaç.
    const aims = await dlg.locator('section[data-section]').evaluateAll((ss) =>
      ss.filter((x) => /^DENEY \d$/.test(x.querySelector('p')?.textContent ?? '')).map((x) => x.querySelector('h3')?.parentElement?.nextElementSibling?.textContent ?? ''));
    const d1Aim = aims[0] ?? '';
    check(`föy kartı (masaüstü): deney gruplarının başlığının altında tek satırlık amaç (${LAB_AIMS} deney); Deney 1 föydeki adıyla`,
      aims.length === LAB_AIMS && d1Aim === 'Diyodun akımının gerilimle nasıl değiştiğini (I-V eğrisini) ölçüp incelemek.', `${aims.length} · ${d1Aim}`);
    await zener.click(); await page.waitForTimeout(500);
    const region = notebook(page).getByRole('region', { name: 'Örnek · Deney 1 · Şekil-3' });
    const labelled = (await region.count()) === 1;
    await region.getByRole('button').first().click(); await page.waitForTimeout(300);
    const text = (await region.textContent()) ?? '';
    const theory = region.getByRole('button', { name: 'Teorik bilgi' });
    const theoryClosed = (await theory.getAttribute('aria-expanded')) === 'false' && !text.includes('kT / q');
    await theory.click(); await page.waitForTimeout(200);
    const theoryOpen = (await theory.getAttribute('aria-expanded')) === 'true' && ((await region.textContent()) ?? '').includes('kT / q');
    const steps = region.getByRole('region', { name: 'Adımlar ve sorular' });
    const stepText = (await steps.textContent()) ?? '';
    const rows = await labRows(steps);
    const before = await steps.locator('div[id]').count();
    await steps.getByRole('button', { name: 'Cevabı göster' }).click(); await page.waitForTimeout(200);
    const answer = (await steps.locator('div[id]').first().textContent()) ?? '';
    const order = ['Amaç', 'Teorik bilgi', 'Adımlar ve sorular', 'Günlük hayatta'].map((t) => text.indexOf(t));
    check('föy kartı (masaüstü): zenerin kartı "Örnek · Deney 1 · Şekil-3"; sırayla Amaç, Teorik bilgi, Adımlar ve sorular, Günlük hayatta; ayrı "Föydeki sorular" ve "Ne işe yarar?" yok',
      labelled && order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])) && !text.includes('Föydeki sorular') && !text.includes('Ne işe yarar?'), `${labelled} · ${order.join(',')}`);
    check('föy kartı (masaüstü): Teorik bilgi kapalı başlıyor, tıklayınca açılıyor (formüller)', theoryClosed && theoryOpen, `${theoryClosed} · ${theoryOpen}`);
    check('föy kartı (masaüstü): 3. adımda föydeki metin, altında "Simülasyonda:" ve adımın içinde kapalı "Cevabı göster"; tıklayınca cevap açılıyor (5 V genliğin neden kırmadığı)',
      rows === '3+' && stepText.includes('Simülasyonda:') && stepText.includes('zener olayını gözleyiniz') && before === 0 && answer.includes('5 V genlik bu zeneri kırmaya yetmez') && answer.includes('4,87 V'),
      `${rows} · ${before} · ${answer.slice(0, 40)}`);
    // Deney 6'nın 4. sorusunun cevabı ek örneği (kuplajlı JFET yükselteç) açıyor.
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(300);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'BF245A ile ortak kaynaklı yükselteç (kazanç 10)', exact: true }))).click(); await page.waitForTimeout(500);
    const fetCard = notebook(page).getByRole('region', { name: 'Örnek · Deney 6 · Şekil-17' });
    await fetCard.getByRole('button').first().click(); await page.waitForTimeout(300);
    const fetQa = fetCard.getByRole('region', { name: 'Adımlar ve sorular' });
    const fetRows = await labRows(fetQa);
    await fetQa.getByRole('button', { name: 'Cevabı göster' }).last().click(); await page.waitForTimeout(200);
    const link = fetQa.getByRole('button', { name: /^Örneği aç: / });
    const linkText = (await link.textContent()) ?? '';
    await link.click(); await page.waitForTimeout(700);
    const opened = (await notebook(page).getByRole('region', { name: /^Örnek ·/ }).textContent()) ?? '';
    check('föy kartı (masaüstü): Deney 6’da adımlar 1, 2, 2a, 2b, 3, 4 (2a ve 2b ayrı satır; 2’nin sorusu yok); 4. adımın cevabındaki "Örneği aç" kuplajlı ek devreyi açıyor (kartı eski düzende, "Föyde yok · ek")',
      fetRows === '1+|2-|2a+|2b+|3+|4+' && linkText.includes('kuplajlı') && opened.includes('Föyde yok · ek') && (await page.title()).length > 0 &&
        (await notebook(page).getByRole('region', { name: 'Örnek · Deney 6 · FET yükselteci' }).count()) === 1,
      `${fetRows} · ${linkText.slice(0, 40)} · ${opened.slice(0, 50)}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    // Deney grubunun ekranında başlığın altında amaç.
    await phoneExamples(page);
    const dlg = page.getByRole('dialog', { name: 'Örnekler' });
    await dlg.getByRole('button', { name: /^Diyot karakteristikleri,/ }).tap(); await page.waitForTimeout(500);
    const row = (await dlg.textContent()) ?? '';
    check('föy kartı (telefon): Deney 1 grubunun ekranında başlığın altında amaç', row.includes('Diyodun akımının gerilimle nasıl değiştiğini (I-V eğrisini) ölçüp incelemek.'), row.slice(0, 80));
    await dlg.getByRole('button', { name: '1N4001: X-Y’de akım-gerilim eğrisi', exact: true }).tap(); await page.waitForTimeout(600);
    const card = phoneNotebook(page).getByRole('region', { name: 'Örnek · Deney 1 · Şekil-3' });
    const labelled = (await card.count()) === 1;
    await card.getByRole('button').first().tap(); await page.waitForTimeout(300);
    const theory = card.getByRole('button', { name: 'Teorik bilgi' });
    await theory.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const theoryBox = await theory.boundingBox();
    const theoryClosed = (await theory.getAttribute('aria-expanded')) === 'false';
    await theory.tap(); await page.waitForTimeout(200);
    const theoryOpen = (await theory.getAttribute('aria-expanded')) === 'true' && ((await card.textContent()) ?? '').includes('kT / q');
    const qa = card.getByRole('region', { name: 'Adımlar ve sorular' });
    const rows = await labRows(qa);
    const sims = await qa.getByText('Simülasyonda:').count();
    const button = qa.getByRole('button', { name: 'Cevabı göster' }).first();
    await button.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const box = await button.boundingBox();
    const closed = await qa.locator('div[id]').count();
    await button.tap(); await page.waitForTimeout(200);
    const answer = (await qa.locator('div[id]').first().textContent()) ?? '';
    const text = (await card.textContent()) ?? '';
    check('föy kartı (telefon): 1N4001 X-Y kartı "Örnek · Deney 1 · Şekil-3"; Amaç, Adımlar ve sorular, Günlük hayatta var, ayrı "Föydeki sorular" yok; adımlar 2a, 2b, 2c, her birinde "Simülasyonda:" ve cevap düğmesi',
      labelled && text.includes('Amaç') && text.includes('Adımlar ve sorular') && text.includes('Günlük hayatta') && !text.includes('Föydeki sorular') && rows === '2a+|2b+|2c+' && sims === 3, `${labelled} · ${rows} · ${sims}`);
    check('föy kartı (telefon): Teorik bilgi en az 44 px, kapalı başlıyor ve dokununca açılıyor; "Cevabı göster" en az 44 px, cevap kapalı başlıyor ve açılıyor (≈ 4,23 mA); sayfa kaymıyor',
      theoryBox !== null && theoryBox.height >= 44 && theoryClosed && theoryOpen && box !== null && box.height >= 44 && closed === 0 && answer.includes('4,23 mA') && !(await pageScrolls(page)),
      `${Math.round(theoryBox?.height ?? 0)} px · ${theoryClosed}/${theoryOpen} · ${Math.round(box?.height ?? 0)} px · ${answer.slice(0, 30)}`);
    await page.context().close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'IRF510 ile ortak kaynaklı yükselteç');
    const card = phoneNotebook(page).getByRole('region', { name: 'Örnek · Deney 8 · Şekil-21' });
    const labelled = (await card.count()) === 1;
    await card.getByRole('button').first().tap(); await page.waitForTimeout(300);
    const theory = card.getByRole('button', { name: 'Teorik bilgi' });
    await theory.scrollIntoViewIfNeeded(); await theory.tap(); await page.waitForTimeout(200);
    const theoryText = (await card.textContent()) ?? '';
    const legs = await card.locator('ol.grid > li').allTextContents();
    const qa = card.getByRole('region', { name: 'Adımlar ve sorular' });
    const steps = await labRows(qa);
    const button = qa.getByRole('button', { name: 'Cevabı göster' }).first();
    await button.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const box = await button.boundingBox();
    await button.tap(); await page.waitForTimeout(200);
    const answer = (await qa.locator('div[id]').first().textContent()) ?? '';
    check('föy kartı (telefon): MOSFET kartı "Örnek · Deney 8 · Şekil-21"; Teorik bilgide föydeki (8)–(10) ve IRF510’un bacak bağlantısı (1 kapı, 2 drain, 3 source)',
      labelled && theoryText.includes('(9)') && theoryText.includes('IRF510: bacak bağlantısı (föydeki Şekil-22)') && legs.join('|') === '1. bacakKapı (G)|2. bacakDrain (D)|3. bacakSource (S)',
      `${labelled} · ${legs.join('|')}`);
    check('föy kartı (telefon): Deney 8’de adımlar 1–5, soruları olan 3., 4., 5. adımda cevap düğmesi; "Cevabı göster" en az 44 px; 3. adımın cevabında küçük işaret kazancı ≈ 172 ve kaymanın hassasiyeti; sayfa kaymıyor',
      steps === '1-|2-|3+|4+|5+' && box !== null && box.height >= 44 && answer.includes('≈ 172') && answer.includes('0,19 V') && !(await pageScrolls(page)),
      `${steps} · ${Math.round(box?.height ?? 0)} px · ${answer.slice(0, 40)}`);
    await page.context().close();
  }

  // --- Parça ekle sayfası: daha açık başlar, başlıktan çekilerek tam boy olur, aşağı çekince kapanır --
  {
    const { page, cdp } = await phone();
    const examples = page.getByRole('button', { name: 'Örneklerden başla' });
    const before = await examples.boundingBox();
    // v4: şemadaki "Kablo bağla" düğmesi yok; alttaki çubuğun Kablo düğmesi boş devrede pasif.
    const wireButton = phoneBar(page).getByRole('button', { name: 'Kablo', exact: true });
    check('boş devrede alttaki çubuğun Kablo düğmesi pasif (bağlanacak uç yok); şemada "Kablo bağla" yok',
      (await wireButton.isDisabled()) && (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 0);
    const addButton = phoneBar(page).getByRole('button', { name: 'Parça', exact: true });
    await addButton.tap(); await page.waitForTimeout(500);
    const sheet = page.getByRole('dialog', { name: 'Parça ekle' });
    const half = await sheet.boundingBox();
    const after = await examples.boundingBox();
    check('boş tuvalde "Örneklerden başla" parça sayfası açılınca yerinde ve aynı boyda kalıyor', before !== null && after !== null && Math.abs(before.y - after.y) < 1 && Math.abs(before.height - after.height) < 1, `${Math.round(before?.y ?? 0)} → ${Math.round(after?.y ?? 0)} px`);
    check('Parça ekle sayfası pencerenin ≈ %60’ı kadar açılıyor', half !== null && half.height > 844 * 0.55 && half.height < 844 * 0.65, `${Math.round(half?.height ?? 0)} px`);
    const chips = sheet.getByRole('tablist');
    const hidden = await chips.evaluate((el) => getComputedStyle(el).scrollbarWidth === 'none');
    check('kategori çiplerinin kaydırma çubuğu gizli (düğmelerle çakışmıyor)', hidden);
    const title = await sheet.getByRole('heading', { name: 'Parça ekle' }).boundingBox();
    await drag(page, cdp, { x: title.x + 20, y: title.y + title.height / 2 }, { x: title.x + 20, y: title.y - 250 });
    await page.waitForTimeout(400);
    const full = await sheet.boundingBox();
    const canvas = await page.locator('svg.schematic').boundingBox();
    check('tam boy sayfada boş tuval ipucu gizli (şerit sıkışmıyor)', !(await examples.isVisible()));
    check('başlıktan yukarı çekince sayfa tam boy; üstte devre şeridi kalıyor, sayfa ona binmiyor', full !== null && half !== null && full.height > half.height + 60 && canvas !== null && canvas.height >= 100 && canvas.y + canvas.height <= full.y + 1, `${Math.round(full?.height ?? 0)} px, tuval ${Math.round(canvas?.height ?? 0)} px`);
    const handle = await sheet.getByRole('button', { name: /^Sayfanın boyunu değiştir/ }).boundingBox();
    await drag(page, cdp, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + handle.width / 2, y: handle.y + 420 });
    await page.waitForTimeout(300);
    check('tutamaçtan aşağı çekince sayfa kapanıyor; alttaki çubuğun Parça düğmesi yine kapalı (aria-expanded=false)', (await sheet.count()) === 0 && (await addButton.getAttribute('aria-expanded')) === 'false');
    await page.context().close();
  }

  // --- Kur kipi: seç, taşı, menü, kaydır, kablo bağlama (DP2), değer, yakınlaştırma ------------
  {
    const { page, cdp } = await phone();
    await addPart(page, 'Direnç');
    await page.getByRole('dialog', { name: 'Parça ekle' }).getByRole('button', { name: 'Kapat', exact: true }).tap(); await page.waitForTimeout(400);
    const r1 = await part(page, 'R1');
    check('dokunarak parça eklendi', Boolean(r1));
    // Şema tam ekran: defter gizlenir, tuval bütün alanı alır.
    await page.getByRole('button', { name: 'Şemayı tam ekran aç' }).tap(); await page.waitForTimeout(400);
    const fullBox = await page.locator('main').boundingBox();
    check('telefon (v3): şemanın tam ekran düğmesi defteri gizleyip tuvali büyütüyor', (await phoneNotebook(page).count()) === 0 && fullBox !== null && fullBox.height > 700, `${Math.round(fullBox?.height ?? 0)} px`);
    const area = await page.locator('svg.schematic').boundingBox();
    // Boş nokta: sol üstte Şema | 3B düğmesinin altında.
    const empty = { x: area.x + 40, y: area.y + 120 };
    let s = await screen(page, r1.x, r1.y);
    await tap(page, cdp, empty); // boşluk: seçimi kaldır
    await tap(page, cdp, s);
    check('parçaya dokununca seçiliyor', (await selectedCount(page)) > 0);
    s = await screen(page, r1.x, r1.y);
    const v0 = await screen(page, 0, 0);
    await drag(page, cdp, s, { x: s.x + 50, y: s.y + 30 }, 20);
    const r1b = await part(page, 'R1');
    const v1 = await screen(page, 0, 0);
    check('parçanın üstünde hızlı kaydırma tuvali kaydırıyor, parça yerinde kalıyor', r1b.x === r1.x && r1b.y === r1.y && Math.abs(v1.x - v0.x - 50) < 3, `görünüm ${Math.round(v1.x - v0.x)} px`);
    s = await screen(page, r1b.x, r1b.y);
    await drag(page, cdp, s, { x: s.x + 60, y: s.y - 50 }, 250);
    const r1c = await part(page, 'R1');
    check('150 ms basılı tutunca parça sürüklenerek taşınıyor', r1c.x !== r1b.x || r1c.y !== r1b.y, `(${r1b.x},${r1b.y}) → (${r1c.x},${r1c.y})`);
    s = await screen(page, r1c.x, r1c.y);
    await drag(page, cdp, s, { x: s.x - 70, y: s.y + 30 }, 750);
    const r1d = await part(page, 'R1');
    const menuOpen = await page.getByRole('menu').count();
    check('basılı tutup sürükleyince parça yine taşınıyor ve menü kapanıyor', (r1d.x !== r1c.x || r1d.y !== r1c.y) && menuOpen === 0, `(${r1c.x},${r1c.y}) → (${r1d.x},${r1d.y}), menü ${menuOpen}`);
    s = await screen(page, r1d.x, r1d.y);
    await tap(page, cdp, s, 750);
    const magnifier = await page.locator('use[href^="#scene-"]').count();
    check('kıpırdamadan uzun basınca menü ve büyüteç açılıyor', (await page.getByRole('menu').count()) === 1 && magnifier === 1);
    await shot(page, 'ios-3-menu.png');
    const hitEmpty = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class') ?? '', [empty.x, empty.y]);
    await tap(page, cdp, empty);
    const selected = await selectedCount(page);
    check('boşluğa dokununca menü, büyüteç ve seçim kalkıyor', (await page.getByRole('menu').count()) === 0 && selected === 0 && (await page.locator('use[href^="#scene-"]').count()) === 0, `seçim çerçevesi ${selected}; dokunulan ${hitEmpty}`);
    const viewBefore = await screen(page, 0, 0);
    await drag(page, cdp, empty, { x: empty.x + 50, y: empty.y + 70 });
    const viewAfter = await screen(page, 0, 0);
    check('boşlukta tek parmakla tuval kaydırılıyor', Math.abs(viewAfter.x - viewBefore.x - 50) < 2 && Math.abs(viewAfter.y - viewBefore.y - 70) < 2);
    // Uca dokununca tam ekran kablo bağlama (DP2); ikinci uca dokununca kablo; Bitti ile Kur'a dönüş.
    await tap(page, cdp, await screen(page, r1d.x - 4, r1d.y)); await page.waitForTimeout(400);
    const wiringStatus = (await page.getByRole('status').filter({ hasText: 'seçildi' }).textContent().catch(() => '')) ?? '';
    const clear = page.getByRole('button', { name: 'Seçimi bırak' });
    check('uca dokununca tam ekran kablo bağlama açılıyor (Bitti, adım 2: "R1’in 1. ucu seçildi", Seçimi bırak)', (await mode(page)) === 'Kablo bağla' && wiringStatus.includes('2') && wiringStatus.includes('R1’in 1. ucu seçildi') && (await clear.isEnabled()), wiringStatus.slice(0, 50));
    await shot(page, 'ios-4-bagla.png');
    await tap(page, cdp, await screen(page, r1d.x + 4, r1d.y)); await page.waitForTimeout(300);
    const wired = await doc(page);
    check('ikinci uca dokununca kablo çiziliyor; bağlama 1. adıma dönüyor', wired.wires.length === 1 && !(await clear.isEnabled()), `${wired.wires.length} kablo`);
    await page.getByRole('button', { name: 'Bitti' }).tap(); await page.waitForTimeout(300);
    check('Bitti ile Kur kipine dönülüyor', (await mode(page)).includes('Kur'));
    // v4: telefonda Geri al üst çubukta değil, Daha fazla sayfasının kutularında.
    await phoneMoreTile(page, 'Geri al', { close: true });
    check('Daha fazla sayfasındaki Geri al son kabloyu siliyor (üst çubukta Geri al yok)', (await doc(page)).wires.length === 0 && (await page.locator('header').getByRole('button', { name: 'Geri al' }).count()) === 0);
    // Parmaklar parçanın iki yanında: yakınlaşma o noktanın çevresinde olur, parça ekranda kalır.
    const canvasBox = await page.locator('svg.schematic').boundingBox();
    const c = await screen(page, r1d.x, r1d.y);
    const cx = Math.min(Math.max(c.x, canvasBox.x + 110), canvasBox.x + canvasBox.width - 110);
    const cy = Math.min(Math.max(c.y, canvasBox.y + 160), canvasBox.y + canvasBox.height - 160);
    const scaleBefore = (await screen(page, 0, 0)).scale;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 35, y: cy, id: 1 }, { x: cx + 35, y: cy, id: 2 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 35 - i * 8, y: cy, id: 1 }, { x: cx + 35 + i * 8, y: cy, id: 2 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(200);
    const scaleAfter = (await screen(page, 0, 0)).scale;
    check('iki parmakla yakınlaştırma çalışıyor', scaleAfter > scaleBefore * 1.3, `${scaleBefore.toFixed(2)} → ${scaleAfter.toFixed(2)}`);
    const r1e = await part(page, 'R1');
    s = await screen(page, r1e.x, r1e.y);
    await drag(page, cdp, s, { x: s.x + 80, y: s.y }, 250);
    const r1f = await part(page, 'R1');
    check('yakınlaştırmadan sonra parça yine tek parmakla taşınıyor', r1f.x !== r1e.x, `(${r1e.x},${r1e.y}) → (${r1f.x},${r1f.y})`);
    // Çift dokunuş: kartı açılır, şema şeride küçülür (DP3).
    s = await screen(page, r1f.x, r1f.y);
    await doubleTap(page, cdp, s); await page.waitForTimeout(400);
    const strip = await page.getByRole('button', { name: /^Şemayı aç/ }).boundingBox();
    const field = phoneNotebook(page).getByLabel('Direnç', { exact: true });
    const fontSize = await field.evaluate((el) => getComputedStyle(el).fontSize).catch(() => '');
    check('çift dokunuşla kartı açılıyor, şema 64 px şeride küçülüyor; değer alanı en az 16 px', strip !== null && strip.height >= 63 && strip.height <= 65 && parseFloat(fontSize) >= 16, `şerit ${Math.round(strip?.height ?? 0)} px, ${fontSize}`);
    await phoneNotebook(page).getByRole('button', { name: 'Direnç: artır' }).tap(); await page.waitForTimeout(200);
    check('− / + E12 dizisinde bir adım değiştiriyor (1 kΩ → 1,2 kΩ)', (await part(page, 'R1')).props.resistance === 1200);
    await page.getByRole('button', { name: /^Şemayı aç/ }).tap(); await page.waitForTimeout(300);
    check('şeride dokununca şema kutusu geri geliyor, kart açık kalıyor', (await page.locator('svg.schematic').count()) === 1 && (await phoneNotebook(page).getByRole('region', { name: 'R1 · Direnç' }).count()) === 1);
    await page.context().close();
  }

  // --- Kalabalıkta seçici ve büyüteç -----------------------------------------------------
  {
    const crowded = { version: 1, parts: [
      { id: 'a', type: 'resistor', label: 'R1', x: 0, y: 0, rotation: 0, props: { resistance: 100 } },
      { id: 'b', type: 'resistor', label: 'R2', x: 0, y: 3, rotation: 0, props: { resistance: 200 } },
      { id: 'c', type: 'battery', label: 'B1', x: -40, y: 20, rotation: 0, props: { voltage: 9, internalResistance: 0 } },
      { id: 'd', type: 'resistor', label: 'R3', x: 40, y: -20, rotation: 0, props: { resistance: 200 } },
    ], wires: [] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } }, JSON.stringify(crowded));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const cdp = await ctx.newCDPSession(page);
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await tap(page, cdp, await screen(page, 0, 1.5));
    const picker = page.getByRole('listbox', { name: /^Burada \d öğe var/ });
    const options = await picker.getByRole('option').count();
    check('kalabalık noktaya dokununca "Burada N öğe var" seçicisi ve büyüteç çıkıyor', options >= 2 && (await page.locator('use[href^="#scene-"]').count()) === 1, `${options} seçenek`);
    await picker.getByRole('option', { name: /^R2 Direnç/ }).tap(); await page.waitForTimeout(300);
    check('seçiciden parça seçiliyor; kartı defterde açılıyor', (await phoneNotebook(page).getByRole('region', { name: 'R2 · Direnç' }).count()) === 1);
    await ctx.close();
  }

  // --- Telefonda kablo silme: dokun → Kablo kartında Sil; basılı tut → menüde Sil; Ölç'te Sil yok ----------
  {
    const { page, cdp } = await phone();
    await openExample(page, 'RC dolma');
    const before = await doc(page);
    // w4: C1 ile V1 arasındaki üst kablo; w5: alttaki dönüş kablosu (parçalardan uzak noktaları).
    const at = { w4: [38, -8], w5: [16, 8] };
    const wireCard = phoneNotebook(page).getByRole('heading', { name: 'Kablo', exact: true });
    const cardDelete = phoneNotebook(page).getByRole('button', { name: 'Sil', exact: true });
    await tap(page, cdp, await screen(page, ...at.w4)); await page.waitForTimeout(300);
    const shownCard = (await wireCard.count()) === 1;
    const box = await cardDelete.boundingBox({ timeout: 3000 }).catch(() => null);
    if (box) await cardDelete.tap();
    const afterCard = await doc(page);
    const toast = page.getByRole('status').filter({ hasText: 'silindi' });
    const toastText = (await toast.textContent().catch(() => '')) ?? '';
    const toastUndo = toast.getByRole('button', { name: 'Geri al' });
    check('telefon: kabloya dokununca Kablo kartında Sil var (en az 44 px); basınca kablo siliniyor, "silindi · Geri al" bildirimi çıkıyor',
      shownCard && box !== null && box.width >= 44 && box.height >= 44 && afterCard.wires.length === before.wires.length - 1 && !afterCard.wires.some((w) => w.id === 'w4') && (await toastUndo.count()) === 1,
      `${before.wires.length} → ${afterCard.wires.length} kablo · Sil ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)} px · ${toastText}`);
    if ((await toastUndo.count()) === 1) await toastUndo.tap();
    check('telefon: bildirimdeki Geri al silinen kabloyu geri getiriyor', afterCard.wires.length === before.wires.length - 1 && (await doc(page)).wires.length === before.wires.length);
    await tap(page, cdp, await screen(page, ...at.w5), 750);
    const menu = page.getByRole('menu', { name: 'Kablo menüsü' });
    const items = await menu.getByRole('menuitem').allTextContents();
    const wireShortcuts = await menu.locator('[role=menuitem] > span:nth-child(2)').count();
    const magnifier = await page.locator('use[href^="#scene-"]').count();
    await shot(page, 'ios-kablo-menu.png');
    if (items.length > 0) await menu.getByRole('menuitem', { name: /^Sil/ }).tap();
    const afterMenu = await doc(page);
    check('telefon: Kur’da kabloyu basılı tutunca menü ve büyüteç açılıyor, içinde Sil; basınca kablo siliniyor, bildirim çıkıyor',
      items.length === 1 && items[0].startsWith('Sil') && magnifier === 1 && afterMenu.wires.length === before.wires.length - 1 && !afterMenu.wires.some((w) => w.id === 'w5') && (await page.getByRole('status').filter({ hasText: 'silindi' }).count()) === 1,
      `menü: ${items.join('|')} · büyüteç ${magnifier} · ${before.wires.length} → ${afterMenu.wires.length} kablo`);
    const menuToast = (await page.getByRole('status').filter({ hasText: 'silindi' }).textContent().catch(() => '')) ?? '';
    check('telefon: tek kablo silinince bildirim "Kablo silindi." (karttan da menüden de)', toastText.startsWith('Kablo silindi.') && menuToast.startsWith('Kablo silindi.'), `${toastText} · ${menuToast}`);
    // Parçanın basılı tutma menüsündeki Sil de bildirimli (deleteSelection); bildirimin Geri al'ı parçayı geri getirir.
    const r1 = before.parts.find((x) => x.label === 'R1');
    await tap(page, cdp, await screen(page, r1.x, r1.y), 750);
    const partMenu = page.getByRole('menu', { name: 'R1 menüsü' });
    const partItems = await partMenu.getByRole('menuitem').allTextContents();
    const partShortcuts = await partMenu.locator('[role=menuitem] > span:nth-child(2)').count();
    if (partItems.length > 0) await partMenu.getByRole('menuitem', { name: /^Sil/ }).tap();
    const afterPart = await doc(page);
    const partUndo = page.getByRole('status').filter({ hasText: 'R1 silindi.' }).getByRole('button', { name: 'Geri al' });
    const partToast = (await partUndo.count()) === 1;
    if (partToast) await partUndo.tap();
    const restored = await doc(page);
    check('telefon: parçanın basılı tutma menüsündeki Sil de "R1 silindi. · Geri al" bildirimini çıkarıyor; Geri al parçayı geri getiriyor',
      afterPart.parts.length === before.parts.length - 1 && partToast && restored.parts.length === before.parts.length,
      `menü: ${partItems.join('|')} · ${before.parts.length} → ${afterPart.parts.length} → ${restored.parts.length} parça · bildirim ${partToast}`);
    check('telefon: bağlam menülerinde (kablo ve parça) klavye kısayolu yazısı yok (Delete, R)',
      wireShortcuts === 0 && partShortcuts === 0 && items.join('|') === 'Sil' && partItems.join('|') === 'Değer|Döndür|Sil', `kablo: ${items.join('|')} · R1: ${partItems.join('|')}`);
    // Ölç kipinde yapı kilitli: kablonun kartında da (parça kartındaki gibi) Sil yok.
    await phoneMoreTile(page, 'Geri al', { close: true });
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(600);
    await tap(page, cdp, await screen(page, ...at.w4)); await page.waitForTimeout(300);
    check('telefon: Ölç’te Kablo kartında Sil yok (parça kartındaki gibi)',
      (await doc(page)).wires.length === before.wires.length && (await mode(page)).includes('Çalışıyor') && (await wireCard.count()) === 1 && (await cardDelete.count()) === 0, await mode(page));
    await tap(page, cdp, await screen(page, ...at.w4), 750);
    const ask = page.getByRole('alertdialog', { name: 'Düzenlemek için durdurulsun mu?' });
    check('telefon: Ölç’te kabloyu basılı tutunca parçadaki gibi "Düzenlemek için durdurulsun mu?" soruluyor; menü açılmıyor',
      (await ask.count()) === 1 && (await page.getByRole('menu').count()) === 0);
    await page.context().close();
  }

  // --- Bağlam menüsü (masaüstü): sağ tık menüsünün Sil'i bildirimli (Geri al) ---------------------
  {
    const one = { version: 1, parts: [{ id: 'a', type: 'resistor', label: 'R1', x: 0, y: 0, rotation: 0, props: { resistance: 100 } }], wires: [] };
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } }, JSON.stringify(one));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const pt = await screen(page, 0, 0);
    await page.mouse.click(pt.x, pt.y, { button: 'right' }); await page.waitForTimeout(300);
    const menu = page.getByRole('menu', { name: 'R1 menüsü' });
    const items = await menu.getByRole('menuitem').allTextContents();
    const shortcuts = await menu.locator('[role=menuitem] > span:nth-child(2)').allTextContents();
    check('masaüstü: sağ tık menüsünde klavye kısayolları yazılı (Döndür R, Sil Delete)', shortcuts.join('|') === 'R|Delete', shortcuts.join('|'));
    if (items.length > 0) await menu.getByRole('menuitem', { name: /^Sil/ }).click();
    const after = await doc(page);
    const undo = page.getByRole('status').filter({ hasText: 'R1 silindi.' }).getByRole('button', { name: 'Geri al' });
    const toast = (await undo.count()) === 1;
    if (toast) await undo.click();
    check('masaüstü: sağ tık menüsünün Sil’i "R1 silindi. · Geri al" bildirimini çıkarıyor; Geri al parçayı geri getiriyor',
      after.parts.length === 0 && toast && (await doc(page)).parts.length === 1, `menü: ${items.join('|')} · bildirim ${toast}`);
    await ctx.close();
  }

  // --- Klavyeyle silme (masaüstü): Delete / Backspace deleteSelection'dan (bildirim, Geri al, takılı ampermetre) --
  {
    const devre = readFileSync(new URL('../src/examples/rc-dolma.json', import.meta.url), 'utf8');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } }, devre);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const before = await doc(page);
    const toastText = async () => (await page.getByRole('status').filter({ hasText: 'silindi' }).textContent().catch(() => '')) ?? '';
    const undoToast = async () => {
      const b = page.getByRole('status').filter({ hasText: 'silindi' }).getByRole('button', { name: 'Geri al' });
      if ((await b.count()) === 1) await b.click();
      await page.waitForTimeout(200);
    };
    // Tek kablo (C1 ile V1 arasındaki üst kablo) → Delete.
    let pt = await screen(page, 38, -8); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    const wireGone = await doc(page);
    const wireToast = await toastText();
    await undoToast();
    const wireBack = (await doc(page)).wires.length === before.wires.length;
    // Tek parça → Delete; iki parça (Shift) → Backspace.
    const r1 = before.parts.find((x) => x.label === 'R1');
    const c1 = before.parts.find((x) => x.label === 'C1');
    pt = await screen(page, r1.x, r1.y); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    const partGone = await doc(page);
    const partToast = await toastText();
    await undoToast();
    pt = await screen(page, r1.x, r1.y); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(200);
    pt = await screen(page, c1.x, c1.y); await page.keyboard.down('Shift'); await page.mouse.click(pt.x, pt.y); await page.keyboard.up('Shift'); await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    const twoGone = await doc(page);
    const twoToast = await toastText();
    await undoToast();
    const all = await doc(page);
    check('masaüstü: Delete / Backspace bildirimli siliyor ("Kablo silindi.", "R1 silindi.", "2 öğe silindi."); bildirimdeki Geri al geri getiriyor',
      wireGone.wires.length === before.wires.length - 1 && wireToast.startsWith('Kablo silindi.') && wireBack &&
        partGone.parts.length === before.parts.length - 1 && partToast.startsWith('R1 silindi.') &&
        twoGone.parts.length === before.parts.length - 2 && twoToast.startsWith('2 öğe silindi.') &&
        all.parts.length === before.parts.length && all.wires.length === before.wires.length,
      `${wireToast} · ${partToast} · ${twoToast} · ${all.parts.length} parça, ${all.wires.length} kablo`);
    await ctx.close();
  }
  // Takılı ampermetre (arıza görevi, ampermetre açık): defterdeki kapalı kartından seçilip Delete → kartındaki
  // Sil gibi kaldırılır, kablo eski hâline döner.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.goto('about:blank'); await page.goto(faultUrl({ tools: { voltage: true, resistance: true, scope: true, ammeter: true } }), { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const start = await doc(page);
    let pt = await screen(page, 40, -16); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
    await page.getByRole('menuitem', { name: 'Buraya ampermetre tak' }).click(); await page.waitForTimeout(600);
    const plugged = await doc(page);
    const meter = plugged.parts.find((x) => x.type === 'ammeter');
    // Takılınca kartı açık gelir (içinde Sil): seçim kaldırılır, kapalı kartın açma düğmesiyle seçilir.
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const opener = page.locator(`[data-card="${meter?.id}"] > button[aria-expanded="false"]`);
    const closedCard = (await opener.count()) === 1;
    if (closedCard) { await opener.click(); await page.waitForTimeout(400); }
    await page.keyboard.press('Delete'); await page.waitForTimeout(300);
    const removedToast = await page.getByText('Ampermetre kaldırıldı; kablo eski hâline döndü').count();
    const unplugged = await doc(page);
    check('masaüstü: takılı ampermetre seçiliyken Delete onu kartındaki Sil gibi kaldırıyor; kablo eski hâline dönüyor, bildirim çıkıyor',
      meter !== undefined && closedCard && plugged.wires.length !== start.wires.length && !unplugged.parts.some((x) => x.type === 'ammeter') && JSON.stringify(unplugged.wires) === JSON.stringify(start.wires) && removedToast === 1,
      `${meter?.label ?? 'ampermetre yok'} · kapalı kart ${closedCard} · kablo ${start.wires.length} → ${plugged.wires.length} → ${unplugged.wires.length} · bildirim ${removedToast}`);
    await ctx.close();
  }

  // --- Ölç kipi: kilit, kart, anahtar, canlı değer, durdurma sorusu ---------------------------
  {
    const { page, cdp } = await phone();
    await openExample(page, 'RC dolma');
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(600);
    const runningBar = await phoneBarButtons(page);
    check('Oynat’tan sonra durum satırında "Çalışıyor" ve zaman; alttaki çubukta Parça ve Kablo yerine Duraklat, Durdur ve süre; üst çubukta Geri al yok',
      /Çalışıyor · [\d,]+/.test(await mode(page)) && (await page.locator('header').getByRole('button', { name: 'Geri al' }).count()) === 0 && /^Duraklat\|Durdur\|[\d,]+ \S*s: hız$/.test(runningBar),
      `${await mode(page)} · ${runningBar}`);
    const r1 = await part(page, 'R1');
    let s = await screen(page, r1.x, r1.y);
    await tap(page, cdp, s); await page.waitForTimeout(400);
    const card = (await phoneNotebook(page).getByRole('region', { name: 'R1 · Direnç' }).textContent().catch(() => '')) ?? '';
    check('Ölç’te parçaya dokununca kartı açılıyor; canlı ölçümler kartta, döndür ve sil yok', card.includes('Gerilim') && (await phoneNotebook(page).getByRole('button', { name: 'Sil', exact: true }).count()) === 0, card.slice(0, 50));
    await drag(page, cdp, s, { x: s.x + 50, y: s.y + 40 }, 250);
    const r1b = await part(page, 'R1');
    check('Ölç’te parça sürüklenince taşınmıyor (yapı kilitli)', r1b.x === r1.x && r1b.y === r1.y);
    const s1 = await part(page, 'S1');
    await tap(page, cdp, await screen(page, s1.x, s1.y)); await page.waitForTimeout(300);
    check('Ölç’te anahtara dokununca açılıp kapanıyor', (await part(page, 'S1')).props.closed === true);
    await tap(page, cdp, await screen(page, r1.x, r1.y)); await page.waitForTimeout(300);
    await phoneNotebook(page).getByRole('button', { name: 'Direnç: artır' }).tap(); await page.waitForTimeout(300);
    check('Ölç’te − / + değeri canlı değiştiriyor, simülasyon durmuyor', (await part(page, 'R1')).props.resistance === 1200 && (await mode(page)).includes('Çalışıyor'));
    await shot(page, 'ios-5-olc.png');
    s = await screen(page, r1.x, r1.y);
    await tap(page, cdp, s, 750);
    const ask = page.getByRole('alertdialog', { name: 'Düzenlemek için durdurulsun mu?' });
    check('Ölç’te basılı tutunca "Düzenlemek için durdurulsun mu?" soruluyor', (await ask.count()) === 1);
    await ask.getByRole('button', { name: 'Durdur ve düzenle' }).tap(); await page.waitForTimeout(300);
    check('"Durdur ve düzenle" Kur kipine döndürüyor', (await mode(page)).includes('Kur'));
    await page.context().close();
  }

  // --- Telefon (v3): durum satırı menüsü, sorun kartı, şema şeridi ------------------------------
  {
    const { page } = await phone();
    await openExample(page, 'Toprak tuzağı: köprüde prob toprağı');
    const problem = phoneNotebook(page).locator('[data-notebook="problem"]').first();
    const compact = (await problem.textContent()) ?? '';
    await problem.getByRole('button', { name: /Oku$/ }).tap(); await page.waitForTimeout(200);
    check('telefonda sorun kartı tek satır ("Toprak tuzağı: … Oku"); Oku ile açılıyor', compact.startsWith('Toprak tuzağı:') && compact.endsWith('Oku') && (await problem.getByRole('button', { name: 'Kapat' }).count()) === 1, compact.slice(0, 40));
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(500);
    // v4: üst çubuktaki durum düğmesi yok; alttaki çubukta süreye dokununca aynı sayfa.
    await phoneBar(page).getByRole('button', { name: /: hız$/ }).tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('dialog', { name: 'Simülasyon' });
    await sheet.getByRole('radio', { name: /^Yavaş/ }).tap(); await page.waitForTimeout(200);
    const slow = await sheet.getByRole('radio', { name: /^Yavaş/ }).getAttribute('aria-checked');
    check('alttaki çubukta süreye dokununca Simülasyon sayfası: Durdur ve Hız; hız seçiliyor', (await sheet.getByRole('button', { name: /^Durdur/ }).count()) === 1 && slow === 'true');
    await shot(page, 'ios-6-durum.png');
    await sheet.getByRole('button', { name: /^Durdur/ }).tap(); await page.waitForTimeout(400);
    check('Durdur sayfayı kapatıp Kur kipine döndürüyor', (await sheet.count()) === 0 && (await mode(page)).includes('Kur'));
    await phoneNotebook(page).getByRole('button', { name: /^FG1 ·/ }).tap(); await page.waitForTimeout(400);
    const strip = (await page.getByRole('button', { name: /^Şemayı aç/ }).textContent().catch(() => '')) ?? '';
    check('defterden kart açılınca şema şeride küçülüyor ("Şema · 8 parça · 1 uyarı · Aç")', strip.includes('8 parça') && strip.includes('1 uyarı') && (await page.locator('svg.schematic').count()) === 0, strip);
    await phoneNotebook(page).getByRole('region', { name: 'FG1 · Fonksiyon üreteci' }).getByRole('button', { name: 'Kartı küçült' }).tap(); await page.waitForTimeout(300);
    check('kart kapanınca şema kutusu geri geliyor', (await page.locator('svg.schematic').count()) === 1);
    await page.context().close();
  }

  // --- Osiloskop kartı (DP3) -------------------------------------------------------------------
  {
    const { page: sp, cdp: scdp } = await phone();
    await openExample(sp, 'Yarım dalga doğrultmaç');
    await sp.getByRole('button', { name: 'Oynat', exact: true }).tap(); await sp.waitForTimeout(300);
    await phoneNotebook(sp).getByRole('button', { name: /^OSC1 ·/ }).tap(); await sp.waitForTimeout(1200);
    const card = phoneNotebook(sp).getByRole('region', { name: 'OSC1 · Osiloskop' });
    const text = (await card.textContent().catch(() => '')) ?? '';
    const screenBox = await card.getByRole('img', { name: /^Osiloskop ekranı/ }).first().boundingBox();
    check('osiloskop kartında kart genişliğinde ekran ve ölçümler', /Tepe-tepe \d+,\d+ V/.test(text) && screenBox !== null && screenBox.width >= 300, text.slice(0, 50));
    const before = (await part(sp, 'OSC1')).props.voltsPerDivB ?? 5;
    await card.getByRole('button', { name: 'B volt/bölme artır' }).tap(); await sp.waitForTimeout(200);
    const after = (await part(sp, 'OSC1')).props.voltsPerDivB;
    check('karttan ayar değişince parçaya kaydediliyor', after !== before, `${before} → ${after}`);
    const coupling = card.getByRole('button', { name: /^A kuplaj: / });
    const couplingBox = await coupling.boundingBox();
    const c0 = (await part(sp, 'OSC1')).props.couplingA ?? 'dc';
    await coupling.tap(); await sp.waitForTimeout(200);
    const c1 = (await part(sp, 'OSC1')).props.couplingA;
    check('telefonda kanal satırı: adımlayıcı ve dokundukça değişen kuplaj düğmesi (DP3)', c1 !== c0 && couplingBox !== null && couplingBox.height >= 44, `${c0} → ${c1}`);
    await card.getByRole('button', { name: /^Gelişmiş ayarlar/ }).tap(); await sp.waitForTimeout(200);
    await card.getByRole('button', { name: 'Oto', exact: true }).tap(); await sp.waitForTimeout(200);
    const auto = (await part(sp, 'OSC1')).props;
    // Yarım dalga (Şekil-4a): 1 kHz, 3 V genlik (6 V t-t).
    check('Oto ayar 0,5 ms/bölme ve 1 V/bölme seçiyor (1 kHz, 6 V t-t)', auto.timePerDiv === 0.0005 && auto.voltsPerDivA === 1, `${auto.timePerDiv} s, ${auto.voltsPerDivA} V`);
    const list = sp.locator('#defter');
    const box = await list.boundingBox();
    const top0 = await list.evaluate((el) => el.scrollTop);
    await drag(sp, scdp, { x: box.x + 30, y: box.y + box.height - 140 }, { x: box.x + 30, y: box.y + 20 });
    await sp.waitForTimeout(300);
    check('defter kendi içinde kayıyor, sayfa kaymıyor', (await list.evaluate((el) => el.scrollTop)) > top0 && (await sp.evaluate(() => document.scrollingElement.scrollTop)) === 0);
    await shot(sp, 'ios-7-osiloskop.png');
    await sp.waitForTimeout(800);
    const jack = sp.getByRole('button', { name: 'OSC1 A ucunu tuvalde göster' });
    await jack.scrollIntoViewIfNeeded(); await jack.tap(); await sp.waitForTimeout(400);
    check('jaka dokununca şema kutusu açılıyor ve uç tuvalde yanıp sönüyor', (await sp.locator('svg.schematic circle.alarm-blink').count()) > 0);
    await sp.context().close();
  }

  // --- Toprak yok (telefon): toprak isteğe bağlı, sıfır noktasında "0 V" işareti ---------------
  {
    const groundless = { version: 1, parts: [
      { id: 'p1', type: 'battery', label: 'B1', x: 0, y: 0, rotation: 90, props: { voltage: 9, internalResistance: 0 } },
      { id: 'p2', type: 'resistor', label: 'R1', x: 12, y: -6, rotation: 0, props: { resistance: 1000 } },
      { id: 'p3', type: 'resistor', label: 'R2', x: 24, y: 0, rotation: 90, props: { resistance: 2000 } },
    ], wires: [
      { id: 'w1', points: [[0, -4], [0, -6], [8, -6]] },
      { id: 'w2', points: [[16, -6], [24, -6], [24, -4]] },
      { id: 'w3', points: [[24, 4], [24, 6], [0, 6], [0, 4]] },
    ] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } }, JSON.stringify(groundless));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(400);
    const zeroMark = page.getByRole('button', { name: /^Sıfır noktası \(0 V\)/ });
    const zeroBox = await zeroMark.boundingBox();
    check('telefonda toprak yokken simülasyon başlıyor; sıfır noktasında 44 px "0 V" işareti', (await mode(page)).includes('Çalışıyor') && zeroBox !== null && zeroBox.width >= 43.5 && zeroBox.height >= 43.5, await mode(page));
    await zeroMark.tap(); await page.waitForTimeout(200);
    const zeroTip = (await page.getByRole('tooltip').textContent()) ?? '';
    check('telefonda "0 V" işaretine dokununca açıklama çıkıyor', zeroTip.includes('Devrede toprak yok'), zeroTip.slice(0, 40));
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('⋯ sayfası açıkken tuvalin touch-action değeri none değil', touchAction !== 'none', touchAction);
    await ctx.close();
  }

  // --- İki toprak sembolü (telefon): kesikli toprak hattı ve hattaki akım noktaları (Fizik 3) ---
  {
    const twoGround = { version: 1, parts: [
      { id: 'p1', type: 'battery', label: 'B1', x: 0, y: 0, rotation: 90, props: { voltage: 9, internalResistance: 0 } },
      { id: 'p2', type: 'resistor', label: 'R1', x: 12, y: -6, rotation: 0, props: { resistance: 470 } },
      { id: 'p3', type: 'led', label: 'D1', x: 24, y: 0, rotation: 90, props: { color: 'red' } },
      { id: 'p4', type: 'ground', label: 'G1', x: 0, y: 8, rotation: 0, props: {} },
      { id: 'p5', type: 'ground', label: 'G2', x: 24, y: 8, rotation: 0, props: {} },
    ], wires: [
      { id: 'w1', points: [[0, -4], [0, -6], [8, -6]] },
      { id: 'w2', points: [[16, -6], [24, -6], [24, -4]] },
      { id: 'w3', points: [[0, 4], [0, 8]] },
      { id: 'w4', points: [[24, 4], [24, 8]] },
    ] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } }, JSON.stringify(twoGround));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    // Küçük şema kutusunda yakınlık düşük (etiketler gizli): tam ekran şemada bakılır.
    await page.getByRole('button', { name: 'Şemayı tam ekran aç' }).tap(); await page.waitForTimeout(400);
    const before = await page.locator('svg.schematic g.earth-line path').count();
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(800);
    const dots = await page.locator('svg.schematic path[stroke-dasharray^="0 "]').count();
    const label = await page.locator('svg.schematic g.earth-line text', { hasText: 'toprak hattı' }).count();
    check('telefonda iki toprak sembolü arasında kesikli toprak hattı, çalışırken üstünde akım noktaları', before === 1 && label === 1 && dots >= 2 && (await mode(page)).includes('Çalışıyor'), `${before} hat, ${label} etiket, ${dots} nokta yolu`);
    await ctx.close();
  }

  // --- Yatay telefon: dikeyle aynı düzen, şema kutusu daha kısa -------------------------------
  {
    const { page, cdp } = await phone(844, 390);
    const head = await page.locator('header').first().boundingBox();
    const box = await page.locator('main').boundingBox();
    const nb = await phoneNotebook(page).boundingBox();
    // v4: en altta sabit çubuk (yatayda ince, 44 px düğmeler) da yer kaplar; defter yine en az 150 px, şema kutusu en az 120 px.
    const lbar = await phoneBar(page).boundingBox();
    check('yatay telefonda dikeyle aynı düzen: üst çubuk, kısa şema kutusu, altında defter (en az 150 px), en altta alttaki çubuk',
      head !== null && head.height <= 57.5 && box !== null && box.height >= 120 && box.height <= 160 && nb !== null && nb.height >= 150 && lbar !== null && lbar.y >= nb.y + nb.height - 1,
      `şema ${Math.round(box?.height ?? 0)} px, defter ${Math.round(nb?.height ?? 0)} px, alttaki çubuk ${Math.round(lbar?.height ?? 0)} px`);
    await openExample(page, 'LED ve ön direnç');
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(600);
    const r1 = await part(page, 'R1');
    await tap(page, cdp, await screen(page, r1.x, r1.y)); await page.waitForTimeout(400);
    const card = (await phoneNotebook(page).getByRole('region', { name: 'R1 · Direnç' }).textContent().catch(() => '')) ?? '';
    check('yatayda parçaya dokununca kartı defterde açılıyor', card.includes('Gerilim') && (await mode(page)).includes('Çalışıyor'), card.slice(0, 40));
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('yatayda tuvalin touch-action değeri none', ta === 'none', ta);
    await shot(page, 'ios-8-yatay.png');
    await page.context().close();
  }
  {
    const { page } = await phone(844, 390);
    await openExample(page, 'Yarım dalga doğrultmaç');
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(300);
    await phoneNotebook(page).getByRole('button', { name: /^OSC1 ·/ }).tap(); await page.waitForTimeout(800);
    const screenBox = await phoneNotebook(page).getByRole('img', { name: /^Osiloskop ekranı/ }).first().boundingBox();
    check('yatayda osiloskop kartının ekranı geniş (defter tam genişlik)', screenBox !== null && screenBox.width > 600, screenBox ? `${Math.round(screenBox.width)} px` : 'yok');
    await page.context().close();
  }

  // --- 375 × 667 ------------------------------------------------------------------------------
  {
    const { page, cdp } = await phone(375, 667);
    await openExample(page, 'Gerilim bölücü');
    const scale = (await screen(page, 0, 0)).scale;
    check('375×667: örnek açılınca devre şema kutusuna okunur büyüklükte sığıyor', scale >= 0.4, `yakınlık ${scale.toFixed(2)}`);
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(500);
    const r1 = await part(page, 'R1');
    await tap(page, cdp, await screen(page, r1.x, r1.y)); await page.waitForTimeout(400);
    const card = await phoneNotebook(page).getByRole('region', { name: 'R1 · Direnç' }).boundingBox();
    const svgBox = await page.locator('svg.schematic').boundingBox();
    const nb = await phoneNotebook(page).boundingBox();
    check('375×667: kart defterde açılıyor; tuval defterin üstünde bitiyor', card !== null && svgBox.y + svgBox.height <= nb.y + 1, `tuval ${Math.round(svgBox.height)} px`);
    await shot(page, 'ios-9-kucuk.png');
    await page.context().close();
  }

  // --- Tablet: masaüstünün defter düzeni, dokunmatik boyutta ------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const cdp = await ctx.newCDPSession(page);
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const nb = await notebook(page).boundingBox();
    const undo = await page.getByRole('button', { name: 'Geri al' }).boundingBox();
    const play = await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).boundingBox();
    check('tablette masaüstünün defter düzeni (400 px defter, araç şeridi yok); üst çubuk düğmeleri 44 px', nb !== null && Math.round(nb.width) === 400 && (await page.getByRole('navigation', { name: 'Araçlar' }).count()) === 0 && Math.round(undo.height) === 44 && Math.round(play.height) === 44, nb ? `${Math.round(nb.width)} px` : 'yok');
    // v4: "Parçalar" başlığındaki Parça ekle düğmesi arama kutusunu açar.
    const addButtonBox = await notebook(page).getByRole('button', { name: 'Parça ekle', exact: true }).boundingBox();
    await notebook(page).getByRole('button', { name: 'Parça ekle', exact: true }).tap(); await page.waitForTimeout(200);
    const addRow = notebook(page).getByRole('combobox', { name: /Parça ekle/ });
    await addRow.fill('direnç'); await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const field = notebook(page).getByLabel('Direnç', { exact: true });
    const fs = await field.evaluate((el) => getComputedStyle(el).fontSize).catch(() => '');
    check('tablette defterin Parça ekle düğmesi (44 px) arama kutusunu açıyor; eklenen parçanın kartı açık; dokunmatik alan (≥ 16 px)',
      (await part(page, 'R1')) !== undefined && parseFloat(fs) >= 16 && Math.round(addButtonBox?.height ?? 0) === 44, `${fs} · düğme ${Math.round(addButtonBox?.height ?? 0)} px`);
    const r1 = await part(page, 'R1');
    let s = await screen(page, r1.x, r1.y);
    await drag(page, cdp, s, { x: s.x + 80, y: s.y + 40 }, 250);
    const moved = await part(page, 'R1');
    check('tablette parça basılı tutup sürüklenerek taşınıyor', moved.x !== r1.x || moved.y !== r1.y);
    await page.getByRole('button', { name: 'Kablo bağla' }).tap(); await page.waitForTimeout(300);
    const clear = page.getByRole('button', { name: 'Seçimi bırak' });
    const idle = await clear.isDisabled();
    await tap(page, cdp, await screen(page, moved.x - 4, moved.y));
    await tap(page, cdp, await screen(page, moved.x + 4, moved.y));
    const wires = (await doc(page)).wires.length;
    await page.getByRole('button', { name: 'Bitti' }).tap(); await page.waitForTimeout(200);
    check('tablette Kablo bağla: iki uca sırayla dokununca kablo; Bitti ile çıkılıyor', idle && wires === 1 && (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 1, `${wires} kablo`);
    // Ölç: toprağı olan bir örnek devre.
    await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(300);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'LED ve ön direnç', exact: true }), true)).tap(); await page.waitForTimeout(600);
    await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).tap(); await page.waitForTimeout(500);
    const before = await part(page, 'R1');
    s = await screen(page, before.x, before.y);
    await drag(page, cdp, s, { x: s.x + 60, y: s.y }, 250);
    const locked = await part(page, 'R1');
    check('tablette Ölç’te Kablo bağla yok ve devre kilitli', (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 0 && locked.x === before.x && locked.y === before.y);
    await shot(page, 'ios-10-tablet.png');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(300);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Yarım dalga doğrultmaç', exact: true }), true)).tap(); await page.waitForTimeout(600);
    const exampleCard = await notebook(page).getByRole('region', { name: /^Örnek ·/ }).count();
    await notebook(page).getByRole('button', { name: /^OSC1 ·/ }).tap(); await page.waitForTimeout(300);
    const rows = await notebook(page).getByRole('button', { name: /^A kuplaj: / }).count();
    check('tablette örnek kartı defterde; osiloskop kartı dokunmatik satır düzeninde', exampleCard === 1 && rows === 1);
    await ctx.close();
  }

  // --- Erişilebilirlik (v3, 9. adım): defterde klavyeyle gezinme, odak, adsız düğme yok ------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Gerilim bölücü', exact: true }))).click(); await page.waitForTimeout(500);
    await page.locator('#tuval').focus();
    const active = () => page.evaluate(() => {
      const el = document.activeElement;
      return { nav: el?.hasAttribute('data-nav') ?? false, card: el?.closest('[data-card]')?.getAttribute('data-card') ?? '', open: el?.matches('section[data-card]') ?? false, label: (el?.getAttribute('aria-label') ?? el?.textContent ?? '').slice(0, 30) };
    });
    await page.keyboard.press('Alt+Digit1'); await page.waitForTimeout(150);
    const first = await active();
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80);
    const second = await active();
    await page.keyboard.press('End'); await page.waitForTimeout(80);
    const last = await active();
    await page.keyboard.press('Home'); await page.waitForTimeout(80);
    const home = await page.evaluate(() => document.activeElement === document.querySelector('#defter [data-nav]'));
    check('erişilebilirlik: Alt+1 ilk parça kartına; ↓ sonraki karta, End sona, Home defterin başına (örnek kartı) geçiyor',
      first.nav && first.card !== '' && second.nav && second.card !== first.card && last.nav && last.card !== second.card && home, `${first.label} → ${second.label} → ${last.label}`);
    await page.keyboard.press('Alt+Digit1'); await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80);
    const target = (await active()).card;
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const opened = await active();
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const closed = await active();
    const expanded = await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded'));
    check('erişilebilirlik: Enter kartı açıp odağı açık karta taşıyor; Esc kartı kapatıp odağı kartın düğmesine döndürüyor',
      opened.open && opened.card === target && closed.nav && !closed.open && closed.card === target && expanded === 'false', `${opened.card} / ${closed.card}`);
    await ctx.close();
  }
  {
    // Adı olmayan düğme, bağlantı ya da form alanı yok (simge düğmelerinde görünmez etiket).
    const unnamed = (page) => page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, a[href], input:not([type=file]), select, textarea, [role=switch], [role=tab], [role=radio], [role=menuitem], [role=menuitemradio], [role=option], [role=slider]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0 && !el.classList.contains('sr-only')) continue;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[aria-hidden="true"], svg').forEach((n) => n.remove());
        const id = el.id;
        const label = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && el.getAttribute('aria-labelledby').split(' ').map((x) => document.getElementById(x)?.textContent ?? '').join('').trim()) ||
          clone.textContent.trim() || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim()) || el.closest('label')?.textContent?.trim();
        if (!label) out.push(el.outerHTML.slice(0, 100));
      }
      return out;
    });
    const found = [];
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const dp = await dctx.newPage();
    await dp.goto(URL0, { waitUntil: 'networkidle' });
    await dp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await dp.waitForTimeout(200);
    await (await pickExample(dp, (p) => p.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }))).click(); await dp.waitForTimeout(500);
    await dp.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await dp.waitForTimeout(600);
    for (const name of [/^OSC1 ·/, /^FG1 ·/]) {
      await notebook(dp).getByRole('button', { name }).click(); await dp.waitForTimeout(200);
      found.push(...await unnamed(dp));
    }
    await benchButton(dp).click();
    await dp.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await dp.waitForTimeout(500);
    found.push(...await unnamed(dp));
    await dctx.close();
    const { page: pp } = await phone();
    found.push(...await unnamed(pp));
    await pp.getByRole('button', { name: /^Daha fazla/ }).tap(); await pp.waitForTimeout(300);
    found.push(...await unnamed(pp));
    await pp.context().close();
    check('erişilebilirlik: adı olmayan düğme ya da alan yok (masaüstü kartlar, 3B, telefon, ⋯)', found.length === 0, found.slice(0, 2).join(' | '));
  }

  // --- Karta aktar (masaüstü, K1–K2, L1): devre menüsünden (v4); delikli plaket (Tamamı, adım adım), PCB --
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', colorScheme: 'dark' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: '555 ile yanıp sönen LED (astabil)' }).first())).click(); await page.waitForTimeout(500);
    await circuitButton(page).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /^Karta aktar/ }).click();
    const karta = page.getByRole('dialog', { name: 'Karta aktar' });
    await karta.waitFor();
    await page.waitForFunction(() => window.__kart !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(600);
    await karta.getByRole('tab', { name: 'Delikli plaket' }).click(); await page.waitForTimeout(300);
    // Varsayılan "Tamamı" (kullanıcı isteği): bütün devre takılı, "25 adım"; Önceki / Sonraki yerine "Adım adım başla".
    const allScene = (await karta.getByRole('img', { name: /^Delikli plaket 3B/ }).getAttribute('aria-label')) ?? '';
    const allAside = (await karta.getByRole('complementary', { name: 'Delikli plaket' }).textContent()) ?? '';
    const allNav = await karta.getByRole('button', { name: /^Sonraki/ }).count();
    // Dış teller (kullanıcı isteği): delikten biraz kalkıp en yakın kenara kıvrılıyor, kenarın dışında
    // aşağı sarkıyor (dimdik yukarı çıkmıyor). Kart kalınlığı T = 1,6 / 2,54.
    const leadBoxes = await page.evaluate(() => [...(window.__kart?.model?.parts ?? [])].filter(([k]) => k.startsWith('lead-')).map(([, v]) => ({ min: v.box.min.y, max: v.box.max.y })));
    const T = 1.6 / 2.54;
    const perfAside = karta.getByRole('complementary', { name: 'Delikli plaket' });
    const bomBox = await perfAside.getByRole('region', { name: 'Malzemeler' }).boundingBox().catch(() => null);
    const startBox = await karta.getByRole('button', { name: 'Adım adım başla' }).boundingBox();
    const linksBox = await perfAside.getByRole('button', { name: 'Yazdır' }).boundingBox();
    const asideScrolls = await perfAside.evaluate((a) => a.scrollHeight > a.clientHeight + 1);
    const bomText = bomBox ? ((await perfAside.getByRole('region', { name: 'Malzemeler' }).textContent()) ?? '') : '';
    check('Karta aktar (masaüstü, Tamamı): dış teller delikten alçakta kalkıp kartın kenarından dışarı sarkıyor (dimdik yukarı çıkmıyor)',
      leadBoxes.length === 4 && leadBoxes.every((b) => b.max < T + 1.35 && b.min < -0.5), leadBoxes.map((b) => `${b.min.toFixed(1)}..${b.max.toFixed(1)}`).join(' '));
    check('Karta aktar (masaüstü, Tamamı): "Adım adım başla" ile alttaki bağlantılar arasında malzeme listesi; panel kaymıyor, bağlantılar görünür',
      bomBox !== null && startBox !== null && linksBox !== null && bomBox.y >= startBox.y + startBox.height && bomBox.y + bomBox.height <= linksBox.y && !asideScrolls && bomText.includes('NE555') && bomText.includes('Direnç 68 kΩ'),
      bomBox ? `${Math.round(bomBox.y)}–${Math.round(bomBox.y + bomBox.height)} · bağlantılar ${Math.round(linksBox?.y ?? 0)}` : 'liste yok');
    await karta.getByRole('button', { name: 'Adım adım başla' }).click(); await page.waitForTimeout(300);
    const started = (await karta.locator('[aria-label$=". adımı"]').getAttribute('aria-label')) ?? '';
    check('Karta aktar (masaüstü): delikli plaket "Tamamı" ile açılıyor (bütün parçalar, "25 adım", adım düğmesi yok); "Adım adım başla" 1. adımdan başlatıyor',
      allScene.includes('bütün parçalar takılı') && allAside.includes('25 adım') && allNav === 0 && /25 adımın 1\. adımı$/.test(started), `${allScene.slice(0, 48)} → ${started}`);
    const dialogBox = await karta.boundingBox();
    const aside = await karta.getByRole('complementary', { name: 'Delikli plaket' }).boundingBox();
    const chip = (await karta.getByText(/breadboard düzeni$/).textContent()) ?? '';
    const holeLabels = await karta.locator('[data-anchor^="hole-"]').allTextContents();
    await karta.getByRole('button', { name: /^Sonraki/ }).focus();
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const at19 = (await karta.locator('[aria-label$=". adımı"]').getAttribute('aria-label')) ?? '';
    const now = (await karta.getByText('ŞİMDİ TAK').locator('..').textContent()) ?? '';
    const labels19 = await karta.locator('[data-anchor^="hole-"]').allTextContents();
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
    const at18 = (await karta.locator('[aria-label$=". adımı"]').getAttribute('aria-label')) ?? '';
    await shot(page, 'karta-plaket.png');
    check('Karta aktar (masaüstü, L1): devre menüsünden açılıyor (16 px kenar boşluğu, panel 368 px); bilgi çipi; delik etiketleri; → ve ← adımı değiştiriyor; 19. adımda C1 · 10c ↔ 11c, + ve − etiketi',
      dialogBox !== null && Math.round(dialogBox.x) === 16 && aside !== null && Math.round(aside.width) === 368 && chip === 'Yarım boy · 30 sütun · breadboard düzeni' && holeLabels.length === 2 &&
      /25 adımın 19\. adımı/.test(at19) && /C1 · Elektrolitik/.test(now) && labels19.some((l) => l.startsWith('+ ')) && labels19.some((l) => l.startsWith('− ')) && /adımın 18\. adımı/.test(at18),
      `${at19} · ${labels19.join(', ')}`);
    await karta.getByRole('button', { name: 'Malzemeler' }).click(); await page.waitForTimeout(200);
    const materials = (await karta.getByRole('complementary', { name: 'Delikli plaket' }).textContent()) ?? '';
    await karta.getByRole('button', { name: 'Denetim' }).click(); await page.waitForTimeout(200);
    const checks = (await karta.getByRole('complementary', { name: 'Delikli plaket' }).textContent()) ?? '';
    await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
    await karta.getByRole('button', { name: 'Yazdır' }).click(); await page.waitForTimeout(200);
    const printed = await page.evaluate(() => window.__printed === true);
    // Yazdırma ortamında: rehber görünür, zemini açık (koyu tema belirteçleri yalnızca ekranda), adımların hepsi var.
    await page.emulateMedia({ media: 'print' });
    const paper = await page.evaluate(() => { const el = document.getElementById('lehim-rehberi'); return el ? { display: getComputedStyle(el).display, bg: getComputedStyle(el).backgroundColor, steps: el.querySelectorAll('ol > li').length } : null; });
    await page.emulateMedia({ media: 'screen' });
    check('Karta aktar (masaüstü): Malzemeler ve Denetim panelde; Yazdır bugünkü rehberi basıyor (koyu temada da açık zemin, 25 adım)',
      materials.includes('Perma-Proto') && materials.includes('DIP-8 soket') && checks.includes('Lehim köprüsü yok') && printed && paper?.display === 'block' && paper.bg === 'rgb(255, 255, 255)' && paper.steps === 25,
      JSON.stringify(paper));
    await karta.getByRole('tab', { name: 'Baskı devre (PCB)' }).click();
    await karta.getByText('Üretime hazır').waitFor({ timeout: 10000 }).catch(() => {});
    const pcbPanel = karta.getByRole('complementary', { name: 'Baskı devre (PCB)' });
    const pcbText = (await pcbPanel.textContent()) ?? '';
    const pcbChip = (await karta.getByText(/^70 × 51 mm$/).count()) === 1;
    await pcbPanel.getByRole('button', { name: /^C_D1/ }).click(); await page.waitForTimeout(200);
    const pressed = await pcbPanel.getByRole('button', { name: /^C_D1/ }).getAttribute('aria-pressed');
    const explained = (await pcbPanel.textContent())?.includes('C_D1: U1 için 100 nF dekuplaj') ?? false;
    await pcbPanel.getByRole('button', { name: 'Sipariş ayarlarını kopyala' }).click(); await page.waitForTimeout(200);
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    await karta.getByRole('button', { name: 'Yalın kart' }).click();
    await karta.getByRole('button', { name: 'Alt yüz' }).click(); await page.waitForTimeout(300);
    await shot(page, 'karta-pcb.png');
    // Gerçekçi yüzey: iki yüzde dokulu, vernikli maske (renk + kabartı); delikler levhayı deliyor, kaplamalı olanların içi kalaylı.
    const surface = await page.evaluate(() => {
      let masks = 0;
      let holes = -1;
      let barrels = 0;
      window.__kart?.scene.traverse((o) => {
        const m = o.material;
        if (m && !Array.isArray(m) && m.map && m.normalMap && m.clearcoat > 0) masks++;
        if (o.geometry?.type === 'ExtrudeGeometry' && Array.isArray(m) && m[0].visible === false) holes = o.geometry.parameters.shapes.holes.length;
        if (o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.openEnded) barrels++;
      });
      return { masks, holes, barrels };
    });
    check('Karta aktar (masaüstü): PCB yüzeyi gerçekçi: iki yüzde dokulu ve vernikli maske (yollar kabarık), delikler levhayı deliyor, kaplamalı deliklerin içi kalaylı (4 montaj deliği kaplamasız)',
      surface.masks === 2 && surface.holes > 20 && surface.barrels === surface.holes - 4, JSON.stringify(surface));
    await pcbPanel.getByRole('button', { name: 'Gümrük ve üretici seçenekleri' }).click(); await page.waitForTimeout(150);
    const notes = (await pcbPanel.textContent()) ?? '';
    check('Karta aktar (masaüstü, K1–K2): PCB "Üretime hazır", 70 × 51 mm çipi; SİPARİŞTE SEÇ kopyalanıyor; C_D1 çipi seçiliyor ve açıklaması çıkıyor; Gümrük satırı açılıyor',
      pcbText.includes('19 bağlantının hepsi çizildi') && pcbChip && pressed === 'true' && explained && copied.includes('Yüzey: Kurşunsuz HASL') && notes.includes('30 € muafiyeti yok') && notes.includes('Malzeme listesi KiCad zip’inde'),
      `${pcbText.slice(0, 40)} · kopya ${copied.split('\n').length} satır`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    check('Karta aktar (masaüstü): Esc kapatıyor, 3B sahnesi bırakılıyor', (await page.getByRole('dialog', { name: 'Karta aktar' }).count()) === 0 && (await page.evaluate(() => window.__kart === undefined)));
    await ctx.close();
  }

  // --- 3B (v3: E1, E3; kullanıcı kararı: denetimler sağ altta) -----------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'LED ve ön direnç', exact: true }))).click(); await page.waitForTimeout(500);
    await benchButton(page).click();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
    const main = await page.locator('main').boundingBox();
    const schemaButton = await page.locator('main').getByRole('button', { name: 'Şema', exact: true }).boundingBox();
    const options = await Promise.all(['Etiketler', 'Akım', 'Karta aktar'].map((n) => page.locator('main').getByRole('button', { name: n, exact: true }).boundingBox()));
    const mini = await page.getByRole('button', { name: 'Şemaya dön' }).boundingBox();
    const right = main.x + main.width;
    const bottom = main.y + main.height;
    // v4: Şema / 3B tezgâh seçimi üst çubuğun ortasında; tezgâhın içinde yalnızca sağ alttaki grup.
    const headerBench = await benchButton(page).getAttribute('aria-pressed');
    check('3B (masaüstü): Şema / 3B tezgâh seçimi üst çubukta (3B tezgâh basılı), tezgâhın sol üstünde Şema | 3B yok; Şema ve öbür seçenekler sağ altta; sol altta küçük şema',
      headerBench === 'true' && (await page.locator('main').getByRole('group', { name: 'Görünüm' }).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().top > window.innerHeight - 90))) && schemaButton !== null && schemaButton.x > right - 120 && schemaButton.y > bottom - 70 &&
      options.every((b) => b !== null && b.y > bottom - 130 && b.x > main.x + main.width / 3) && mini !== null && mini.x < main.x + 30 && mini.y + mini.height > bottom - 30,
      schemaButton ? `Şema ${Math.round(right - schemaButton.x)} px sağdan` : 'Şema yok');
    await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(1200);
    const labels = await page.locator('[data-anchor="part"]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity === '1').map((e) => e.textContent));
    const dots = await page.evaluate(() => window.__tezgah?.dots.count ?? 0);
    check('3B: çalışırken parçaların etiketleri (ad · değer, ampermetrede akım) ve kablolarda akım noktaları', labels.some((t) => t?.startsWith('A1 · Ampermetre') && /mA/.test(t)) && labels.length >= 3 && dots > 0, `${labels.length} etiket, ${dots} nokta`);
    await page.locator('main').getByRole('button', { name: 'Akım', exact: true }).click(); await page.waitForTimeout(300);
    const dotsOff = await page.evaluate(() => window.__tezgah?.dots.count ?? -1);
    await page.locator('main').getByRole('button', { name: 'Akım', exact: true }).click(); await page.waitForTimeout(200);
    check('3B: Akım düğmesi akım noktalarını kapatıyor (şemadaki ayarla aynı)', dotsOff === 0);
    const elevation = () => page.evaluate(() => { const t = window.__tezgah; const c = t.camera.position; const g = t.controls.target; return Math.atan2(c.y - g.y, Math.hypot(c.x - g.x, c.z - g.z)) * 180 / Math.PI; });
    const e0 = await elevation();
    await page.getByRole('button', { name: /^Kamera:/ }).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: 'Üstten' }).click(); await page.waitForTimeout(400);
    const eTop = await elevation();
    check('3B: Kamera menüsünde Üstten yukarıdan bakıyor', eTop > 80 && e0 < 60, `${e0.toFixed(0)}° → ${eTop.toFixed(0)}°`);
    await page.locator('#defter').getByRole('button', { name: /^R1 ·/ }).click(); await page.waitForTimeout(300);
    const distance = () => page.evaluate(() => window.__tezgah.camera.position.distanceTo(window.__tezgah.controls.target));
    const d0 = await distance();
    await page.locator('#defter').getByRole('button', { name: '3B’de yaklaş' }).click(); await page.waitForTimeout(400);
    const d1 = await distance();
    const selectedLabel = await page.locator('[data-anchor="part"].bg-accent').textContent().catch(() => '');
    check('3B: açık kartta "3B’de yaklaş" kamerayı parçaya yaklaştırıyor; seçili parçanın etiketi mavi', d1 < d0 * 0.8 && (selectedLabel ?? '').startsWith('R1'), `${d0.toFixed(0)} → ${d1.toFixed(0)}`);
    await page.locator('main').getByRole('button', { name: 'Yakınlaştır' }).click(); await page.waitForTimeout(200);
    check('3B: sağ alttaki + yakınlaştırıyor', (await distance()) < d1);
    await page.locator('main').getByRole('button', { name: 'Şema', exact: true }).click(); await page.waitForTimeout(300);
    check('3B: sağ alttaki Şema düğmesi şemaya döndürüyor', (await page.locator('svg.schematic').count()) === 1 && (await page.evaluate(() => window.__tezgah === undefined)));
    await ctx.close();
  }
  // --- Analiz (docs/tasarim-v3 → "Analiz katmanı", N1, N9): çekmece, izler, kayıt, imleç, CSV / PNG ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /^\d*RC dolma/ }).first())).click(); await page.waitForTimeout(500);
    const button = page.getByRole('button', { name: 'Analiz', exact: true });
    const examplesBox = await page.getByRole('button', { name: 'Örnekler', exact: true }).boundingBox();
    const buttonBox = await button.boundingBox();
    await button.click(); await page.waitForTimeout(300);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    const dBox = await drawer.boundingBox();
    const mainBox = await page.locator('main').boundingBox();
    const nbBox = await notebook(page).boundingBox();
    // Analiz v2: grafik yokken başlangıç ekranı ("Ne çizmek istiyorsun?"); boş grafik hiç gösterilmez.
    const startTitle = await drawer.getByRole('heading', { name: 'Ne çizmek istiyorsun?' }).count();
    const startChips = await drawer.getByRole('tablist', { name: 'Grafikler' }).count();
    const startCards = await drawer.getByRole('button', { name: /^(Zamana göre|Bir değeri tarayarak|Frekansa göre|Parçanın karakteristiği)/ }).count();
    // RC dolmada diyot ya da transistör yok: Parçanın karakteristiği kartı da yok (Zamana göre, Bir değeri tarayarak, Frekansa göre).
    check('analiz (masaüstü, N1; v2): üst çubukta Örnekler’in yanında "Analiz" (basılı); tezgâhın altında 380 px çekmece, defter yerinde; grafik yokken başlangıç ekranı ("Ne çizmek istiyorsun?", Kendin kur kartları), çip yok, "+ Yeni grafik" basılı',
      buttonBox !== null && examplesBox !== null && buttonBox.x > examplesBox.x && buttonBox.x - (examplesBox.x + examplesBox.width) < 24 && (await button.getAttribute('aria-pressed')) === 'true' &&
      dBox !== null && Math.abs(dBox.height - 380) < 2 && mainBox !== null && dBox.y >= mainBox.y + mainBox.height - 1 && nbBox !== null && nbBox.x >= dBox.x + dBox.width - 1 &&
      startTitle === 1 && startChips === 0 && startCards === 3 && (await drawer.getByRole('button', { name: 'Yeni grafik' }).getAttribute('aria-pressed')) === 'true',
      `${Math.round(dBox?.height ?? 0)} px · başlık ${startTitle} · kart ${startCards} · çip ${startChips}`);
    // Zamana göre → Şemadan seç: kabloya tıkla (düğüm, toprağa göre); grafik açılınca İz ekle → Şemadan seç → parçaya tıkla (akım).
    await drawer.getByRole('button', { name: /^Zamana göre/ }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: 'Şemadan seç' }).click(); await page.waitForTimeout(150);
    let at = await screen(page, 28, -8); await page.mouse.click(at.x, at.y); await page.waitForTimeout(150);
    const pickText = (await drawer.getByRole('status').filter({ hasText: 'seçildi' }).textContent().catch(() => '')) ?? '';
    await drawer.getByRole('button', { name: 'Toprağa göre ekle' }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: 'İz ekle' }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: 'Şemadan seç' }).click(); await page.waitForTimeout(150);
    at = await screen(page, 20, -8); await page.mouse.click(at.x, at.y); await page.waitForTimeout(200);
    const names = await drawer.locator('b.font-mono').allTextContents();
    const marks = await page.locator('svg.schematic text').allTextContents();
    check('analiz (v2): Zamana göre → Şemadan seç → düğüme tıklayınca V(C1) (fark için ikinci düğüm sorulur; grafik açılır), İz ekle → Şemadan seç → parçaya tıklayınca I(R1); şemada izin renginde etiketler',
      pickText.startsWith('C1 seçildi') && names.slice(0, 2).join(',') === 'V(C1),I(R1)' && marks.includes('V(C1)') && marks.includes('I(R1) →'), `${names.slice(0, 2).join(',')} · ${pickText.slice(0, 30)}`);
    // Kayıt: S1 çalışırken kapanır, kondansatör dolar.
    const sim = page.getByRole('region', { name: 'Simülasyon' });
    await sim.getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(150);
    at = await screen(page, 8, -8); await page.mouse.click(at.x, at.y);
    const closedAt = (await simTime(page)) ?? 0;
    await page.waitForTimeout(900); await waitSimTime(page, closedAt + 0.85);
    await sim.getByRole('button', { name: 'Duraklat' }).click(); await page.waitForTimeout(400);
    const info = ((await drawer.locator('dl').textContent()) ?? '').replace(/\s+/g, ' ');
    const chartLabel = (await drawer.getByRole('img').getAttribute('aria-label')) ?? '';
    const slider = drawer.getByRole('slider', { name: 'İmleç zamanı' });
    await slider.focus(); await page.keyboard.press('End'); await page.waitForTimeout(150);
    const endValue = ((await drawer.locator('.shadow-lg').first().textContent()) ?? '').replace(/\s+/g, ' ');
    check('analiz: kayıt yalnız seçili izler, 5 ms aralıkla; grafik role="img" açıklamalı; imleç klavyeyle sona gidiyor, değer kutusunda V(C1) ≈ 9,9 V',
      /Aralık ?5 ms · \d{2,} nokta/.test(info) && chartLabel.startsWith('Grafik: V(C1), I(R1)') && /V\(C1\) ?9,[89]\d\d V/.test(endValue), `${info} · ${endValue.slice(0, 60)}`);
    // İmleç değer kutusu (analiz düzeltmeleri, 8): eğrilerle en az çakışan yere; sondaki imleçte kutunun
    // içine eğrilerin hiçbir noktası düşmüyor (RC dolmada üstteki düzlüğü örtmüyor).
    const covered = await drawer.evaluate((root) => {
      const boxEl = root.querySelector('.shadow-lg');
      const svg = root.querySelector('svg[role=img]');
      if (!boxEl || !svg) return -1;
      const b = boxEl.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      let n = 0;
      for (const path of svg.querySelectorAll('path[stroke^="var(--color-tr"]')) {
        for (const m of (path.getAttribute('d') ?? '').matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
          const x = s.left + Number(m[1]);
          const y = s.top + Number(m[2]);
          if (x > b.left && x < b.right && y > b.top && y < b.bottom) n++;
        }
      }
      return n;
    });
    check('analiz (analiz düzeltmeleri 8): imleç sondayken değer kutusu eğrilere binmiyor (kutunun içinde eğri noktası yok)', covered === 0, `${covered} nokta`);
    // Kablo gerilimi göstergesi (analiz düzeltmeleri, 2; v4): sol alttaki tek satırlık kutu yerine sağ altta küçük
    // çip ("Gerilim ±9 V"), sol altta yakınlaştırma grubu. Çekmece açıkken ve çalışırken (duraklatılmış) ikisi de
    // RC dolmanın alt kablosuna binmiyor (Sığdır grubun yerini dışarıda bırakır); çipe tıklayınca açıklamalı
    // Gösterim kutusu açılıyor, kutuya tıklayınca çipe dönüyor.
    {
      const main = page.locator('main');
      const chip = main.getByRole('button', { name: 'Gösterim: kablo gerilimi ölçeği' });
      const note = main.getByRole('note', { name: 'Gösterim' });
      const zoomGroup = main.getByRole('group', { name: 'Yakınlaştırma' });
      const mb = await main.boundingBox();
      const covers = (r, a, b) => r !== null && a.y >= r.y - 4 && a.y <= r.y + r.height + 4 && Math.max(a.x, b.x) >= r.x && Math.min(a.x, b.x) <= r.x + r.width;
      await page.getByRole('button', { name: 'Yakınlaştır' }).click(); await page.getByRole('button', { name: 'Yakınlaştır' }).click(); await page.waitForTimeout(250);
      const zoomedChip = await chip.boundingBox();
      await page.getByRole('button', { name: 'Devreyi ekrana sığdır' }).click(); await page.waitForTimeout(250);
      const a = await screen(page, 0, 8);
      const b = await screen(page, 44, 8);
      const cb = await chip.boundingBox();
      const chipText = ((await chip.textContent()) ?? '').trim();
      const zb = await zoomGroup.boundingBox();
      const noteBefore = await note.count();
      await chip.click(); await page.waitForTimeout(200);
      const nb = await note.boundingBox();
      const noteText = (await note.textContent().catch(() => '')) ?? '';
      const chipWhileOpen = await chip.count();
      await note.click(); await page.waitForTimeout(200);
      const closedBack = (await note.count()) === 0 && (await chip.count()) === 1;
      check('kablo gerilimi göstergesi (v4): çekmece açık ve çalışırken sağ altta tek satırlık çip ("Gerilim ±… V"; yakınlaşınca da tek satır), sol altta yakınlaştırma grubu; ikisi de RC dolmanın alt kablosuna binmiyor; çipe tıklayınca açıklamalı Gösterim kutusu sağ altta açılıyor, kutuya tıklayınca çipe dönüyor',
        cb !== null && mb !== null && cb.height <= 40 && zoomedChip !== null && zoomedChip.height <= 40 && /^Gerilim ±[\d,]+ V$/.test(chipText) && cb.x + cb.width >= mb.x + mb.width - 24 && cb.y + cb.height >= mb.y + mb.height - 24 &&
          !covers(cb, a, b) && zb !== null && zb.x <= mb.x + 24 && !covers(zb, a, b) && noteBefore === 0 &&
          nb !== null && nb.height > 60 && nb.x + nb.width >= mb.x + mb.width - 24 && noteText.includes('Kablo gerilimi') && chipWhileOpen === 0 && closedBack,
        `çip ${Math.round(cb?.width ?? 0)}×${Math.round(cb?.height ?? 0)} "${chipText}" · grup x ${Math.round((zb?.x ?? 0) - (mb?.x ?? 0))} · alt kablo y ${Math.round(a.y)} · kutu ${Math.round(nb?.height ?? 0)} px`);
    }
    await drawer.getByRole('button', { name: 'Tabloya ekle' }).click(); await page.waitForTimeout(200);
    const [csv] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'CSV indir' }).click()]);
    const csvText = Buffer.concat(await (await csv.createReadStream()).toArray()).toString('utf8');
    const [png] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'PNG' }).click()]);
    check('analiz: "Tabloya ekle" imleçteki değerleri tabloya geçiriyor; CSV (noktalı virgül, ondalık virgül) ve PNG indiriliyor',
      /^grafik-verisi-.*\.csv$/.test(csv.suggestedFilename()) && csvText.startsWith('﻿t (s);V(C1) (V);I(R1) (A)') && /\r\n0,00\d+;/.test(csvText) && /^grafik-.*\.png$/.test(png.suggestedFilename()),
      `${csv.suggestedFilename()} · ${png.suggestedFilename()}`);
    await drawer.getByRole('button', { name: 'Ölçüm tablosu' }).click(); await page.waitForTimeout(150);
    const tablePanel = drawer.getByRole('complementary', { name: 'Ölçüm tablosu' });
    const tableText = (await tablePanel.textContent()) ?? '';
    const tableBox = await tablePanel.boundingBox();
    const sep = drawer.getByRole('separator', { name: 'Analiz çekmecesinin yüksekliği' });
    await sep.focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
    const taller = (await drawer.boundingBox())?.height ?? 0;
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre')).analysis ?? null);
    check('analiz (v2): "Ölçüm tablosu" sağdan açılan panelde eklenen satırlar; tutamak (↑) çekmeceyi büyütüyor; izler, grafik ve tablo devreyle kaydediliyor',
      tableText.includes('V(C1)') && tableText.includes('imleç') && tableBox !== null && dBox !== null && tableBox.x + tableBox.width >= dBox.x + dBox.width - 2 && Math.abs(taller - 420) < 2 &&
        saved?.traces?.length === 2 && saved?.rows?.length === 2 && saved?.graphs?.length === 1 && saved?.graphs?.[0]?.kind === 'time',
      `${Math.round(taller)} px · ${saved?.traces?.length}/${saved?.rows?.length}/${saved?.graphs?.length}`);
    // Tablo (A2, N2): sütunlar, % hata, laboratuvar sütunu, satır ekle ve kaynak seçimi, doğru uydurma, CSV menüsü.
    const heads = await drawer.locator('thead th').allTextContents();
    await drawer.getByRole('textbox', { name: 'V(C1): teorik değer' }).fill('10 V'); await page.waitForTimeout(100);
    const errText = ((await drawer.locator('tbody tr').first().locator('td').nth(3).textContent()) ?? '').trim();
    await drawer.getByRole('button', { name: 'Laboratuvar sütunu' }).click(); await page.waitForTimeout(100);
    const labHead = await drawer.locator('thead th', { hasText: 'Laboratuvar' }).count();
    await drawer.getByRole('button', { name: 'Satır ekle' }).click(); await page.waitForTimeout(100);
    await drawer.getByRole('combobox', { name: 'Yeni büyüklük: ölçülen değerin kaynağı' }).selectOption({ index: 1 }); await page.waitForTimeout(100);
    const newRow = ((await drawer.locator('tbody tr').nth(2).textContent()) ?? '').replace(/\s+/g, ' ');
    check('analiz (Tablo, N2): Büyüklük | Teorik (sen gir) | Ölçülen (simülasyon) | % Hata; teorik 10 V → % hata; Laboratuvar sütunu; Satır ekle ve ölçüleni imleçten seç',
      heads.slice(0, 4).join('|') === 'Büyüklük|Teorik (sen gir)|Ölçülen (simülasyon)|% Hata' && /^0,\d\d$/.test(errText) && labHead === 1 && /imleç/.test(newRow),
      `${heads.join('|')} · hata ${errText} · ${newRow.slice(0, 40)}`);
    const fitPanel = drawer.getByRole('region', { name: 'Doğru uydur' });
    // Varsayılan (analiz düzeltmeleri, 3): aralık sinyalin değişmeye başladığı andan; dönüşümsüz doğru
    // R² < 0,9 → uyarı, "Tabloya ekle" yine görünür; ln ile uyarı kalkıyor.
    const autoFrom = Number(((await fitPanel.getByRole('textbox', { name: 'x en az' }).inputValue()) ?? '').replace(',', '.'));
    const warnBefore = ((await fitPanel.getByRole('status').textContent().catch(() => '')) ?? '');
    const addBefore = await fitPanel.getByRole('button', { name: 'Eğimi tabloya ekle' }).count();
    await fitPanel.getByRole('combobox', { name: 'y dönüşümü' }).selectOption('ln'); await page.waitForTimeout(200);
    const warnAfter = await fitPanel.getByRole('status').count();
    const tauText = ((await fitPanel.locator('dl').textContent()) ?? '').replace(/\s+/g, ' ');
    check('analiz (Tablo): doğru uydurmanın aralığı sinyalin değişmeye başladığı andan; R² < 0,9’da "Veri doğruya benzemiyor" uyarısı (Tabloya ekle görünür); ln ile τ ≈ 100 ms ve uyarı yok',
      autoFrom > 0.05 && warnBefore.startsWith('Veri doğruya benzemiyor. Üstel bir değişimse ln dönüşümünü dene.') && addBefore === 1 && warnAfter === 0 && /τ = −1 \/ eğim(9\d,\d+|10\d,\d+) ms/.test(tauText),
      `başlangıç ${autoFrom} s · ${tauText.slice(0, 70)}`);
    const fitText = ((await fitPanel.locator('dl').textContent()) ?? '').replace(/\s+/g, ' ');
    const fitChart = (await fitPanel.getByRole('img').getAttribute('aria-label')) ?? '';
    const rowsBefore = await drawer.locator('tbody tr').count();
    await fitPanel.getByRole('button', { name: 'τ’yu tabloya ekle' }).click(); await page.waitForTimeout(150);
    const tauRow = ((await drawer.locator('tbody tr').last().textContent()) ?? '').replace(/\s+/g, ' ');
    check('analiz (Tablo): doğru uydur y = ln(a − V(C1)), x = t → eğim, τ = −1 / eğim, R²; grafik role="img"; "τ’yu tabloya ekle"',
      /Eğim−\d/.test(fitText) && /τ = −1 \/ eğim\d/.test(fitText) && /R²(0,\d{4}|1,0000) · \d+ nokta/.test(fitText) && fitChart.startsWith('Doğru uydurma: ln(10') &&
      (await drawer.locator('tbody tr').count()) === rowsBefore + 1 && tauRow.includes('τ (uydurma)') && tauRow.includes('doğru uydurma'), `${fitText.slice(0, 80)} · ${tauRow.slice(0, 40)}`);
    await drawer.getByRole('button', { name: 'CSV seçenekleri' }).click(); await page.waitForTimeout(150);
    const radios = await page.getByRole('menuitemradio').evaluateAll((els) => els.map((e) => `${e.textContent.trim()}=${e.getAttribute('aria-checked')}`));
    await page.getByRole('menuitemradio', { name: /Virgül/ }).click(); await page.waitForTimeout(100);
    const [tableCsv] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /tablo\.csv indir/ }).click()]);
    const tableCsvText = Buffer.concat(await (await tableCsv.createReadStream()).toArray()).toString('utf8');
    const savedSep = await page.evaluate(() => localStorage.getItem('devre-simulatoru:csv-ayirici'));
    check('analiz (Tablo): CSV menüsünde ayırıcı (varsayılan noktalı virgül, virgül seçilebiliyor ve hatırlanıyor); tablo.csv ve grafik verisi ayrı',
      radios.length === 2 && radios[0].endsWith('=true') && /^tablo-.*\.csv$/.test(tableCsv.suggestedFilename()) && tableCsvText.startsWith('\uFEFFBüyüklük,Formül,Teorik,Ölçülen,Birim,Kaynak,% Hata,Laboratuvar') && savedSep === ',',
      `${radios.join(' / ')} · ${tableCsvText.split('\r\n')[1]?.slice(0, 40)}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'RC dolma');
    // v4: alttaki çubuk yüzünden Analiz sayfası açıkken şemanın görünen kısmı ≈ 125 px; "Örnek yüklendi." bildirimi
    // (4–5 s) sayfanın üstünde durur ve C1'in düğümünü örter: kaybolması beklenir.
    await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(500);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    const sheetBox = await sheet.boundingBox();
    // Zamana göre → seçici: aranıp düğüm (C1) seçilir, "Grafiği çiz" (telefonda şemadan seçilmez; sayfa ekranı kaplar).
    await sheet.getByRole('button', { name: /^Zamana göre/ }).tap(); await page.waitForTimeout(200);
    const fromSchematic = await sheet.getByRole('button', { name: 'Şemadan seç' }).count();
    await sheet.getByRole('searchbox', { name: 'Büyüklük ara' }).fill('C1'); await page.waitForTimeout(150);
    await sheet.getByRole('group', { name: 'Düğümler' }).getByRole('button').first().tap(); await page.waitForTimeout(150);
    await sheet.getByRole('button', { name: /^Grafiği çiz/ }).tap(); await page.waitForTimeout(300);
    const chips = await sheet.locator('span.font-mono').allTextContents();
    const chipTabs = await sheet.getByRole('tablist', { name: 'Grafikler' }).getByRole('tab').count();
    const small = await sheet.evaluate((root) => [...root.querySelectorAll('button, [role=tab]')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16), w: r.width, h: r.height }; }).filter((r) => r.w > 0 && (r.h < 43.5 || r.w < 35)).map((r) => `${r.n} ${Math.round(r.w)}×${Math.round(r.h)}`));
    const bottom = await sheet.getByRole('button', { name: 'CSV paylaş' }).boundingBox();
    check('analiz (telefon, N9; v2): ⋯ → Analiz tam ekran sayfa; Zamana göre → seçicide arayıp V(C1) → bir grafik çipi; telefonda "Şemadan seç" yok; hedefler ≥ 44 px; altta "Tabloya ekle" ve "CSV paylaş"; sayfa kaymıyor',
      sheetBox !== null && sheetBox.y <= 1 && sheetBox.height >= 843 && fromSchematic === 0 && chips.includes('V(C1)') && chipTabs === 1 && small.length === 0 && bottom !== null && bottom.y + bottom.height <= 844 && !(await pageScrolls(page)),
      small.join(', ') || `${chips.join(',')} · sayfa ${Math.round(sheetBox?.y ?? -1)}+${Math.round(sheetBox?.height ?? 0)}`);
    await sheet.getByRole('button', { name: 'Ölçüm tablosu' }).tap(); await page.waitForTimeout(200);
    await sheet.getByRole('button', { name: 'Satır ekle' }).tap(); await page.waitForTimeout(200);
    const theoryInput = sheet.getByRole('textbox', { name: 'Yeni büyüklük: teorik değer' });
    const inputBox = await theoryInput.boundingBox();
    const inputFont = await theoryInput.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const tableButtons = await Promise.all(['Kopyala', 'CSV paylaş'].map((n) => sheet.getByRole('button', { name: n, exact: true }).boundingBox()));
    check('analiz (telefon, Tablo): satırlar kart; girdiler ≥ 44 px ve 16 px yazı (iOS yakınlaştırmaz); altta Kopyala ve CSV paylaş; doğru uydurma altında',
      inputBox !== null && inputBox.height >= 43.5 && inputFont >= 16 && tableButtons.every((b) => b !== null && b.height >= 44) && (await sheet.getByRole('region', { name: 'Doğru uydur' }).count()) === 1,
      `${Math.round(inputBox?.height ?? 0)} px · ${inputFont} px`);
    await page.context().close();
  }
  // --- Analiz v2: başlangıç ekranı, föy kartları, eğri ailesi, büyüklük seçici, tarama iptali, çipler, telefon ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'BF245A: çıkış ve transfer karakteristiği', exact: true }))).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(300);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    const curves = () => drawer.locator('svg[role=img] path[stroke^="var(--color-tr"]').count();
    const foyHeading = await drawer.getByRole('heading', { name: 'Föydeki grafikler · Deney 5 · Şekil-15' }).count();
    const foyCards = await drawer.getByRole('button', { name: /^ADIM / }).allTextContents();
    const offers = await drawer.getByRole('heading', { name: 'Bu devre için' }).count();
    check('analiz v2: Deney 5 açıkken başlangıç ekranında "Föydeki grafikler · Deney 5 · Şekil-15" ve iki kart (ADIM 2–3 çıkış ailesi, ADIM 4–5 transfer); "Bu devre için" ve "Kendin kur" bölümleri',
      foyHeading === 1 && foyCards.length === 2 && /ADIM 2–3 · ÇIKIŞ KARAKTERİSTİĞİ.*ID – VDS ailesi/.test(foyCards[0] ?? '') && /ADIM 4–5 · TRANSFER/.test(foyCards[1] ?? '') && offers === 1 &&
        (await drawer.getByRole('heading', { name: 'Kendin kur' }).count()) === 1,
      foyCards.map((c) => c.slice(0, 40)).join(' | '));
    // Föy kartından tek tıkla aile: üç eğri (VGG 0; 0,2; 0,4 V), çipte FÖY.
    await drawer.getByRole('button', { name: /ID – VDS ailesi/ }).click();
    await drawer.getByText(/^Tarama bitti · \d+ nokta$/).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const familyCurves = await curves();
    const chip1 = ((await drawer.getByRole('tablist', { name: 'Grafikler' }).getByRole('tab', { selected: true }).textContent()) ?? '').replace(/\s+/g, ' ');
    const done = ((await drawer.getByText(/^Tarama bitti/).textContent().catch(() => '')) ?? '');
    check('analiz v2: föy kartına tek tıkla ID – VDS ailesi çiziliyor (3 eğri, 144 nokta); çip "FÖY ID – VDS ailesi" seçili',
      familyCurves === 3 && done === 'Tarama bitti · 144 nokta' && chip1.startsWith('FÖY') && chip1.includes('ID – VDS ailesi'), `${familyCurves} eğri · ${done} · ${chip1}`);
    // Büyüklük seçici: Yeni grafik → Zamana göre → arama süzüyor, seçilen büyüklükle grafik çiziliyor (ikinci çip).
    await drawer.getByRole('button', { name: 'Yeni grafik' }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: /^Zamana göre/ }).click(); await page.waitForTimeout(150);
    const search = drawer.getByRole('searchbox', { name: 'Büyüklük ara' });
    const groupsBefore = await drawer.getByRole('group').evaluateAll((els) => els.map((e) => e.querySelector('h4')?.textContent ?? '').filter(Boolean));
    await search.fill('j1 vds'); await page.waitForTimeout(150);
    const found = await drawer.getByRole('button', { pressed: false }).filter({ hasText: /^J1 · / }).allTextContents();
    await drawer.getByRole('button', { name: /^J1 · VDS/ }).click(); await page.waitForTimeout(100);
    await drawer.getByRole('button', { name: /^Grafiği çiz/ }).click(); await page.waitForTimeout(300);
    const chipCount = await drawer.getByRole('tablist', { name: 'Grafikler' }).getByRole('tab').count();
    const traceNames = await drawer.locator('b.font-mono').allTextContents();
    check('analiz v2 (büyüklük seçici): Ölçü aletleri | Parçalar | Düğümler grupları; "j1 vds" araması yalnız J1 · VDS’yi bırakıyor; seçilip "Grafiği çiz" ile ikinci çip ve J1 · VDS izi',
      groupsBefore.join('|') === 'Ölçü aletleri|Parçalar|Düğümler' && found.length === 1 && chipCount === 2 && traceNames.includes('J1 · VDS'), `${groupsBefore.join('|')} · ${found.length} · ${chipCount} çip`);
    // Tarama iptali: Bir değeri tarayarak, adım küçültülünce uzun tarama; İptal ilerlemeyi durduruyor.
    await drawer.getByRole('button', { name: 'Yeni grafik' }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: /^Bir değeri tarayarak/ }).click(); await page.waitForTimeout(200);
    const stepField = drawer.getByRole('textbox', { name: 'Adım 1' });
    await stepField.fill('0,004'); await stepField.press('Enter');
    const cancel = drawer.getByRole('button', { name: 'İptal' });
    await cancel.waitFor({ timeout: 5000 }).catch(() => {});
    const running = ((await drawer.getByText(/^Taranıyor · \d+ \/ \d+$/).first().textContent().catch(() => '')) ?? '');
    await cancel.click().catch(() => {}); await page.waitForTimeout(300);
    const stopped = (await cancel.count()) === 0 && (await drawer.getByRole('button', { name: 'Yeniden tara' }).count()) === 1;
    check('analiz v2 (tarama): "Bir değeri tarayarak" uzun taramada ilerleme ("Taranıyor · n / N") ve İptal; İptal’den sonra Yeniden tara',
      /^Taranıyor · \d+ \/ \d+$/.test(running) && stopped, `${running} · durdu ${stopped}`);
    // Çipler: kapatılan çipin yanındaki açılıyor; hepsi kapanınca başlangıç ekranı.
    const tabs = drawer.getByRole('tablist', { name: 'Grafikler' });
    const beforeClose = await tabs.getByRole('tab').count();
    await drawer.getByRole('button', { name: /grafiğini kapat$/ }).last().click(); await page.waitForTimeout(150);
    const afterOne = await tabs.getByRole('tab').count();
    const activeAfter = ((await tabs.getByRole('tab', { selected: true }).textContent().catch(() => '')) ?? '');
    while ((await drawer.getByRole('button', { name: /grafiğini kapat$/ }).count()) > 0) { await drawer.getByRole('button', { name: /grafiğini kapat$/ }).first().click(); await page.waitForTimeout(100); }
    const backToStart = await drawer.getByRole('heading', { name: 'Ne çizmek istiyorsun?' }).count();
    check('analiz v2 (çipler): üç grafik üç çip; kapatılan çipin yanındaki seçiliyor; hepsi kapanınca başlangıç ekranı (boş grafik yok)',
      beforeClose === 3 && afterOne === 2 && activeAfter.length > 0 && backToStart === 1, `${beforeClose} → ${afterOne} · ${activeAfter.slice(0, 30)}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BF245A: çıkış ve transfer karakteristiği');
    await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(500);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    const box = await sheet.boundingBox();
    const foyCards = await sheet.getByRole('button', { name: /^ADIM / }).count();
    const customCols = await sheet.getByRole('button', { name: /^(Zamana göre|Bir değeri tarayarak|Frekansa göre|Parçanın karakteristiği)/ }).evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().x))).size);
    await sheet.getByRole('button', { name: /ID – VDS ailesi/ }).tap();
    await sheet.locator('svg[role=img] path[stroke^="var(--color-tr"]').nth(2).waitFor({ timeout: 30000 }).catch(() => {});
    const phoneCurves = await sheet.locator('svg[role=img] path[stroke^="var(--color-tr"]').count();
    const fold = sheet.getByRole('button', { name: 'Ayarlar' });
    const foldClosed = (await fold.getAttribute('aria-expanded')) === 'false';
    const chart = await sheet.getByRole('img').first().boundingBox();
    const foldBox = await fold.boundingBox();
    check('analiz v2 (telefon): Analiz tam ekran sayfa; föy kartları (2), Kendin kur 2 sütun; föy kartına dokununca aile (3 eğri) ve ayarlar grafiğin altında katlı; sayfa kaymıyor',
      box !== null && box.y <= 1 && box.height >= 843 && foyCards === 2 && customCols === 2 && phoneCurves === 3 && foldClosed && chart !== null && foldBox !== null && foldBox.y > chart.y + chart.height - 1 && !(await pageScrolls(page)),
      `${foyCards} kart · ${customCols} sütun · ${phoneCurves} eğri · katlı ${foldClosed}`);
    await page.context().close();
  }
  // --- Analiz v2: föy grafiklerinde föyün adları, işaret yazıları, telefonda açıklama satırları ve PNG ---
  {
    // Grafiğin yazıları (boşluklar tek: alt simgeden sonraki boşluk), kutuları; çizim alanı, kesikli çizgiler.
    const svgInfo = (loc) => loc.evaluate((svg) => {
      const r = svg.getBoundingClientRect();
      const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      const plot = svg.querySelector('rect');
      return {
        svg: { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width },
        plot: plot ? box(plot) : null,
        texts: [...svg.querySelectorAll('text')].map((t) => ({ text: t.textContent.replace(/\s+/g, ' ').trim(), ...box(t), mark: t.hasAttribute('data-mark'), label: t.hasAttribute('data-label'), legend: t.closest('[data-legend]') !== null })),
        dashed: [...svg.querySelectorAll('line[stroke-dasharray]')].filter((l) => l.getAttribute('stroke') === 'var(--color-warn)').map(box),
      };
    });
    const inside = (t, s) => t.l >= s.l - 0.5 && t.r <= s.r + 0.5 && t.t >= s.t - 0.5 && t.b <= s.b + 0.5;
    const hits = (t, l) => l.l <= t.r && l.r >= t.l && l.t <= t.b && l.b >= t.t;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'BF245A: çıkış ve transfer karakteristiği', exact: true }))).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(300);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    const cards = (await drawer.getByRole('button', { name: /^ADIM / }).allTextContents()).map((c) => c.replace(/\s+/g, ' '));
    check('föy adları (Deney 5): kartlarda föydeki ad ve parantez içinde devredeki ad ("x: VDS (V1), y: ID (A1)", "x: VGS (J1), y: ID (A1)"), eğriler VGS 0; −0,2; −0,4 V',
      cards.length === 2 && cards[0].includes('VGS 0; −0,2; −0,4 V · x: VDS (V1), y: ID (A1)') && cards[1].includes('x: VGS (J1), y: ID (A1)'), cards.map((c) => c.slice(-40)).join(' | '));
    await drawer.getByRole('button', { name: /ID – VDS ailesi/ }).click();
    await drawer.getByText(/^Tarama bitti/).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const fam = await svgInfo(drawer.locator('svg[role=img]').first());
    const famTexts = fam.texts.map((t) => t.text);
    const famLabels = fam.texts.filter((t) => t.label);
    check('föy adları (Deney 5 çıkış ailesi, 1440 px): eksenler "ID (mA)" ve "VDS (V)", eğri adları "VGS = 0 V", "VGS = −0,2 V", "VGS = −0,4 V" (devre adı yok); adlar grafiğin içinde (taşmıyor)',
      famTexts.includes('ID (mA)') && famTexts.includes('VDS (V)') && ['VGS = 0 V', 'VGS = −0,2 V', 'VGS = −0,4 V'].every((n) => famLabels.some((t) => t.text === n)) && !famTexts.some((t) => /PS1|A1|V1/.test(t)) && famLabels.length === 3 && famLabels.every((t) => inside(t, fam.svg)),
      `${famLabels.map((t) => t.text).join(' | ')} · ${famTexts.filter((t) => /\(/.test(t)).join(' | ')}`);
    await drawer.getByRole('button', { name: 'Yeni grafik' }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: /ID – VGS ve VP/ }).click();
    await drawer.getByText(/^Tarama bitti/).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    const tf = await svgInfo(drawer.locator('svg[role=img]').first());
    const marks = tf.texts.filter((t) => t.mark);
    const crossing = marks.filter((t) => tf.dashed.some((l) => hits(t, l)));
    const tfLabel = tf.texts.find((t) => t.label);
    check('föy işareti (Deney 5 transfer): "ID (VGS = 0, VDS ≈ 9,6 V) = 4,12 mA" (IDSS değil) ve "VP ≈ −1,74 V"; işaret yazılarının üstünden kesikli çizgi geçmiyor, yazılar grafik alanında; eğri adı "VDD = 10 V" grafiğin içinde',
      marks.map((t) => t.text).sort().join(' | ') === 'ID (VGS = 0, VDS ≈ 9,6 V) = 4,12 mA | VP ≈ −1,74 V' && !tf.texts.some((t) => /IDSS/.test(t.text)) && tf.dashed.length === 2 && crossing.length === 0 &&
        marks.every((t) => tf.plot && inside(t, tf.plot)) && tfLabel?.text === 'VDD = 10 V' && inside(tfLabel, tf.svg),
      `${marks.map((t) => t.text).join(' | ')} · çakışan ${crossing.length} · ${tfLabel?.text}`);
    await ctx.close();
  }
  {
    // Telefon: grafik ekranın tam genişliğinde, eğri adları grafiğin altında; PNG paylaşımı (Web Share API
    // dosya paylaşımı taklit edilir: paylaşılan dosya kaydedilir).
    const { page } = await phone();
    await openExample(page, 'BF245A: çıkış ve transfer karakteristiği');
    await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => Array.isArray(d?.files) });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })); } });
    });
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(500);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await sheet.getByRole('button', { name: /ID – VDS ailesi/ }).tap();
    await sheet.locator('svg[role=img] [data-legend]').nth(2).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const info = await sheet.locator('svg[role=img]').first().evaluate((svg) => {
      const r = svg.getBoundingClientRect();
      const plot = svg.querySelector('rect').getBoundingClientRect();
      const legend = [...svg.querySelectorAll('[data-legend] text')].map((t) => { const b = t.getBoundingClientRect(); return { text: t.textContent.replace(/\s+/g, ' ').trim(), l: b.left, r: b.right, t: b.top, b: b.bottom }; });
      const right = [...svg.querySelectorAll('text[data-label]')].filter((t) => !t.closest('[data-legend]')).length;
      return { l: r.left, w: r.width, plotRight: plot.right, plotBottom: plot.bottom, svgBottom: r.bottom, legend, right };
    });
    const vw = page.viewportSize().width;
    const png = sheet.getByRole('button', { name: 'PNG paylaş' });
    const pngVisible = (await png.count()) === 1 && (await png.isEnabled());
    const pngBox = await png.boundingBox();
    await png.tap().catch(() => {});
    await page.waitForFunction(() => window.__shared !== undefined, null, { timeout: 8000 }).catch(() => {});
    const shared = await page.evaluate(() => window.__shared ?? null);
    check('telefon (föy grafiği): grafik ekranın tam genişliğinde, eğri adları grafiğin altında (sağda ad yok), adlar ekranın içinde; PNG paylaş düğmesi (≥ 44 px) PNG dosyası paylaşıyor',
      Math.abs(info.l) <= 1 && Math.abs(info.w - vw) <= 1 && info.plotRight >= vw - 20 && info.right === 0 && info.legend.length === 3 && info.legend.every((t) => t.t > info.plotBottom && t.b <= info.svgBottom + 0.5 && t.l >= 0 && t.r <= vw) &&
        info.legend.map((t) => t.text).join('|') === 'VGS = 0 V|VGS = −0,2 V|VGS = −0,4 V' && pngVisible && pngBox !== null && pngBox.height >= 44 &&
        shared !== null && shared.length === 1 && shared[0].type === 'image/png' && /^tarama-\d{4}-\d{2}-\d{2}\.png$/.test(shared[0].name) && shared[0].size > 2000 && !(await pageScrolls(page)),
      `svg ${Math.round(info.l)}+${Math.round(info.w)}/${vw} · açıklama ${info.legend.map((t) => t.text).join(', ')} · paylaşılan ${JSON.stringify(shared)}`);
    await page.context().close();
  }
  {
    // Dosya paylaşımı olmayan tarayıcıda PNG düğmesi yok, CSV paylaş kalıyor.
    const { page } = await phone();
    await openExample(page, 'BF245A: çıkış ve transfer karakteristiği');
    await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(500);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await sheet.getByRole('button', { name: /ID – VDS ailesi/ }).tap();
    await sheet.getByRole('button', { name: 'CSV paylaş' }).waitFor({ timeout: 8000 }).catch(() => {});
    check('telefon: Web Share API ile dosya paylaşılamıyorsa PNG düğmesi yok, yalnızca CSV paylaş',
      (await sheet.getByRole('button', { name: 'PNG paylaş' }).count()) === 0 && (await sheet.getByRole('button', { name: 'CSV paylaş' }).count()) === 1);
    await page.context().close();
  }
  // --- Analiz ince ayar: katlayıcıda iki Vp pozitif; telefonda grafik Ayarlar kapalıyken boş yeri dolduruyor ---
  {
    // Telefonda açık grafiğin ölçüleri: SVG'nin boyu, Ayarlar'ın altı ile kayan bölmenin altı arası, kayma.
    const layout = (page) => page.evaluate(() => {
      const sheet = document.querySelector('section[aria-label="Analiz"]');
      const svg = sheet.querySelector('svg[role=img]');
      const fold = [...sheet.querySelectorAll('button[aria-expanded]')].find((b) => b.textContent.includes('Ayarlar'));
      const pane = svg.closest('.overflow-y-auto');
      const p = pane.getBoundingClientRect();
      return { svg: svg.getBoundingClientRect().height, gap: p.bottom - fold.closest('div').getBoundingClientRect().bottom, scroll: pane.scrollHeight - pane.clientHeight };
    });
    const openGraph = async (example, card) => {
      const { page } = await phone();
      await openExample(page, example);
      await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
      await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
      await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(500);
      const sheet = page.getByRole('region', { name: 'Analiz' });
      await sheet.getByRole('button', { name: card }).tap(); await page.waitForTimeout(300);
      return { page, sheet };
    };
    {
      const { page, sheet } = await openGraph('Gerilim katlayıcı (ikileyici)', /^ADIM 2 · GERİLİM KATLAYICI/);
      const chips = (await sheet.locator('span.rounded-full.bg-accent-soft').allTextContents()).map((c) => c.replace(/\s+/g, ' ').trim());
      await sheet.getByRole('button', { name: /^Oynat/ }).first().tap();
      await page.waitForTimeout(2500);
      await sheet.getByRole('button', { name: 'Duraklat' }).tap().catch(() => {});
      await page.waitForTimeout(300);
      const values = await sheet.evaluate((el) => Object.fromEntries([...el.querySelectorAll('span.font-mono + b')].map((b) => [b.previousElementSibling.textContent.replace(/\s+/g, ' ').trim(), Number(b.textContent.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.'))])));
      const [c1, c2, vc] = [values['Vp (C1)'], values['Vp (C2)'], values['Vç']];
      check('katlayıcı (föy grafiği): föydeki gibi iki Vp de pozitif (B ters çevrilmiş): izler "Vp (C1)", "Vp (C2)", "Vç"; Vp ≈ 4,6 V, Vç ≈ Vp (C1) + Vp (C2)',
        chips.join('|') === 'Vp (C1)|Vp (C2)|Vç' && c1 > 4.3 && c2 > 4.3 && Math.abs(c1 - c2) < 0.1 && Math.abs(vc - c1 - c2) < 0.05,
        `${chips.join('|')} · ${JSON.stringify(values)}`);
      const closed = await layout(page);
      await sheet.getByRole('button', { name: 'Ayarlar' }).tap(); await page.waitForTimeout(300);
      const open = await layout(page);
      check('telefon (zaman grafiği): Ayarlar kapalıyken grafik altındaki boş yeri dolduruyor (Ayarlar bölmenin dibinde, kayma yok); Ayarlar açılınca grafik en az boyuna (210 px) dönüyor, bölme kayıyor; sayfa kaymıyor',
        closed.svg > 260 && closed.gap <= 16 && closed.scroll <= 1 && Math.abs(open.svg - 210) <= 1 && open.scroll > 0 && !(await pageScrolls(page)),
        `kapalı ${Math.round(closed.svg)} px, boşluk ${Math.round(closed.gap)} · açık ${Math.round(open.svg)} px, kayma ${open.scroll}`);
      await page.context().close();
    }
    {
      const { page, sheet } = await openGraph('BF245A: çıkış ve transfer karakteristiği', /ID – VDS ailesi/);
      await sheet.locator('svg[role=img] [data-legend]').nth(2).waitFor({ timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(300);
      const closed = await layout(page);
      await sheet.getByRole('button', { name: 'Ayarlar' }).tap(); await page.waitForTimeout(300);
      const open = await layout(page);
      check('telefon (tarama grafiği): Ayarlar kapalıyken grafik altındaki boş yeri dolduruyor (≥ 450 px, kayma yok); açılınca en az boyuna (260 px + açıklama satırı) dönüyor, bölme kayıyor',
        closed.svg >= 450 && closed.gap <= 16 && closed.scroll <= 1 && open.svg < 300 && open.svg >= 260 && open.scroll > 0 && !(await pageScrolls(page)),
        `kapalı ${Math.round(closed.svg)} px, boşluk ${Math.round(closed.gap)} · açık ${Math.round(open.svg)} px, kayma ${open.scroll}`);
      await page.context().close();
    }
  }
  // --- Örnekler penceresi: devre çalışırken kaydırma donmuyor; sekmenin simgesi yeni logo -------------------
  {
    // Uzun görevler (≥ 50 ms) sayfa yüklenince izlenir; ölçülen aralıkta toplamları.
    const watchLong = (page) => page.evaluate(() => {
      window.__long = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask' });
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    // Sekmenin simgesi: sürüm ekli adres (tarayıcının önbelleğindeki eski simge kalmasın), yeni logo.
    const icon = await page.evaluate(async () => {
      const href = document.querySelector('link[rel=icon]')?.getAttribute('href') ?? '';
      const svg = await (await fetch(href)).text();
      const manifest = await (await fetch(document.querySelector('link[rel=manifest]').getAttribute('href'))).json();
      return { href, wave: svg.includes('M8 16C10.5 8.5 13.5 8.5 16 16S21.5 23.5 24 16'), old: svg.includes('M4 16h5l2-6'), icons: manifest.icons.map((i) => i.src) };
    });
    check('sekmenin simgesi (favicon): yeni logo ("düğüm dalgası"), adreste sürüm eki (favicon.svg?v=4; manifest simgeleri de), eski kırmızı zikzak yok',
      /\/favicon\.svg\?v=\d+$/.test(icon.href) && icon.wave && !icon.old && icon.icons.every((src) => /\.png\?v=\d+$/.test(src)), `${icon.href} · ${icon.icons.join(', ')}`);
    await watchLong(page);
    await page.locator('header').getByRole('button', { name: 'Oynat', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.locator('header').getByRole('button', { name: 'Örnekler', exact: true }).click();
    await page.waitForTimeout(1000);
    const dialog = page.getByRole('dialog', { name: 'Örnekler' });
    const box = await dialog.locator('.overflow-y-auto').nth(1).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => { window.__long = 0; });
    const t0 = Date.now();
    for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(100); }
    const elapsed = Date.now() - t0;
    const busy = await page.evaluate(() => window.__long);
    const running = await page.locator('header').getByRole('button', { name: 'Duraklat' }).count();
    check('Örnekler (masaüstü, devre çalışırken): kaydırırken pencere her karede yeniden çizilmiyor — uzun görevlerin toplamı sürenin %20’sinden az (eskiden neredeyse tamamı)',
      running === 1 && busy < elapsed * 0.2, `${Math.round(busy)} ms / ${elapsed} ms`);
    await ctx.close();
  }
  {
    // Telefon işlemcisi gibi 4 kat yavaş (hızlı makinede 11 kartın her karede yeniden çizimi 50 ms'yi aşmıyordu).
    const { page, cdp } = await phone();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.__long = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask' });
    });
    await phoneBar(page).getByRole('button', { name: 'Oynat' }).tap();
    await page.waitForTimeout(1000);
    await phoneExamples(page);
    await page.locator('[data-group="arduino"]').tap(); await page.waitForTimeout(800);
    const list = page.locator('[role=dialog] .overflow-y-auto').last();
    const box = await list.boundingBox();
    await page.evaluate(() => { window.__long = 0; });
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) {
      await page.evaluate((y) => document.querySelectorAll('[role=dialog] .overflow-y-auto')[document.querySelectorAll('[role=dialog] .overflow-y-auto').length - 1].scrollBy(0, y), 160);
      await page.waitForTimeout(150);
    }
    const elapsed = Date.now() - t0;
    const busy = await page.evaluate(() => window.__long);
    check('Örnekler (telefon, işlemci 4 kat yavaş, Arduino grubu, devre çalışırken): kaydırırken uzun görevlerin toplamı sürenin %20’sinden az',
      box !== null && busy < elapsed * 0.2, `${Math.round(busy)} ms / ${elapsed} ms`);
    await page.context().close();
  }
  // --- Şemayı indir / yazdır: PNG, SVG, yazdırma; her zaman açık renkler ve beyaz zemin (grafik PNG'si de) ---
  {
    const { readFileSync } = await import('node:fs');
    const EX = 'BF245A: çıkış ve transfer karakteristiği';
    // İndirilen PNG: boyu ve bir pikselin rengi (tarayıcıda çözülür).
    const pngInfo = (page, file, x = 2, y = 2) => page.evaluate(async ([b64, px, py]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(px, py, 1, 1).data;
      return { w: bmp.width, h: bmp.height, rgb: [d[0], d[1], d[2]] };
    }, [readFileSync(file).toString('base64'), x, y]);
    const download = async (page, click) => {
      const [d] = await Promise.all([page.waitForEvent('download'), click()]);
      return { name: d.suggestedFilename(), path: await d.path() };
    };
    const desktop = async (scheme) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', colorScheme: scheme });
      await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
      await page.goto(URL0, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
      await (await pickExample(page, (p) => p.getByRole('button', { name: EX, exact: true }))).click(); await page.waitForTimeout(500);
      await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
      return { ctx, page };
    };
    const dialogOf = (page) => page.getByRole('dialog', { name: 'Şemayı indir ya da yazdır' });
    const ready = async (dlg) => {
      await dlg.getByRole('button', { name: 'SVG indir' }).and(dlg.locator(':enabled')).waitFor({ timeout: 15000 }).catch(() => {});
      await dlg.page().waitForTimeout(200);
    };
    {
      const { ctx, page } = await desktop('light');
      // Devre menüsünde (Ctrl+P kısayoluyla).
      await page.locator('header').getByRole('button', { name: /BF245A/ }).first().click(); await page.waitForTimeout(150);
      const item = page.getByRole('menuitem', { name: /Şemayı indir \/ yazdır…/ });
      const itemText = ((await item.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
      await item.click();
      const dlg = dialogOf(page);
      await ready(dlg);
      const preview = await dlg.getByRole('img').evaluate((img) => ({ w: img.naturalWidth, alt: img.alt }));
      const headerOn = await dlg.getByRole('checkbox', { name: /Başlık satırı/ }).isChecked();
      const liveBox = dlg.getByRole('checkbox', { name: /O anki değerlerle/ });
      const liveOff = (await liveBox.isDisabled()) && (await dlg.getByText('Devre çalışırken ya da duraklatılmışken seçilebilir.').count()) === 1;
      const svgFile = await download(page, () => dlg.getByRole('button', { name: 'SVG indir' }).click());
      const svg = readFileSync(svgFile.path, 'utf8');
      const size = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="(\d+)" height="(\d+)"/.exec(svg);
      check('şemayı indir (masaüstü): devre menüsünde "Şemayı indir / yazdır… Ctrl+P"; pencerede önizleme, Başlık satırı açık, "O anki değerlerle" devre dururken kapalı; SVG tek başına açılır (var(--…) yok, yazı tipleri gömülü, beyaz zemin, başlık ve "Deney 5 · Şekil-15")',
        /Şemayı indir \/ yazdır… ?Ctrl\+P/.test(itemText) && preview.w > 0 && headerOn && liveOff && /^sema-\d{4}-\d{2}-\d{2}\.svg$/.test(svgFile.name) && size !== null &&
          !svg.includes('var(--') && svg.includes('@font-face') && svg.includes('data:font/woff2') && svg.includes('fill="#ffffff"') && svg.includes(EX) && svg.includes('Deney 5 · Şekil-15'),
        `${itemText} · ${svgFile.name} ${size?.[1]}×${size?.[2]} · ${Math.round(svg.length / 1024)} KB`);
      check('şemayı indir (sade çizim, föy gibi): ölçü aletlerinin boş göstergesi ("– – – A/V") yok; güç kaynağının ekranları siyah dolgu yerine beyaz zeminli ve ince çerçeveli, ayarlı değerleri ("10,0 V", "0,00 V") koyu yazıyla; renk ölçeği yok',
        !svg.includes('– – –') && !svg.includes('#1e2a25') && !svg.includes('#a6f4bd') && svg.includes('>10,0 V<') && svg.includes('>0,00 V<') && !svg.includes('data-legend'),
        `boş gösterge ${svg.includes('– – –')} · siyah ekran ${svg.includes('#1e2a25')}`);
      // PNG: iki kat çözünürlük, beyaz köşe.
      const pngFile = await download(page, () => dlg.getByRole('button', { name: 'PNG indir' }).click());
      const png = await pngInfo(page, pngFile.path);
      // Başlıksız: önizleme alçalır, SVG'de başlık yok.
      await dlg.getByRole('checkbox', { name: /Başlık satırı/ }).click();
      await page.waitForTimeout(300); await ready(dlg);
      const bare = readFileSync((await download(page, () => dlg.getByRole('button', { name: 'SVG indir' }).click())).path, 'utf8');
      const bareSize = /width="(\d+)" height="(\d+)"/.exec(bare);
      check('şemayı indir (masaüstü): PNG iki kat çözünürlükte, köşesi beyaz; Başlık satırı kapatılınca başlık yok, resim 62 px alçak',
        /^sema-\d{4}-\d{2}-\d{2}\.png$/.test(pngFile.name) && png.w === 2 * Number(size?.[1]) && png.h === 2 * Number(size?.[2]) && png.rgb.every((c) => c >= 250) &&
          !bare.includes(EX) && bareSize !== null && Number(size?.[2]) - Number(bareSize[2]) === 62,
        `${png.w}×${png.h} rgb ${png.rgb} · başlıksız ${bareSize?.[1]}×${bareSize?.[2]}`);
      // Yazdır: window.print çağrılırken yalnızca şema (#sema-yazdir) ve A4 yatay; yazdırma bitince kaldırılır.
      await dlg.getByRole('checkbox', { name: /Başlık satırı/ }).click();
      await page.waitForTimeout(300); await ready(dlg);
      await page.evaluate(() => {
        window.__printed = null;
        window.print = () => {
          const box = document.getElementById('sema-yazdir');
          const page = [...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => t.includes('@page')) ?? '';
          window.__printed = { svg: box?.querySelector(':scope > svg') !== null && box !== null, page, hiddenOnScreen: box ? getComputedStyle(box).display === 'none' : null };
        };
      });
      await dlg.getByRole('button', { name: 'Yazdır' }).click();
      await page.waitForFunction(() => window.__printed !== null, null, { timeout: 5000 }).catch(() => {});
      const printed = await page.evaluate(() => window.__printed);
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await page.waitForTimeout(200);
      const cleaned = (await page.locator('#sema-yazdir').count()) === 0 && !(await page.evaluate(() => [...document.querySelectorAll('style')].some((s) => s.textContent.includes('size: A4'))));
      check('şemayı yazdır: yazdırılırken sayfada yalnızca şema (ekranda gizli), A4 yatay (şekil enine), yazdırma bitince kaldırılıyor',
        printed !== null && printed.svg && printed.hiddenOnScreen === true && /size: A4 landscape/.test(printed.page) && cleaned, JSON.stringify(printed));
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      // O anki değerlerle: devre çalışırken seçilebilir; kablolar gerilimin rengiyle, A1 okumasıyla.
      await page.locator('header').getByRole('button', { name: 'Oynat', exact: true }).click();
      await page.waitForTimeout(1500);
      await page.keyboard.press('Control+p');
      const dlg2 = dialogOf(page);
      await ready(dlg2);
      const enabled = await dlg2.getByRole('checkbox', { name: /O anki değerlerle/ }).isEnabled();
      await dlg2.getByRole('checkbox', { name: /O anki değerlerle/ }).click();
      await page.waitForTimeout(300); await ready(dlg2);
      const live = readFileSync((await download(page, () => dlg2.getByRole('button', { name: 'SVG indir' }).click())).path, 'utf8');
      const strokes = new Set([...live.matchAll(/<polyline[^>]*stroke="([^"]+)"/g)].map((m) => m[1]));
      const liveW = Number(/^<svg xmlns="[^"]+" width="(\d+)"/.exec(live)?.[1]);
      const chip = /<g data-legend="">[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="28"[\s\S]*?>(Gerilim ±[^<]+)<\/text>/.exec(live);
      check('şemayı indir: "O anki değerlerle" devre çalışırken seçilebiliyor; kablolar gerilimin rengiyle (birden çok renk), A1 okuması (mA) çizimde; sağ altta gerilim renk ölçeği ("Gerilim ±10 V", ekrandaki çip gibi)',
        enabled && strokes.size > 1 && /\d,\d+\s?mA/.test(live.replace(/<[^>]+>/g, '')) && chip !== null && chip[4] === 'Gerilim ±10 V' && Math.abs(Number(chip[1]) + Number(chip[3]) - (liveW - 24)) < 1,
        `${strokes.size} renk · ölçek ${chip?.[4]} sağ kenar ${chip ? Number(chip[1]) + Number(chip[3]) : '?'} / ${liveW - 24}`);
      await page.keyboard.press('Escape');
      await ctx.close();
    }
    {
      // Şebeke toprağı işareti (FG1, OSC1): sade çizimde siyah; o anki değerlerle (ve ekranda) yeşil.
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
      await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
      await page.goto(URL0, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
      await (await pickExample(page, (p) => p.getByRole('button', { name: 'Yarım dalga doğrultmaç', exact: true }))).click(); await page.waitForTimeout(500);
      await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
      const screenGreen = await page.locator('svg.schematic g[stroke="var(--color-earth)"]').count();
      await page.keyboard.press('Control+p');
      const dlg = dialogOf(page);
      await ready(dlg);
      const plain = readFileSync((await download(page, () => dlg.getByRole('button', { name: 'SVG indir' }).click())).path, 'utf8');
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      await page.locator('header').getByRole('button', { name: 'Oynat', exact: true }).click();
      await page.waitForTimeout(1200);
      await page.keyboard.press('Control+p');
      const dlg2 = dialogOf(page);
      await ready(dlg2);
      await dlg2.getByRole('checkbox', { name: /O anki değerlerle/ }).click();
      await page.waitForTimeout(300); await ready(dlg2);
      const live = readFileSync((await download(page, () => dlg2.getByRole('button', { name: 'SVG indir' }).click())).path, 'utf8');
      const green = (svg) => (svg.match(/<g stroke="#1b7d44"/g) ?? []).length;
      check('şemayı indir (şebeke toprağı işareti): ekranda yeşil; sade çizimde siyah (FG1 ve OSC1’de yeşil yok), o anki değerlerle yeşil kalıyor',
        screenGreen === 2 && green(plain) === 0 && green(live) === 2, `ekran ${screenGreen} · sade ${green(plain)} · o anki ${green(live)}`);
      await page.keyboard.press('Escape');
      await ctx.close();
    }
    {
      // Koyu tema: ekran koyu kalır; şemanın ve Analiz grafiğinin PNG'si açık renkli, beyaz zeminli.
      const { ctx, page } = await desktop('dark');
      const screenDark = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.keyboard.press('Control+p');
      const dlg = dialogOf(page);
      await ready(dlg);
      const svg = readFileSync((await download(page, () => dlg.getByRole('button', { name: 'SVG indir' }).click())).path, 'utf8');
      const png = await pngInfo(page, (await download(page, () => dlg.getByRole('button', { name: 'PNG indir' }).click())).path);
      check('şemayı indir (koyu tema): ekran koyu kalıyor; indirilen şema açık temanın renkleriyle (çizgiler #1d2733, koyu temanın #d9e0e7 yok), PNG beyaz zeminli',
        screenDark === 'dark' && svg.includes('#1d2733') && !svg.includes('#d9e0e7') && png.rgb.every((c) => c >= 250), `${screenDark} · rgb ${png.rgb}`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(300);
      const drawer = page.getByRole('region', { name: 'Analiz' });
      await drawer.getByRole('button', { name: /ID – VDS ailesi/ }).click();
      await drawer.getByText(/^Tarama bitti/).waitFor({ timeout: 30000 }).catch(() => {});
      const panelDark = await drawer.evaluate((el) => getComputedStyle(el).backgroundColor);
      const graph = await download(page, () => drawer.getByRole('button', { name: 'PNG', exact: true }).click());
      const g = await pngInfo(page, graph.path);
      const mid = await pngInfo(page, graph.path, 4, Math.round(g.h / 2));
      check('koyu temada indirilen grafik PNG’si beyaz zeminli (açık temanın renkleriyle); ekrandaki grafik koyu kalıyor',
        /^tarama-\d{4}-\d{2}-\d{2}\.png$/.test(graph.name) && g.rgb.every((c) => c >= 250) && mid.rgb.every((c) => c >= 250) && panelDark !== 'rgb(255, 255, 255)',
        `${graph.name} ${g.w}×${g.h} köşe ${g.rgb} · sol orta ${mid.rgb} · ekran ${panelDark}`);
      await page.locator('header').getByRole('button', { name: 'Oynat', exact: true }).click();
      await page.waitForTimeout(1500);
      await page.keyboard.press('Control+p');
      const dlg2 = dialogOf(page);
      await ready(dlg2);
      await dlg2.getByRole('checkbox', { name: /O anki değerlerle/ }).click();
      await page.waitForTimeout(300); await ready(dlg2);
      const liveDark = readFileSync((await download(page, () => dlg2.getByRole('button', { name: 'SVG indir' }).click())).path, 'utf8');
      const hsl = [...liveDark.matchAll(/<polyline[^>]*stroke="(hsl\([^"]+\))"/g)].map((m) => m[1]);
      check('şemayı indir (koyu tema, o anki değerlerle): kablolar açık temanın gerilim renkleriyle (doygunluk %75; koyu temanın %60 açık tonları yok)',
        hsl.length > 0 && hsl.every((c) => / 75% /.test(c)), [...new Set(hsl)].slice(0, 3).join(', '));
      await ctx.close();
    }
    {
      // Telefon: dosya sayfasında; pencere tam ekran, üç düğme tek satırda (≥ 44 px, yazı kırılmıyor), PNG paylaş.
      const { page } = await phone();
      await openExample(page, EX);
      await page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => Array.isArray(d?.files) });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })); } });
      });
      await phoneFileSheet(page);
      await page.getByRole('button', { name: 'Şemayı indir / yazdır…' }).tap();
      const dlg = dialogOf(page);
      await ready(dlg);
      const box = await dlg.boundingBox();
      const buttons = await dlg.getByRole('button', { name: /^(Yazdır|SVG indir|PNG paylaş)$/ }).evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, y: Math.round(e.getBoundingClientRect().y), fits: e.scrollWidth <= e.clientWidth + 1 })));
      await dlg.getByRole('button', { name: 'PNG paylaş' }).tap();
      await page.waitForFunction(() => window.__shared !== undefined, null, { timeout: 8000 }).catch(() => {});
      const shared = await page.evaluate(() => window.__shared ?? null);
      check('şemayı indir (telefon): dosya sayfasında; pencere tam ekran; Yazdır, SVG, PNG paylaş tek satırda (≥ 44 px, yazılar sığıyor); PNG paylaş bir PNG dosyası paylaşıyor; sayfa kaymıyor',
        box !== null && box.y <= 1 && box.height >= 843 && buttons.length === 3 && buttons.every((b) => b.h >= 44 && b.fits && b.y === buttons[0].y) &&
          shared !== null && shared[0]?.type === 'image/png' && /^sema-\d{4}-\d{2}-\d{2}\.png$/.test(shared[0]?.name ?? '') && !(await pageScrolls(page)),
        `${JSON.stringify(buttons)} · ${JSON.stringify(shared)}`);
      await page.context().close();
    }
  }
  // --- Analiz → Eğri izleyici (A3, N3): Worker'da DC tarama, basamaklar, transfer, yük doğrusu, iptal ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    let workers = 0;
    page.on('worker', () => (workers += 1));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /BF245A: çıkış ve transfer/ }).first())).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(200);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    await openAnalysisGraph(drawer, 'curve', { part: 'J1' });
    const summary = drawer.getByText(/noktalık DC tarama$/);
    await summary.waitFor({ timeout: 30000 }).catch(() => {});
    const pill = ((await drawer.locator('p.rounded-full').textContent()) ?? '').replace(/\s+/g, ' ');
    const loadSwitch = drawer.getByRole('switch', { name: /Yük doğrusu ve Q noktası/ });
    const marks = await page.locator('svg.schematic text').allTextContents();
    const chips = await drawer.getByRole('button', { name: /basamağını kaldır$/ }).count();
    check('eğri izleyici (N3): BF245A çıkış ailesi Worker’da taranıyor (4 × 31); V_DS = 10 V’ta I_D 4,14 / 3,25 / 2,46 / 1,78 mA; R_D ile drain arasında ampermetre varken yük doğrusu soluk; şemada "Taranan parça: J1"',
      (await summary.textContent()) === '4 × 31 noktalık DC tarama' && /4,14.*3,25.*2,46.*1,78/.test(pill) && workers >= 1 && (await loadSwitch.isDisabled()) && ((await loadSwitch.textContent()) ?? '').includes('Devrede RD yok') &&
      marks.includes('Taranan parça: J1') && chips === 4 && (await drawer.getByRole('img', { name: 'Eğri izleyici: J1, 4 eğri' }).count()) === 1,
      `${await summary.textContent()} · ${pill.slice(0, 70)} · iş parçacığı ${workers}`);
    await drawer.getByRole('button', { name: 'Basamak ekle' }).click();
    await drawer.getByRole('textbox', { name: /Yeni basamak değeri/ }).fill('-0,8'); await page.keyboard.press('Enter');
    await page.getByText('5 × 31 noktalık DC tarama').waitFor({ timeout: 30000 }).catch(() => {});
    const five = await drawer.getByText(/noktalık DC tarama$/).textContent().catch(() => '');
    await drawer.getByRole('radio', { name: 'Transfer' }).click();
    await page.getByText(/^1 × \d+ noktalık DC tarama$/).waitFor({ timeout: 30000 }).catch(() => {});
    const transfer = await drawer.getByText(/noktalık DC tarama$/).textContent().catch(() => '');
    await drawer.getByRole('button', { name: 'Yeniden tara' }).click();
    const cancelVisible = await drawer.getByRole('button', { name: 'İptal' }).isVisible().catch(() => false);
    if (cancelVisible) await drawer.getByRole('button', { name: 'İptal' }).click();
    await page.waitForTimeout(200);
    check('eğri izleyici: + ile basamak eklenince yeniden taranıyor (5 eğri); Transfer tek eğri; Yeniden tara ve İptal',
      five === '5 × 31 noktalık DC tarama' && /^1 × \d+ noktalık DC tarama$/.test(transfer ?? '') && (await drawer.getByRole('button', { name: 'Yeniden tara' }).isVisible()), `${five} · ${transfer} · iptal ${cancelVisible}`);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /BC107 yükselteç: kuplajlı/ }).first())).click(); await page.waitForTimeout(500);
    // v2: grafikler devreyle kaydedilir; yeni devre başlangıç ekranıyla açılır, eğri izleyici yeniden açılır.
    await openAnalysisGraph(drawer, 'curve', { part: 'Q1' });
    await drawer.getByText(/noktalık DC tarama$/).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const bjtSwitch = drawer.getByRole('switch', { name: /Yük doğrusu ve Q noktası/ });
    const qText = await drawer.getByRole('img', { name: /^Eğri izleyici: Q1/ }).locator('text', { hasText: /^Q$/ }).count();
    check('eğri izleyici: BC107 yükselteçte basamak I_B (µA), yük doğrusu R_C · 12 V ve Q noktası çiziliyor',
      !(await bjtSwitch.isDisabled()) && (await bjtSwitch.getAttribute('aria-checked')) === 'true' && ((await bjtSwitch.textContent()) ?? '').includes('RC · kaynak 12,0 V') && qText === 1 &&
      (await drawer.getByRole('button', { name: '10 µA basamağını kaldır' }).count()) === 1, ((await bjtSwitch.textContent()) ?? '').slice(0, 60));
    // Q basamağı (analiz düzeltmeleri, 9): yük doğrusu açıkken Q'daki gerçek I_B ayrı, kalın ve "Q · …"
    // etiketli eğri; öbür basamaklar aynı; aralık beslemeye (12 V) kadar. Kapatınca Q eğrisi ve uzama kalkar.
    const ends = async () => drawer.getByRole('img', { name: /^Eğri izleyici: Q1/ }).locator('text').allTextContents();
    const qLabel = (await ends()).find((x) => x.startsWith('Q · ')) ?? '';
    const qStrong = await drawer.getByRole('img', { name: /^Eğri izleyici: Q1/ }).locator('path[stroke-width="3.5"]').count();
    const toValue = await drawer.getByRole('textbox', { name: 'Bitiş' }).inputValue();
    const summaryOn = (await drawer.getByText(/noktalık DC tarama$/).textContent()) ?? '';
    await bjtSwitch.click();
    await drawer.getByText(/^4 × \d+ noktalık DC tarama$/).waitFor({ timeout: 30000 }).catch(() => {});
    const offLabels = await ends();
    const toOff = await drawer.getByRole('textbox', { name: 'Bitiş' }).inputValue();
    await bjtSwitch.click();
    check('eğri izleyici (analiz düzeltmeleri 9): yük doğrusu açıkken Q’daki gerçek I_B ayrı kalın eğri ("Q · 5,1 µA" civarı), 10–40 µA aynı; aralık 12 V’a kadar; kapatınca Q eğrisi yok, aralık 10 V',
      /^Q · (4,[89]|5,[0-4])\d* µA$/.test(qLabel) && qStrong === 1 && toValue === '12' && /^5 × 121 noktalık DC tarama$/.test(summaryOn) &&
      !offLabels.some((x) => x.startsWith('Q · ')) && toOff === '10',
      `${qLabel} · bitiş ${toValue} / ${toOff} · ${summaryOn}`);
    // MOSFET (kullanıcı kararı): yük doğrusu açıkken varsayılan basamaklar Q'daki V_GS'nin çevresinde;
    // kullanıcı bir basamağı silince onun seçtiği basamaklar kalır.
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /IRF510 yükselteç: R_S/ }).first())).click(); await page.waitForTimeout(500);
    await openAnalysisGraph(drawer, 'curve', { part: 'M1' });
    // M1'in taraması bitene kadar (önceki parçanın sonucu ekranda kalabilir).
    await drawer.getByRole('button', { name: '3,83 V basamağını kaldır' }).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(200);
    const stepChips = async () => (await drawer.getByRole('button', { name: / basamağını kaldır$/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace(' basamağını kaldır', ''))));
    const mosChips = await stepChips();
    const mosQ = (await drawer.getByRole('img', { name: /^Eğri izleyici: M1/ }).locator('text').allTextContents()).find((x) => x.startsWith('Q · ')) ?? '';
    await drawer.getByRole('button', { name: '3,83 V basamağını kaldır' }).click();
    await drawer.getByText(/^4 × \d+ noktalık DC tarama$/).waitFor({ timeout: 30000 }).catch(() => {});
    const userChips = await stepChips();
    check('eğri izleyici (MOSFET, kullanıcı kararı): yük doğrusu açıkken basamaklar Q’nun çevresinde (3,83 / 3,84 / 3,86 / 3,87 V, Q · 3,854 V); bir basamak silinince kullanıcının basamakları kalıyor',
      mosChips.join('|') === '3,83 V|3,84 V|3,86 V|3,87 V' && /^Q · 3,85\d V$/.test(mosQ) && userChips.join('|') === '3,84 V|3,86 V|3,87 V',
      `${mosChips.join(', ')} · ${mosQ} · ${userChips.join(', ')}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BF245A: çıkış ve transfer karakteristiği');
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await openAnalysisGraph(sheet, 'curve', { touch: true, part: 'J1' });
    await sheet.locator('p.rounded-full').waitFor({ timeout: 30000 }).catch(() => {});
    const pill = ((await sheet.locator('p.rounded-full').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    const curveEdit = sheet.getByRole('button', { name: /^Ayarları düzenle: / });
    const curveSummary = ((await curveEdit.getAttribute('aria-label').catch(() => '')) ?? '').replace('Ayarları düzenle: ', '');
    const curveBox = await sheet.getByRole('img', { name: /^Eğri izleyici/ }).boundingBox();
    check('eğri izleyici (telefon, analiz düzeltmeleri 7): tarama bitince ayarlar tek satıra kapanıyor ("J1 · Çıkış ailesi · VDS 0–15 V · 4 basamak · Düzenle"), grafik kaydırmadan görünüyor',
      /^J1 · Çıkış ailesi · VDS 0–15 V · \d basamak$/.test(curveSummary) && curveBox !== null && curveBox.y + curveBox.height <= ((await sheet.getByRole('button', { name: 'Yeniden tara' }).boundingBox())?.y ?? 0),
      `${curveSummary} · grafik altı ${Math.round((curveBox?.y ?? 0) + (curveBox?.height ?? 0))}`);
    await curveEdit.tap(); await page.waitForTimeout(200);
    const small = await sheet.evaluate((root) => [...root.querySelectorAll('button, [role=tab], [role=radio], select, input')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), h: r.height }; }).filter((r) => r.h > 0 && r.h < 43.5).map((r) => `${r.n} ${Math.round(r.h)}`));
    check('eğri izleyici (telefon): alt sayfada eğriler ve imleç satırı; denetimler ≥ 44 px; altta Yeniden tara ve CSV paylaş',
      /4,14.*1,78/.test(pill) && small.length === 0 && (await sheet.getByRole('button', { name: 'Yeniden tara' }).count()) === 1 && (await sheet.getByRole('button', { name: 'CSV paylaş' }).count()) === 1,
      small.join(', ') || pill.slice(0, 50));
    await page.context().close();
  }
  // --- Analiz → Ölçülen Bode (A4, N4): giriş / çıkış, 16 nokta, orta bant ve f_H, tabloya aktar, CSV -----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /BC107 yükselteç: kuplajlı/ }).first())).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(200);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    await openAnalysisGraph(drawer, 'bode');
    await drawer.getByText('✓ Ölçüm bitti').waitFor({ timeout: 60000 }).catch(() => {});
    const selects = await drawer.locator('select').evaluateAll((els) => els.map((e) => e.selectedOptions[0]?.textContent ?? ''));
    const progress = await drawer.getByRole('progressbar', { name: 'Bode ölçümünün ilerlemesi' }).getAttribute('aria-valuenow');
    const mid = ((await drawer.getByText(/^Orta bant \(/).locator('..').textContent()) ?? '').replace(/\s+/g, ' ');
    const fhChip = drawer.locator('span[title*="ara değer"]');
    const fhText = ((await fhChip.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    const charts = await drawer.getByRole('img').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const marks = await page.locator('svg.schematic text').allTextContents();
    check('Bode (N4): giriş FG1 çıkışı, çıkış Q1 kollektörü · OSC1 B; 16 / 16 nokta; orta bant ≈ 205 kat · 46,3 dB; f_H ≈ 1 MHz (ipucunda ara değer); kazanç ve faz grafikleri; şemada Giriş ve Çıkış',
      selects[0] === 'FG1 çıkışı (OUT − COM)' && /OSC1 B$/.test(selects[1] ?? '') && progress === '16' && /20[4-7],\d kat · 46,\d dB/.test(mid) && /≈ (0,9\d|1,\d\d) MHz/.test(fhText) &&
      charts.includes('Bode kazanç grafiği, 16 ölçüm noktası ve kesikli teori eğrisi') && charts.includes('Bode faz grafiği, 16 ölçüm noktası ve kesikli teori eğrisi') && marks.includes('Giriş') && marks.includes('Çıkış'),
      `${selects.join(' / ')} · ${mid} · ${fhText}`);
    // Teori (A5, küçük sinyal AC): kesikli eğri, çip (gösterge düğmesi), imleç satırı.
    const toggle = drawer.getByRole('button', { name: 'Teori eğrisini göster' });
    const theoryChip = ((await toggle.textContent()) ?? '').replace(/\s+/g, ' ');
    const dashed = await drawer.locator('svg path[stroke-dasharray="6 4"]').count();
    const cursorLine = (await drawer.getByText(/^f = /).textContent().catch(() => '')) ?? '';
    await toggle.click(); await page.waitForTimeout(150);
    const hidden = (await drawer.locator('svg path[stroke-dasharray="6 4"]').count()) === 0 && (await drawer.getByRole('img', { name: 'Bode kazanç grafiği, 16 ölçüm noktası' }).count()) === 1;
    await toggle.click(); await page.waitForTimeout(150);
    check('Bode (A5): kesikli Teori eğrisi (küçük sinyal AC) kazanç ve fazda; "Teori" çipinde orta bant ≈ 209,8 kat ve f_H; imleç satırında teori; Teori çipi (düğme, aria-pressed) gizleyip gösteriyor',
      dashed === 2 && theoryChip.startsWith('Teori') && /209,8 kat/.test(theoryChip) && /≈ 1,\d+ MHz/.test(theoryChip) && cursorLine.includes('teori') && hidden && (await toggle.getAttribute('aria-pressed')) === 'true',
      `${theoryChip} · ${cursorLine.slice(-30)}`);
    // Düzen (analiz düzeltmeleri, 1): çekmece en az 560 px; çipler ve gösterge başlık satırının altında tek
    // satırda, grafik alanının dışında; her grafik ≥ 140 px; sol sütun taşmıyor; açıklama "ⓘ" ipucunda.
    {
      const dH = (await drawer.boundingBox())?.height ?? 0;
      const tabsBox = await drawer.getByRole('tablist').boundingBox();
      const midBox = await drawer.getByText(/^Orta bant \(/).boundingBox();
      const tBox = await toggle.boundingBox();
      const gainBox = await drawer.getByRole('img', { name: /^Bode kazanç grafiği/ }).boundingBox();
      const phaseBox = await drawer.getByRole('img', { name: /^Bode faz grafiği/ }).boundingBox();
      const column = await drawer.getByRole('combobox').first().evaluate((el) => { const c = el.closest('.overflow-y-auto'); return c ? c.scrollHeight - c.clientHeight : -1; });
      const longText = await drawer.getByText(/^Kesikli çizgi teoridir/).count();
      await drawer.getByRole('button', { name: 'Ölçüm yöntemi ve teori eğrisi' }).click(); await page.waitForTimeout(150);
      const note = ((await page.getByRole('note', { name: 'Ölçüm yöntemi ve teori eğrisi' }).textContent().catch(() => '')) ?? '');
      const noteBox = await page.getByRole('note', { name: 'Ölçüm yöntemi ve teori eğrisi' }).boundingBox();
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      // İkinci tur, 4: kutu grafiklerin dışında (düğmenin üstünde), kazanç grafiğinin eksen yazılarını örtmüyor.
      const apart = noteBox !== null && gainBox !== null && (noteBox.y + noteBox.height <= gainBox.y || noteBox.x >= gainBox.x + gainBox.width);
      check('Bode (masaüstü, analiz düzeltmeleri ikinci tur 4): ⓘ kutusu grafiklerin dışında açılıyor, kazanç grafiğine binmiyor',
        apart, `kutu ${Math.round(noteBox?.x ?? 0)},${Math.round(noteBox?.y ?? 0)} ${Math.round(noteBox?.width ?? 0)}×${Math.round(noteBox?.height ?? 0)} · grafik üst ${Math.round(gainBox?.y ?? 0)}`);
      check('Bode (düzen): çekmece ≥ 560 px; çipler ve gösterge sekmelerin altında tek satırda, grafiklerin üstünde; kazanç ve faz ≥ 140 px; sol sütun taşmıyor; teori açıklaması ⓘ ipucunda',
        dH >= 559 && tabsBox !== null && midBox !== null && tBox !== null && gainBox !== null && phaseBox !== null && midBox.y > tabsBox.y + tabsBox.height && Math.abs(midBox.y + midBox.height / 2 - (tBox.y + tBox.height / 2)) < 3 &&
        midBox.y + midBox.height <= gainBox.y && gainBox.height >= 140 && phaseBox.height >= 140 && column === 0 && longText === 0 && note.includes('Kesikli çizgi teoridir') && note.includes('2 periyot'),
        `${Math.round(dH)} px · kazanç ${Math.round(gainBox?.height ?? 0)}, faz ${Math.round(phaseBox?.height ?? 0)} px · sütun taşması ${column}`);
    }
    await drawer.getByRole('button', { name: 'Tabloya aktar' }).click(); await page.waitForTimeout(200);
    const [csv] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'CSV indir' }).click()]);
    const csvText = Buffer.concat(await (await csv.createReadStream()).toArray()).toString('utf8');
    // Otomatik kayıt 0,4 s gecikmeyle yazar.
    await page.waitForTimeout(700);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre')).analysis?.rows ?? []);
    check('Bode: "Tabloya aktar" orta bant kazancını (kat, dB) ve f_H’yi tabloya geçiriyor; CSV (f, genlikler, kazanç, dB, faz, oturdu, teori kazanç ve faz)',
      saved.some((r) => r.name === 'Orta bant kazancı' && r.measured > 200) && saved.some((r) => r.name === 'f_{H} (−3 dB)' && r.unit === 'Hz') &&
      /^bode-.*\.csv$/.test(csv.suggestedFilename()) && csvText.startsWith('﻿f (Hz);giriş genliği (V);çıkış genliği (V);kazanç (kat);kazanç (dB);faz (°);oturdu;teori kazanç (kat);teori faz (°)') && csvText.split('\r\n').length >= 17,
      `${saved.length} satır · ${csv.suggestedFilename()}`);
    // Çekmece alçalınca (tutamak): iki grafik 140 px'e sığmıyor → faz gizli, "Fazı göster" ile geliyor.
    const sep = drawer.getByRole('separator', { name: 'Analiz çekmecesinin yüksekliği' });
    await sep.focus(); for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    const lowH = (await drawer.boundingBox())?.height ?? 0;
    const phaseHidden = (await drawer.getByRole('img', { name: /^Bode faz grafiği/ }).count()) === 0;
    const lowGain = (await drawer.getByRole('img', { name: /^Bode kazanç grafiği/ }).boundingBox())?.height ?? 0;
    await drawer.getByRole('button', { name: 'Fazı göster' }).click(); await page.waitForTimeout(200);
    const phaseShown = (await drawer.getByRole('img', { name: /^Bode faz grafiği/ }).boundingBox())?.height ?? 0;
    check('Bode (düzen): kullanıcının verdiği boy kalıyor; alçak çekmecede faz gizli, "Fazı göster" ile ≥ 140 px geliyor; kazanç ≥ 140 px',
      lowH < 400 && phaseHidden && lowGain >= 140 && phaseShown >= 140 && (await drawer.getByRole('button', { name: 'Fazı gizle' }).count()) === 1,
      `${Math.round(lowH)} px · kazanç ${Math.round(lowGain)} · faz ${Math.round(phaseShown)}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BC107 yükselteç: kuplajlı, R_B = 2,2 MΩ');
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await openAnalysisGraph(sheet, 'bode', { touch: true });
    // Ölçüm bitince ayarlar tek satırlık özete kapanır, grafik öne çıkar (analiz düzeltmeleri, 7).
    const edit = sheet.getByRole('button', { name: /^Ayarları düzenle: / });
    await edit.waitFor({ timeout: 60000 }).catch(() => {});
    const summary = ((await edit.getAttribute('aria-label').catch(() => '')) ?? '').replace('Ayarları düzenle: ', '');
    const gainBox = await sheet.getByRole('img', { name: /^Bode kazanç grafiği/ }).boundingBox();
    // Alttaki sabit düğmelerin (Yeniden ölç, CSV paylaş) üstünde kalmalı.
    const viewH = (await sheet.getByRole('button', { name: 'Yeniden ölç' }).boundingBox())?.y ?? page.viewportSize().height;
    check('Bode (telefon, analiz düzeltmeleri 7): ölçüm bitince ayarlar tek satıra kapanıyor ("FG1 → Q1 kollektör · 20 Hz–2 MHz · 16 nokta · Düzenle"), kazanç grafiği kaydırmadan görünüyor; Düzenle ayarları açıyor',
      summary === 'FG1 → Q1 kollektör · 20 Hz–2 MHz · 16 nokta' && gainBox !== null && gainBox.y + gainBox.height <= viewH && (await sheet.getByText('✓ Ölçüm bitti').count()) === 0,
      `${summary} · grafik ${Math.round(gainBox?.y ?? 0)}–${Math.round((gainBox?.y ?? 0) + (gainBox?.height ?? 0))} / ${viewH}`);
    {
      const info = sheet.getByRole('button', { name: 'Ölçüm yöntemi ve teori eğrisi' });
      const strip = await info.evaluate((el) => { const s = el.parentElement; return { over: s.scrollWidth - s.clientWidth, h: Math.round(s.getBoundingClientRect().height), right: Math.max(...[...s.children].map((c) => c.getBoundingClientRect().right)) }; });
      const fhText = ((await sheet.getByText(/^≈ \d/).first().textContent().catch(() => '')) ?? '');
      const vw = page.viewportSize().width;
      check('Bode (telefon, analiz düzeltmeleri ikinci tur 2): ölçü şeridi iki satıra sarılıyor, yana kaymıyor; f_H değeri tam okunuyor',
        strip.over === 0 && strip.h <= 100 && strip.right <= vw && /≈ 1,\d+ MHz/.test(fhText), `${strip.h} px · taşma ${strip.over} · ${fhText}`);
      const before = (await sheet.getByRole('img', { name: /^Bode kazanç grafiği/ }).boundingBox())?.y ?? 0;
      await info.tap(); await page.waitForTimeout(300);
      const note = page.getByRole('note', { name: 'Ölçüm yöntemi ve teori eğrisi' });
      const nb = await note.boundingBox();
      const after = (await sheet.getByRole('img', { name: /^Bode kazanç grafiği/ }).boundingBox())?.y ?? 0;
      const vh = page.viewportSize().height;
      const text = ((await note.textContent()) ?? '');
      const close = note.getByRole('button', { name: 'Açıklamayı kapat' });
      const closeH = (await close.boundingBox())?.height ?? 0;
      await close.tap(); await page.waitForTimeout(200);
      check('Bode (telefon, analiz düzeltmeleri ikinci tur 1): ⓘ metni alttan açılan sayfada görünüyor, yalnızca metin kadar yer kaplıyor, grafikleri itmiyor; Kapat ≥ 44 px',
        nb !== null && nb.x >= 0 && nb.x + nb.width <= vw + 0.5 && Math.abs(nb.y + nb.height - vh) < 1 && nb.height < 260 && text.includes('Kesikli çizgi teoridir') && Math.abs(after - before) < 1 && closeH >= 43.5 && (await note.count()) === 0,
        `sayfa ${Math.round(nb?.y ?? 0)}–${Math.round((nb?.y ?? 0) + (nb?.height ?? 0))} / ${vh} · grafik ${Math.round(before)} → ${Math.round(after)}`);
    }
    await edit.tap(); await page.waitForTimeout(200);
    const small = await sheet.evaluate((root) => [...root.querySelectorAll('button, [role=tab], select, input')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), h: r.height }; }).filter((r) => r.h > 0 && r.h < 43.5).map((r) => `${r.n} ${Math.round(r.h)}`));
    const note = await sheet.getByText(/iki ölçüm noktası arasında doğrusal ara değer/).count();
    const theoryChip = ((await sheet.getByRole('button', { name: 'Teori eğrisini göster' }).textContent().catch(() => '')) ?? '');
    check('Bode (telefon): alt sayfada ölçüm biter; f_H’nin ara değer olduğu yazıyor; Teori çipi (düğme) değeriyle; denetimler ≥ 44 px; altta Yeniden ölç ve CSV paylaş',
      (await sheet.getByText('✓ Ölçüm bitti').count()) === 1 && note === 1 && theoryChip.startsWith('Teori') && /209,8 kat/.test(theoryChip) && small.length === 0 && (await sheet.getByRole('button', { name: 'Yeniden ölç' }).count()) === 1 && (await sheet.getByRole('button', { name: 'CSV paylaş' }).count()) === 1,
      small.join(', '));
    await page.context().close();
  }
  // --- Görev (C1, N5 öğrenci, N6 hoca): bağlantı + dosya, hedefler canlı, kilitli parçalar, teslim ------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /BC107 yükselteç: kuplajlı/ }).first())).click(); await page.waitForTimeout(500);
    await circuitButton(page).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /^Görev oluştur/ }).click(); await page.waitForTimeout(300);
    const dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('textbox', { name: 'Görev adı' }).fill('Deney 7 · BJT yükselteç tasarımı');
    await dlg.getByRole('textbox', { name: 'Yönerge' }).fill('RB ve RC’yi seç. Kazanç 200 ± %10, V_{CE} yaklaşık 6 V olsun.');
    await dlg.getByRole('button', { name: 'RB', exact: true }).click();
    await dlg.getByRole('button', { name: 'RC', exact: true }).click();
    for (let i = 0; i < 3; i++) await dlg.getByRole('button', { name: 'Hedef ekle' }).click();
    const sels = dlg.getByRole('combobox', { name: 'Hedefin büyüklüğü' });
    const groups = await sels.first().locator('optgroup').evaluateAll((els) => els.map((e) => e.getAttribute('label')));
    const nodeOptions = await sels.first().locator('optgroup[label="Düğüm gerilimi"] option').allTextContents();
    const choose = async (n, text) => sels.nth(n).selectOption(await sels.nth(n).locator('option', { hasText: text }).first().getAttribute('value'));
    await choose(0, 'VCE · Q1 (DC)'); await choose(1, 'Kazanç |çıkış / giriş|'); await choose(2, 'Üst kesim fH');
    const vals = dlg.getByRole('textbox', { name: /: hedef değer$/ });
    await vals.nth(0).fill('6 V'); await vals.nth(0).blur();
    await vals.nth(1).fill('200'); await vals.nth(1).blur();
    await dlg.getByRole('combobox', { name: /karşılaştırma/ }).nth(2).selectOption('ge');
    await vals.nth(2).fill('500k'); await vals.nth(2).blur();
    await page.waitForTimeout(200);
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    const warning = (await dlg.getByRole('note').textContent()) ?? '';
    const preview = await dlg.getByRole('link', { name: 'Öğrenci gibi önizle' }).getAttribute('target');
    const [taskFile] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Görev dosyası (.json)' }).click()]);
    const taskPath = await taskFile.path();
    const sizeText = (await dlg.getByText(/^Bağlantı [\d,]+ KB$/).textContent().catch(() => '')) ?? '';
    check('görev (hoca, N6): devre menüsü → "Görev oluştur…"; ad, yönerge, değiştirilebilir parça çipleri, "Yeni parça eklenebilir", hedefler dört grupta (DC çalışma noktası, Bode, düğüm, parça); uyarı kutusu; #g= bağlantısı, önizleme yeni sekmede, görev dosyası',
      url.startsWith(URL0) && url.includes('#g=') && warning.includes('öğrenci görebilir') && warning.includes('notlu sınav için değil') && preview === '_blank' &&
      groups.join('|') === 'DC çalışma noktası|Bode|Düğüm gerilimi|Parça ölçümleri (canlı)' && nodeOptions.includes('V(Q1 kollektör)') && /^gorev-deney-7-.*\.json$/.test(taskFile.suggestedFilename()) && sizeText !== '' &&
      (await dlg.getByRole('alert').count()) === 0,
      `${url.length} karakter · ${sizeText} · ${taskFile.suggestedFilename()} · ${nodeOptions.join(', ')}`);
    check('görev (analiz düzeltmeleri 10): düğüm adları anlaşılır sırayla: kaynağın ucu (V(PS1 +), V(FG1 OUT)), transistörün ucu (V(Q1 baz), V(Q1 kollektör)); "RB 1. uç", "C1 − uç" gibi adlar yok',
      ['V(PS1 +)', 'V(FG1 OUT)', 'V(Q1 baz)', 'V(Q1 kollektör)'].every((x) => nodeOptions.includes(x)) && !nodeOptions.some((x) => /RB 1\. uç|C1 − uç/.test(x)),
      nodeOptions.join(', '));
    // 8 KB üstü: pencere söylüyor, dosyayı öneriyor (sıkışmayan uzun yönerge).
    const noise = Array.from({ length: 2600 }, (_, i) => ((i * 7919) % 9973).toString(36)).join(' ');
    await dlg.getByRole('textbox', { name: 'Yönerge' }).fill(noise); await page.waitForTimeout(200);
    const longUrl = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    const alert = (await dlg.getByRole('alert').textContent().catch(() => '')) ?? '';
    check('görev (hoca): bağlantı 8 KB’ı geçince pencere bunu söylüyor ve görev dosyasını öneriyor',
      longUrl.length > 8192 && alert.includes('Bağlantı çok uzun') && alert.includes('Görev dosyasını (.json) kullan'), `${longUrl.length} karakter · ${alert.slice(0, 40)}`);
    await dlg.getByRole('button', { name: 'Kapat' }).click();

    // Öğrenci: bağlantıyla açılır.
    const st = await ctx.newPage();
    st.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await st.goto(url, { waitUntil: 'networkidle' }); await st.waitForTimeout(800);
    const card = st.getByRole('region', { name: /^Görev: Deney 7/ });
    const cardHtml = (await card.innerHTML().catch(() => '')) ?? '';
    const chip = (await st.getByText(/^Görev kipi/).textContent().catch(() => '')) ?? '';
    const pencil = await notebook(st).locator('[data-card]').filter({ has: st.locator('[title="değiştirilebilir"]') }).count();
    const titleButton = await st.getByRole('button', { name: 'Deney 7 · BJT yükselteç tasarımı: devre menüsü' }).count();
    const locks = await notebook(st).locator('[data-card]').filter({ has: st.locator('[title="kilitli"]') }).count();
    const canvasLocks = await st.locator('svg.schematic g[aria-hidden="true"] circle[r="7.5"]').count();
    check('görev (öğrenci, N5): defterin en üstünde görev kartı (0 / 3; adlar <sub> ile: VCE, fH; "not vermez"); "Görev kipi · yalnızca RB ve RC değişir"; defterde RB, RC kalemli, öbürleri kilitli; şemada kilit rozetleri; üst çubukta görevin adı ("Devrem" değil)',
      titleButton === 1 && (await card.count()) === 1 && /V<sub[^>]*>CE<\/sub>/.test(cardHtml) && /f<sub[^>]*>H<\/sub>/.test(cardHtml) && !cardHtml.includes('V_') && !cardHtml.includes('f_') && cardHtml.includes('not vermez') &&
      chip === 'Görev kipi · yalnızca RB ve RC değişir' && pencil === 2 && locks >= 5 && canvasLocks >= 5 && (await card.getByLabel('3 hedefin 0 tanesi tuttu').count()) === 1,
      `${chip} · kalem ${pencil}, kilit ${locks}, şemada ${canvasLocks}`);
    // Kilitli Q1: kartta değer alanı ve − + devre dışı, Döndür ve Sil yok; Delete reddediliyor ("Bu parça görevde kilitli"), β değişmiyor.
    const q1Card = notebook(st).locator('[data-card]').filter({ hasText: 'Q1' }).first();
    await q1Card.click(); await st.waitForTimeout(300);
    const beta = q1Card.locator('input').first();
    const betaOff = await beta.isDisabled();
    const stepOff = await q1Card.getByRole('button', { name: /azalt|artır/ }).evaluateAll((els) => els.length >= 2 && els.every((e) => e.disabled));
    const cardActions = (await q1Card.getByRole('button', { name: 'Döndür', exact: true }).count()) + (await q1Card.getByRole('button', { name: 'Sil', exact: true }).count());
    await st.keyboard.press('Delete'); await st.waitForTimeout(400);
    const toast = (await st.getByText('Bu parça görevde kilitli: değiştirilemez.').count()) > 0;
    const q1 = await st.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre')).parts.find((p) => p.label === 'Q1')?.props.beta);
    check('görev (öğrenci): kilitli parçanın kartında değer alanı ve − + devre dışı, Döndür ve Sil yok; Delete → "Bu parça görevde kilitli" (başarı bildirimi yok); Q1 β = 200 kalıyor',
      q1 === 200 && betaOff && stepOff && cardActions === 0 && toast && (await st.getByText('Q1 silindi.').count()) === 0, `β = ${q1} · ${betaOff} ${stepOff} ${cardActions} ${toast}`);
    await st.keyboard.press('Escape');
    await st.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await st.waitForTimeout(1500);
    // VCE pencerenin ortalaması: ilk pencere açılıştaki geçici durumu da içerir, ikincisi (0,8 s) oturmuş.
    await waitSimTime(st, 0.9);
    const vce = ((await card.locator('li').first().textContent()) ?? '').replace(/\s+/g, ' ');
    await card.getByRole('button', { name: 'Bode ile ölç' }).first().click();
    await st.getByRole('region', { name: 'Analiz' }).getByText('✓ Ölçüm bitti').waitFor({ timeout: 60000 }).catch(() => {});
    await st.waitForTimeout(400);
    const rows = (await card.locator('li').allTextContents()).map((r) => r.replace(/\s+/g, ' '));
    check('görev (öğrenci): Oynat’la VCE canlı (≈ 6 V, yeşil tik); "Bode ile ölç" Analiz → Bode’u açıp ölçüyor; kazanç ≈ 205,8 ve fH ≈ 1,08 MHz tutuyor (3 / 3); hedef "200 ± %10"',
      /5,9\d V|6,0\d V/.test(vce) && (await card.getByLabel('3 hedefin 3 tanesi tuttu').count()) === 1 && (await card.getByLabel('Hedef tuttu').count()) === 3 &&
      rows.some((r) => r.includes('Hedef 200 ± %10') && /20[4-7],\d/.test(r)) && rows.some((r) => /Hedef ≥ 500 kHz.*(0,9\d|1,\d\d) MHz/.test(r)),
      rows.map((r) => r.slice(-22)).join(' | '));
    const [sub] = await Promise.all([st.waitForEvent('download'), card.getByRole('button', { name: 'Teslim dosyası (.json)' }).click()]);
    const subJson = JSON.parse(Buffer.concat(await (await sub.createReadStream()).toArray()).toString('utf8'));
    check('görev (öğrenci): "Teslim dosyası (.json)" devreyi, görevi ve hedeflerin ölçülen değerlerini indiriyor',
      /^teslim-deney-7-.*\.json$/.test(sub.suggestedFilename()) && subJson.parts?.length > 0 && subJson.teslim?.hedefler?.length === 3 && subJson.teslim.hedefler.every((h) => h.tuttu === true),
      sub.suggestedFilename());
    await card.getByRole('button', { name: 'Görevden çık' }).click(); await st.waitForTimeout(300);
    const after = await st.evaluate(() => localStorage.getItem('devre-simulatoru:gorev'));
    check('görev (öğrenci): "Görevden çık" kartı ve kilitleri kaldırıyor', (await card.count()) === 0 && after === null && (await st.getByText(/^Görev kipi/).count()) === 0);
    // Görev dosyası devre menüsü → Bilgisayardan aç (gizli dosya girişi) ile açılıyor.
    await st.locator('input[type=file]').setInputFiles(taskPath); await st.waitForTimeout(600);
    check('görev: görev dosyası devre menüsü → "Bilgisayardan aç…" (dosya girişi) ile açılınca görev kartı geliyor', (await st.getByRole('region', { name: /^Görev: Deney 7/ }).count()) === 1);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BC107 yükselteç: kuplajlı, R_B = 2,2 MΩ');
    await phoneFileSheet(page);
    await page.getByRole('button', { name: /^Görev oluştur/ }).tap(); await page.waitForTimeout(400);
    const dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('button', { name: 'RC', exact: true }).tap();
    await dlg.getByRole('button', { name: 'Hedef ekle' }).tap();
    const sel = dlg.getByRole('combobox', { name: 'Hedefin büyüklüğü' }).first();
    await sel.selectOption(await sel.locator('option', { hasText: 'Üst kesim fH' }).first().getAttribute('value'));
    const small = await dlg.evaluate((root) => [...root.querySelectorAll('button, select, input, textarea, a')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), h: r.height, fs: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName }; })
      .filter((r) => r.h > 0 && (r.h < 43.5 || (['INPUT', 'SELECT', 'TEXTAREA'].includes(r.tag) && r.fs < 16))).map((r) => `${r.n} ${Math.round(r.h)}/${r.fs}`));
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    check('görev (telefon, N6): devrenin adı (devre sayfası) → Görev oluştur; hedefler ≥ 44 px, yazı alanları 16 px; sayfa kaymıyor', small.length === 0 && !(await pageScrolls(page)), small.join(', '));
    // Yalnız # değişirse tarayıcı sayfayı yeniden yüklemez: önce boş sayfa.
    await page.goto('about:blank'); await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const card = page.getByRole('region', { name: /^Görev:/ });
    const bodeBox = await card.getByRole('button', { name: 'Bode ile ölç' }).boundingBox({ timeout: 5000 }).catch(() => null);
    const taskBar = await phoneBarButtons(page);
    check('görev (telefon, N5): görev kartı defterin en üstünde; "Bode ile ölç" ≥ 44 px; yeni parça kapalıyken alttaki çubukta Parça ve Kablo yok (yalnızca Oynat); sayfa kaymıyor',
      (await card.count()) === 1 && bodeBox !== null && bodeBox.height >= 44 && (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 0 &&
      taskBar === 'Oynat' && !(await pageScrolls(page)),
      `Bode ile ölç ${Math.round(bodeBox?.height ?? 0)} px · çubuk ${taskBar}`);
    await page.context().close();
  }
  // --- Görevde önce tahmin (B1): tahminler kaydedilmeden Oynat ve ölçüm kapalı, sonra yan yana -------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /BC107 yükselteç: kuplajlı/ }).first())).click(); await page.waitForTimeout(500);
    await circuitButton(page).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /^Görev oluştur/ }).click(); await page.waitForTimeout(300);
    const dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('textbox', { name: 'Görev adı' }).fill('Ön hazırlık: BJT yükselteç');
    await dlg.getByRole('button', { name: 'RC', exact: true }).click();
    const predictSwitch = dlg.getByRole('switch', { name: /Öğrenci önce tahmin etsin/ });
    await predictSwitch.click();
    const note = await dlg.getByText(/Oynat’a basamaz ve ölçüm alamaz/).count();
    for (let i = 0; i < 2; i++) await dlg.getByRole('button', { name: 'Hedef ekle' }).click();
    const sels = dlg.getByRole('combobox', { name: 'Hedefin büyüklüğü' });
    const choose = async (n, text) => sels.nth(n).selectOption(await sels.nth(n).locator('option', { hasText: text }).first().getAttribute('value'));
    await choose(0, 'VCE · Q1 (DC)'); await choose(1, 'Kazanç |çıkış / giriş|');
    const vals = dlg.getByRole('textbox', { name: /: hedef değer$/ });
    await vals.nth(0).fill('6 V'); await vals.nth(0).blur();
    await vals.nth(1).fill('200'); await vals.nth(1).blur();
    await page.waitForTimeout(200);
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    check('tahmin (hoca, B1): görev penceresinde "Öğrenci önce tahmin etsin" anahtarı ve açıklaması', (await predictSwitch.getAttribute('aria-checked')) === 'true' && note === 1);

    const st = await ctx.newPage();
    st.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await st.goto(url, { waitUntil: 'networkidle' }); await st.waitForTimeout(800);
    const card = st.getByRole('region', { name: /^Görev:/ });
    const before = ((await card.textContent()) ?? '').replace(/\s+/g, ' ');
    const inputs = card.getByRole('textbox', { name: /: tahminin$/ });
    const lock = card.getByRole('button', { name: 'Tahminleri kaydet' });
    await st.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await st.waitForTimeout(400);
    const blockedPlay = (await st.getByText('Önce görev kartında tahminlerini yaz ve kaydet.').count()) >= 1 && (await st.getByRole('button', { name: 'Duraklat' }).count()) === 0;
    await st.getByRole('button', { name: 'Analiz', exact: true }).click(); await st.waitForTimeout(200);
    const drawer = st.getByRole('region', { name: 'Analiz' });
    // v2: başlangıç ekranında Frekansa göre (Bode), eğri izleyici ve tarama kartları yok; nedeni yazıyor.
    const blockedBode = (await drawer.getByText('Önce görev kartında tahminlerini yaz ve kaydet.').count()) === 1 && (await drawer.getByRole('button', { name: /^Frekansa göre/ }).count()) === 0 && (await drawer.getByRole('button', { name: 'Yeniden ölç' }).count()) === 0;
    check('tahmin (öğrenci, B1): kart "Önce tahmin et", her hedefe tahmin alanı, ölçülen gizli; kaydetmeden Oynat ve Analiz → Bode kapalı (nedeni yazıyor); "Tahminleri kaydet" hepsi yazılınca etkin',
      before.startsWith('Önce tahmin et') && (await inputs.count()) === 2 && !/5,9\d V/.test(before) && blockedPlay && blockedBode && !(await lock.isEnabled()),
      before.slice(0, 60));
    // Gerekçe ve güven (analiz düzeltmeleri, 6): güven seçilmeden kaydedilemez; gerekçe en çok 200 karakter.
    const reasons = card.getByRole('textbox', { name: /: neden\? \(isteğe bağlı\)$/ });
    const groups = card.getByRole('radiogroup', { name: /: ne kadar eminsin\?$/ });
    const reasonMax = await reasons.first().getAttribute('maxlength');
    await inputs.nth(0).fill('6 V'); await inputs.nth(1).fill('180'); await st.waitForTimeout(100);
    const noConfidenceDisabled = !(await lock.isEnabled()) && ((await card.textContent()) ?? '').includes('ne kadar emin olduğunu seç');
    await groups.nth(0).getByRole('radio', { name: 'Eminim' }).click();
    await groups.nth(1).getByRole('radio', { name: 'Eminim' }).click();
    await reasons.nth(0).fill('RC ile RB, VCE’yi beslemenin yarısına getirecek seçildi');
    const options = await groups.first().getByRole('radio').allTextContents();
    check('tahmin (öğrenci, analiz düzeltmeleri 6): her hedefte isteğe bağlı "Neden?" (en çok 200 karakter) ve zorunlu güven seçimi (Tahmin ettim · Emin değilim · Eminim); güven seçilmeden kaydedilemiyor',
      reasonMax === '200' && options.join('|') === 'Tahmin ettim|Emin değilim|Eminim' && noConfidenceDisabled && (await groups.nth(0).getByRole('radio', { name: 'Eminim' }).getAttribute('aria-checked')) === 'true',
      `${options.join('|')} · max ${reasonMax}`);
    await inputs.nth(1).fill('');
    // Yazarken sayılır (analiz düzeltmeleri, 5): son kutudan çıkmadan sayaç 2 / 2, düğme etkin; geçersiz
    // yazı sayılmaz ama uyarısı ancak kutudan çıkınca.
    await inputs.nth(0).fill('6 V'); await inputs.nth(0).blur();
    await inputs.nth(1).fill('180'); await st.waitForTimeout(100);
    const typedCount = ((await card.textContent()) ?? '').includes('2 hedefin 2 tanesine tahmin yazıldı');
    const typedEnabled = await lock.isEnabled();
    await inputs.nth(1).fill('18x'); await st.waitForTimeout(100);
    const typingWarn = await card.getByText('Sayı değil').count();
    const invalidDisabled = !(await lock.isEnabled());
    await inputs.nth(1).blur(); await st.waitForTimeout(100);
    const blurWarn = await card.getByText('Sayı değil').count();
    check('tahmin (öğrenci): yazarken geçerli sayı hemen sayılıyor (son kutudan çıkmadan 2 / 2, "Tahminleri kaydet" etkin); geçersiz yazı sayılmıyor, uyarısı kutudan çıkınca',
      typedCount && typedEnabled && typingWarn === 0 && invalidDisabled && blurWarn === 1, `sayaç ${typedCount} · etkin ${typedEnabled} · uyarı ${typingWarn}/${blurWarn}`);
    await inputs.nth(1).fill('180'); await inputs.nth(1).blur();
    await st.waitForTimeout(150);
    const enabled = await lock.isEnabled();
    await lock.click(); await st.waitForTimeout(300);
    const savedLine = await card.getByText('Tahminler kaydedildi. Şimdi Oynat’a bas ve ölç.').count();
    // v2: tahminler kaydedilince başlangıç ekranında Frekansa göre (Bode) açılıyor; kazanç hedefi Bode'dan ölçülür.
    await openAnalysisGraph(drawer, 'bode');
    await st.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await st.waitForTimeout(300);
    const measuringLine = await card.getByText('Ölçülüyor…').count();
    await st.waitForTimeout(1200);
    await drawer.getByText('✓ Ölçüm bitti').waitFor({ timeout: 60000 }).catch(() => {});
    await st.waitForTimeout(400); await waitSimTime(st, 0.9);
    const cardText = ((await card.textContent()) ?? '').replace(/\s+/g, ' ');
    check('tahmin (öğrenci, analiz düzeltmeleri ikinci tur 3): kaydedince "Şimdi Oynat’a bas", devre çalışınca "Ölçülüyor…", hedeflerin hepsi ölçülünce bu satır kalkıyor ve karşılaştırma görünüyor ("2 tahminin 1 tanesi ölçülenle uyuştu")',
      savedLine === 1 && measuringLine === 1 && !cardText.includes('Tahminler kaydedildi') && !cardText.includes('Ölçülüyor') && cardText.includes('Karşılaştırma: 2 tahminin 1 tanesi ölçülenle uyuştu.'),
      `${savedLine}/${measuringLine} · ${cardText.match(/Karşılaştırma[^.]*\./)?.[0] ?? '—'}`);
    const rows = (await card.locator('li').allTextContents()).map((r) => r.replace(/\s+/g, ' '));
    check('tahmin (öğrenci): kaydedince Oynat ve Bode çalışıyor; satırda "Tahmin 6 V · fark %0,2 · Eminim" ve ölçülen 5,99 V, kazançta "Tahmin 180 · fark %13 · Eminim" ve 205,8',
      enabled && (await st.getByRole('button', { name: 'Duraklat' }).count()) === 1 && rows.some((r) => /Tahmin 6 V · fark %0,\d · Eminim/.test(r) && /5,9\d V/.test(r)) && rows.some((r) => r.includes('Tahmin 180 · fark %1') && r.includes('· Eminim') && /20[4-7],\d/.test(r)),
      rows.map((r) => r.slice(0, 90)).join(' | '));
    const lockedInputs = (await card.getByRole('textbox').count()) + (await card.getByRole('radiogroup').count());
    check('tahmin (öğrenci, 6): kaydedince gerekçe ve güven de kilitli (alan yok); gerekçe satırda; "Eminim" deyip ölçülenden toleranstan çok uzak kalan kazanç tahmininde "Emindin ama sonuç farklı" notu, tutan VCE tahmininde yok',
      lockedInputs === 0 && rows.some((r) => r.includes('Neden: RC ile RB') && !r.includes('Emindin')) && rows.some((r) => r.includes('Tahmin 180') && r.includes('Emindin ama sonuç farklı: nedenini düşün.')),
      `${lockedInputs} alan`);
    const [sub] = await Promise.all([st.waitForEvent('download'), card.getByRole('button', { name: 'Teslim dosyası (.json)' }).click()]);
    const subJson = JSON.parse(Buffer.concat(await (await sub.createReadStream()).toArray()).toString('utf8'));
    await st.reload({ waitUntil: 'networkidle' }); await st.waitForTimeout(600);
    const kept = ((await st.getByRole('region', { name: /^Görev:/ }).textContent()) ?? '').includes('Tahmin 6 V');
    check('tahmin (öğrenci): teslim dosyasında her hedefin tahmini, gerekçesi ve güveni; sayfa yenilenince tahminler kaydedilmiş hâliyle duruyor',
      subJson.teslim.hedefler.map((h) => h.tahmin).join(',') === '6,180' && subJson.teslim.hedefler.map((h) => h.guven).join(',') === 'Eminim,Eminim' &&
      subJson.teslim.hedefler[0].gerekce.startsWith('RC ile RB') && subJson.teslim.hedefler[1].gerekce === '' && kept);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BC107 yükselteç: kuplajlı, R_B = 2,2 MΩ');
    await phoneFileSheet(page);
    await page.getByRole('button', { name: /^Görev oluştur/ }).tap(); await page.waitForTimeout(400);
    const dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('switch', { name: /Öğrenci önce tahmin etsin/ }).tap();
    await dlg.getByRole('button', { name: 'Hedef ekle' }).tap();
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    await page.goto('about:blank'); await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const card = page.getByRole('region', { name: /^Görev:/ });
    const small = await card.evaluate((root) => [...root.querySelectorAll('button, input')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), h: r.height, fs: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName }; })
      .filter((r) => r.h > 0 && (r.h < 43.5 || (r.tag === 'INPUT' && r.fs < 16))).map((r) => `${r.n} ${Math.round(r.h)}/${r.fs}`));
    check('tahmin (telefon, B1): kartta tahmin alanı ve "Tahminleri kaydet" ≥ 44 px, yazı 16 px; sayfa kaymıyor',
      (await card.getByRole('textbox', { name: /: tahminin$/ }).count()) === 1 && small.length === 0 && !(await pageScrolls(page)), small.join(', '));
    await page.context().close();
  }
  // --- Arıza bulma (B2, R1–R5): gizli arıza, otomatik göstergeler kapalı, multimetre, günlük, bildir ------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    // Düğüm gerilimleri ve akım noktaları açık olsa da arıza kipinde görünmez.
    await page.evaluate(() => localStorage.setItem('devre-simulatoru:ayarlar', JSON.stringify({ nodeVoltages: true, currentDots: true })));
    await page.goto('about:blank'); await page.goto(faultUrl(), { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await page.waitForTimeout(2500);
    const strokes = await page.evaluate(() => [...new Set([...document.querySelectorAll('svg.schematic polyline')].map((p) => p.getAttribute('stroke')))]);
    const dots = await page.evaluate(() => document.querySelectorAll('svg.schematic line[stroke-dasharray^="0 "]').length);
    const banner = await page.getByText('Arıza bulma · otomatik göstergeler kapalı', { exact: true }).count();
    const hidden = await page.getByText('canlı değerler gizli', { exact: true }).count();
    const problemsShown = await page.locator('#defter [data-notebook="problem"]').count();
    const legend = (await page.getByRole('note', { name: 'Gösterim' }).count()) + (await page.getByRole('button', { name: 'Gösterim: kablo gerilimi ölçeği' }).count());
    const osc = ((await page.locator('[data-card]').filter({ hasText: 'OSC1' }).first().textContent()) ?? '').replace(/\s+/g, ' ');
    check('arıza (B2, 2. aşama): şerit "Arıza bulma · otomatik göstergeler kapalı"; çalışırken kablolar renksiz, akım noktası, düğüm etiketi ve gerilim göstergesi (çip ya da kutu) yok; defterde "canlı değerler gizli"; osiloskop kartı ölçmeye devam ediyor',
      banner === 1 && strokes.every((x) => x === 'var(--color-symbol)' || x === 'currentColor') && dots === 0 && legend === 0 && hidden === 1 && problemsShown === 0 && /mVpp/.test(osc),
      `${strokes.join(',')} · ${osc.slice(0, 40)}`);
    // 3. aşama (R1): multimetre paneli, uçlar bacağa ya da kabloya; bacak ile düğüm ayrı okunur; Ω durmuşken.
    {
      const panel = page.getByRole('region', { name: 'Multimetre' });
      const reading = async () => ((await panel.getByRole('img').getAttribute('aria-label')) ?? '').replace('Multimetrenin okuması: ', '');
      const place = async (color, gx, gy) => {
        await panel.getByRole('button', { name: new RegExp(`^${color} u`) }).click(); await page.waitForTimeout(150);
        const p = await screen(page, gx, gy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(1500);
      };
      const start = ((await panel.textContent()) ?? '').replace(/\s+/g, ' ');
      await panel.getByRole('button', { name: /^Kırmızı ucu şemaya koy/ }).click(); await page.waitForTimeout(150);
      const hint = await page.getByText('Kırmızı ucu koy: şemada bir bacağa ya da kabloya tıkla').count();
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      await place('Kırmızı', 44, -4);
      const leg = await reading();
      const tag = await page.getByText('Kırmızı uç · RC alt bacağı', { exact: true }).count();
      await place('Kırmızı', 44, -2);
      const node = await reading();
      check('arıza (B2, 3. aşama, R1): multimetre paneli (iç direnç 10 MΩ, V ⎓ · V ∿ · Ω), siyah uç toprakta; kırmızı uç RC’nin kopuk bacağında 11,99 V, hemen yanındaki kollektör kablosunda mV (bacak ile düğüm ayrı)',
        start.includes('iç direnç 10 MΩ') && start.includes('GND1') && hint === 1 && leg === '11,99 V ⎓' && tag === 1 && /^\d+,\d+ mV ⎓$/.test(node), `${leg} · ${node}`);
      await panel.getByRole('radio', { name: /^Direnç/ }).click(); await page.waitForTimeout(200);
      const running = ((await panel.textContent()) ?? '').includes('Ω ölçmek için simülasyonu durdur');
      await page.getByRole('button', { name: 'Durdur', exact: true }).first().click(); await page.waitForTimeout(400);
      await place('Kırmızı', 44, -12); await place('Siyah', 44, -4);
      const rc = await reading();
      await place('Siyah', 44, -2);
      const open = await reading();
      check('arıza (B2, 3. aşama): Ω yalnızca simülasyon durmuşken; RC’nin iki bacağı ≈ 5,6 kΩ, RC üst bacağı ile kollektör arası MΩ (bacak kopuk)',
        running && /^5,(59\d|600) kΩ$/.test(rc) && /MΩ$|^OL/.test(open), `${rc} · ${open}`);
      // 4. aşama: ölçüm günlüğü kendiliğinden (uçlar taşınırken her kararlı okuma, Ω'da durunca hemen);
      // aynı nokta ve kip bir kez (RC'nin iki bacağı yeniden ölçülünce yazılmaz); siyah uç toprakta değilse iki nokta.
      await place('Kırmızı', 44, -12); await place('Siyah', 44, -4);
      const log = (await page.getByRole('region', { name: /^Arıza bul:/ }).locator('ol li').allTextContents()).map((r) => r.replace(/\s+/g, ' ').trim());
      const count = ((await page.getByRole('region', { name: /^Arıza bul:/ }).textContent()) ?? '').match(/(\d+) ölçüm/)?.[1];
      check('arıza (B2, 4. aşama): ölçüm günlüğü kendiliğinden yazılıyor (sıra, nokta, değer); aynı ölçüm tekrar yazılmıyor; Ω’da iki nokta R(…, …)',
        log.length === 6 && log[0] === '1V(RC alt bacağı)11,99 V' && /^2V\(Q1 kollektör\)\d+,\d+ mV$/.test(log[1] ?? '') && /^3R\(Q1 kollektör\)[\d,]+ MΩ$/.test(log[2] ?? '') &&
          log[4] === '5R(RC üst bacağı, RC alt bacağı)5,600 kΩ' && /^6R\(RC üst bacağı, Q1 kollektör\)[\d,]+ MΩ$/.test(log[5] ?? '') && count === '6',
        log.join(' | '));
      await panel.getByRole('radio', { name: /^Doğru/ }).click();
      await place('Siyah', 7, 16);
      await page.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await page.waitForTimeout(1500);
    }
    await page.locator('[data-card]').filter({ hasText: 'Q1' }).first().locator('[data-nav]').first().click(); await page.waitForTimeout(300);
    const q1 = ((await page.locator('[data-card]').filter({ hasText: 'Q1' }).first().textContent()) ?? '').replace(/\s+/g, ' ');
    await page.getByRole('button', { name: 'Analiz', exact: true }).first().click(); await page.waitForTimeout(300);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    const graphGate = ((await drawer.textContent()) ?? '').includes('Arıza bulmada serbest iz eklenmez') && (await drawer.getByRole('button', { name: /İz ekle/ }).count()) === 0;
    const bodeGate = ((await drawer.textContent()) ?? '').includes('Arıza kipinde Bode ve Eğri izleyici kapalı; ölçüm aletleriyle bul.') && (await drawer.getByRole('button', { name: /^(Frekansa göre|Parçanın karakteristiği|Bir değeri tarayarak|Zamana göre)/ }).count()) === 0;
    check('arıza (B2, 2. aşama): açık kartta canlı değer yok ("ölçü aletiyle ölç"); Analiz’de serbest iz eklenmiyor, Eğri izleyici ve Bode kapalı',
      q1.includes('Arıza bulmada canlı değerler gizli') && !/V_?BE|VBE|I_?C\b/.test(q1) && graphGate && bodeGate, q1.slice(0, 80));
    // 5. aşama (R2, R3): ipucu, yanlış bildirim, doğru bildirim → Arıza bulundu, rapor, Onar ve çalıştır.
    {
      await page.getByRole('button', { name: 'Analiz', exact: true }).first().click(); await page.waitForTimeout(300);
      const card = () => page.locator('[data-notebook="task"]').first();
      await card().getByRole('button', { name: 'İpucu' }).click(); await page.waitForTimeout(150);
      const hint = ((await card().textContent()) ?? '').includes('Beslemeden başla');
      await card().getByRole('button', { name: 'Arızayı bildir' }).click(); await page.waitForTimeout(300);
      const where = await page.getByText('Arızanın yerini şemada seç: parça, bacak ya da kablo').count();
      const panelHidden = (await page.getByRole('region', { name: 'Multimetre' }).count()) === 0;
      let p = await screen(page, 42, 4); await page.mouse.click(p.x + 8, p.y); await page.waitForTimeout(200);
      const q1Place = ((await card().textContent()) ?? '').includes('Q1 · NPN transistör');
      await card().getByRole('radio', { name: 'Yanlış değerli parça' }).click();
      await card().getByRole('button', { name: 'Bildir', exact: true }).click(); await page.waitForTimeout(300);
      const wrong = await page.getByRole('alert').filter({ hasText: 'Bu değil, ölçmeye devam et.' }).count();
      check('arıza (B2, 5. aşama, R2): İpucu genel ipucu açıyor; Arızayı bildir: multimetre gizli, "Arızanın yerini şemada seç", yer şemadan (Q1), tür; yanlış bildirimde "Bu değil, ölçmeye devam et."',
        hint && where === 1 && panelHidden && q1Place && wrong === 1, `${hint} ${where} ${panelHidden} ${q1Place} ${wrong}`);
      await card().getByRole('button', { name: 'Arızayı bildir' }).click(); await page.waitForTimeout(300);
      p = await screen(page, 44, -4); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
      const rcPlace = ((await card().textContent()) ?? '').includes('RC · Q1 kollektör tarafındaki bacak') && (await page.getByText('Seçili · RC alt bacağı', { exact: true }).count()) === 1;
      await card().getByRole('radio', { name: /^Kopuk bağlantı/ }).click();
      await card().getByRole('checkbox').first().check();
      await card().getByRole('button', { name: 'Bildir', exact: true }).click(); await page.waitForTimeout(400);
      const found = ((await card().textContent()) ?? '').replace(/\s+/g, ' ');
      const here = await page.getByText('Arıza burada: kopuk bacak', { exact: true }).count();
      const [dl] = await Promise.all([page.waitForEvent('download'), card().getByRole('button', { name: 'Rapor (.json)' }).click()]);
      const rapor = JSON.parse(Buffer.concat(await (await dl.createReadStream()).toArray()).toString('utf8')).rapor;
      check('arıza (B2, 5. aşama, R3): doğru bildirimde "Arıza bulundu" (açıklama, gerekçe ölçümleri, ölçüm · bildirim · ipucu · gerekçe), şemada "Arıza burada: kopuk bacak"; Rapor (.json) günlük, bildirimler (yanlış, doğru) ve ipucuyla',
        rcPlace && found.startsWith('Arıza bulundu') && found.includes('Seni buraya götüren ölçümler') && /Bildirim2İpucu1Gerekçe1 ölçüm/.test(found) && here === 1 &&
        /^ariza-raporu-.*\.json$/.test(dl.suggestedFilename()) && rapor.olcumler.length >= 4 && rapor.bildirimler.map((b) => b.dogru).join(',') === 'false,true' && rapor.ipuclari === 1 && rapor.bulundu === true,
        `${found.slice(0, 70)} · ${dl.suggestedFilename()}`);
      await card().getByRole('button', { name: 'Onar ve çalıştır' }).click(); await page.waitForTimeout(2000);
      const strokes = await page.evaluate(() => new Set([...document.querySelectorAll('svg.schematic polyline')].map((x) => x.getAttribute('stroke'))).size);
      const legend = (await page.getByRole('note', { name: 'Gösterim' }).count()) + (await page.getByRole('button', { name: 'Gösterim: kablo gerilimi ölçeği' }).count());
      check('arıza (B2, 5. aşama): Onar ve çalıştır → arıza kalkıyor, devre çalışıyor, otomatik göstergeler (kablo renkleri) geri geliyor; multimetre panelinin arkasında renk ölçeği (çip ya da kutu) yok',
        ((await card().textContent()) ?? '').includes('Onarıldı · devre çalışıyor') && (await page.getByText('Arıza bulma · otomatik göstergeler kapalı').count()) === 0 && strokes > 2 && legend === 0, `${strokes} renk · ${legend}`);
    }
    await ctx.close();
  }
  // 6. aşama (R4): hoca Görev oluştur'da "Arıza bulma"; yer şemadan da seçilir; bağlantı hedefli görevle aynı yapıda.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /BC107 yükselteç: kuplajlı/ }).first())).click(); await page.waitForTimeout(500);
    await circuitButton(page).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /^Görev oluştur/ }).click(); await page.waitForTimeout(300);
    let dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('radio', { name: 'Arıza bulma' }).click(); await page.waitForTimeout(150);
    await dlg.getByRole('textbox', { name: 'Görev adı' }).fill('Deney 7 · arıza bul');
    await dlg.getByRole('textbox', { name: /^Belirti/ }).fill('Osiloskobun B kanalında sinyal yok.');
    const tools = await dlg.getByRole('button', { pressed: true }).allTextContents();
    const parts = (await dlg.getByRole('button', { name: 'Arıza ekle' }).count()) === 1 && (await dlg.getByRole('button', { name: 'Rastgele seç' }).count()) === 1;
    const note = ((await dlg.textContent()) ?? '').includes('Arıza bağlantının içinde durur');
    if (OUT) await page.screenshot({ path: path.join(OUT, 'ariza-gorev-olustur.png') });
    await dlg.getByRole('button', { name: 'Yeri şemadan seç' }).first().click(); await page.waitForTimeout(300);
    const pickHint = await page.getByText('Arızanın yerini şemada seç: bacak, parça ya da kablo (Esc: vazgeç)').count();
    const hidden = (await page.getByRole('dialog', { name: 'Görev oluştur' }).count()) === 0;
    const p = await screen(page, 44, -4); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300);
    dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    const place = await dlg.getByRole('combobox', { name: '1. arızanın yeri' }).evaluate((el) => el.selectedOptions[0]?.textContent ?? '');
    const kind = await dlg.getByRole('combobox', { name: '1. arızanın türü' }).evaluate((el) => el.selectedOptions[0]?.textContent ?? '');
    await dlg.getByRole('switch', { name: /Önce beklenen değeri sor/ }).click();
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    check('arıza (B2, 6. aşama, R4): Görev oluştur → "Hedefli görev | Arıza bulma"; ad, belirti, gizli arıza (yer ve tür), Arıza ekle, Rastgele seç, ölçü aletleri (V, Ω, osiloskop seçili), uyarı; yer şemadan seçiliyor (pencere kapanıp geri açılıyor); #g= bağlantısı',
      tools.join('|') === 'Multimetre V|Multimetre Ω|Osiloskop (devrede)' && parts && note && pickHint === 1 && hidden && place === 'RC · Q1 kollektör tarafındaki bacak' && kind === 'Kopuk bağlantı' && /#g=/.test(url),
      `${tools.join('|')} · ${place} · ${kind}`);
    await page.goto('about:blank'); await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const card = page.getByRole('region', { name: 'Arıza bul: Deney 7 · arıza bul' });
    const cardText = ((await card.textContent()) ?? '').replace(/\s+/g, ' ');
    await page.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await page.waitForTimeout(1200);
    const panel = page.getByRole('region', { name: 'Multimetre' });
    await panel.getByRole('button', { name: /^Kırmızı u/ }).click(); await page.waitForTimeout(150);
    const q = await screen(page, 44, -4); await page.mouse.click(q.x, q.y); await page.waitForTimeout(2000);
    const reading = (await panel.getByRole('img').getAttribute('aria-label')) ?? '';
    const expected = await card.getByRole('textbox', { name: /beklediğin değer$/ }).count();
    check('arıza (B2, 6. aşama): bağlantı öğrencide arıza kipini açıyor (kart, belirti); seçilen arıza devrede (RC bacağında 11,99 V); "Önce beklenen değeri sor" günlükte beklenen alanı',
      cardText.includes('Osiloskobun B kanalında sinyal yok.') && reading.endsWith('11,99 V ⎓') && expected === 1, `${reading} · ${expected}`);
    await ctx.close();
  }
  // Ampermetre (hoca izin verdiyse): panelde yalnızca ampermetre; kabloya "Buraya ampermetre tak",
  // kaldırınca kablo eski hâline döner; şeritte Bode ve Eğri izleyicinin kapalı olduğu yazar.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    const tools = { voltage: true, resistance: true, scope: true, ammeter: true };
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.goto('about:blank'); await page.goto(faultUrl({ tools }), { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre') ?? '{}'));
    const banner = ((await page.locator('main').getByText('Arıza kipinde Bode ve Eğri izleyici kapalı; ölçüm aletleriyle bul.').count()) === 1);
    const add = await deskAdd(page);
    await add.fill('direnç'); await page.waitForTimeout(150);
    const none = await page.getByRole('option').count();
    await add.fill('amper'); await page.waitForTimeout(150);
    const amp = await page.getByRole('option').allTextContents();
    await add.fill('');
    await page.getByRole('button', { name: /^Bütün parçalar \(/ }).click(); await page.waitForTimeout(200);
    const grid = await page.getByRole('dialog').locator('button[data-part]').evaluateAll((els) => els.map((e) => e.getAttribute('data-part')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check('arıza (ampermetre): şeritte "Arıza kipinde Bode ve Eğri izleyici kapalı; ölçüm aletleriyle bul."; parça panelinde (arama ve Bütün parçalar) yalnızca ampermetre',
      banner && none === 0 && amp.length === 1 && /Ampermetre/.test(amp[0] ?? '') && grid.join(',') === 'ammeter', `${none} · ${amp.length} · ${grid.join(',')}`);
    await page.waitForTimeout(500);
    const before = await saved();
    // Elle kablo kapalı: PS1'in uçlarından (boştaki 2+ dahil) sürükleyip bırakınca kablo eklenmiyor; W kablo aracını açmıyor.
    const ps1 = before.parts.find((x) => x.label === 'PS1');
    for (const gy of [-11, -9, -7, -5]) {
      const a = await screen(page, ps1.x + 5, gy);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 90, a.y + 40, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150);
      await page.mouse.click(a.x + 220, a.y + 140); await page.waitForTimeout(100);
    }
    await page.keyboard.press('w'); await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    const manual = await saved();
    // Kilitli PS1: kartta Döndür ve Sil yok, − + devre dışı; Delete reddediliyor ("Bu parça görevde kilitli"), PS1 duruyor.
    let pt = await screen(page, ps1.x, ps1.y); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(400);
    const psCard = page.locator(`[data-card="${ps1.id}"]`);
    const psButtons = [await psCard.getByRole('button', { name: 'Döndür', exact: true }).count(), await psCard.getByRole('button', { name: 'Sil', exact: true }).count()];
    const steppers = await psCard.getByRole('button', { name: /^[−+]$|azalt|artır/i }).evaluateAll((els) => els.map((e) => e.disabled));
    await page.keyboard.press('Delete'); await page.waitForTimeout(400);
    const lockedToast = await page.getByText('Bu parça görevde kilitli: değiştirilemez.').count();
    const deletedToast = await page.getByText('PS1 silindi.').count();
    const kept = (await saved()).parts.some((x) => x.id === ps1.id);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const lockBadges = await page.locator('svg.schematic path[d^="M-2.8 -0.2h5.6"]').count();
    const note = await page.getByText('Kırmızı ucu şemaya koy.', { exact: true }).count();
    check('arıza (masaüstü): elle kablo çizilmiyor (PS1 uçlarından sürükleme, W); kilitli PS1 kartında Döndür ve Sil yok, − + devre dışı; Delete → "Bu parça görevde kilitli", başarı bildirimi yok; kilit simgesi yok; siyah uç yerindeyken "Kırmızı ucu şemaya koy."',
      manual.wires.length === before.wires.length && JSON.stringify(manual.wires) === JSON.stringify(before.wires) && psButtons.join(',') === '0,0' && steppers.length >= 4 && steppers.every(Boolean) &&
        lockedToast === 1 && deletedToast === 0 && kept && lockBadges === 0 && note === 1,
      `${manual.wires.length}/${before.wires.length} · ${psButtons} · ${steppers.length} · ${lockedToast}/${deletedToast}/${kept} · ${lockBadges} · ${note}`);
    // Kilitli PS1 ve RC birlikte seçili (Shift): sağ panelde Döndür, Ters çevir ve Sil yok; sağ tık menüsünde de yok.
    const rc = before.parts.find((x) => x.label === 'RC');
    pt = await screen(page, ps1.x, ps1.y); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(200);
    pt = await screen(page, rc.x, rc.y); await page.keyboard.down('Shift'); await page.mouse.click(pt.x, pt.y); await page.keyboard.up('Shift'); await page.waitForTimeout(300);
    const multi = page.locator('main').getByText('2 öğe seçili', { exact: true });
    const multiBox = multi.locator('xpath=ancestor::div[contains(@class,"border-accent")][1]');
    const multiButtons = (await multi.count()) === 1 ? await multiBox.getByRole('button').allTextContents() : ['(seçim yok)'];
    await page.mouse.click(pt.x, pt.y, { button: 'right' }); await page.waitForTimeout(300);
    const rcMenu = await page.getByRole('menuitem').allTextContents();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check('arıza (masaüstü): kilitli PS1 ve RC birlikte seçiliyken sağ panelde Döndür, Ters çevir ve Sil yok; kilitli parçanın sağ tık menüsünde yalnızca Özellikler',
      multiButtons.length === 0 && rcMenu.length === 1 && /Özellikler/.test(rcMenu[0] ?? ''), `${multiButtons.join('|')} · ${rcMenu.join('|')}`);
    // Üst rayda RB bağlantısıyla köşe arasında: A1 kablonun üstünde, göstergesi altta (üstte OSC1 A kablosu); kaldırınca kablolar eski hâline.
    pt = await screen(page, 40, -16); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
    await page.getByRole('menuitem', { name: 'Buraya ampermetre tak' }).click(); await page.waitForTimeout(600);
    const rail = (await saved()).parts.find((x) => x.type === 'ammeter');
    const railFlip = (JSON.parse(await page.evaluate(() => localStorage.getItem('devre-simulatoru:ariza') ?? '{}')).meters ?? []).at(-1)?.flip;
    if (rail) { pt = await screen(page, rail.x, rail.y); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300); await page.getByRole('menuitem', { name: 'Ampermetreyi kaldır' }).click(); await page.waitForTimeout(500); }
    const railBack = JSON.stringify((await saved()).wires) === JSON.stringify(before.wires);
    // RC'nin hemen üstündeki dikey parça: yanda da yer yok → "yer yok", kablolar değişmiyor.
    pt = await screen(page, 44, -14); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
    await page.getByRole('menuitem', { name: 'Buraya ampermetre tak' }).click(); await page.waitForTimeout(500);
    const crowdedToast = await page.getByText(/^Burada ampermetreye yer yok/).count();
    const unchanged = JSON.stringify((await saved()).wires) === JSON.stringify(before.wires);
    check('arıza (ampermetre, masaüstü): üst rayda RB bağlantısının sağına tıkla → A1 kablonun üstünde (40, −16), göstergesi altta; RC’nin hemen üstündeki kısa dikey parçada "yer yok", kablolar değişmiyor',
      rail?.x === 40 && rail?.y === -16 && rail?.rotation === 0 && railFlip === true && railBack && crowdedToast >= 1 && unchanged, `${rail?.x},${rail?.y} · ${railFlip} · ${railBack} · ${crowdedToast} · ${unchanged}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // Kollektörden OSC1 B'ye giden kablo: A1 kablonun üstünde, kablonun yönünde.
    pt = await screen(page, 51, -2.3); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
    const menu = await page.getByRole('menuitem').allTextContents();
    await page.getByRole('menuitem', { name: 'Buraya ampermetre tak' }).click(); await page.waitForTimeout(700);
    const plugged = await saved();
    const meter = plugged.parts.find((x) => x.type === 'ammeter');
    await page.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await page.waitForTimeout(1500);
    await waitSimTime(page, 0.5);
    const shown = await page.locator('svg.schematic').getByText(/A$/).allTextContents();
    await page.getByRole('button', { name: 'Durdur', exact: true }).first().click(); await page.waitForTimeout(300);
    pt = await screen(page, meter.x, meter.y); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
    const menu2 = await page.getByRole('menuitem').allTextContents();
    await page.getByRole('menuitem', { name: 'Ampermetreyi kaldır' }).click(); await page.waitForTimeout(700);
    const after = await saved();
    check('arıza (ampermetre, masaüstü): kabloya tıkla → "Buraya ampermetre tak": A1 kablonun üstünde, kablonun yönünde (kablo ikiye bölünüyor, gösterge çalışıyor); ampermetreye tıkla → "Ampermetreyi kaldır": kablolar birebir eski hâline dönüyor',
      menu.join('|') === 'Buraya ampermetre tak' && meter !== undefined && meter.y === -2 && meter.rotation === 0 && plugged.parts.length === before.parts.length + 1 && plugged.wires.length === before.wires.length + 1 &&
        shown.some((x) => /\d [pnµm]?A$/.test(x)) && menu2.join('|') === 'Ampermetreyi kaldır' && JSON.stringify(after.wires) === JSON.stringify(before.wires) && after.parts.length === before.parts.length,
      `${menu.join('|')} · ${meter?.x},${meter?.y} · ${plugged.parts?.length}/${plugged.wires?.length} · ${shown.join(',')} · ${menu2.join('|')}`);
    // 3B: etiketlerde yalnızca ölçü aletlerinin değeri (PS1, FG1 değersiz), Akım düğmesi yok; panelden ampermetre → şemaya dön, "Bir kabloya tıkla".
    await page.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await page.waitForTimeout(500);
    await benchButton(page).click(); await page.waitForTimeout(3500);
    const labels = (await page.locator('[data-anchor="part"]').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    const dots = await page.getByRole('button', { name: 'Akım', exact: true }).count();
    await (await deskAdd(page)).fill('amper'); await page.waitForTimeout(200);
    await page.getByRole('option').first().click(); await page.waitForTimeout(500);
    const back = (await page.locator('svg.schematic').count()) === 1 && (await page.getByText('Bir kabloya tıkla: ampermetre oraya takılır.').count()) === 1;
    const noLoose = (await saved()).parts.length === before.parts.length;
    await page.getByRole('button', { name: 'Durdur', exact: true }).first().click(); await page.waitForTimeout(300);
    check('arıza (3B): çalışırken etiketlerde canlı değer yok (PS1, FG1 yalnızca adı; 2B kartlarıyla aynı), Akım düğmesi yok; panelden ampermetre konmuyor: şemaya dönülüyor, "Bir kabloya tıkla"',
      labels.some((t) => t === 'PS1 · DC güç kaynağı') && labels.some((t) => /^FG1 · [^0-9]*1 kHz · 20 mV t-t$/.test(t)) && !labels.some((t) => /^(PS1|FG1|RC|Q1|RB|C1) .*\d,\d{3}/.test(t)) && dots === 0 && back && noLoose,
      `${labels.filter((t) => /^(PS1|FG1)/.test(t)).join(' | ')} · ${dots} · ${back} · ${noLoose}`);
    await ctx.close();
  }
  // Ampermetre izni yoksa 3B'de Parça ekle yok.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.goto('about:blank'); await page.goto(faultUrl(), { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    // v4: arama kutusu "Parçalar" başlığındaki Parça ekle düğmesiyle açılır; izin yoksa düğme de yok.
    const addControls = async () => (await page.getByRole('combobox', { name: /parça ekle/i }).count()) + (await notebook(page).getByRole('button', { name: 'Parça ekle', exact: true }).count());
    const desk = await addControls();
    await benchButton(page).click(); await page.waitForTimeout(2500);
    const bench = await addControls();
    await page.getByRole('button', { name: 'Şema', exact: true }).first().click(); await page.waitForTimeout(300);
    check('arıza (ampermetre izni yok): şemada ve 3B\'de sağ paneldeki Parça ekle (düğme ve arama kutusu) yok', desk === 0 && bench === 0, `${desk} · ${bench}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    const tools = { voltage: true, resistance: true, scope: true, ammeter: true };
    await page.goto('about:blank'); await page.goto(faultUrl({ tools }), { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const chip = ((await page.locator('p').filter({ hasText: /^Arıza bulma/ }).first().textContent()) ?? '').replace(/\s+/g, ' ');
    const percent = await page.getByText(/^%\d+ · değerler gizli$/).count();
    check('arıza (telefon): yakınlaştırma yüzdesi kutusu yok; "değerler gizli" Arıza bulma çipinin içinde', percent === 0 && /^Arıza bulma ?· değerler gizli$/.test(chip), `${percent} · ${chip}`);
    const pt = await screen(page, 51, -2.3); await page.touchscreen.tap(pt.x, pt.y); await page.waitForTimeout(400);
    const menu = await page.getByRole('menuitem').allTextContents();
    const itemH = (await page.getByRole('menuitem').first().boundingBox())?.height ?? 0;
    await page.getByRole('menuitem', { name: 'Buraya ampermetre tak' }).tap(); await page.waitForTimeout(700);
    const d = await page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre') ?? '{}'));
    const faultBar = await phoneBarButtons(page);
    check('arıza (ampermetre, telefon): kablo bağlamaya geçmeden kabloya dokun → "Buraya ampermetre tak" (≥ 44 px) → ampermetre seri; alttaki çubukta Parça ve Kablo yok (yalnızca Oynat); sayfa kaymıyor',
      menu.join('|') === 'Buraya ampermetre tak' && itemH >= 43.5 && d.parts.filter((x) => x.type === 'ammeter').length === 1 &&
        (await page.getByRole('button', { name: /Kablo bağla/ }).count()) === 0 && faultBar === 'Oynat' && !(await pageScrolls(page)),
      `${menu.join('|')} · ${Math.round(itemH)} px · çubuk ${faultBar}`);
    await page.context().close();
  }
  // 8. aşama: Örnekler → "Arıza bul" grubu; hazır senaryo (föy deneyi), kendi açıklaması, Yeni arıza dene.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    const dlg = page.getByRole('dialog');
    // Föye dayanmayan senaryo (LED) genel gruptaki "Arıza bulma"da, öbürleri Akdeniz Üniversitesi'ninkinde.
    const mainScenarios = await dlg.locator('section[data-section="ariza"]').getByRole('button', { name: /^Arıza bul: / }).count();
    const scenarios = { length: await dlg.getByRole('button', { name: /^Arıza bul: / }).count() };
    await dlg.getByRole('button', { name: 'Arıza bul: Yükselteçte çıkış yok' }).click(); await page.waitForTimeout(600);
    const card = () => page.locator('[data-notebook="task"]').first();
    const head = ((await card().textContent()) ?? '').replace(/\s+/g, ' ');
    check('arıza (B2, 8. aşama): Örnekler’de "Arıza bul" grubu (5 hazır senaryo: temel devre, Deney 1, 2, 5, 7); BJT senaryosu kartta "Arıza bul · Deney 7", "Yükselteçte çıkış yok", belirti',
      scenarios.length === 5 && mainScenarios === 1 && head.startsWith('Arıza bul · Deney 7') && head.includes('Yükselteçte çıkış yok') && head.includes('Osiloskobun B kanalında sinyal yok.') && (await page.getByText('Arıza bulma · otomatik göstergeler kapalı').count()) === 1,
      `${scenarios.length} · ${head.slice(0, 60)}`);
    await card().getByRole('button', { name: 'Arızayı bildir' }).click(); await page.waitForTimeout(300);
    // Şekil-18: R_C'nin kollektör tarafındaki (1.) bacağı üstte, (44, −12)'de.
    const pt = await screen(page, 44, -12); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(200);
    await card().getByRole('radio', { name: /^Kopuk bağlantı/ }).click();
    await card().getByRole('button', { name: 'Bildir', exact: true }).click(); await page.waitForTimeout(400);
    const found = ((await card().textContent()) ?? '').replace(/\s+/g, ' ');
    await card().getByRole('button', { name: 'Yeni arıza dene' }).click(); await page.waitForTimeout(600);
    const next = ((await card().textContent()) ?? '').replace(/\s+/g, ' ');
    check('arıza (B2, 8. aşama): senaryonun kendi açıklaması ("RC’nin kollektör tarafındaki bacağı temas etmiyordu", belirleyici ölçüm 12,00 V ve 6,3 mV); Yeni arıza dene sıradaki senaryoyu açıyor',
      found.includes('RC’nin kollektör tarafındaki bacağı temas etmiyordu') && found.includes('Belirleyici ölçüm: RC’nin ucunda 12,00 V') && next.startsWith('Arıza bul · Temel devre') && next.includes('LED yanmıyor'),
      `${found.slice(0, 60)} → ${next.slice(0, 40)}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await page.goto('about:blank'); await page.goto(faultUrl(), { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const chip = await page.locator('p').filter({ hasText: /^Arıza bulma/ }).first().boundingBox();
    const vw = page.viewportSize().width;
    check('arıza (telefon, R5): şemanın sağ üstünde "Arıza bulma" çipi; sayfa kaymıyor',
      chip !== null && chip.x + chip.width <= vw && chip.y < 140 && !(await pageScrolls(page)), `${Math.round(chip?.x ?? 0)},${Math.round(chip?.y ?? 0)}`);
    // 7. aşama (R5): defterin yerinde arıza sayfası; önce ucu seç, sonra şemada dokun; altta İpucu ve Arızayı bildir.
    const sheet = page.getByRole('region', { name: /^Arıza bul:/ });
    const connect = (await page.getByRole('button', { name: /Kablo bağla/ }).count()) + (await phoneBar(page).getByRole('button', { name: 'Kablo', exact: true }).count());
    await phoneBar(page).locator('[data-tour="play"]').tap(); await page.waitForTimeout(1200);
    await sheet.getByRole('button', { name: /^Kırmızı u/ }).tap(); await page.waitForTimeout(200);
    const pt = await screen(page, 44, -4); await page.touchscreen.tap(pt.x, pt.y); await page.waitForTimeout(2200);
    const reading = (await sheet.getByRole('img').getAttribute('aria-label')) ?? '';
    const rows = await sheet.locator('ol li').count();
    const small = await sheet.evaluate((root) => [...root.querySelectorAll('button, input')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), h: r.height }; }).filter((r) => r.h > 0 && r.h < 43.5).map((r) => `${r.n} ${Math.round(r.h)}`));
    const bar = await sheet.getByRole('button', { name: 'Arızayı bildir' }).boundingBox();
    // v4: yüzen Oynat yok; alttaki sabit çubuk (çalışırken Duraklat) arıza sayfasının düğmelerinin altında.
    const fab = await phoneBar(page).locator('[data-tour="play"]').boundingBox();
    check('arıza (telefon, 7. aşama, R5): defterin yerinde arıza sayfası (büyük okuma, kip, iki uç düğmesi, günlük); Kablo bağla ve alttaki çubukta Kablo yok; ucu seç → şemada dokun: RC bacağında 11,99 V, günlükte; altta İpucu ve Arızayı bildir, alttaki çubuğun (Duraklat) üstünde; denetimler ≥ 44 px; sayfa kaymıyor',
      connect === 0 && reading.endsWith('11,99 V ⎓') && rows === 1 && small.length === 0 && bar !== null && fab !== null && bar.y + bar.height <= fab.y && !(await pageScrolls(page)),
      `${reading} · ${rows} satır · ${small.join(', ')}`);
    await sheet.getByRole('button', { name: 'Arızayı bildir' }).tap(); await page.waitForTimeout(300);
    const report = page.getByRole('region', { name: 'Arızayı bildir' });
    const hint = await page.getByText('Arızanın yerini şemada seç: parçaya, bacağa ya da kabloya dokun').boundingBox();
    await page.touchscreen.tap(pt.x, pt.y); await page.waitForTimeout(300);
    const where = ((await report.textContent()) ?? '').includes('RC · Q1 kollektör tarafındaki bacak');
    check('arıza (telefon, R5): Arızayı bildir kartı defterde, yer şemaya dokunarak seçiliyor; yönerge ekrana sığıyor',
      (await report.count()) === 1 && where && hint !== null && hint.x >= 0 && hint.x + hint.width <= vw, `${where} · ${Math.round(hint?.x ?? -1)}–${Math.round((hint?.x ?? 0) + (hint?.width ?? 0))}`);
    await page.context().close();
  }
  // --- Gömme (C4, C5, C8; N7, N8): Paylaş → Sayfaya göm, /embed/ sade görünüm, salt okunur, Moodle ------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: /RC dolma/ }).first())).click(); await page.waitForTimeout(500);
    const savedBefore = await page.evaluate(() => localStorage.getItem('devre-simulatoru:devre'));
    await circuitButton(page).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /^Paylaş/ }).click(); await page.waitForTimeout(300);
    const dlg = page.getByRole('dialog', { name: 'Paylaş' });
    const tabs = await dlg.getByRole('tab').allTextContents();
    await dlg.getByRole('tab', { name: 'Sayfaya göm' }).click(); await page.waitForTimeout(200);
    const codeBox = dlg.getByRole('textbox', { name: 'Gömme kodu' });
    const code = await codeBox.inputValue();
    const switches = await dlg.getByRole('switch').evaluateAll((els) => els.map((e) => `${e.textContent.trim()}=${e.getAttribute('aria-checked')}`));
    const steps = await dlg.locator('ol li').allTextContents();
    const recipe = dlg.getByRole('link', { name: 'Ayrıntılı tarif (yeni sekmede)' });
    const privacy = (await dlg.getByText(/öğrenci verisi toplamaz/).textContent()) ?? '';
    check('gömme (N7): Paylaş penceresinde "Bağlantı | Sayfaya göm"; Sade görünüm, Salt okunur açık, Oynat ve Başa al, Defter, Tam ekranda aç; iframe kodu /embed/?ornek=rc-dolma&salt-okunur=1, 560 px; Moodle’da 5 adım, Ayrıntılı tarif, gizlilik notu',
      tabs.join('|') === 'Bağlantı|Sayfaya göm' && code.startsWith(`<iframe src="${URL0}embed/?ornek=rc-dolma&salt-okunur=1"`) && code.includes('height="560"') && code.includes('title="Devre simülatörü: RC dolma"') &&
      switches.join(',') === 'Salt okunurParça ve kablo değişmez=true,Oynat ve Başa al=true,Defter paneli=false,Tam ekranda aç bağlantısı=true' &&
      (await dlg.getByRole('radio', { name: 'Sade: yalnız tezgâh' }).getAttribute('aria-checked')) === 'true' &&
      steps.length === 5 && steps[0].includes('Sayfa') && steps[4].includes('Sınav') && (await recipe.getAttribute('href'))?.endsWith('/docs/hoca/moodle-gomme.md') && (await recipe.getAttribute('target')) === '_blank' &&
      privacy.includes('GitHub Pages'),
      code.split('\n')[0]);
    await dlg.getByRole('switch', { name: 'Defter paneli' }).click();
    await dlg.getByRole('textbox', { name: 'Gömülü görünümün yüksekliği (piksel)' }).fill('640');
    await dlg.getByRole('textbox', { name: 'Gömülü görünümün yüksekliği (piksel)' }).press('Enter');
    await dlg.getByRole('button', { name: 'Kodu kopyala' }).click(); await page.waitForTimeout(200);
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check('gömme: Defter açılınca adrese defter=1, yükseklik 640; "Kodu kopyala" panoya yazıyor; ayar hatırlanıyor',
      copied.includes('&defter=1"') && copied.includes('height="640"') && (await page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:gomme')).height)) === 640,
      copied.split('\n')[0]);
    await dlg.getByRole('switch', { name: 'Defter paneli' }).click();
    await dlg.getByRole('textbox', { name: 'Gömülü görünümün yüksekliği (piksel)' }).fill('560');
    await dlg.getByRole('textbox', { name: 'Gömülü görünümün yüksekliği (piksel)' }).press('Enter');
    await dlg.getByRole('button', { name: 'Kapat' }).click();

    // Ders sayfası benzeri ev sahibinde iframe (N8).
    const host = await ctx.newPage();
    host.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await host.setContent(`<body style="margin:0"><div style="max-width:1000px;margin:40px auto">${code}</div></body>`);
    await host.waitForTimeout(2500);
    const frame = host.frames().find((f) => f.url().includes('/embed/'));
    const bar = frame ? ((await frame.getByRole('banner').textContent()) ?? '') : '';
    const open = frame ? await frame.getByRole('link', { name: 'Simülatörde aç (yeni sekmede)' }).getAttribute('href') : '';
    const frameBox = await host.locator('iframe').boundingBox();
    check('gömme (N8): iframe içinde ince şerit (simge, "RC dolma", "Salt okunur", Başa al, Oynat, Simülatörde aç), altında yalnız tezgâh; üst çubuk ve Analiz yok; 560 px',
      frame !== undefined && bar.startsWith('RC dolma') && bar.includes('Salt okunur') && bar.includes('Başa al') && bar.includes('Oynat') && open?.startsWith(`${URL0}#d=`) &&
      (await frame.getByRole('button', { name: 'Örnekler', exact: true }).count()) === 0 && (await frame.getByRole('button', { name: 'Analiz', exact: true }).count()) === 0 &&
      (await frame.locator('svg.schematic').count()) === 1 && Math.round(frameBox?.height ?? 0) === 560,
      bar);
    // Salt okunur: anahtar çalışır, parça silinmez; Başa al ilk hâle döndürür; ana kayıt değişmez.
    const strip = frame.getByRole('banner');
    await strip.getByRole('button', { name: 'Oynat', exact: true }).click(); await host.waitForTimeout(400);
    const s1 = await frame.locator('svg.schematic text', { hasText: /^S1$/ }).first().boundingBox();
    await host.mouse.click(s1.x + s1.width / 2, s1.y + s1.height + 22); await host.waitForTimeout(1500);
    const v1 = (await frame.locator('svg.schematic text[fill="#a6f4bd"]').first().textContent()) ?? '';
    await frame.locator('svg.schematic').click({ position: { x: 20, y: 20 } });
    await host.keyboard.press('Control+a'); await host.keyboard.press('Delete'); await host.waitForTimeout(300);
    const blocked = await frame.getByText('Salt okunur: parça ve kablo değiştirilemez.').count();
    const r1 = await frame.locator('svg.schematic text', { hasText: /^R1$/ }).count();
    await strip.getByRole('button', { name: 'Başa al' }).click(); await host.waitForTimeout(400);
    const after = (await strip.textContent()) ?? '';
    const savedAfter = await page.evaluate(() => localStorage.getItem('devre-simulatoru:devre'));
    check('gömme (salt okunur): Oynat’la S1’e tıklayınca anahtar kapanıyor (V1 ≈ 10 V); parça silinmiyor, "Salt okunur" bildirimi; Başa al durduruyor; asıl devrenin kaydı değişmiyor',
      /^(9,9\d|10,0)\d? V$/.test(v1.trim()) && blocked === 1 && r1 === 1 && after.includes('Oynat') && savedAfter === savedBefore,
      `V1 ${v1.trim()}`);
    // Tam uygulama ve bozuk adres
    await page.goto(`${URL0}embed/?ornek=rc-dolma&salt-okunur=1&gorunum=tam`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    const full = (await page.getByText('Salt okunur · parça ve kablo değişmez').count()) === 1 && (await page.getByRole('button', { name: 'Analiz', exact: true }).count()) === 1;
    await page.goto(`${URL0}embed/?salt-okunur=1#d=bozuk`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    check('gömme: gorunum=tam bütün uygulamayı "Salt okunur" çipiyle açıyor; bozuk adreste "Gömülü devre bulunamadı"',
      full && (await page.getByText(/^Gömülü devre bulunamadı/).count()) === 1);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await page.goto(`${URL0}embed/?ornek=rc-dolma&salt-okunur=1&defter=1`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const bar = page.getByRole('banner');
    const sizes = await bar.evaluate((root) => [...root.querySelectorAll('button, a')].map((el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    const title = await bar.getByRole('heading').evaluate((el) => ({ w: el.clientWidth, full: el.scrollWidth <= el.clientWidth }));
    check('gömme (telefon genişliğinde iframe): şeritteki hedefler ≥ 44 px, devrenin adı okunuyor; defter tezgâhın altında; sayfa kaymıyor',
      sizes.length === 3 && sizes.every((x) => x >= 44) && title.full && (await page.getByRole('complementary', { name: /^Defter/ }).count()) === 1 && !(await pageScrolls(page)),
      `${sizes.map(Math.round).join(', ')} · ad ${title.w} px${title.full ? '' : ' (kesik)'}`);
    await page.goto(URL0, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    await phoneFileSheet(page);
    await page.getByRole('button', { name: 'Sayfaya göm' }).tap(); await page.waitForTimeout(400);
    const dlg = page.getByRole('dialog', { name: 'Paylaş' });
    const small = await dlg.evaluate((root) => [...root.querySelectorAll('button, a, input, textarea, [role=tab]')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16), h: r.height, fs: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName }; })
      .filter((r) => r.h > 0 && (r.h < 43.5 || (['INPUT', 'TEXTAREA'].includes(r.tag) && r.fs < 16))).map((r) => `${r.n} ${Math.round(r.h)}/${r.fs}`));
    check('gömme (telefon): devrenin adı (devre sayfası) → Sayfaya göm, Paylaş penceresi Sayfaya göm sekmesinde; hedefler ≥ 44 px, yazı alanları 16 px; sayfa kaymıyor',
      (await dlg.getByRole('tab', { name: 'Sayfaya göm' }).getAttribute('aria-selected')) === 'true' && small.length === 0 && !(await pageScrolls(page)), small.join(', '));
    await page.context().close();
  }
  // --- 3B tezgâh: masadaki parçalardan gelen kablolar gövdelerin içinden geçmiyor (pil) ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:gorunum', 'bench'); } catch {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const hits = [];
    for (const id of ['rc-dolma', 'ard-blink', 'transformator', 'bjt-yukseltec']) {
      await page.goto('about:blank');
      await page.goto(`${URL0}embed/?ornek=${id}&gorunum=tam`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      hits.push(`${id}:${await page.evaluate(() => window.__tezgah?.cableHits() ?? -1)}`);
    }
    check('3B: masadaki parçalardan (pil, Arduino, transformatör, cihazlar) gelen kablolar gövdelerin içinden geçmiyor; pilin uzak ucundaki kablo üstünden aşıyor',
      hits.every((h) => h.endsWith(':0')), hits.join(' '));
    await ctx.close();
  }
  // --- Ölçü aletinin okuması her yerde aynı: şema göstergesi, defter kartı, 3B etiketi, 3B ekranı ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button').filter({ hasText: '555 ile yanıp sönen LED (astabil)' }).first())).click(); await page.waitForTimeout(500);
    const sim = page.getByRole('region', { name: 'Simülasyon' });
    /** V1'in şemadaki göstergesi, defter kartı, 3B etiketi ve 3B aletin ekranı. */
    const readings = () => page.evaluate(() => {
      const value = (el) => el?.textContent?.replace(/^.*Voltmetre/, '').trim() ?? null;
      const id = JSON.parse(localStorage.getItem('devre-simulatoru:devre')).parts.find((p) => p.label === 'V1').id;
      const placed = window.__tezgah?.parts.get(id);
      return {
        gauge: document.querySelector('svg.schematic text[fill="#a6f4bd"]')?.textContent ?? null,
        card: value(document.querySelector(`[data-card="${id}"]`)),
        label: value([...document.querySelectorAll('[data-anchor="part"]')].find((e) => e.textContent?.startsWith('V1'))),
        screen: placed?.model.root.userData.screen ?? null,
      };
    });
    await sim.getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(1200);
    const running = [];
    for (let i = 0; i < 5; i++) { running.push(await readings()); await page.waitForTimeout(130); }
    await sim.getByRole('button', { name: 'Duraklat' }).click(); await page.waitForTimeout(400);
    const paused = await readings();
    await benchButton(page).click();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
    const bench = await readings();
    // v4: duraklatılmışken düğmenin adı "Devam et".
    await sim.getByRole('button', { name: 'Devam et' }).click(); await page.waitForTimeout(900);
    await sim.getByRole('button', { name: 'Duraklat' }).click(); await page.waitForTimeout(400);
    const bench2 = await readings();
    check('ölçü aleti (555): çalışırken şema göstergesi ve defter kartı aynı okumayı gösteriyor', running.every((r) => r.gauge !== null && r.gauge === r.card) && new Set(running.map((r) => r.gauge)).size >= 2, running.map((r) => `${r.gauge}/${r.card}`).join(' '));
    check('ölçü aleti (555): duraklatılmışken şema, defter kartı, 3B etiketi ve 3B aletin ekranı aynı sayı; ekran boş değil',
      paused.gauge !== null && paused.gauge === paused.card && bench.card === paused.card && bench.label === paused.card && bench.screen === paused.card && bench2.label === bench2.card && bench2.screen === bench2.card && bench2.card !== paused.card,
      `şema ${paused.gauge} · kart ${paused.card} · 3B ${bench.label} · ekran ${bench.screen} → ${bench2.card}/${bench2.label}/${bench2.screen}`);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'LED ve ön direnç');
    await page.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: '3B' }).tap();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
    const labels = await page.locator('[data-anchor="part"]').allTextContents();
    const tag = await page.getByRole('button', { name: 'Etiketler' }).boundingBox();
    const full = await page.getByRole('button', { name: 'Şemayı tam ekran aç' }).boundingBox();
    check('3B (telefon): etiket yalnızca ölçü aletinde (seçim yokken); Etiketler, Kamera ve Karta aktar sağ altta, 44 px',
      labels.length === 1 && labels[0].startsWith('A1') && tag !== null && tag.height >= 43.5 && full !== null && Math.abs(tag.y - full.y) < 2 && tag.x < full.x, labels.join(' | '));
    // İlk açılıştaki hareket ipucu: sahnenin altında, düğmelerin üstünde; görünen hiçbir etiketin üstüne binmiyor.
    const hint = await page.getByText(/^Bir parmak: döndür/).boundingBox();
    const area = await page.locator('main').boundingBox();
    const hintClash = await page.evaluate(() => {
      const h = [...document.querySelectorAll('[data-obstacle]')][0]?.getBoundingClientRect();
      if (!h) return ['ipucu yok'];
      return [...document.querySelectorAll('[data-anchor]')].filter((e) => getComputedStyle(e).opacity === '1').filter((e) => {
        const b = e.getBoundingClientRect();
        return b.left < h.right && b.right > h.left && b.top < h.bottom && b.bottom > h.top;
      }).map((e) => e.textContent);
    });
    check('3B (telefon): ilk açılıştaki "Bir parmak: döndür…" ipucu sahnenin altında, düğmelerin üstünde; etiketlerin üstüne binmiyor',
      hint !== null && area !== null && tag !== null && hint.y > area.y + area.height / 2 && hint.y + hint.height <= tag.y + 1 && hintClash.length === 0 && labels.length === 1,
      hint ? `ipucu ${Math.round(hint.y)}–${Math.round(hint.y + hint.height)}, düğmeler ${Math.round(tag?.y ?? 0)} · ${hintClash.join(', ')}` : 'ipucu yok');
    await page.context().close();
  }

  // --- Tema: Sistem / Açık / Koyu ---------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('tema: sistem koyuyken açılış koyu (koyu zemin)', (await themeOf()) === 'dark' && (await bg()) === 'rgb(14, 19, 24)', await bg());
    // v4: üst çubukta tema düğmesi yok; Daha fazla menüsünün en üstünde Tema (Sistem / Açık / Koyu), seçince menü açık kalır.
    let menu = await openMore(page);
    const themeGroup = menu.getByRole('group', { name: 'Tema' });
    const items = await themeGroup.getByRole('menuitemradio').count();
    await themeGroup.getByRole('menuitemradio', { name: 'Açık', exact: true }).click(); await page.waitForTimeout(200);
    const light = (await themeOf()) === 'light' && (await bg()) === 'rgb(238, 240, 243)';
    const stayed = (await menu.count()) === 1 && (await themeGroup.getByRole('menuitemradio', { name: 'Açık', exact: true }).getAttribute('aria-checked')) === 'true';
    await page.reload({ waitUntil: 'networkidle' });
    check('tema: Daha fazla menüsündeki Tema satırından Açık seçilince açık (menü açık kalıyor); sistem koyu olsa da yeniden açılışta açık kalıyor; üst çubukta ayrı tema düğmesi yok',
      items === 3 && light && stayed && (await themeOf()) === 'light' && (await page.getByRole('button', { name: /^Tema:/ }).count()) === 0, `${items} seçenek · açık kaldı ${stayed}`);
    menu = await openMore(page);
    await menu.getByRole('group', { name: 'Tema' }).getByRole('menuitemradio', { name: 'Koyu', exact: true }).click(); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    const metaColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'));
    check('tema: Koyu seçilince koyu; tarayıcı çubuğunun rengi de koyu', (await themeOf()) === 'dark' && metaColor === '#0e1318', metaColor ?? '');
    await page.goto(URL0 + 'baraj/', { waitUntil: 'networkidle' });
    check('tema: baraj sayfası aynı ayarı kullanıyor (koyu)', (await themeOf()) === 'dark' && (await page.getByRole('button', { name: /^Tema:/ }).count()) === 1);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    const group = page.getByRole('radiogroup', { name: 'Tema' });
    await group.getByRole('radio', { name: 'Koyu' }).tap(); await page.waitForTimeout(200);
    const box = await group.getByRole('radio', { name: 'Koyu' }).boundingBox();
    check('tema: telefonda ⋯ → Tema (Sistem / Açık / Koyu); Koyu seçilince koyu, düğmeler 44 px', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && box !== null && box.height >= 43.5);
    await page.context().close();
  }

  // --- 8. aşama: hoş geldin, yardım, ayarlar, Geri al'lı bildirim -----------------------------
  {
    const ctx = await browser.newContext({ welcome: true, viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const welcome = page.getByRole('dialog', { name: /hoş geldin/ });
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
    check('ilk ziyarette hoş geldin penceresi; odak "Örnekle başla"da', (await welcome.count()) === 1 && focused.includes('Örnekle başla'), focused.slice(0, 30));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'networkidle' });
    check('hoş geldin Esc ile kapanıyor ve bir daha açılmıyor', (await page.getByRole('dialog', { name: /hoş geldin/ }).count()) === 0);
    // v4: Yardım üst çubukta değil, Daha fazla menüsünde (F1).
    await (await openMore(page)).getByRole('menuitem', { name: /^Yardım/ }).click(); await page.waitForTimeout(200);
    const help = page.getByRole('dialog', { name: 'Yardım' });
    const tabs = await help.getByRole('tab').count();
    await help.getByRole('tab', { name: 'Simgeler ve renkler' }).click();
    const symbols = (await help.getByRole('tabpanel').textContent()) ?? '';
    check('Daha fazla → Yardım: Yardım penceresi dört sekmeli; simgeler sekmesi açılıyor', tabs === 4 && symbols.includes('Kablo gerilimi'), `${tabs} sekme`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Gerilim bölücü', exact: true }))).click(); await page.waitForTimeout(500);
    const undo = page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).getByRole('button', { name: 'Geri al' });
    const hadUndo = (await undo.count()) === 1;
    if (hadUndo) await undo.click();
    await page.waitForTimeout(300);
    check('örnek yüklenince bildirimde Geri al; dokununca önceki devre geri geliyor', hadUndo && (await doc(page)).parts.length === 0);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Gerilim bölücü', exact: true }))).click(); await page.waitForTimeout(400);
    // v4: Ayarlar Daha fazla menüsünde ("Ayarlar…"); pencere düğmenin altında açılır, Esc kapatır.
    await (await openMore(page)).getByRole('menuitem', { name: 'Ayarlar…' }).click(); await page.waitForTimeout(150);
    const settingsOpen = (await page.getByRole('dialog', { name: 'Ayarlar' }).count()) === 1;
    await page.getByRole('dialog', { name: 'Ayarlar' }).getByRole('switch', { name: /Düğüm gerilimlerini yaz/ }).click(); await page.waitForTimeout(100);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const settingsClosed = (await page.getByRole('dialog', { name: 'Ayarlar' }).count()) === 0;
    const settingsFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    // Esc kapatmazsa dışarı tıklayarak kapatılır (aşağıdaki adımlar için).
    if (!settingsClosed) { await page.locator('header h1').click(); await page.waitForTimeout(150); }
    await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(600);
    const labels = await page.locator('svg.schematic text', { hasText: /^4,50 V$/ }).count();
    check('Daha fazla → Ayarlar… → Düğüm gerilimlerini yaz: düğümlerin yanında gerilim etiketi', settingsOpen && labels >= 1, `${labels} etiket`);
    check('Daha fazla → Ayarlar… penceresi Esc ile kapanıyor, odak Daha fazla düğmesine dönüyor', settingsClosed && settingsFocus === 'Daha fazla', `kapandı ${settingsClosed} · odak ${settingsFocus}`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ welcome: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const welcome = page.getByRole('dialog', { name: /hoş geldin/ });
    check('telefonda hoş geldin alt sayfa olarak açılıyor (P01)', (await welcome.count()) === 1);
    await welcome.getByRole('button', { name: /Kısa tur/ }).tap(); await page.waitForTimeout(300);
    const tour = page.getByRole('dialog', { name: 'Kısa tur' });
    const step1 = (await tour.textContent()) ?? '';
    await addPart(page, 'Direnç');
    const step2 = (await tour.textContent()) ?? '';
    check('kısa tur gerçek eylemle ilerliyor (parça eklenince 2. adım)', step1.includes('Adım 1 / 4') && step2.includes('Adım 2 / 4'), step2.slice(0, 20));
    await tour.getByRole('button', { name: 'Turu bitir' }).tap(); await page.waitForTimeout(200);
    // v4: Daha fazla'da Örnekler / Dosya / Paylaş kutuları yok (Örnekler üst çubukta, dosya devrenin adında);
    // kutular Analiz, Geri al, Yinele, Sığdır; yardım "Yardım" satırının alt sayfasında, geri düğmesi "Daha fazla".
    await page.getByRole('button', { name: /Daha fazla/ }).tap(); await page.waitForTimeout(300);
    const moreSheet = page.getByRole('dialog', { name: 'Daha fazla' });
    const tiles = await moreSheet.locator('button.h-16').allTextContents();
    const rows = await moreSheet.locator('button.min-h-\\[52px\\]').allTextContents();
    await moreSheet.getByRole('button', { name: 'Yardım', exact: true }).tap(); await page.waitForTimeout(300);
    const more = (await moreSheet.textContent()) ?? '';
    const backButton = moreSheet.getByRole('button', { name: 'Daha fazla', exact: true });
    const hadBack = (await backButton.count()) === 1;
    if (hadBack) { await backButton.tap(); await page.waitForTimeout(300); }
    const backHome = (await moreSheet.getByRole('button', { name: 'Ayarlar', exact: true }).count()) === 1;
    check('telefonda ⋯ (v4): kutular Analiz, Geri al, Yinele, Sığdır; satırlar Ayarlar, Yardım, Kısa turu başlat (Örnekler, Dosya ve Klavye kısayolları yok); Yardım sayfasında dokunma hareketleri, "Daha fazla" ile geri (P14)',
      tiles.join('|') === 'Analiz|Geri al|Yinele|Sığdır' && rows.join('|') === 'Ayarlar|Yardım|Kısa turu başlat' && more.includes('Uca dokun') && hadBack && backHome &&
        (await moreSheet.getByRole('button', { name: 'Örnekler', exact: true }).count()) === 0 && (await moreSheet.getByRole('button', { name: 'Dosya', exact: true }).count()) === 0,
      `${tiles.join('|')} · ${rows.join('|')} · ${more.slice(0, 40)}`);
    await ctx.close();
  }

  // --- 9. aşama: klavye, odak sırası ve kısayollar (N02, M12) --------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const active = () => page.evaluate(() => ({ id: document.activeElement?.id ?? '', tag: document.activeElement?.tagName ?? '', text: (document.activeElement?.textContent ?? '').trim().slice(0, 30) }));
    await page.keyboard.press('Tab');
    const first = await active();
    await page.keyboard.press('Enter');
    const afterSkip = await active();
    check('ilk Tab durağı "Tuvale atla"; Enter tuvale götürüyor', first.text === 'Tuvale atla' && afterSkip.id === 'tuval', `${first.text} → ${afterSkip.id}`);
    // v4: "Parçalar" başlığındaki Parça ekle düğmesi arama kutusunu açar (odak kutuda); yaz, oklarla seç, Enter ekler.
    await notebook(page).getByRole('button', { name: 'Parça ekle', exact: true }).focus();
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const addRow = page.getByRole('combobox', { name: /Parça ekle/ });
    const addFocused = await addRow.evaluate((el) => document.activeElement === el).catch(() => false);
    await addRow.focus(); await page.keyboard.type('diyot'); await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    const pick = (await page.getByRole('option', { selected: true }).textContent()) ?? '';
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    check('masaüstü (v4): Parça ekle düğmesi (Enter) arama kutusunu açıp odağı oraya veriyor; yazıp okla seçilen parça Enter’la ekleniyor', addFocused && pick.startsWith('Zener diyot') && (await doc(page)).parts.some((p) => p.type === 'zener'), `${addFocused} · ${pick.slice(0, 30)}`);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).focus();
    await page.keyboard.press('Space'); await page.waitForTimeout(300);
    const examplesOpen = (await page.getByRole('dialog', { name: 'Örnekler' }).count()) === 1;
    check('odak bir düğmedeyken Boşluk düğmeyi çalıştırıyor (tuval kaydırmayı yutmuyor)', examplesOpen);
    if (examplesOpen) await page.getByRole('button', { name: 'Gerilim bölücü', exact: true }).click();
    await page.waitForTimeout(500);
    await page.locator('#tuval').focus();
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    const announced = (await page.locator('#tuval ~ p[aria-live]').first().textContent().catch(() => '')) ?? '';
    const selected = (await page.evaluate(() => JSON.stringify(document.activeElement?.id))) === '"tuval"';
    check('tuvalde oklar en yakın parçayı seçiyor ve seçim duyuruluyor', selected && announced.includes('seçili'), announced);
    const before = await doc(page);
    const selectedLabel = announced.split(',')[0] ?? '';
    const partBefore = before.parts.find((p) => p.label === selectedLabel);
    await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(150);
    const partAfter = (await doc(page)).parts.find((p) => p.label === selectedLabel);
    check('Shift + ok seçili parçayı 1 birim kaydırıyor', partBefore && partAfter && partAfter.x === partBefore.x + 1, `${partBefore?.x} → ${partAfter?.x}`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const inField = await active();
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const back = await active();
    check('Enter değer alanına, panelden Esc tuvale götürüyor', inField.tag === 'INPUT' && back.id === 'tuval', `${inField.tag} → ${back.id}`);
    const scale0 = (await screen(page, 0, 0)).scale;
    await page.keyboard.press('+'); await page.waitForTimeout(100);
    const scale1 = (await screen(page, 0, 0)).scale;
    await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(100);
    const scale2 = (await screen(page, 0, 0)).scale;
    check('+ yakınlaştırıyor, Shift+1 devreyi sığdırıyor', scale1 > scale0 && Math.abs(scale2 - scale0) < 0.01, `${scale0.toFixed(2)} → ${scale1.toFixed(2)} → ${scale2.toFixed(2)}`);
    await page.keyboard.press('p'); await page.waitForTimeout(400);
    const running = (await page.getByRole('region', { name: 'Simülasyon' }).getByRole('status').first().textContent()) ?? '';
    await page.keyboard.press('p'); await page.waitForTimeout(200);
    const paused = (await page.getByRole('region', { name: 'Simülasyon' }).getByRole('status').first().textContent()) ?? '';
    check('P oynatıp duraklatıyor', running.includes('Çalışıyor') && paused.includes('Duraklatıldı'), `${running} / ${paused}`);
    await page.keyboard.press('Alt+Digit1'); await page.waitForTimeout(150);
    const inNotebook = await page.evaluate(() => Boolean(document.activeElement?.closest('#defter [data-notebook="card"]')));
    check('Alt+1 deftere (parça kartlarına) geçiyor (v3)', inNotebook);
    await page.locator('#tuval').focus();
    await page.keyboard.press('?'); await page.waitForTimeout(200);
    const helpOpen = (await page.getByRole('dialog', { name: 'Yardım' }).count()) === 1;
    const keysTab = (await page.getByRole('dialog', { name: 'Yardım' }).getByRole('tab', { selected: true }).textContent().catch(() => '')) ?? '';
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check('? Yardım’ı "Klavye kısayolları" sekmesinde açıyor, Esc kapatıyor', helpOpen && keysTab === 'Klavye kısayolları' && (await page.getByRole('dialog', { name: 'Yardım' }).count()) === 0, keysTab);
    await ctx.close();
  }

  // --- Arayüz v4: üst çubuk, menüler, kısayollar, telefonun alttaki çubuğu, koyu tema, Örnekler'in "/" işareti ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const header = page.locator('header');
    const run = header.getByRole('region', { name: 'Simülasyon' });
    // Üst çubuğun öğeleri soldan sağa (Oynat'ın yuvası hariç).
    const items = {
      logo: header.locator('svg').first(),
      ad: header.getByRole('heading', { level: 1 }),
      devre: circuitButton(page),
      kayıt: header.getByRole('status', { name: 'Tarayıcıda kaydedildi' }),
      görünüm: header.getByRole('group', { name: 'Görünüm' }),
      örnekler: header.getByRole('button', { name: 'Örnekler', exact: true }),
      analiz: header.getByRole('button', { name: 'Analiz', exact: true }),
      geriAl: header.getByRole('button', { name: 'Geri al', exact: true }),
      yinele: header.getByRole('button', { name: 'Yinele', exact: true }),
      dahaFazla: header.getByRole('button', { name: 'Daha fazla', exact: true }),
    };
    const boxes = async () => Object.fromEntries(await Promise.all(Object.entries(items).map(async ([k, l]) => [k, await l.boundingBox()])));
    const hb = await header.boundingBox();
    const b0 = await boxes();
    const play = await run.getByRole('button', { name: 'Oynat', exact: true }).boundingBox();
    const order = [...Object.values(b0), play];
    const ordered = order.every((b, i) => b !== null && (i === 0 || b.x >= order[i - 1].x + order[i - 1].width - 0.5));
    const centred = order.every((b) => b !== null && Math.abs(b.y + b.height / 2 - (hb.y + hb.height / 2)) <= 1.5);
    const viewMid = b0.görünüm ? b0.görünüm.x + b0.görünüm.width / 2 : -1;
    const saveText = ((await items.kayıt.textContent()) ?? '').trim();
    check('arayüz v4 (masaüstü 1440): üst çubuk 56 px; soldan sağa logo, "Devre Simülatörü", devrenin adı ▾, kayıt simgesi; ortada Görünüm (Şema | 3B tezgâh) çubuğun tam ortasında; sağda Örnekler, Analiz, Geri al, Yinele, Daha fazla ve en sağda Oynat; hepsi dikeyde ortalı',
      Math.round(hb.height) === 56 && ordered && centred && Math.abs(viewMid - (hb.x + hb.width / 2)) <= 2 && play !== null && play.x + play.width >= hb.x + hb.width - 13 &&
        saveText === 'Tarayıcıda kaydedildi' && (b0.kayıt?.width ?? 99) <= 32 && (await items.devre.getAttribute('aria-label')) === 'Yeni devre: devre menüsü' &&
        (await items.görünüm.getByRole('button', { name: 'Şema', exact: true }).count()) === 1 && (await items.görünüm.getByRole('button', { name: '3B tezgâh', exact: true }).count()) === 1,
      `çubuk ${Math.round(hb.height)} px · sıra ${ordered} · dikeyde ${centred} · ortada ${Math.round(viewMid - (hb.x + hb.width / 2))} px · Oynat sağdan ${Math.round(hb.x + hb.width - (play?.x ?? 0) - (play?.width ?? 0))} px · kayıt ${Math.round(b0.kayıt?.width ?? 0)} px "${saveText}"`);

    // 2. Oynat'a basınca çubuktaki öbür öğeler yerinden oynamıyor; çalışırken ve duraklatılmışken Geri al / Yinele pasif.
    await (await deskAdd(page)).fill('direnç'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.locator('#tuval').focus();
    const bStop = await boxes();
    const slot0 = await run.boundingBox();
    const undoBefore = await items.geriAl.isEnabled();
    await run.getByRole('button', { name: 'Oynat', exact: true }).click(); await page.waitForTimeout(400);
    const bRun = await boxes();
    const slot1 = await run.boundingBox();
    const runNames = await run.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()).join('|'));
    const runTime = ((await run.getByRole('status').textContent()) ?? '').replace('Çalışıyor', '').trim();
    const speedPopup = await run.getByRole('button', { name: /^Hız / }).getAttribute('aria-haspopup');
    const disabledRunning = !(await items.geriAl.isEnabled()) && !(await items.yinele.isEnabled());
    await run.getByRole('button', { name: 'Duraklat', exact: true }).click(); await page.waitForTimeout(250);
    const bPause = await boxes();
    const pausedNames = await run.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()).join('|'));
    const disabledPaused = !(await items.geriAl.isEnabled()) && !(await items.yinele.isEnabled());
    await run.getByRole('button', { name: 'Durdur', exact: true }).click(); await page.waitForTimeout(250);
    const undoAfter = await items.geriAl.isEnabled();
    const moved = Object.keys(items).filter((k) => [bRun, bPause].some((b) => !b[k] || !bStop[k] || Math.abs(b[k].x - bStop[k].x) > 0.5 || Math.abs(b[k].width - bStop[k].width) > 0.5));
    check('arayüz v4: Oynat’a basınca (ve Duraklat’ta) üst çubuktaki öbür öğeler yer değiştirmiyor (yuva sabit genişlik); çalışırken grup Duraklat · Durdur · süre · Hız ×1 (hız penceresi), duraklatınca Devam et; Geri al ve Yinele çalışırken ve duraklatılmışken pasif, durunca geri geliyor',
      moved.length === 0 && slot0 !== null && slot1 !== null && Math.abs(slot0.x - slot1.x) <= 0.5 && Math.abs(slot0.width - slot1.width) <= 0.5 &&
        /^Duraklat\|Durdur\|Hız ×1$/.test(runNames) && /^[\d,]+ \S*s$/.test(runTime) && speedPopup === 'dialog' && /^Devam et\|Durdur\|Hız ×1$/.test(pausedNames) &&
        undoBefore && disabledRunning && disabledPaused && undoAfter,
      `kayan: ${moved.join(', ') || 'yok'} · ${runNames} (${runTime}) · ${pausedNames} · geri al ${undoBefore}/${!disabledRunning}/${!disabledPaused}/${undoAfter}`);

    // 4. Menüler: devre menüsü ve Daha fazla; sıra, kısayol yazıları, JSON yok; Esc odağı düğmeye döndürüyor.
    const menuRows = (menu) => menu.getByRole('menuitem').evaluateAll((els) => els.map((e) => `${e.querySelector('span')?.textContent ?? ''}${e.querySelector('kbd') ? ` [${e.querySelector('kbd').textContent}]` : ''}`).join('|'));
    await circuitButton(page).click(); await page.waitForTimeout(150);
    const devreMenu = page.getByRole('menu', { name: 'Devre' });
    const devreRows = await menuRows(devreMenu);
    const devreText = (await devreMenu.textContent()) ?? '';
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const devreBack = (await devreMenu.count()) === 0 && ((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '').endsWith(': devre menüsü');
    const more = await openMore(page);
    const moreRows = await menuRows(more);
    const themes = await more.getByRole('group', { name: 'Tema' }).getByRole('menuitemradio').allTextContents();
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const moreBack = (await more.count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Daha fazla';
    check('arayüz v4: devre menüsü "Devre": Yeni devre, Bilgisayardan aç… (Ctrl+O), Bilgisayara indir (Ctrl+S), Şemayı indir / yazdır… (Ctrl+P), Paylaş…, Görev oluştur…, Karta aktar (PCB, lehim)…; altta "Her değişiklik bu tarayıcıya kaydedilir"; menüde "JSON" yok; Esc kapatıp odağı düğmeye döndürüyor',
      devreRows === 'Yeni devre|Bilgisayardan aç… [Ctrl+O]|Bilgisayara indir [Ctrl+S]|Şemayı indir / yazdır… [Ctrl+P]|Paylaş…|Görev oluştur…|Karta aktar (PCB, lehim)…' && devreText.includes('Her değişiklik bu tarayıcıya kaydedilir') && !/JSON/i.test(devreText) && devreBack,
      `${devreRows} · Esc ${devreBack}`);
    check('arayüz v4: Daha fazla menüsü: en üstte Tema (Sistem, Açık, Koyu); Ayarlar…, Klavye kısayolları (?), Yardım (F1), Kısa turu başlat, Tam ekran (F11); Esc kapatıp odağı düğmeye döndürüyor',
      themes.join('|') === 'Sistem|Açık|Koyu' && moreRows === 'Ayarlar…|Klavye kısayolları [?]|Yardım [F1]|Kısa turu başlat|Tam ekran [F11]' && moreBack,
      `${themes.join('|')} · ${moreRows} · Esc ${moreBack}`);
    // Ayarlar… düğmenin altında açılır; Klavye kısayolları ve Yardım yardım penceresini ilgili sekmede açar.
    await (await openMore(page)).getByRole('menuitem', { name: 'Ayarlar…' }).click(); await page.waitForTimeout(150);
    const settingsBox = await page.getByRole('dialog', { name: 'Ayarlar' }).boundingBox();
    const moreBox = await items.dahaFazla.boundingBox();
    const settingsFields = (await page.getByRole('dialog', { name: 'Ayarlar' }).getByRole('radiogroup').count()) === 2 && (await page.getByRole('dialog', { name: 'Ayarlar' }).getByRole('switch', { name: /Düğüm gerilimlerini yaz/ }).count()) === 1;
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const helpTab = async (item) => {
      await (await openMore(page)).getByRole('menuitem', { name: item }).click(); await page.waitForTimeout(200);
      const tab = (await page.getByRole('dialog', { name: 'Yardım' }).getByRole('tab', { selected: true }).textContent().catch(() => '')) ?? '';
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      return tab;
    };
    const keysTab = await helpTab(/^Klavye kısayolları/);
    const pointerTab = await helpTab(/^Yardım/);
    check('arayüz v4: Daha fazla → Ayarlar… penceresi düğmenin altında (direnç sembolü, kablo renkleri, düğüm gerilimleri); Klavye kısayolları yardımı "Klavye kısayolları", Yardım "Fare ve dokunma" sekmesinde açıyor',
      settingsBox !== null && moreBox !== null && settingsBox.y >= moreBox.y + moreBox.height && settingsBox.x + settingsBox.width >= moreBox.x + moreBox.width - 1 && settingsFields && keysTab === 'Klavye kısayolları' && pointerTab === 'Fare ve dokunma',
      `ayarlar ${Math.round(settingsBox?.y ?? 0)} px · ${keysTab} · ${pointerTab}`);

    // 5. Kısayollar: Ctrl+O dosya seçici, Ctrl+S indirme (devre-YYYY-AA-GG.json), F1 yardım (Fare ve dokunma), F11 tam ekran.
    await page.locator('#tuval').focus();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null), page.keyboard.press('Control+o')]);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.keyboard.press('Control+s')]);
    const saved = download ? JSON.parse(readFileSync(await download.path(), 'utf8')) : null;
    await page.keyboard.press('F1'); await page.waitForTimeout(200);
    const f1Tab = (await page.getByRole('dialog', { name: 'Yardım' }).getByRole('tab', { selected: true }).textContent().catch(() => '')) ?? '';
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check('arayüz v4 (kısayollar): Ctrl+O dosya seçiciyi açıyor; Ctrl+S devreyi devre-YYYY-AA-GG.json olarak indiriyor (tarayıcının kaydetmesi değil); F1 yardımı "Fare ve dokunma" sekmesinde açıyor',
      chooser !== null && download !== null && /^devre-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()) && saved?.parts?.some((p) => p.type === 'resistor') && f1Tab === 'Fare ve dokunma',
      `seçici ${chooser !== null} · ${download?.suggestedFilename() ?? 'indirme yok'} · F1 ${f1Tab}`);
    await page.locator('#tuval').focus();
    await page.keyboard.press('F11'); await page.waitForTimeout(500);
    const f11On = { fs: await page.evaluate(() => document.fullscreenElement?.tagName ?? null), notebook: await notebook(page).count(), toggle: await header.getByRole('button', { name: 'Defter', exact: true }).count() };
    await page.locator('#tuval').focus();
    await page.keyboard.press('F11'); await page.waitForTimeout(500);
    const f11Off = { fs: await page.evaluate(() => document.fullscreenElement?.tagName ?? null), notebook: await notebook(page).count(), toggle: await header.getByRole('button', { name: 'Defter', exact: true }).count() };
    check('arayüz v4 (kısayollar): F11 uygulamanın tam ekranını açıyor (defter gizli, Defter düğmesi çıkıyor), yeniden F11 kapatıyor',
      f11On.fs === 'HTML' && f11On.notebook === 0 && f11On.toggle === 1 && f11Off.fs === null && f11Off.notebook === 1 && f11Off.toggle === 0, `${JSON.stringify(f11On)} → ${JSON.stringify(f11Off)}`);

    // 8. Örnekler penceresi: "/" işareti arama kutusu odaktayken gizli, değilken görünür.
    await header.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(400);
    const dlg = page.getByRole('dialog', { name: 'Örnekler' });
    const hint = dlg.locator('header kbd');
    const searchFocused = await dlg.getByRole('searchbox', { name: 'Örnek ara' }).evaluate((el) => document.activeElement === el);
    const hiddenWhileFocused = !(await hint.isVisible());
    await dlg.getByRole('button', { name: 'Örnekler penceresini kapat' }).focus(); await page.waitForTimeout(100);
    const shownAfterBlur = await hint.isVisible();
    await page.keyboard.press('/'); await page.waitForTimeout(100);
    const hiddenAgain = !(await hint.isVisible());
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    if ((await dlg.count()) > 0) { await dlg.getByRole('button', { name: 'Örnekler penceresini kapat' }).click(); await page.waitForTimeout(200); }
    check('arayüz v4 (Örnekler): aramanın yanındaki "/" işareti kutu odaktayken gizli, odak başka yerdeyken görünür; "/" ile kutuya dönünce yine gizli',
      searchFocused && hiddenWhileFocused && shownAfterBlur && hiddenAgain, `${searchFocused} · ${hiddenWhileFocused} · ${shownAfterBlur} · ${hiddenAgain}`);

    // 7. Koyu tema: Daha fazla → Koyu; üst çubuk koyu panel renginde, logonun çerçevesi görünür.
    const logoFrame = () => items.logo.locator('rect').nth(1).evaluate((el) => getComputedStyle(el).stroke);
    const lightFrame = await logoFrame();
    await (await openMore(page)).getByRole('group', { name: 'Tema' }).getByRole('menuitemradio', { name: 'Koyu', exact: true }).click(); await page.waitForTimeout(250);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    const headerBg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
    const panelBg = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'bg-panel'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    const darkFrame = await logoFrame();
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const isDark = rgb(headerBg).slice(0, 3).every((v) => v < 60);
    const visible = (c) => c !== 'none' && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
    check('arayüz v4 (koyu tema): Daha fazla → Koyu: html[data-theme=dark]; üst çubuğun zemini koyu panel rengi; logonun çerçevesi (ikinci dikdörtgenin çizgisi) görünür',
      theme === 'dark' && headerBg === panelBg && isDark && visible(darkFrame), `${theme} · çubuk ${headerBg} · çerçeve açıkta ${lightFrame}, koyuda ${darkFrame}`);
    await ctx.close();
  }
  {
    // 3. Dar pencere (1000 × 800): site adı yalnızca ekran okuyucuda; Örnekler ve Analiz yalnızca simge (adları duruyor); görünüm düğmesi "3B".
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const header = page.locator('header');
    const title = await header.getByRole('heading', { level: 1, name: 'Devre Simülatörü' }).evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    const iconOnly = async (name) => header.getByRole('button', { name, exact: true }).evaluate((el) => ({ text: el.innerText.trim(), w: Math.round(el.getBoundingClientRect().width) }));
    const examples = await iconOnly('Örnekler');
    const analysis = await iconOnly('Analiz');
    const views = await header.getByRole('group', { name: 'Görünüm' }).getByRole('button').evaluateAll((els) => els.map((e) => e.innerText.trim()));
    const benchNamed = await header.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: '3B', exact: true }).count();
    const hb = await header.boundingBox();
    check('arayüz v4 (dar pencere 1000 px): site adı görünmüyor (yalnızca ekran okuyucuda); Örnekler ve Analiz yalnızca simge (yazı yok, 32 px, adları duruyor); görünüm düğmesi "3B"; çubuk 56 px',
      title.w <= 1 && title.h <= 1 && examples.text === '' && analysis.text === '' && examples.w === 32 && analysis.w === 32 && views.join('|') === 'Şema|3B' && benchNamed === 1 && Math.round(hb.height) === 56,
      `ad ${Math.round(title.w)}×${Math.round(title.h)} · Örnekler "${examples.text}" ${examples.w} px · Analiz "${analysis.text}" ${analysis.w} px · ${views.join('|')}`);
    await ctx.close();
  }
  {
    // 6. Telefon (390 × 844): alttaki çubuk üç durumda; üst ve alt çubuktaki bütün hedefler ≥ 44 px; sayfa kaymıyor.
    const { page, cdp } = await phone();
    await openExample(page, 'RC dolma');
    const states = [];
    const measure = async (label) => {
      const sizes = await page.evaluate(() => [...document.querySelectorAll('header button, header a, nav[aria-label="Simülasyon ve düzenleme"] button')]
        .filter((e) => e.getClientRects().length > 0).map((e) => { const r = e.getBoundingClientRect(); return { n: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 20), s: Math.min(r.width, r.height) }; }));
      const bar = await phoneBar(page).boundingBox();
      const scroll = await page.evaluate(() => ({ h: document.scrollingElement.scrollHeight, vh: window.innerHeight }));
      states.push({ label, names: await phoneBarButtons(page), small: sizes.filter((x) => x.s < 43.5).map((x) => `${x.n} ${Math.round(x.s)}`), count: sizes.length, bottom: bar ? Math.round(bar.y + bar.height) : -1, scroll });
    };
    await measure('kur');
    await phoneBar(page).getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(500);
    await measure('çalışıyor');
    await phoneBar(page).getByRole('button', { name: 'Duraklat', exact: true }).tap(); await page.waitForTimeout(300);
    await measure('duraklatıldı');
    const pausedMode = await mode(page);
    await phoneBar(page).getByRole('button', { name: 'Düzenlemek için durdur', exact: true }).tap(); await page.waitForTimeout(300);
    const stoppedMode = await mode(page);
    const [kur, running, paused] = states;
    check('arayüz v4 (telefon): alttaki çubuk (Simülasyon ve düzenleme) ekranın altında; Kur’da Parça · Kablo · Oynat, çalışırken Duraklat · Durdur · süre (hız), duraklatılmışken Düzenlemek için durdur · Devam et; "Düzenlemek için durdur" Kur’a döndürüyor',
      kur.names === 'Parça|Kablo|Oynat' && /^Duraklat\|Durdur\|[\d,]+ \S*s: hız$/.test(running.names) && paused.names === 'Düzenlemek için durdur|Devam et' && pausedMode.startsWith('Duraklatıldı') && stoppedMode.startsWith('Kur') &&
        states.every((x) => Math.abs(x.bottom - 844) <= 1),
      states.map((x) => `${x.label}: ${x.names} (alt ${x.bottom})`).join(' · '));
    check('arayüz v4 (telefon): üç durumda da üst çubuk ve alttaki çubuktaki bütün düğmeler ≥ 44 px; sayfa kaymıyor (belge yüksekliği ≤ ekran)',
      states.every((x) => x.count >= 5 && x.small.length === 0 && x.scroll.h <= x.scroll.vh),
      states.map((x) => `${x.label}: ${x.count} düğme${x.small.length ? ` (küçük: ${x.small.join(', ')})` : ''}, ${x.scroll.h}/${x.scroll.vh}`).join(' · '));
    // Kablo: tam ekran kablo bağlamayı açıyor (Bitti ile dönülüyor).
    await phoneBar(page).getByRole('button', { name: 'Kablo', exact: true }).tap(); await page.waitForTimeout(400);
    const wiring = await mode(page);
    const barHidden = (await phoneBar(page).count()) === 0;
    await page.getByRole('button', { name: 'Bitti' }).tap(); await page.waitForTimeout(300);
    check('arayüz v4 (telefon): alttaki çubuğun Kablo düğmesi tam ekran kablo bağlamayı açıyor (çubuk gizli, Bitti); Bitti ile Kur’a dönülüyor, çubuk geri geliyor',
      wiring === 'Kablo bağla' && barHidden && (await mode(page)).startsWith('Kur') && (await phoneBar(page).count()) === 1, `${wiring} · çubuk gizli ${barHidden}`);
    void cdp;
    await page.context().close();
  }

  // --- Arayüz v4 düzeltmeleri (telefon): gerilim çipi, Daha fazla'nın adı, alt sayfaların boyu, bildirim, kısayollar ---
  {
    const { page } = await phone();
    // 4. "Örnek yüklendi. · Geri al" 390 px'te tek satır (genişlik içeriğe göre; eskiden ekranın yarısında kırılıyordu).
    // Satırlar yazının parçalarının üst kenarından sayılır (yazı birkaç düğümde olabilir: "±" ve değer).
    await openExample(page, 'RC dolma');
    const toast = page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' });
    const toastBox = await toast.boundingBox();
    const toastLines = await toast.locator('span').first().evaluate((s) => { const r = document.createRange(); r.selectNodeContents(s); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; }).catch(() => -1);
    const undoBox = await toast.getByRole('button', { name: 'Geri al' }).boundingBox();
    check('arayüz v4 düzeltmeleri (telefon 390): "Örnek yüklendi. · Geri al" bildirimi tek satır (yazı tek satır, bildirim ≤ 48 px, Geri al aynı satırda)',
      toastBox !== null && undoBox !== null && toastLines === 1 && toastBox.height <= 48.5 && undoBox.y >= toastBox.y && undoBox.y + undoBox.height <= toastBox.y + toastBox.height + 0.5,
      `${Math.round(toastBox?.width ?? 0)}×${Math.round(toastBox?.height ?? 0)} px · ${toastLines} satır`);
    await toast.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});

    // 1. Gerilim çipi: sağ altta, tam ekran düğmesinin solunda, düğmeyle aynı boyda tek satır; Sığdır o köşeyi
    // dışarıda bıraktığı için çip (ve düğme) çizime (parçalar, etiketleri, kablolar) binmiyor.
    const chipRows = [];
    for (const name of ['RC dolma', 'Gerilim bölücü', 'LED ve ön direnç', 'Yarım dalga doğrultmaç', 'Transistör anahtar: LED kollektörde']) {
      if (name !== 'RC dolma') await openExample(page, name);
      await phoneBar(page).getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(700);
      const chip = page.getByRole('button', { name: 'Gösterim: kablo gerilimi ölçeği' });
      const cb = await chip.boundingBox();
      const fb = await page.getByRole('button', { name: 'Şemayı tam ekran aç' }).boundingBox();
      const lines = await chip.locator('span').evaluate((s) => { const r = document.createRange(); r.selectNodeContents(s); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; }).catch(() => -1);
      const hits = cb === null || fb === null ? ['?'] : await page.evaluate((rects) => {
        const svg = document.querySelector('svg.schematic');
        const items = [
          ...[...svg.querySelectorAll('g[transform^="translate("][style*="color"]')].map((g) => ({ n: g.querySelector('text')?.textContent ?? 'parça', r: g.getBoundingClientRect() })),
          ...[...svg.querySelectorAll('polyline')].filter((p) => !['none', 'transparent'].includes(p.getAttribute('stroke') ?? 'none')).map((p) => ({ n: 'kablo', r: p.getBoundingClientRect() })),
        ];
        const out = [];
        for (const { n, r } of items) for (const c of rects) if (r.left < c.x + c.width && r.right > c.x && r.top < c.y + c.height && r.bottom > c.y) out.push(n);
        return out;
      }, [cb, fb]);
      chipRows.push({ name, ok: cb !== null && fb !== null && lines === 1 && Math.abs(cb.height - fb.height) < 0.5 && Math.abs(cb.y - fb.y) < 0.5 && fb.x - (cb.x + cb.width) >= 4 && fb.x - (cb.x + cb.width) <= 12 && hits.length === 0,
        text: `${name}: çip ${Math.round(cb?.width ?? 0)}×${Math.round(cb?.height ?? 0)}, düğmeyle arası ${Math.round((fb?.x ?? 0) - ((cb?.x ?? 0) + (cb?.width ?? 0)))} px${hits.length ? `, değiyor: ${hits.join(', ')}` : ''}` });
      await phoneBar(page).getByRole('button', { name: 'Durdur', exact: true }).tap(); await page.waitForTimeout(300);
    }
    check('arayüz v4 düzeltmeleri (telefon 390): gerilim çipi sağ altta, tam ekran düğmesinin solunda, düğmeyle aynı boyda (44 px) tek satır; beş örnekte de Sığdır sonrası çip ve düğme çizime binmiyor',
      chipRows.every((x) => x.ok), chipRows.filter((x) => !x.ok).map((x) => x.text).join(' · ') || chipRows[0].text);

    // 2. Daha fazla düğmesinin adı içerikle aynı (Paylaş devre sayfasında; burada yok). 5. Klavye kısayolları telefonda yok.
    const moreButton = page.locator('header').getByRole('button', { name: /^Daha fazla/ });
    const moreName = await moreButton.getAttribute('aria-label');
    await moreButton.tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('dialog', { name: 'Daha fazla' });
    const sheetText = (await sheet.textContent()) ?? '';
    check('arayüz v4 düzeltmeleri (telefon): Daha fazla düğmesinin adı "Daha fazla: analiz, tema, ayarlar, yardım"; sayfada Analiz, Tema, Ayarlar, Yardım var, Paylaş yok',
      moreName === 'Daha fazla: analiz, tema, ayarlar, yardım' && (await sheet.getByRole('button', { name: 'Analiz', exact: true }).count()) === 1 && (await sheet.getByRole('radiogroup', { name: 'Tema' }).count()) === 1 &&
        (await sheet.getByRole('button', { name: 'Ayarlar', exact: true }).count()) === 1 && (await sheet.getByRole('button', { name: 'Yardım', exact: true }).count()) === 1 && !sheetText.includes('Paylaş'),
      moreName ?? '');
    const noKeys = (await sheet.getByText('Klavye kısayolları').count()) === 0;

    // 3. Alt sayfaların boyu içeriğe göre (altında boşluk yok), en çok ekranın % 90'ı; uzun içerik içeride kayıyor.
    const sizeOf = async (dlg, lastName) => {
      const box = await dlg.boundingBox();
      const last = await dlg.getByRole('button', { name: lastName, exact: true }).boundingBox();
      return { h: box ? box.height : 0, top: box ? box.y : 0, gap: box && last ? box.y + box.height - (last.y + last.height) : -1 };
    };
    const moreSize = await sizeOf(sheet, 'Kısa turu başlat');
    await sheet.getByRole('button', { name: 'Yardım', exact: true }).tap(); await page.waitForTimeout(300);
    const helpBox = await sheet.boundingBox();
    const helpScroll = await sheet.evaluate((d) => [...d.querySelectorAll('div')].some((e) => e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY === 'auto'));
    await sheet.getByRole('button', { name: 'Daha fazla', exact: true }).tap(); await page.waitForTimeout(300);
    await sheet.getByRole('button', { name: 'Kapat', exact: true }).first().tap(); await page.waitForTimeout(300);
    await phoneFileSheet(page);
    const fileSheet = page.getByRole('dialog', { name: 'Dosya' });
    const fileSize = await sizeOf(fileSheet, 'Sayfaya göm');
    await fileSheet.getByRole('button', { name: 'Kapat', exact: true }).first().tap(); await page.waitForTimeout(300);
    const max = 844 * 0.9;
    check('arayüz v4 düzeltmeleri (telefon 390 × 844): Daha fazla ve devre sayfası içeriğe göre (son satırın altında ≤ 20 px, ekranın % 90’ından kısa); Yardım gibi uzun içerikte sayfa en çok % 90 (760 px), içerik kayıyor',
      moreSize.h < max && moreSize.gap >= 0 && moreSize.gap <= 20 && fileSize.h < max && fileSize.gap >= 0 && fileSize.gap <= 20 && helpBox !== null && helpBox.height <= max + 1 && helpBox.height >= max - 2 && helpScroll,
      `Daha fazla ${Math.round(moreSize.h)} px (alt boşluk ${Math.round(moreSize.gap)}) · devre sayfası ${Math.round(fileSize.h)} px (alt boşluk ${Math.round(fileSize.gap)}) · Yardım ${Math.round(helpBox?.height ?? 0)} px`);
    await page.context().close();

    // Yatay telefon (844 × 390): Daha fazla sayfası en çok ekranın % 90'ı.
    const { page: land } = await phone(844, 390);
    await land.locator('header').getByRole('button', { name: /^Daha fazla/ }).tap(); await land.waitForTimeout(400);
    const landBox = await land.getByRole('dialog', { name: 'Daha fazla' }).boundingBox();
    check('arayüz v4 düzeltmeleri (yatay telefon 844 × 390): Daha fazla sayfası en çok ekranın % 90’ı (351 px), üstü ekranın içinde',
      landBox !== null && landBox.height <= 390 * 0.9 + 1 && landBox.y >= 390 * 0.1 - 1, `${Math.round(landBox?.height ?? 0)} px`);
    await land.context().close();

    // 5. Tablette (1180 × 820, dokunmatik) masaüstünün Daha fazla menüsünde Klavye kısayolları duruyor.
    const tctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await tp.goto(URL0, { waitUntil: 'networkidle' });
    await tp.locator('header').getByRole('button', { name: 'Daha fazla', exact: true }).tap(); await tp.waitForTimeout(250);
    const tabletKeys = await tp.getByRole('menu', { name: 'Daha fazla' }).getByRole('menuitem', { name: /^Klavye kısayolları/ }).count();
    check('arayüz v4 düzeltmeleri: "Klavye kısayolları" telefonun Daha fazla sayfasında yok, tablette (1180 px, dokunmatik) Daha fazla menüsünde var',
      noKeys && tabletKeys === 1, `telefonda yok ${noKeys} · tablette ${tabletKeys}`);
    await tctx.close();
  }

  // --- Masaüstü kabuğu: kütüphane bilgi alanı, ipucu şeridi, hız penceresi ---------------
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const dp = await desk.newPage();
  dp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await dp.goto(URL0, { waitUntil: 'networkidle' });
  const canvas = await dp.locator('svg.schematic').boundingBox();
  // v3: sol kütüphane yok; "Bütün parçalar (55)" (v4: eskiden "Bütün parçalara göz at") kategorili ızgarayı açar, tıklanan parça eklenir.
  await notebook(dp).getByRole('button', { name: 'Bütün parçalar (55)', exact: true }).click(); await dp.waitForTimeout(200);
  const grid = dp.getByRole('dialog', { name: 'Bütün parçalar' });
  const tiles = await grid.locator('button[data-part]').count();
  await grid.getByRole('button', { name: 'Kondansatör', exact: true }).click(); await dp.waitForTimeout(300);
  check('masaüstü (v3): kütüphane yok; "Bütün parçalar" 55 parçayı gösteriyor, tıklanan parça ekleniyor, pencere kapanıyor',
    (await dp.getByPlaceholder(/Parça ara/).count()) === 0 && tiles === 55 && (await doc(dp)).parts.some((p) => p.type === 'capacitor') && (await grid.count()) === 0, `${tiles} parça`);
  await dp.getByRole('button', { name: 'Geri al', exact: true }).click(); await dp.waitForTimeout(150);
  // v3: alt simülasyon çubuğu ve ipucu şeridi yok; tuval alta kadar. v4: yakınlaştırma grubu tuvalin sol altında
  // (−, %yüzde, +, Sığdır); Şema / 3B seçimi üst çubukta.
  const view = await dp.locator('main').getByRole('group', { name: 'Yakınlaştırma' }).boundingBox();
  const zoomText = ((await dp.locator('main').getByRole('group', { name: 'Yakınlaştırma' }).getByRole('status').textContent()) ?? '').replace('Yakınlaştırma: ', '');
  const zoomNames = await dp.locator('main').getByRole('group', { name: 'Yakınlaştırma' }).getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).join('|'));
  check('masaüstü (v4): alt çubuk yok, tuval alta iniyor; yakınlaştırma grubu (Uzaklaştır, %yüzde, Yakınlaştır, Devreyi ekrana sığdır) tuvalin sol altında, içinde 3B yok',
    canvas.y + canvas.height >= 899 && view !== null && view.x >= canvas.x && view.x <= canvas.x + 24 && view.y + view.height >= canvas.y + canvas.height - 24 &&
      /^%\d+$/.test(zoomText) && zoomNames === 'Uzaklaştır|Yakınlaştır|Devreyi ekrana sığdır',
    view ? `tuval altı ${Math.round(canvas.y + canvas.height)} · grup ${Math.round(view.x - canvas.x)},${Math.round(view.y)} · ${zoomText} · ${zoomNames}` : 'yok');
  // Hız yalnızca çalışırken üst çubukta.
  await dp.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await dp.waitForTimeout(300);
  await dp.getByRole('button', { name: /^Hız/ }).click(); await dp.waitForTimeout(200);
  await dp.getByRole('radio', { name: /Ağır çekim/ }).click(); await dp.waitForTimeout(200);
  const speedText = (await dp.getByRole('button', { name: /^Hız/ }).textContent()) ?? '';
  check('masaüstü: hız penceresinde "Ağır çekim" ×10⁻⁶ yapıyor', speedText.includes('10⁻⁶'), speedText);
  await dp.keyboard.press('Escape'); await dp.waitForTimeout(100);
  check('masaüstü: hız penceresi Esc ile kapanıyor', (await dp.getByRole('dialog', { name: 'Simülasyon hızı' }).count()) === 0);
  // Hızı gerçek zamana geri al (aşağıdaki denetimler için).
  await dp.getByRole('button', { name: /^Hız/ }).click(); await dp.getByRole('radio', { name: /Gerçek zaman/ }).click();
  await dp.keyboard.press('Escape');
  await dp.getByRole('button', { name: 'Durdur', exact: true }).click(); await dp.waitForTimeout(200);

  // --- Masaüstü: İnceleme paneli (İncele, Örnek, Mesajlar) ----------------------------
  await dp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await dp.waitForTimeout(200);
  await (await pickExample(dp, (p) => p.getByRole('button', { name: 'LED ve ön direnç', exact: true }))).click(); await dp.waitForTimeout(500);
  // v4: örnek şeridi (accent-soft): mono üst yazı (grubun adı), kısa cümle, "Açıklamayı aç" ve "Sonraki örnek"; açılınca kartın kendisi.
  const exampleCard = notebook(dp).getByRole('region', { name: /^Örnek ·/ });
  const folded = (await exampleCard.textContent()) ?? '';
  const stripName = (await exampleCard.getAttribute('aria-label')) ?? '';
  const stripButtons = await exampleCard.getByRole('button').allTextContents();
  const stripBg = await exampleCard.evaluate((el) => getComputedStyle(el).backgroundColor);
  const accentSoftBg = await dp.evaluate(() => { const d = document.createElement('div'); d.className = 'bg-accent-soft'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
  await exampleCard.getByRole('button', { name: 'Açıklamayı aç', exact: true }).click(); await dp.waitForTimeout(150);
  const exampleText = (await exampleCard.textContent()) ?? '';
  check('masaüstü (v4): örnek şeridi katlı (accent-soft zemin; "Örnek · Temel devreler", üst yazı TEMEL DEVRELER ve kısa cümle; "Açıklamayı aç", "Sonraki örnek"); açılınca "Ne işe yarar?" ve "Günlük hayatta", soru yok',
    stripName === 'Örnek · Temel devreler' && folded.startsWith('TEMEL DEVRELER') && stripButtons.join('|') === 'Açıklamayı aç|Sonraki örnek' && stripBg === accentSoftBg &&
      !folded.includes('Ne işe yarar?') && exampleText.includes('Ne işe yarar?') && exampleText.includes('Günlük hayatta') && !exampleText.includes('Tahmin'),
    `${stripName} · ${folded.slice(0, 60)} · ${stripButtons.join('|')}`);
  const deskR1 = await part(dp, 'R1');
  const r1At = await screen(dp, deskR1.x, deskR1.y);
  await dp.mouse.dblclick(r1At.x, r1At.y); await dp.waitForTimeout(250);
  const focused = await dp.evaluate(() => (document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null));
  check('masaüstü: çift tıklayınca İncele sekmesinde ilk değer alanına odaklanıyor', focused === '330', `odak: ${focused}`);
  await dp.keyboard.type('1k'); await dp.keyboard.press('Enter');
  check('masaüstü: değer Enter ile uygulanıyor', (await part(dp, 'R1')).props.resistance === 1000);
  const valueField = dp.getByLabel('Direnç', { exact: true });
  await valueField.fill('abc'); await valueField.press('Enter'); await dp.waitForTimeout(150);
  const alert = (await notebook(dp).getByRole('alert').textContent().catch(() => '')) ?? '';
  check('masaüstü: geçersiz değer uygulanmıyor, hata alanın altında', alert.includes('sayı değil') && (await part(dp, 'R1')).props.resistance === 1000, alert.slice(0, 30));
  await valueField.press('Escape');
  await dp.getByRole('button', { name: 'Oynat' }).first().click(); await dp.waitForTimeout(600);
  await valueField.fill('470'); await valueField.press('Tab'); await dp.waitForTimeout(400);
  const statusText = (await dp.getByRole('region', { name: 'Simülasyon' }).getByRole('status').textContent()) ?? '';
  check('masaüstü: çalışırken alandan çıkınca değer uygulanıyor, simülasyon durmuyor', (await part(dp, 'R1')).props.resistance === 470 && statusText.includes('Çalışıyor'), statusText);
  const live = (await notebook(dp).textContent()) ?? '';
  check('masaüstü: defterde açık kartta canlı ölçüm görünüyor', live.includes('Canlı uygulanır') && /Akım\s*[\d,]+\s*mA/.test(live), live.slice(0, 60));
  const after = (await exampleCard.textContent()) ?? '';
  check('masaüstü: Oynat’tan sonra örnek kartı aynı açıklamayı gösteriyor', after.includes('Ne işe yarar?'), after.slice(0, 40));
  await desk.close();

  // --- Masaüstü (v3): Arduino kartı (D3) ------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const ap = await ctx.newPage();
    ap.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await ap.goto(URL0, { waitUntil: 'networkidle' });
    await ap.getByRole('button', { name: 'Örnekler', exact: true }).click(); await ap.waitForTimeout(200);
    await (await pickExample(ap, (p) => p.getByRole('button', { name: 'Arduino: yanıp sönen LED', exact: true }))).click(); await ap.waitForTimeout(500);
    await ap.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click();
    await notebook(ap).getByRole('button', { name: /^ARD1 ·/ }).click();
    await ap.waitForFunction(() => /D13 · Çıkış/.test(document.querySelector('#defter')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const card = notebook(ap).getByRole('region', { name: 'ARD1 · Arduino Uno' });
    const program = await card.getByRole('combobox', { name: 'Program' }).inputValue();
    const cardText = (await card.textContent()) ?? '';
    await card.getByRole('button', { name: /^Kod/ }).click(); await ap.waitForTimeout(150);
    const code = (await card.locator('pre code').textContent()) ?? '';
    check('masaüstü (v3): Arduino kartında program seçimi, kullanılan pinin canlı değeri (D13 çıkış), seri ekran ve açılan kod',
      program === 'blink' && /D13 · Çıkış/.test(cardText) && cardText.includes('Seri ekran') && code.includes('digitalWrite'), cardText.slice(0, 80));
    await card.getByRole('combobox', { name: 'Program' }).selectOption('fade'); await ap.waitForTimeout(200);
    check('masaüstü (v3): Arduino kartında program değiştirilebiliyor', (await part(ap, 'ARD1')).props.program === 'fade');
    await ctx.close();
  }

  // --- Masaüstü (v3): cihaz kartları (raf yok) -----------------------------------------------
  const rackCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const rp = await rackCtx.newPage();
  rp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await rp.goto(URL0, { waitUntil: 'networkidle' });
  await rp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await rp.waitForTimeout(200);
  await (await pickExample(rp, (p) => p.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }))).click(); await rp.waitForTimeout(500);
  const rackCanvas = await rp.locator('svg.schematic').boundingBox();
  const fgClosed = (await notebook(rp).getByRole('button', { name: /^FG1 ·/ }).textContent()) ?? '';
  check('masaüstü (v3): cihaz rafı yok, tuval alta kadar; kapalı üreteç kartında ayar özeti',
    (await rp.getByRole('region', { name: 'Cihaz rafı' }).count()) === 0 && rackCanvas.y + rackCanvas.height >= 899 && fgClosed.includes('Sinüs · 1 kHz · 10 Vpp'), fgClosed.slice(0, 60));
  await notebook(rp).getByRole('button', { name: /^OSC1 ·/ }).click(); await rp.waitForTimeout(200);
  const screenBox = await notebook(rp).getByRole('img', { name: /^Osiloskop ekranı/ }).first().boundingBox();
  // v4: defter her genişlikte 400 px (eskiden 1440 px'te 500): ekran açık kartın iç genişliği kadar (iç boşluk ≈ 28 px).
  const oscCard = await notebook(rp).getByRole('region', { name: 'OSC1 · Osiloskop' }).boundingBox();
  const voltsBefore = (await part(rp, 'OSC1')).props.voltsPerDivA ?? 2;
  await notebook(rp).getByRole('button', { name: 'A volt/bölme artır' }).click();
  const voltsAfter = (await part(rp, 'OSC1')).props.voltsPerDivA;
  check('masaüstü (v4): osiloskop kartında kart genişliğinde ekran (400 px defterde) ve kademeli ayar',
    voltsAfter > voltsBefore && screenBox !== null && oscCard !== null && screenBox.width >= oscCard.width - 32 && screenBox.width >= 330,
    `${voltsBefore} → ${voltsAfter}; ekran ${Math.round(screenBox?.width ?? 0)} px, kart ${Math.round(oscCard?.width ?? 0)} px`);
  await notebook(rp).getByRole('button', { name: /^FG1 ·/ }).click(); await rp.waitForTimeout(200);
  await notebook(rp).getByRole('spinbutton', { name: 'Frekans' }).click(); await rp.waitForTimeout(100);
  await rp.keyboard.press('Control+A'); await rp.keyboard.type('2k'); await rp.keyboard.press('Enter'); await rp.waitForTimeout(150);
  check('masaüstü: üretecin frekansı değere tıklayıp yazılarak değişiyor', (await part(rp, 'FG1')).props.frequency === 2000);
  await rp.getByRole('button', { name: 'FG1 OUT ucunu tuvalde göster' }).click(); await rp.waitForTimeout(150);
  check('masaüstü: jaka tıklayınca tuvalde uç yanıp sönüyor', (await rp.locator('svg.schematic circle.alarm-blink').count()) > 0);
  await rp.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await rp.waitForTimeout(700);
  await notebook(rp).getByRole('button', { name: /^OSC1 ·/ }).click(); await rp.waitForTimeout(200);
  const status = (await notebook(rp).getByRole('region', { name: 'OSC1 · Osiloskop' }).textContent()) ?? '';
  await notebook(rp).getByRole('button', { name: /^Gelişmiş/ }).click(); await rp.waitForTimeout(150);
  await notebook(rp).getByRole('button', { name: 'Oto', exact: true }).click(); await rp.waitForTimeout(300);
  const autoToast = (await rp.getByRole('status').filter({ hasText: 'Oto:' }).count()) > 0;
  check('masaüstü (v3): çalışırken osiloskop kartı tetik durumunu gösteriyor; Gelişmiş’teki Oto neyin değiştiğini bildiriyor', autoToast && (status.includes('Tetikleniyor') || status.includes('Tetiklenmiyor')), status.slice(0, 40));
  // Üretecin çıkış satırı AC'de anlık değeri değil, 0,4 s'lik pencerenin etkin değerini gösterir (her karede zıplamaz; simetrik AC işaretsiz).
  const fgRegion = notebook(rp).getByRole('region', { name: 'FG1 · Fonksiyon üreteci' });
  if (!(await fgRegion.count())) await notebook(rp).getByRole('button', { name: /^FG1 ·/ }).click();
  await rp.waitForTimeout(900);
  // Pencereler simülasyon zamanında dolar: yavaş işlemcide ilk tam pencereler gelene dek beklenir.
  await waitSimTime(rp, 0.9);
  const fgOuts = [];
  // Okumalar gerçek zamanda 100 ms arayla (IOS_CPU uzatmaz): ≈ 0,8 s'de pencere en çok üç kez yenilenir.
  const realWait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 8; i++) {
    fgOuts.push(((await fgRegion.textContent()) ?? '').match(/Çıkış \(OUT − COM\) ([^·]+)·/)?.[1]?.trim() ?? '');
    await realWait(100);
  }
  // ≈ 1 s'lik okumada pencere (0,4 s) en çok üç kez yenilenir; düzeltmeden önce her okuma farklıydı.
  const changes = (texts) => texts.filter((t, i) => i > 0 && t !== texts[i - 1]).length;
  check('masaüstü: çalışırken üreteç kartında çıkış "≈ etkin değer" (her karede zıplamıyor, simetrik AC işaretsiz)',
    fgOuts.every((t) => /^≈ \d/.test(t)) && changes(fgOuts) <= 3, fgOuts.join(' | '));
  // Salınan bir kablo seçilince panelde pencerenin ortalaması (≈), en düşük ve en yüksek değer; değer karede bir zıplamıyor.
  const wireSpots = await rp.evaluate(() => [...document.querySelectorAll('svg.schematic polyline[stroke-width="3"]')].map((el) => {
    const pts = el.points;
    if (pts.length < 2) return null;
    const ctm = el.getScreenCTM();
    const p = new DOMPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2).matrixTransform(ctm);
    return { x: p.x, y: p.y, length: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) };
  }).filter((s) => s && s.length > 40).sort((a, b) => b.length - a.length).slice(0, 6));
  let wireTexts = [];
  for (const spot of wireSpots) {
    await rp.mouse.click(spot.x, spot.y); await rp.waitForTimeout(700);
    const text = (await notebook(rp).textContent()) ?? '';
    if (!text.includes('En düşük')) continue;
    for (let i = 0; i < 6; i++) {
      wireTexts.push(((await notebook(rp).textContent()) ?? '').match(/ortalama\s*(≈ [^E]+?)En düşük/)?.[1]?.trim() ?? '');
      await realWait(100);
    }
    break;
  }
  check('masaüstü: çalışırken salınan kablo seçilince panelde "≈ ortalama", en düşük ve en yüksek; değer karede bir zıplamıyor',
    wireTexts.length === 6 && wireTexts.every((t) => t.startsWith('≈ ')) && changes(wireTexts) <= 3, wireTexts.join(' | ') || `${wireSpots.length} kablo denendi`);
  await rp.getByRole('button', { name: 'Durdur', exact: true }).click(); await rp.waitForTimeout(300);
  await rackCtx.close();

  // --- Masaüstü: hatalar ve uyarılar (rozet, LED balonu, düzeltmeler, toprak yok, tuzak) ------
  const errCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const ep = await errCtx.newPage();
  ep.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await ep.goto(URL0, { waitUntil: 'networkidle' });
  await ep.getByRole('button', { name: 'Örnekler', exact: true }).click(); await ep.waitForTimeout(200);
  await (await pickExample(ep, (p) => p.getByRole('button', { name: 'LED ve ön direnç', exact: true }))).click(); await ep.waitForTimeout(400);
  await ep.getByRole('button', { name: 'Oynat' }).first().click(); await ep.waitForTimeout(400);
  await notebook(ep).getByRole('button', { name: /^R1 ·/ }).first().click();
  const r1Field = ep.getByLabel('Direnç', { exact: true });
  await r1Field.fill('10'); await r1Field.press('Enter'); await ep.waitForTimeout(900);
  const balloon = ep.getByRole('alertdialog', { name: /LED1 yandı/ });
  check('masaüstü (v3): LED yanınca balon ve defterin en üstünde hata kartı', (await balloon.count()) === 1 && (await notebook(ep).getByRole('region', { name: /^Hata ·/ }).count()) >= 1);
  await balloon.getByRole('button', { name: 'Neden?' }).click(); await ep.waitForTimeout(200);
  const fix = notebook(ep).getByRole('button', { name: /^R1’i .* yap$/ });
  const fixLabel = (await fix.textContent().catch(() => '')) ?? '';
  check('masaüstü: "Neden?" mesajı seçiyor; seri direnç önerisi var', fixLabel.includes('160'), fixLabel);
  await fix.click(); await ep.waitForTimeout(700);
  check('masaüstü: önerilen ön direnç uygulanınca LED onarılıyor', (await part(ep, 'R1')).props.resistance === 160 && (await ep.getByRole('alertdialog').count()) === 0);
  await errCtx.close();

  const groundless = { version: 1, parts: [
    { id: 'p1', type: 'battery', label: 'B1', x: 0, y: 0, rotation: 90, props: { voltage: 9, internalResistance: 0 } },
    { id: 'p2', type: 'resistor', label: 'R1', x: 12, y: -6, rotation: 0, props: { resistance: 1000 } },
    { id: 'p3', type: 'resistor', label: 'R2', x: 24, y: 0, rotation: 90, props: { resistance: 2000 } },
  ], wires: [
    { id: 'w1', points: [[0, -4], [0, -6], [8, -6]] },
    { id: 'w2', points: [[16, -6], [24, -6], [24, -4]] },
    { id: 'w3', points: [[24, 4], [24, 6], [0, 6], [0, 4]] },
  ] };
  const ngCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  await ngCtx.addInitScript((d) => { if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } }, JSON.stringify(groundless));
  const gp = await ngCtx.newPage();
  gp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await gp.goto(URL0, { waitUntil: 'networkidle' });
  await gp.getByRole('button', { name: 'Oynat' }).first().click(); await gp.waitForTimeout(400);
  const runningText = (await gp.getByRole('region', { name: 'Simülasyon' }).getByRole('status').textContent()) ?? '';
  const deskZero = gp.getByRole('button', { name: /^Sıfır noktası \(0 V\)/ });
  check('masaüstü: toprak yokken simülasyon başlıyor, sıfır noktasında "0 V" işareti', runningText.includes('Çalışıyor') && (await deskZero.count()) === 1, runningText);
  await deskZero.click(); await gp.waitForTimeout(200);
  check('masaüstü: "0 V" işaretine tıklayınca açıklama çıkıyor', ((await gp.getByRole('tooltip').textContent()) ?? '').includes('gerilimler bu noktaya göre'.replace('gerilimler', 'Gerilimler')));
  await ngCtx.close();

  const trapCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const tp = await trapCtx.newPage();
  tp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await tp.goto(URL0, { waitUntil: 'networkidle' });
  await tp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await tp.waitForTimeout(200);
  await (await pickExample(tp, (p) => p.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }))).click(); await tp.waitForTimeout(400);
  const earthLines = await tp.locator('svg.schematic g.earth-line path').count();
  const earthLabel = await tp.locator('svg.schematic g.earth-line text', { hasText: 'toprak hattı' }).count();
  const trapText = (await notebook(tp).textContent()) ?? '';
  check(
    'masaüstü: toprak tuzağında uyarı ve kesikli toprak hattı (tek mesaj)',
    earthLines >= 1 && earthLabel <= 1 && trapText.includes('Toprak tuzağı') && trapText.includes('D4 kısa devre oldu') && !trapText.includes('toprak hattı üzerinden dönüyor'),
    `${earthLines} çizgi, ${earthLabel} etiket; ${trapText.slice(0, 50)}`,
  );
  await notebook(tp).getByRole('button', { name: 'D4’ü göster' }).click(); await tp.waitForTimeout(200);
  const earthGlow = await tp.locator('svg.schematic g.earth-line path[stroke-opacity="0.35"]').count();
  check('masaüstü (v3): uyarı kartında "D4’ü göster" toprak hattını vurguluyor, D4’ün kartını açıyor', earthGlow >= 1 && (await notebook(tp).getByRole('region', { name: 'D4 · Diyot' }).count()) === 1, `${earthGlow} vurgu`);
  await trapCtx.close();

  // --- Gerçek dünya sınırları (Fizik 5): ısınan direnç, ters LED, ters elektrolitik ------------
  {
    const limits = { version: 1, parts: [
      { id: 'p1', type: 'battery', label: 'B1', x: 0, y: 0, rotation: 90, props: { voltage: 9, internalResistance: 0 } },
      { id: 'p2', type: 'resistor', label: 'R1', x: 12, y: -6, rotation: 0, props: { resistance: 10 } },
      { id: 'p3', type: 'resistor', label: 'R2', x: 24, y: 0, rotation: 90, props: { resistance: 100 } },
      { id: 'p4', type: 'led', label: 'D1', x: 36, y: 0, rotation: 270, props: { color: 'red' } },
      { id: 'p5', type: 'capacitor', label: 'C1', x: 48, y: 0, rotation: 270, props: { capacitance: 1e-5, initialVoltage: 0, kind: 'electrolytic' } },
      { id: 'p6', type: 'capacitor', label: 'C2', x: 60, y: 0, rotation: 270, props: { capacitance: 1e-5, initialVoltage: 0, kind: 'film' } },
      { id: 'p7', type: 'ground', label: 'G1', x: 0, y: 8, rotation: 0, props: {} },
    ], wires: [
      { id: 'w1', points: [[0, -4], [0, -6], [8, -6]] },
      { id: 'w2', points: [[16, -6], [60, -6], [60, -4]] },
      { id: 'w3', points: [[24, -6], [24, -4]] },
      { id: 'w4', points: [[36, -6], [36, -4]] },
      { id: 'w5', points: [[48, -6], [48, -4]] },
      { id: 'w6', points: [[0, 4], [0, 8], [60, 8], [60, 4]] },
      { id: 'w7', points: [[24, 4], [24, 8]] },
      { id: 'w8', points: [[36, 4], [36, 8]] },
      { id: 'w9', points: [[48, 4], [48, 8]] },
    ] };
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript((d) => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); } } catch { /* yok */ } }, JSON.stringify(limits));
    const lp = await ctx.newPage();
    lp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await lp.goto(URL0, { waitUntil: 'networkidle' });
    await lp.getByRole('button', { name: 'Oynat' }).last().click(); await lp.waitForTimeout(800);
    const text = (await notebook(lp).textContent()) ?? '';
    const warningCards = await notebook(lp).getByRole('region', { name: /^Uyarı ·/ }).count();
    const hot = await lp.locator('svg.schematic polyline[stroke^="rgb("]').count();
    check(
      'masaüstü: ısınan direnç kızıl, ters LED ve ters elektrolitik için uyarı (Fizik 5)',
      hot >= 1 && text.includes('Direnç ısınıyor') && text.includes('LED ters yönde') && text.includes('elektrolitik kondansatör ters yönde') && warningCards === 3,
      `${hot} kızıl gövde; ${text.slice(0, 60)}`,
    );
    await ctx.close();
  }

  // --- Sabit boyutlar: bilgi kutusu ve hız penceresi yazıya göre büyüyüp küçülmez -----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const fp = await ctx.newPage();
    fp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await fp.goto(URL0, { waitUntil: 'networkidle' });
    // Hız düğmesi yalnızca çalışırken (v3).
    await fp.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await fp.waitForTimeout(300);
    await fp.getByRole('button', { name: /^Hız/ }).first().click(); await fp.waitForTimeout(200);
    const dialog = fp.getByRole('dialog', { name: /hız/i }).first();
    const heights = new Set();
    for (const v of ['0.00', '1.37', '2.50', '3.91', '5.20', '6.00']) {
      await dialog.locator('input[type=range]').first().evaluate((el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, v);
      await fp.waitForTimeout(60);
      heights.add(Math.round((await dialog.boundingBox())?.height ?? 0));
    }
    check('masaüstü: hız sürgüsü kaydırılınca hız penceresi boy değiştirmez', heights.size === 1, [...heights].join(','));
    await ctx.close();
  }

  // --- Bobin (Fizik 7): kütüphanede, RL örneğinde anahtar açılınca Lenz uyarısı -------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const bp = await ctx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await bp.goto(URL0, { waitUntil: 'networkidle' });
    await (await deskAdd(bp)).fill('bobin'); await bp.waitForTimeout(150);
    const inLibrary = await bp.getByRole('option', { name: /^Bobin/ }).count();
    await notebook(bp).getByRole('combobox', { name: /Parça ekle/ }).fill('');
    await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
    await (await pickExample(bp, (p) => p.getByRole('button', { name: 'RL devresi', exact: true }))).click(); await bp.waitForTimeout(400);
    await bp.getByRole('button', { name: 'Oynat', exact: true }).last().click(); await bp.waitForTimeout(400);
    const box = await bp.locator('svg.schematic text', { hasText: /^S1$/ }).first().boundingBox();
    const toggle = async () => { await bp.mouse.click(box.x + box.width / 2, box.y + box.height + 12); await bp.waitForTimeout(600); };
    await toggle();
    const closedText = (await bp.locator('svg.schematic text', { hasText: /mA$/ }).allTextContents()).join(' ');
    await toggle();
    const text = (await notebook(bp).textContent()) ?? '';
    check(
      'masaüstü: Parça ekle’de Bobin; RL örneğinde akım ≈ 89 mA, anahtar açılınca Lenz uyarısı (Fizik 7)',
      inLibrary >= 1 && closedText.includes('89,') && text.includes('Bobin akımı aniden kesildi') && text.includes('Lenz'),
      `${inLibrary} kütüphane; ampermetre ${closedText}; ${text.slice(0, 50)}`,
    );
    await ctx.close();
  }

  // --- Parça Dalga 1 (Y3): çift yollu anahtar tıklanınca değişir, basmalı düğme basılı tutulur ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const openDesktop = async (name) => {
      const bp = await ctx.newPage();
      bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      await bp.goto(URL0, { waitUntil: 'networkidle' });
      await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
      await (await pickExample(bp, (p) => p.getByRole('button', { name, exact: true }))).click(); await bp.waitForTimeout(400);
      await bp.getByRole('button', { name: 'Oynat', exact: true }).last().click(); await bp.waitForTimeout(800);
      return bp;
    };
    const ohm = await openDesktop('Akım kaynağıyla Ohm yasası');
    const meters = async () => (await ohm.locator('svg.schematic text', { hasText: / (V|mA)$/ }).allTextContents()).join(' ');
    const before = await meters();
    const s1 = await part(ohm, 'S1');
    const at = await screen(ohm, s1.x, s1.y);
    await ohm.mouse.click(at.x, at.y); await ohm.waitForTimeout(900);
    const after = await meters();
    // B'de multimetrenin 10 MΩ'u 10 V'ta 1 µA çeker: ampermetre 9,999 mA.
    check('masaüstü (Parça Dalga 1): çift yollu anahtara tıklayınca B’ye geçiyor; multimetre 4,70 V → 10,0 V, akım yine ≈ 10,0 mA',
      before.includes('4,701 V') && after.includes('10,00 V') && /(9,99\d|10,00) mA/.test(after) && (await part(ohm, 'S1')).props.to === 'b', `${before} → ${after}`);
    const scr = await openDesktop('Tristörle mandallı LED');
    const bt1 = await part(scr, 'BT1');
    const p1 = await screen(scr, bt1.x, bt1.y);
    await scr.mouse.move(p1.x, p1.y); await scr.mouse.down(); await scr.waitForTimeout(600);
    const held = (await notebook(scr).textContent()) ?? '';
    await scr.mouse.up(); await scr.waitForTimeout(700);
    const released = (await notebook(scr).textContent()) ?? '';
    check('masaüstü (Parça Dalga 1): basmalı düğme basılı tutulunca tristör tetikleniyor, bırakınca LED yanık kalıyor (mandal)',
      held.includes('basılı') && held.includes('iletimde') && released.includes('iletimde') && !released.includes('basılı'), released.replace(/\s+/g, ' ').slice(0, 80));
    await ctx.close();
    // Telefonda: Ölç’te parmakla basılı tutulur; kartın "Basılı tut" düğmesi en az 44 px.
    const { page, cdp } = await phone();
    await openExample(page, 'Tristörle mandallı LED');
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(600);
    const b = await part(page, 'BT1');
    const s = await screen(page, b.x, b.y);
    const t = touch(cdp);
    await t.start(s.x, s.y); await page.waitForTimeout(600); await t.end(); await page.waitForTimeout(600);
    const text = (await phoneNotebook(page).textContent()) ?? '';
    await phoneNotebook(page).getByRole('button', { name: /^BT1 ·/ }).tap(); await page.waitForTimeout(400);
    const holdBox = await phoneNotebook(page).getByRole('region', { name: /^BT1 ·/ }).getByRole('button', { name: /Basılı tut/ }).boundingBox().catch(() => null);
    await shot(page, 'ios-dalga1.png');
    check('telefon (Parça Dalga 1): Ölç’te düğmeye parmakla basılı tutunca tristör tetikleniyor; kartta "Basılı tut" en az 44 px, sayfa kaymıyor',
      text.includes('iletimde') && holdBox !== null && holdBox.height >= 44 && !(await pageScrolls(page)), `${holdBox ? Math.round(holdBox.height) : 'yok'} px; ${text.replace(/\s+/g, ' ').slice(0, 60)}`);
    await page.context().close();
  }

  // --- Lojik entegreler (Dalga 2): DIP sembolü, defter kartı (bacaklar, doğruluk tablosu), LS girişi, Tahtada kur, gösterge, telefon --
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'VE kapısının doğruluk tablosu (74HC08)', exact: true }))).click(); await page.waitForTimeout(500);
    const texts = await page.locator('svg.schematic text').allTextContents();
    const numbers = Array.from({ length: 14 }, (_, i) => String(i + 1)).every((n) => texts.includes(n));
    check('lojik (masaüstü): 74HC08 şemada veri sayfasının bacak sırasıyla DIP kutusu: 1–14 numaralar, 1A 1B 1Y … adları, VCC ve GND açık bacak; altında model',
      numbers && ['1A', '1B', '1Y', '4Y', 'VCC', 'GND'].every((n) => texts.includes(n)) && texts.includes('74HC08'), texts.filter((t) => /^(VCC|GND|1A|74HC08)$/.test(t)).join(' '));
    await page.getByRole('button', { name: 'Oynat', exact: true }).last().click(); await page.waitForTimeout(1200);
    const highDots = await page.locator('svg.schematic circle[fill="var(--color-paused)"]').count();
    await notebook(page).getByRole('button', { name: /^U1 ·/ }).click(); await page.waitForTimeout(400);
    const card = notebook(page).getByRole('region', { name: /^U1 ·/ });
    const cardText = (await card.textContent()) ?? '';
    const current = await card.locator('tr[aria-current="true"]').textContent().catch(() => '');
    const gates = await card.getByRole('group', { name: 'Doğruluk tablosu gösterilen kapı' }).getByRole('button').count();
    const pinRow = (n) => card.getByRole('region', { name: 'Bacaklar' }).locator('tbody tr').nth(n - 1).textContent();
    check('lojik (masaüstü): Oynat’ta 1 olan bacaklarda turuncu nokta; kartta doğruluk tablosu (1. kapı, o anki satır 1 1 1 vurgulu), 4 kapı seçilebilir; bacak tablosunda 1Y 1 · 4,60 V, besleme 5,000 V',
      highDots >= 3 && cardText.includes('Doğruluk tablosu') && (current ?? '').replace(/\s+/g, '') === '111' && gates === 4 && /1Y.*1.*4,60 V/.test((await pinRow(3)) ?? '') && cardText.includes('5,000 V'),
      `${highDots} nokta · satır ${current} · ${gates} kapı · ${(await pinRow(3))?.replace(/\s+/g, ' ')}`);
    // 4. kapıya geç: tablo değişir, satır 0 0 0 (girişleri toprakta).
    await card.getByRole('button', { name: '4. kapı' }).click(); await page.waitForTimeout(200);
    const fourth = await card.locator('tr[aria-current="true"]').textContent().catch(() => '');
    check('lojik (masaüstü): 4. kapının tablosunda o anki satır 0 0 0 (kullanılmayan girişler toprakta)', (fourth ?? '').replace(/\s+/g, '') === '000', fourth ?? '');
    // 74LS08'e geç ve S2'yi aç: 10 kΩ LS girişini ancak 1,67 V'a çeker (belirsiz, 1 okunur), uyarı.
    await card.getByRole('radio', { name: '74LS08', exact: true }).click(); await page.waitForTimeout(900);
    const s2 = await part(page, 'S2');
    const at = await screen(page, s2.x, s2.y);
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(1200);
    const lsCard = notebook(page).getByRole('region', { name: /^U1 ·/ });
    const lsRow = ((await lsCard.getByRole('region', { name: 'Bacaklar' }).locator('tbody tr').nth(1).textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    const messages = (await notebook(page).textContent()) ?? '';
    check('lojik (masaüstü): 74LS08’de S2 açıkken 1B 1,67 V’ta “belirsiz”; “Giriş gerilimi belirsiz bölgede” uyarısı; LED yanık kalıyor (1 okunur)',
      lsRow.includes('belirsiz') && lsRow.includes('1,67 V') && messages.includes('Giriş gerilimi belirsiz bölgede'), lsRow);
    await ctx.close();
  }
  {
    // Parça notu: yarım toplayıcının LED'lerinde "Toplam" ve "Elde"; kartta etiketin yanında, Diğer ayarlar → Not.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Yarım toplayıcı (74HC86 + 74HC08)', exact: true }))).click(); await page.waitForTimeout(500);
    const notes = await page.locator('svg.schematic text[data-note]').allTextContents();
    const group = notebook(page).getByRole('button', { name: /^LED’ler/ });
    if (await group.count()) { await group.click(); await page.waitForTimeout(200); }
    const row = notebook(page).getByRole('button', { name: /^LED1 · Toplam · LED: kartı aç/ });
    const rowOk = (await row.count()) === 1;
    await row.click(); await page.waitForTimeout(300);
    const card = notebook(page).getByRole('region', { name: /^LED1 · Toplam/ });
    await card.getByRole('button', { name: 'Diğer ayarlar' }).click(); await page.waitForTimeout(200);
    const input = card.getByRole('textbox', { name: /^Not/ });
    const before = await input.inputValue();
    await input.fill('Toplam (S)'); await input.press('Enter'); await page.waitForTimeout(300);
    const after = await page.locator('svg.schematic text[data-note]').allTextContents();
    await page.keyboard.press('Escape');
    await page.locator('header').getByRole('button', { name: 'Geri al', exact: true }).click(); await page.waitForTimeout(300);
    const undone = await page.locator('svg.schematic text[data-note]').allTextContents();
    check('not (masaüstü): şemada LED’lerin adının altında “Toplam” ve “Elde”; kartta etiketin yanında; Diğer ayarlar → Not değişince şema güncelleniyor, Geri al eskisine döndürüyor',
      notes.includes('Toplam') && notes.includes('Elde') && rowOk && before === 'Toplam' && after.includes('Toplam (S)') && undone.includes('Toplam') && !undone.includes('Toplam (S)'),
      `${notes.join('/')} · satır ${rowOk} · ${before} → ${after.join('/')} → ${undone.join('/')}`);
    await ctx.close();
  }
  {
    // 555 zamanlaması (motor-555): uygulamanın osiloskobu (büyük adımlarla ilerleyen motor) metindeki frekansı
    // (küçük adımla ölçülen) %0,5 içinde gösteriyor: saat 968 Hz, Q 484 Hz.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'D flip-flopla frekans bölücü (555 + 74HC74)', exact: true }))).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Oynat', exact: true }).last().click(); await page.waitForTimeout(3000);
    await notebook(page).getByRole('button', { name: /^OSC1 ·/ }).click(); await page.waitForTimeout(1200);
    const scopeText = ((await notebook(page).getByRole('region', { name: /^OSC1 ·/ }).textContent()) ?? '').replace(/\s+/g, ' ');
    const freqs = [...scopeText.matchAll(/f ([\d.,]+) (k?)Hz/g)].map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')) * (m[2] ? 1000 : 1));
    const [fa, fb] = freqs;
    check('555 zamanlaması: frekans bölücüde uygulamanın osiloskobu saati 968 Hz, Q’yu 484 Hz gösteriyor (metindeki, küçük adımla ölçülen değerler; %0,5 içinde)',
      fa !== undefined && fb !== undefined && Math.abs(fb / 968 - 1) < 0.005 && Math.abs(fa / 484 - 1) < 0.005, `A ${fa} Hz · B ${fb} Hz`);
    await ctx.close();
  }
  {
    // Tahtada kur: 74HC08 kanalın üstüne oturuyor (alt sıra f, üst sıra e; 14 bacak).
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const bp = await ctx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await bp.goto(URL0, { waitUntil: 'networkidle' });
    await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
    await (await pickExample(bp, (p) => p.getByRole('button', { name: 'VE kapısının doğruluk tablosu (74HC08): tahtada kur' }))).click(); await bp.waitForTimeout(1500);
    await bp.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await bp.waitForTimeout(600);
    const panel = bp.getByRole('region', { name: 'Tahtada kur paneli' });
    const holeXY = (name) => bp.evaluate((n) => {
      const t = window.__tezgah.topTransform(); const rect = document.querySelector('[role=region][aria-label^="Breadboard"]').getBoundingClientRect();
      const m = /^(\d+)([a-j])$/.exec(n); const col = +m[1]; const row = 'abcdefghij'.indexOf(m[2]);
      const x = col - 15.5; const z = row < 5 ? -5.5 + row : 1.5 + (row - 5);
      return { x: rect.left + x * t.scale + t.ox, y: rect.top + z * t.scale + t.oy };
    }, name);
    await panel.getByRole('button', { name: 'U1: tahtaya tak' }).click();
    const target = await holeXY('10f'); await bp.mouse.click(target.x, target.y); await bp.waitForTimeout(500);
    const d = await doc(bp);
    const id = d.parts.find((q) => q.label === 'U1').id;
    const holes = d.build?.parts[id]?.holes ?? [];
    const expected = [...Array.from({ length: 7 }, (_, i) => `${10 + i}f`), ...Array.from({ length: 7 }, (_, i) => `${16 - i}e`)];
    const placed = await bp.evaluate((pid) => window.__tezgah?.parts.has(pid) ?? false, id);
    await shot(bp, 'ios-lojik-tahta.png');
    check('lojik (Tahtada kur): 74HC08 kanalın üstüne oturuyor: 1. bacak 10f, 1–7 f satırında soldan sağa, 8–14 e satırında sağdan sola; 3B’de entegre var',
      holes.join(' ') === expected.join(' ') && placed, holes.join(' '));
    await ctx.close();
  }
  {
    // 7 segment gösterge: BCD örneğinde 5; segmentler yanıyor; kod çözücünün kartında rakam.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'BCD’den 7 segmente (CD4511 + gösterge)', exact: true }))).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Oynat', exact: true }).last().click(); await page.waitForTimeout(1200);
    const lit = await page.locator('svg.schematic path[fill="var(--color-lamp-cc)"]').count();
    await notebook(page).getByRole('button', { name: /^U1 ·/ }).click(); await page.waitForTimeout(400);
    const decoder = (await notebook(page).getByRole('region', { name: /^U1 ·/ }).textContent()) ?? '';
    await notebook(page).getByRole('button', { name: /^DS1 ·/ }).click(); await page.waitForTimeout(400);
    const display = notebook(page).getByRole('region', { name: /^DS1 ·/ });
    const litRows = await display.locator('tbody tr', { hasText: 'yanıyor' }).count();
    const aRow = ((await display.locator('tbody tr').first().textContent()) ?? '').replace(/\s+/g, ' ');
    await shot(page, 'ios-lojik-gosterge.png');
    // Yanık segmentler: göstergede 5 ve kod çözücünün kutusundaki küçük hanede 5.
    check('lojik (masaüstü): gösterge 5’i gösteriyor (a, c, d, f, g yanık; CD4511’in kutusunda da 5); CD4511 kartında “Gösterilen rakam: 5”; göstergenin kartında 5 segment yanıyor, a 10,0 mA',
      lit === 10 && decoder.includes('Gösterilen rakam: 5') && litRows === 5 && aRow.includes('10,0 mA'), `${lit} · ${litRows} · ${aRow}`);
    await ctx.close();
  }
  {
    // Telefon: kart (bacak tablosu, doğruluk tablosu), kapı düğmeleri 44 px, sayfa kaymıyor.
    const { page } = await phone();
    await openExample(page, 'VE kapısının doğruluk tablosu (74HC08)');
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(1000);
    await phoneNotebook(page).getByRole('button', { name: /^U1 ·/ }).tap(); await page.waitForTimeout(500);
    const card = phoneNotebook(page).getByRole('region', { name: /^U1 ·/ });
    const gateButtons = await card.getByRole('group', { name: 'Doğruluk tablosu gösterilen kapı' }).getByRole('button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
    const current = await card.locator('tr[aria-current="true"]').textContent().catch(() => '');
    const rows = await card.locator('tbody tr').count();
    await shot(page, 'ios-lojik-telefon.png');
    check('lojik (telefon): kartta doğruluk tablosu (satır 1 1 1 vurgulu) ve 14 bacaklık tablo; kapı düğmeleri en az 44 px; sayfa kaymıyor',
      (current ?? '').replace(/\s+/g, '') === '111' && rows === 4 + 14 && gateButtons.length === 4 && gateButtons.every((h) => h >= 44) && !(await pageScrolls(page)),
      `${current} · ${rows} satır · ${gateButtons.join('/')} px`);
    await page.context().close();
  }

  // --- Tahtada kur (T1–T6): tepeden görünüm, takma, dolu delik, bacak aralığı, Esc, geri al ------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const bp = await ctx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await bp.goto(URL0, { waitUntil: 'networkidle' });
    await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
    await (await pickExample(bp, (p) => p.getByRole('button', { name: 'Transistör anahtar: LED kollektörde', exact: true }))).click(); await bp.waitForTimeout(400);
    await benchButton(bp).click();
    await bp.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }); await bp.waitForTimeout(800);
    await bp.getByRole('button', { name: 'Tahtada kur', exact: true }).click(); await bp.waitForTimeout(1500);
    const panel = bp.getByRole('region', { name: 'Tahtada kur paneli' });
    const topOn = (await bp.getByRole('group', { name: 'Tahta görünümü' }).getByRole('button', { name: 'Tepeden' }).getAttribute('aria-pressed')) === 'true';
    const panelText = (await panel.textContent()) ?? '';
    check('Tahtada kur (masaüstü): 3B araç çubuğundan açılıyor; Tepeden seçili, Çık var; panelde şema, 0 / 4 takılı ve 4 alet kablosu (T1; Şekil-24: güç kaynağı ve üreteç)',
      topOn && (await bp.getByRole('button', { name: /Tahtada kur’dan çık/ }).count()) === 1 && panelText.includes('Şemadaki devreyi tahtaya kur') && panelText.includes('0 / 4 takılı') && panelText.includes('0 / 4 takılı', panelText.indexOf('0 / 4 takılı') + 1), panelText.slice(0, 60));
    const holeXY = (name) => bp.evaluate((n) => {
      const t = window.__tezgah.topTransform(); const rect = document.querySelector('[role=region][aria-label^="Breadboard"]').getBoundingClientRect();
      const m = /^(\d+)([a-j])$/.exec(n); const col = +m[1]; const row = 'abcdefghij'.indexOf(m[2]);
      const x = col - 15.5; const z = row < 5 ? -5.5 + row : 1.5 + (row - 5);
      return { x: rect.left + x * t.scale + t.ox, y: rect.top + z * t.scale + t.oy };
    }, name);
    const holesOf = async (label) => { const d = await doc(bp); const id = d.parts.find((q) => q.label === label).id; return d.build?.parts[id]?.holes.join(' ') ?? null; };
    // Tıklayarak (R1), kutudan sürükleyerek (Q1), delik adı yazarak (R2, LED1).
    await panel.getByRole('button', { name: 'R1: tahtaya tak' }).click();
    let at = await holeXY('2c'); await bp.mouse.click(at.x, at.y);
    at = await holeXY('12c'); await bp.mouse.click(at.x, at.y); await bp.waitForTimeout(300);
    const far = (await bp.getByRole('status').allTextContents()).join(' ');
    at = await holeXY('6c'); await bp.mouse.click(at.x, at.y); await bp.waitForTimeout(300);
    const row = await panel.getByRole('button', { name: 'Q1: tahtaya tak' }).boundingBox();
    const to = await holeXY('2h');
    await bp.mouse.move(row.x + 30, row.y + row.height / 2); await bp.mouse.down();
    for (let i = 1; i <= 10; i++) await bp.mouse.move(row.x + 30 + ((to.x - row.x - 30) * i) / 10, row.y + row.height / 2 + ((to.y - row.y - row.height / 2) * i) / 10);
    await bp.mouse.up(); await bp.waitForTimeout(300);
    await panel.getByRole('button', { name: 'R2: tahtaya tak' }).click();
    await bp.keyboard.type('7h'); await bp.keyboard.press('Enter'); await bp.keyboard.type('11h'); await bp.keyboard.press('Enter'); await bp.waitForTimeout(300);
    await panel.getByRole('button', { name: 'LED1: tahtaya tak' }).click();
    await bp.keyboard.type('11h'); await bp.keyboard.press('Enter'); await bp.waitForTimeout(200);
    const full = (await bp.getByRole('status').allTextContents()).join(' ');
    await bp.keyboard.type('11g'); await bp.keyboard.press('Enter'); await bp.keyboard.type('12g'); await bp.keyboard.press('Enter'); await bp.waitForTimeout(400);
    const placed = [await holesOf('R1'), await holesOf('Q1'), await holesOf('R2'), await holesOf('LED1')];
    check('Tahtada kur: tıklayarak, kutudan sürükleyerek ve delik adı yazarak takılıyor; T1’in kurulumu (R1 2c–6c, Q1 2h-3h-4h, R2 7h–11h, LED1 11g–12g)',
      placed.join(' | ') === '2c 6c | 2h 3h 4h | 7h 11h | 11g 12g' && ((await panel.textContent()) ?? '').includes('4 / 4 takılı'), placed.join(' | '));
    check('Tahtada kur: uzanmayan bacak (direnç 3–8 delik) ve dolu delik kısa uyarıyla reddediliyor; takılınca ekran okuyucuya duyuru',
      far.includes('uzanmaz') && full.includes('dolu') && ((await bp.locator('[role=region][aria-label^="Breadboard"] [aria-live=polite]').textContent()) ?? '').includes('LED1, 11g ve 12g deliklerine takıldı'), `${far.slice(-50)} / ${full.slice(-40)}`);
    // Esc vazgeçer; seçili parça Del ile kutuya döner, Ctrl+Z geri getirir.
    await panel.getByRole('button', { name: 'R1' }).first().click();
    at = await holeXY('4c'); await bp.mouse.click(at.x, at.y); await bp.waitForTimeout(200);
    await bp.keyboard.press('Delete'); await bp.waitForTimeout(400);
    const removed = await holesOf('R1');
    await bp.keyboard.press('Control+z'); await bp.waitForTimeout(400);
    const back = await holesOf('R1');
    await panel.getByRole('button', { name: 'R1' }).first().click();
    check('Tahtada kur: seçili parça Del ile kutuya dönüyor, Ctrl+Z geri getiriyor', removed === null && back === '2c 6c', `${removed} → ${back}`);
    // Kablolar (5. aşama): K ile ara kablo, kendiliğinden renk, renk değiştirme, Del; alet kablosu.
    await bp.keyboard.press('k'); await bp.waitForTimeout(200);
    const wireOn = (await bp.getByRole('toolbar', { name: 'Tahta araçları' }).getByRole('button', { name: 'Kablo K', exact: true }).getAttribute('aria-pressed')) === 'true';
    for (const name of ['8c', 'üst + rayı (5. sütun hizası)', '13a', '16a']) { await bp.keyboard.type(name); await bp.keyboard.press('Enter'); await bp.waitForTimeout(120); }
    await bp.keyboard.press('Escape'); await bp.waitForTimeout(500);
    const colors = ((await doc(bp)).build?.wires ?? []).map((w) => w.color).join(' ');
    const a = await holeXY('13a'); const c = await holeXY('16a');
    await bp.mouse.click((a.x + c.x) / 2, (a.y + c.y) / 2); await bp.waitForTimeout(200);
    await bp.getByRole('button', { name: /^Kablo rengi:/ }).click(); await bp.waitForTimeout(150);
    await bp.getByRole('radio', { name: 'mavi' }).click(); await bp.waitForTimeout(500);
    const recolored = ((await doc(bp)).build?.wires ?? []).map((w) => w.color).join(' ');
    await bp.keyboard.press('Delete'); await bp.waitForTimeout(500);
    const left = ((await doc(bp)).build?.wires ?? []).length;
    check('Tahtada kur: K ile iki delik arasına kablo; renk kendiliğinden (+ rayına giden kırmızı, öbürü turuncu), seçilen kablo araç çubuğundan maviye boyanıyor, Del ile çıkıyor',
      wireOn && colors === 'red orange' && recolored === 'red blue' && left === 1, `${wireOn} ${colors} → ${recolored} → ${left}`);
    await panel.getByRole('button', { name: 'PS1 1+ kablosunu tak' }).click(); await bp.waitForTimeout(150);
    await bp.keyboard.type('20a'); await bp.keyboard.press('Enter'); await bp.waitForTimeout(500);
    const lead = ((await doc(bp)).build?.leads ?? []).map((l) => l.hole).join(' ');
    const pin = await bp.locator('[data-anchor="pin"][data-exact]').nth(0).boundingBox();
    await bp.mouse.click(pin.x + pin.width / 2, pin.y + pin.height / 2); await bp.waitForTimeout(200);
    const leadChip = await bp.getByRole('group', { name: /kablosu · bir deliğe tak$/ }).count();
    await bp.keyboard.press('Escape'); await bp.waitForTimeout(150);
    check('Tahtada kur: alet kablosu panelin çipinden başlatılıp delik adıyla takılıyor (1 / 4 takılı); karttaki uca tıklayınca da takma başlıyor',
      lead === '20a' && ((await panel.textContent()) ?? '').includes('1 / 4 takılı') && leadChip === 1, `${lead} ${leadChip}`);
    await bp.getByRole('button', { name: /Tahtada kur’dan çık/ }).click(); await bp.waitForTimeout(400);
    check('Tahtada kur: Çık ile 3B tezgâha dönülüyor, kurulum devrede kalıyor', (await bp.getByRole('region', { name: 'Tahtada kur paneli' }).count()) === 0 && (await holesOf('Q1')) === '2h 3h 4h');
    await ctx.close();
  }

  // --- Tahtada kur: Denetle (T3) ve sonuç (T4): R1 aynı şeritte, LED1 ters; ipuçları, işaretler, düzeltince aynı ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const bp = await ctx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await bp.goto(URL0, { waitUntil: 'networkidle' });
    await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
    await (await pickExample(bp, (p) => p.getByRole('button', { name: 'Transistör anahtar: LED kollektörde', exact: true }))).click(); await bp.waitForTimeout(300);
    // T3'teki kurulum: planBreadboard yerleşimi, yalnızca R1 6b–6e ve LED1 ters.
    const d = await doc(bp);
    const id = (label) => d.parts.find((p) => p.label === label).id;
    const rail = (side, sign, col) => `${side} ${sign} rayı (${col}. sütun hizası)`;
    d.build = {
      cols: 30,
      parts: { [id('R1')]: { holes: ['6b', '6e'] }, [id('Q1')]: { holes: ['2h', '3h', '4h'] }, [id('R2')]: { holes: ['7h', '11h'] }, [id('LED1')]: { holes: ['12g', '11g'] } },
      // Şekil-24: kollektör (2j) R2'nin ucuna ve LED'in anoduna (11j); LED'in katodu (12j) alt − rayına.
      wires: [['6a', '3j', 'orange'], ['2j', '11j', 'yellow'], ['4j', rail('alt', '−', 4), 'black'], ['12j', rail('alt', '−', 12), 'black'], ['7j', rail('alt', '+', 8), 'red'], [rail('üst', '+', 2), rail('alt', '+', 2), 'red'], [rail('üst', '−', 30), rail('alt', '−', 30), 'black']].map(([a, b, color]) => ({ a, b, color })),
      leads: [['PS1', 0, rail('üst', '+', 10)], ['PS1', 1, rail('üst', '−', 10)], ['FG1', 1, '2a'], ['FG1', 2, rail('üst', '−', 23)]].map(([label, pin, hole]) => ({ part: id(label), pin, hole })),
    };
    await bp.evaluate((x) => localStorage.setItem('devre-simulatoru:devre', JSON.stringify(x)), d);
    await bp.reload({ waitUntil: 'networkidle' });
    await benchButton(bp).click();
    await bp.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }); await bp.waitForTimeout(800);
    await bp.getByRole('button', { name: 'Tahtada kur', exact: true }).click(); await bp.waitForTimeout(1500);
    const panel = bp.getByRole('region', { name: 'Tahtada kur paneli' });
    await panel.getByRole('button', { name: 'Denetle', exact: true }).click(); await bp.waitForTimeout(300);
    const titles = async () => (await panel.locator('ol > li b').allTextContents()).join(' | ');
    const first = `${await panel.locator('h2').textContent()} / ${await titles()}`;
    check('Tahtada kur, Denetle (T3): T3’ün kurulumunda “2 sorun var”; ilk kademede yalnızca sayı (1. sorun, 2. sorun)', first === '2 sorun var / 1. sorun | 2. sorun', first);
    for (let i = 0; i < 2; i++) await panel.getByRole('button', { name: 'Yerini göster' }).first().click();
    await bp.waitForTimeout(300);
    const located = await titles();
    const schematicMarks = await panel.locator('svg rect[stroke="var(--color-danger)"]').count();
    const boardMarks = await bp.locator('[role=region][aria-label^="Breadboard"] svg rect[stroke="var(--color-danger)"]').count();
    check('Tahtada kur, Denetle: “Yerini göster” sorunun parçasını adlandırıyor; tahtada ve şemada iki kırmızı işaret',
      located === 'R1 çevresinde | LED1 çevresinde' && schematicMarks === 2 && boardMarks === 2, `${located} / şema ${schematicMarks} / tahta ${boardMarks}`);
    // Sonuçlar listelenince (parça kutusu da açıkken) şema kartı ezilmiyor (en az 200 px), işaretler görünür; panel kayıyor.
    await panel.getByRole('button', { name: /^Parça kutusu ·/ }).click(); await bp.waitForTimeout(200);
    const schematicBox = await panel.getByRole('region', { name: 'Şema (değiştirilemez): tahtaya kurulacak devre' }).boundingBox();
    const markBox = await panel.locator('svg rect[stroke="var(--color-danger)"]').first().boundingBox();
    const scrolls = await panel.locator('div.overflow-y-auto').first().evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto');
    await panel.getByRole('button', { name: /^Parça kutusu ·/ }).click(); await bp.waitForTimeout(150);
    check('Tahtada kur, Denetle: sorun kartları listelenince sağ paneldeki şema en az 200 px kalıyor, kırmızı işaret görünür; panel kendi içinde kayıyor',
      (schematicBox?.height ?? 0) >= 200 && (markBox?.height ?? 0) > 4 && scrolls, `şema ${Math.round(schematicBox?.height ?? 0)} px / işaret ${Math.round(markBox?.height ?? 0)} px / kayar ${scrolls}`);
    for (let i = 0; i < 2; i++) await panel.getByRole('button', { name: 'Açıklamayı göster' }).first().click();
    await bp.waitForTimeout(300);
    const explained = await titles();
    const text = (await panel.locator('ol > li p').first().textContent()) ?? '';
    const stats = (await panel.locator('p').last().textContent()) ?? '';
    check('Tahtada kur, Denetle: açıklamada tür ve yer (R1 · iki bacağı aynı şeritte, 6b ve 6e’de; LED1 · ters takılmış); Denetle 1 · ipucu 4',
      explained === 'R1 · iki bacağı aynı şeritte | LED1 · ters takılmış' && text.startsWith('R1’in bacakları 6b ve 6e’de.') && stats === 'Denetle 1 · ipucu 4.', `${explained} / ${text.slice(0, 40)} / ${stats}`);
    await bp.getByRole('button', { name: 'İşaretleri gizle' }).click(); await bp.waitForTimeout(200);
    const hidden = await bp.locator('[role=region][aria-label^="Breadboard"] svg rect[stroke="var(--color-danger)"]').count();
    await bp.getByRole('button', { name: 'İşaretleri göster' }).click(); await bp.waitForTimeout(200);
    // Düzelt: R1 2c–6c, LED1 11g–12g; Yeniden denetle.
    await panel.getByRole('button', { name: /^Parça kutusu ·/ }).click(); await bp.waitForTimeout(150);
    for (const [label, a, b] of [['R1', '2c', '6c'], ['LED1', '11g', '12g']]) {
      await panel.getByRole('button', { name: new RegExp(`^${label}`) }).first().click(); await bp.waitForTimeout(150);
      await bp.keyboard.press('Delete'); await bp.waitForTimeout(200);
      await panel.getByRole('button', { name: `${label}: tahtaya tak` }).click(); await bp.waitForTimeout(150);
      await bp.keyboard.type(a); await bp.keyboard.press('Enter'); await bp.keyboard.type(b); await bp.keyboard.press('Enter'); await bp.waitForTimeout(250);
    }
    await panel.getByRole('button', { name: 'Yeniden denetle' }).click(); await bp.waitForTimeout(300);
    const fixed = `${await panel.locator('h2').textContent()} / ${(await panel.locator('h2 + span').textContent()) ?? ''}`;
    check('Tahtada kur, Denetle: İşaretleri gizle tahtadaki işaretleri kaldırıyor; düzeltip Yeniden denetle “Kurulum şemayla aynı” (2. denetlemede)',
      hidden === 0 && fixed === 'Kurulum şemayla aynı / 2. denetlemede', `${hidden} / ${fixed}`);
    // Sonuç (T4): özet, üst çubukta "Şemayla aynı", rapor, lehim rehberi, tahtayı boşalt.
    const rows = (await panel.locator('dl > div').allTextContents()).join(' | ');
    const pill = await bp.getByText('Şemayla aynı', { exact: true }).count();
    const [download] = await Promise.all([bp.waitForEvent('download'), panel.getByRole('button', { name: 'Raporu indir (.json)' }).click()]);
    const report = JSON.parse(readFileSync(await download.path(), 'utf8'));
    check('Tahtada kur, sonuç (T4): Bu kurulum (Denetle 2 kez · İpucu 4 (en çok: açıklama) · R1 aynı şeritte · LED1 ters); üst çubukta “Şemayla aynı”; rapor .json’da 2 deneme ve son kurulum',
      rows.startsWith('Denetle2 kez | İpucu4 (en çok: açıklama) | SorunlarR1 aynı şeritte · LED1 ters | Süre') && pill === 1 && report.rapor?.denetle?.length === 2 && report.rapor.sonuc === 'şemayla aynı' && Object.keys(report.build?.parts ?? {}).length === 4,
      `${rows} / ${pill} / ${JSON.stringify(report.rapor?.denetle)}`);
    await panel.getByRole('button', { name: 'Lehim rehberine geç' }).click(); await bp.waitForTimeout(1200);
    const guideTab = (await bp.getByRole('dialog').getByRole('tab', { selected: true }).allTextContents()).join(' ');
    await bp.keyboard.press('Escape'); await bp.waitForTimeout(400);
    await panel.getByRole('button', { name: 'Tahtayı boşalt, yeniden kur' }).click(); await bp.waitForTimeout(500);
    const emptied = ((await panel.textContent()) ?? '').includes('0 / 4 takılı') && (await panel.locator('h2').textContent()) === 'Şemadaki devreyi tahtaya kur';
    await bp.keyboard.press('Control+z'); await bp.waitForTimeout(400);
    check('Tahtada kur, sonuç: Lehim rehberine geç Karta aktar’ı Delikli plaket sekmesinde açıyor; Tahtayı boşalt parçaları kutuya alıyor, Ctrl+Z geri getiriyor',
      guideTab === 'Delikli plaket' && emptied && ((await panel.textContent()) ?? '').includes('4 / 4 takılı'), `${guideTab} / ${emptied}`);
    await ctx.close();
  }

  // --- Tahtada kur: giriş noktaları ve görev (T6): örnek kartı, Görev oluştur → Tahtada kur, öğrenci, Teslim et ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', acceptDownloads: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Transistör anahtar: LED kollektörde: tahtada kur' }))).click(); await page.waitForTimeout(1500);
    let panel = page.getByRole('region', { name: 'Tahtada kur paneli' });
    const entered = (await panel.count()) === 1 && ((await panel.textContent()) ?? '').includes('0 / 4 takılı') && ((await panel.textContent()) ?? '').includes('Deney 9');
    check('Tahtada kur (T6): Örnekler’de her kartta “Tahtada kur”: örnek açılıyor, tahta boş, şema sağ panelde', entered);
    // Şemanın yakınlaştırma grubu (Uzaklaştır, Yakınlaştır, Devreyi ekrana sığdır, 3B) Tahtada kur'da yok; tahtanın grubu tek.
    const schematicControls = async (p) => [(await p.getByRole('button', { name: 'Devreyi ekrana sığdır' }).count()), (await p.getByRole('button', { name: 'Uzaklaştır', exact: true }).count())];
    const fromExample = await schematicControls(page);
    await page.getByRole('button', { name: /Tahtada kur’dan çık/ }).click(); await page.waitForTimeout(400);
    await circuitButton(page).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: /^Görev oluştur/ }).click(); await page.waitForTimeout(300);
    const dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('radio', { name: 'Tahtada kur' }).click(); await page.waitForTimeout(150);
    await dlg.getByRole('textbox', { name: 'Görev adı' }).fill('Deney 9 · tahtada kur');
    await dlg.getByRole('radiogroup', { name: 'Başlangıçta tahtada' }).getByRole('radio', { name: 'Seçili parçalar takılı' }).click();
    await dlg.getByRole('button', { name: 'Q1', exact: true }).click();
    await dlg.getByRole('radiogroup', { name: 'Denetle hakkı' }).getByRole('radio', { name: '3 kez' }).click();
    await dlg.getByRole('radiogroup', { name: 'İpuçları en çok' }).getByRole('radio', { name: 'Açıklama' }).click();
    await dlg.getByRole('switch', { name: /^Bağlı delikleri göster/ }).click();
    await dlg.getByRole('switch', { name: /^Oynat’la denemeye izin ver/ }).click();
    const boardRow = ((await dlg.textContent()) ?? '').includes('Yarım boy · 30 sütun');
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    check('Tahtada kur (T6): Görev oluştur’da üçüncü sekme; başlangıç, Denetle hakkı, ipucu sınırı, Bağlı delikler, Oynat izni; tahta “Yarım boy · 30 sütun”; #g= bağlantısı',
      boardRow && url.includes('#g='), url.slice(0, 60));
    // Öğrenci: bağlantıyı açar → doğrudan Tahtada kur; Çık ve Bağlı delikler anahtarı yok; Q1 hazır takılı.
    const sp = await ctx.newPage();
    sp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await sp.goto(url, { waitUntil: 'networkidle' }); await sp.waitForTimeout(2000);
    panel = sp.getByRole('region', { name: 'Tahtada kur paneli' });
    const text = (await panel.textContent()) ?? '';
    const locked = (await sp.getByRole('button', { name: /Tahtada kur’dan çık/ }).count()) === 0 && (await sp.getByRole('switch', { name: 'Bağlı delikleri göster' }).count()) === 0;
    const fromTask = await schematicControls(sp);
    // Görevde alt şerit: Denetle ve Teslim et tek satır, kırpılmıyor; şema tuvalinin görev çipi yok.
    const footer = await panel.evaluate((el) => [...el.querySelectorAll('button')].filter((b) => /^(Denetle|Teslim et)$/.test((b.textContent ?? '').trim())).map((b) => [b.scrollWidth <= b.clientWidth + 1, b.getBoundingClientRect().height <= 48])).catch(() => []);
    const chip = await sp.getByText(/^Görev kipi/).count();
    check('Tahtada kur (T6, öğrenci, masaüstü): alttaki Denetle ve Teslim et tek satırda, kırpılmadan; “Görev kipi” çipi Tahtada kur’un arkasında görünmüyor',
      footer.length === 2 && footer.flat().every(Boolean) && chip === 0, `${JSON.stringify(footer)} / çip ${chip}`);
    check('Tahtada kur: Örnekler’den ve görev bağlantısından girince şemanın yakınlaştırma grubu (Devreyi ekrana sığdır, ikinci Uzaklaştır) görünmüyor',
      fromExample.join(',') === '0,1' && fromTask.join(',') === '0,1', `${fromExample} / ${fromTask}`);
    await sp.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await sp.waitForTimeout(300);
    const noPlay = ((await sp.getByRole('alert').allTextContents()).join(' ')).includes('Bu görevde Oynat kapalı');
    check('Tahtada kur (T6, öğrenci): bağlantı doğrudan bu kipte açılıyor; Çık ve Bağlı delikler gizli; Q1 hazır takılı (1 / 4 takılı); Oynat kapalı; “Denetle hakkı: 3”',
      text.includes('1 / 4 takılı') && text.includes('Deney 9 · tahtada kur') && locked && noPlay && text.includes('Denetle hakkı: 3'), `${locked} ${noPlay} ${text.slice(0, 80)}`);
    // Kilitli (hazır gelen) Q1 seçiliyken araç çubuğundaki ve seçim çubuğundaki Döndür ve Sil pasif.
    const q1At = await sp.evaluate(() => {
      const t = window.__tezgah.topTransform(); const rect = document.querySelector('[role=region][aria-label^="Breadboard"]').getBoundingClientRect();
      return { x: rect.left + (3 - 15.5) * t.scale + t.ox, y: rect.top + (1.5 + 2) * t.scale + t.oy };
    });
    await sp.mouse.click(q1At.x, q1At.y); await sp.waitForTimeout(300);
    const toolbar = sp.getByRole('toolbar', { name: 'Tahta araçları' });
    const lockedTools = [await toolbar.getByRole('button', { name: /^Döndür/ }).isDisabled(), await toolbar.getByRole('button', { name: /^Sil/ }).isDisabled()];
    const board = sp.locator('[role=region][aria-label^="Breadboard"] > div.z-10');
    const lockedChip = [await board.getByRole('button', { name: 'Döndür', exact: true }).isDisabled(), await board.getByRole('button', { name: 'Sil', exact: true }).isDisabled()];
    check('Tahtada kur (T6, öğrenci): kilitli (hazır gelen) Q1 seçiliyken araç çubuğundaki ve seçim çubuğundaki Döndür ve Sil pasif',
      lockedTools.every(Boolean) && lockedChip.every(Boolean), `${lockedTools} / ${lockedChip}`);
    await sp.keyboard.press('Escape'); await sp.waitForTimeout(150);
    for (let i = 0; i < 3; i++) { await panel.getByRole('button', { name: /^(Denetle|Yeniden denetle)$/ }).click(); await sp.waitForTimeout(250); }
    const spent = await panel.getByRole('button', { name: 'Yeniden denetle' }).isDisabled();
    await panel.getByRole('button', { name: 'Yerini göster' }).first().click(); await sp.waitForTimeout(150);
    await panel.getByRole('button', { name: 'Açıklamayı göster' }).first().click(); await sp.waitForTimeout(150);
    const noExample = (await panel.getByRole('button', { name: 'Örnek yerleşim' }).count()) === 0;
    const [download] = await Promise.all([sp.waitForEvent('download'), panel.getByRole('button', { name: 'Teslim et' }).click()]);
    const body = JSON.parse(readFileSync(await download.path(), 'utf8'));
    check('Tahtada kur (T6, öğrenci): 3 Denetle’den sonra düğme kapalı (“Denetle hakkın bitti”); ipucu sınırı Açıklama (Örnek yerleşim yok); Teslim et dosyasında son kurulum, 3 deneme, ipuçları, süre',
      spent && ((await panel.textContent()) ?? '').includes('Denetle hakkın bitti') && noExample && body.teslim?.tahtada_kur?.denetle?.length === 3 && body.teslim.tahtada_kur.ipuclari.length === 2 && typeof body.teslim.tahtada_kur.sure_sn === 'number' && body.build?.parts !== undefined,
      `${spent} ${noExample} ${JSON.stringify(body.teslim?.tahtada_kur?.denetle?.map((c) => c.sorunlar.length))}`);
    await ctx.close();
  }

  // --- Tahtada kur (telefon, T5): 3B'den giriş, parça kutusu alttan, dokun-kaydır-bırak ve büyüteç, Denetle ---
  {
    const { page, cdp } = await phone();
    await openExample(page, 'Transistör anahtar: LED kollektörde');
    await page.getByRole('button', { name: '3B', exact: true }).first().tap();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Tahtada kur', exact: true }).tap(); await page.waitForTimeout(1500);
    const sheet = page.getByRole('region', { name: 'Tahtada kur', exact: true });
    const sheetText = (await sheet.textContent()) ?? '';
    const holeXY = (name) => page.evaluate((n) => {
      const t = window.__tezgah.topTransform(); const rect = document.querySelector('[role=region][aria-label^="Breadboard"]').getBoundingClientRect();
      const m = /^(\d+)([a-j])$/.exec(n); const col = +m[1]; const row = 'abcdefghij'.indexOf(m[2]);
      return { x: rect.left + (col - 15.5) * t.scale + t.ox, y: rect.top + (row < 5 ? -5.5 + row : 1.5 + (row - 5)) * t.scale + t.oy };
    }, name);
    const pitch = await page.evaluate(() => window.__tezgah.topTransform().scale);
    check('Tahtada kur (telefon): 3B’den açılıyor; tahta yüksekliğine sığıyor (delik aralığı ≥ 22 px, tahta yatay kayar); parça kutusu alttaki sayfada (0 / 4 takılı, Tak düğmeleri, 4 kablo çipi)',
      sheetText.includes('Parça kutusu') && sheetText.includes('0 / 4 takılı') && (await sheet.getByRole('button', { name: /: tahtaya tak$/ }).count()) === 4 && (await sheet.getByRole('button', { name: /kablosunu tak$/ }).count()) === 4 && pitch >= 22,
      `aralık ${pitch.toFixed(1)} px`);
    // Oynat tahtanın üstünde yüzmüyor: alttaki sayfanın içinde; takarken hiç yok.
    const playAtEntry = await page.getByRole('button', { name: 'Oynat', exact: true }).boundingBox();
    const sheetBox = await sheet.boundingBox();
    await sheet.getByRole('button', { name: 'R1: tahtaya tak' }).tap(); await page.waitForTimeout(300);
    const playWhilePlacing = await page.getByRole('button', { name: 'Oynat', exact: true }).count();
    check('Tahtada kur (telefon): Oynat düğmesi tahtanın üstünde değil, alttaki sayfanın şeridinde; takma sırasında görünmüyor',
      playAtEntry !== null && sheetBox !== null && playAtEntry.y >= sheetBox.y && playWhilePlacing === 0, `${Math.round(playAtEntry?.y ?? -1)} ≥ ${Math.round(sheetBox?.y ?? -1)} / takarken ${playWhilePlacing}`);
    const step1 = (await sheet.textContent()) ?? '';
    const t = touch(cdp);
    let a = await holeXY('3c'); const b = await holeXY('2c');
    await t.start(a.x, a.y); await page.waitForTimeout(60);
    for (let i = 1; i <= 6; i++) { await t.move(a.x + ((b.x - a.x) * i) / 6, a.y); await page.waitForTimeout(20); }
    await page.waitForTimeout(150);
    const loupe = (await page.getByText(/^2c · 2a–2e bağlı$/).count()) === 1;
    await t.end(); await page.waitForTimeout(250);
    const step2 = (await sheet.textContent()) ?? '';
    a = await holeXY('6c'); await tap(page, cdp, a); await page.waitForTimeout(300);
    const r1 = (await part(page, 'R1')).id;
    const holes = (await doc(page)).build?.parts?.[r1]?.holes?.join(' ');
    check('Tahtada kur (telefon): Tak → takma sayfası (R1 · 10 kΩ, 1. bacak); dokun-kaydır-bırak: büyüteç ve “2c · 2a–2e bağlı”, bırakınca 2. bacak; R1 2c–6c',
      step1.includes('R1 · 10 kΩ') && step1.includes('1. bacak') && loupe && step2.includes('2. bacak') && holes === '2c 6c', `${loupe} / ${holes}`);
    // Alet kablosu: çip → Delik adı yaz.
    await sheet.getByRole('button', { name: 'PS1 1+ kablosunu tak' }).tap(); await page.waitForTimeout(200);
    await sheet.getByRole('button', { name: 'Delik adı yaz' }).tap(); await page.waitForTimeout(200);
    const fontSize = await sheet.getByRole('textbox').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await sheet.getByRole('textbox').fill('20a'); await sheet.getByRole('button', { name: 'Tak', exact: true }).tap(); await page.waitForTimeout(400);
    const leads = ((await doc(page)).build?.leads ?? []).map((l) => l.hole).join(' ');
    // İki parmakla yakınlaştırma.
    const s0 = await page.evaluate(() => window.__tezgah.topTransform().scale);
    const c = await holeXY('8f');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x - 30, y: c.y, id: 1 }, { x: c.x + 30, y: c.y, id: 2 }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 30 - i * 10, y: c.y, id: 1 }, { x: c.x + 30 + i * 10, y: c.y, id: 2 }] }); await page.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(200);
    const s1 = await page.evaluate(() => window.__tezgah.topTransform().scale);
    check('Tahtada kur (telefon): alet kablosu çipten, “Delik adı yaz” ile (yazı 16 px); iki parmakla yakınlaşıyor',
      leads === '20a' && fontSize >= 16 && s1 > s0 * 1.3, `${leads} / ${fontSize} px / ${s0.toFixed(1)} → ${s1.toFixed(1)}`);
    // Denetle: ilk kademede yalnızca sayı ve "Nerede?"; sonra kartlar.
    await sheet.getByRole('button', { name: 'Denetle', exact: true }).tap(); await page.waitForTimeout(400);
    const checked = (await sheet.locator('h2').first().textContent()) ?? '';
    const cards0 = await sheet.locator('ol > li').count();
    await sheet.getByRole('button', { name: 'Nerede?' }).tap(); await page.waitForTimeout(400);
    const cards = (await sheet.locator('ol > li b').allTextContents()).slice(0, 2).join(' | ');
    const small = await page.evaluate(() => [...document.querySelectorAll('button, input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && (r.height < 44 || r.width < 44); }).map((e) => `${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
    const scrolled = await page.evaluate(() => window.scrollY + document.scrollingElement.scrollTop + document.querySelector('.app-root').scrollTop);
    check('Tahtada kur (telefon): Denetle alttaki sayfada (ilk kademede kart yok, “Nerede?” yerleri adlandırıyor); dokunma hedefleri ≥ 44 px, sayfa kaymıyor',
      /^\d+ sorun var$/.test(checked) && cards0 === 0 && /çevresinde/.test(cards) && small.length === 0 && scrolled === 0, `${checked} / ${cards} / ${small.join(', ')} / ${scrolled}`);
    await page.context().close();
  }

  // --- Tahtada kur (telefon, T6): örnek kartından giriş, Şema penceresi, Teslimde kipindeki görev ----------
  {
    // Görev bağlantısı masaüstünde: Teslimde, Bağlı delikler kapalı.
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await dctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const dp = await dctx.newPage();
    await dp.goto(URL0, { waitUntil: 'networkidle' });
    await dp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await dp.waitForTimeout(200);
    await (await pickExample(dp, (p) => p.getByRole('button', { name: 'Transistör anahtar: LED kollektörde', exact: true }))).click(); await dp.waitForTimeout(400);
    await circuitButton(dp).click(); await dp.waitForTimeout(150);
    await dp.getByRole('menuitem', { name: /^Görev oluştur/ }).click(); await dp.waitForTimeout(300);
    const dlg = dp.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('radio', { name: 'Tahtada kur' }).click();
    await dlg.getByRole('textbox', { name: 'Görev adı' }).fill('Deney 9 · sınav');
    await dlg.getByRole('radiogroup', { name: 'Denetle hakkı' }).getByRole('radio', { name: 'Teslimde' }).click();
    await dlg.getByRole('switch', { name: /^Bağlı delikleri göster/ }).click();
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    await dctx.close();

    const { page } = await phone();
    await phoneExamples(page);
    await page.getByRole('searchbox', { name: 'Örnek ara' }).fill('Transistör anahtar: LED kollektörde'); await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Transistör anahtar: LED kollektörde: tahtada kur' }).tap(); await page.waitForTimeout(1800);
    const sheet = page.getByRole('region', { name: 'Tahtada kur', exact: true });
    const entered = ((await sheet.textContent()) ?? '').includes('0 / 4 takılı');
    await page.getByRole('button', { name: 'Şema', exact: true }).tap(); await page.waitForTimeout(500);
    const small = async () => page.evaluate(() => [...document.querySelectorAll('button, input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && (r.height < 44 || r.width < 44); }).map((e) => `${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
    const dialogSmall = await small();
    const svgWidth = await page.getByRole('dialog').locator('svg[role=img]').evaluate((el) => el.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Büyük şemayı kapat' }).tap(); await page.waitForTimeout(300);
    check('Tahtada kur (telefon, T6): Örnekler’deki kartta “Tahtada kur” (tahta boş); Şema penceresi okunur boyda (≥ 700 px, kayar), dokunma hedefleri ≥ 44 px',
      entered && dialogSmall.length === 0 && svgWidth >= 700 && (await page.getByRole('dialog').count()) === 0, `${entered} / ${dialogSmall.join(', ')} / ${Math.round(svgWidth)} px`);
    // Görev (yeni sayfada; aynı sayfada yalnızca # değişir): Teslimde kipinde Denetle yok, Teslim et var; Çık ve
    // Bağlı delikler yok; büyüteç yalnızca deliğin adını söyler.
    const sp = await page.context().newPage();
    sp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const scdp = await page.context().newCDPSession(sp);
    await sp.goto(url, { waitUntil: 'networkidle' }); await sp.waitForTimeout(2000);
    const tsheet = sp.getByRole('region', { name: 'Tahtada kur', exact: true });
    const text = (await tsheet.textContent()) ?? '';
    const rules = (await tsheet.getByRole('button', { name: 'Denetle', exact: true }).count()) === 0 && (await tsheet.getByRole('button', { name: 'Teslim et' }).count()) === 1 && text.includes('Bu görevde Denetle yok')
      && (await sp.getByRole('button', { name: /Tahtada kur’dan çık/ }).count()) === 0 && (await tsheet.getByRole('button', { name: 'Bağlı delikler' }).count()) === 0;
    // Kilitli (hazır gelen) + ray köprüsüne dokununca seçim çubuğundaki Sil pasif. Dokunulan yer üst − rayı ile
    // a satırı arası (z = −6,5): tahtanın ortası alttaki sayfanın altında kalır.
    const bridge = await sp.evaluate(() => {
      const t = window.__tezgah.topTransform(); const rect = document.querySelector('[role=region][aria-label^="Breadboard"]').getBoundingClientRect();
      return { x: rect.left - 14 * t.scale + t.ox, y: rect.top - 6.5 * t.scale + t.oy };
    });
    await tap(sp, scdp, bridge); await sp.waitForTimeout(300);
    const lockedDelete = await sp.locator('[role=region][aria-label^="Breadboard"] > div.z-10').getByRole('button', { name: 'Sil', exact: true }).isDisabled({ timeout: 3000 }).catch(() => false);
    check('Tahtada kur (telefon, T6 öğrenci): kilitli (hazır gelen) ray köprüsü seçiliyken seçim çubuğundaki Sil pasif', lockedDelete);
    await tsheet.getByRole('button', { name: 'R1: tahtaya tak' }).tap(); await sp.waitForTimeout(300);
    const at = await sp.evaluate(() => {
      const t = window.__tezgah.topTransform(); const rect = document.querySelector('[role=region][aria-label^="Breadboard"]').getBoundingClientRect();
      return { x: rect.left + (2 - 15.5) * t.scale + t.ox, y: rect.top + (-5.5 + 2) * t.scale + t.oy };
    });
    const t = touch(scdp);
    await t.start(at.x, at.y); await sp.waitForTimeout(80); await t.move(at.x + 1, at.y); await sp.waitForTimeout(150);
    const plainLabel = (await sp.getByText(/^2c$/).count()) === 1 && (await sp.getByText(/bağlı$/).count()) === 0;
    await t.end(); await sp.waitForTimeout(200);
    check('Tahtada kur (telefon, T6 öğrenci): Teslimde kipinde Denetle yok, Teslim et var; Çık ve Bağlı delikler gizli; büyüteç etiketi bağlı delikleri söylemiyor (yalnızca “2c”)',
      rules && plainLabel, `${rules} ${plainLabel}`);
    await page.context().close();
  }

  // --- Sıkışık masaüstü (1100 px): defter 400 px, parça defterden eklenir (v3) ---------------
  const compact = await browser.newContext({ viewport: { width: 1100, height: 760 }, locale: 'tr-TR' });
  const cp = await compact.newPage();
  cp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await cp.goto(URL0, { waitUntil: 'networkidle' });
  const nbBox = await notebook(cp).boundingBox();
  const addRowCp = await deskAdd(cp);
  await addRowCp.fill('kondansatör'); await addRowCp.press('Enter');
  // Otomatik kayıt 0,4 s gecikmeli; uzun çalıştırmada yük altında daha geç düşebilir (3 s'ye kadar beklenir).
  const placed = await cp.waitForFunction(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre') ?? 'null')?.parts?.some((p) => p.type === 'capacitor'), null, { timeout: 3000 }).then(() => true, () => false);
  check('1100 px (v4): defter 400 px; Parça ekle düğmesiyle açılan kutudan eklenen parça şemaya geliyor', nbBox !== null && Math.round(nbBox.width) === 400 && placed, nbBox ? `${Math.round(nbBox.width)} px` : 'yok');
  await compact.close();

  // --- Cihaz kartları (masaüstü 1280, 1440, 1920 px): yazı taşması yok --------------------------
  // Defter her genişlikte 400 px. Kartta kendi genişliğinden (ya da sabit yüksekliğinden) büyük yazısı olan
  // öğe aranır: kesilen değer ("200 mV/b"), bitişen seçenek ("A ve B" ile "A + B"), "…" ile kısalan başlık
  // ("OSC1 · Osiloskop"). Şema görünümünde BF245A yükseltecinin osiloskobu (açılır bölümler açık; A ve B,
  // A + B, X-Y kipleri), fonksiyon üreteci ve güç kaynağı, baraj örneğinin su haznesi; 3B görünümünde aynı
  // üç cihaz ("3B’de yaklaş" masaüstünde kartın gövdesinde, başlıkta değil).
  {
    const overflowing = (root) => {
      const out = [];
      for (const el of root.querySelectorAll('*')) {
        if (el.closest('svg') || el.closest('.sr-only') || el.tagName === 'CANVAS') continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.display === 'inline' || cs.visibility === 'hidden') continue;
        const hasText = [...el.childNodes].some((n) => (n.nodeType === 3 || (n.nodeType === 1 && getComputedStyle(n).display === 'inline')) && n.textContent.trim());
        if (!hasText) continue;
        const name = `"${el.textContent.trim().slice(0, 32)}"`;
        if (el.scrollWidth > el.clientWidth + 1) out.push(`${name} ${el.scrollWidth}>${el.clientWidth}`);
        else if (el.scrollHeight > el.clientHeight + 1 && !['auto', 'scroll'].includes(cs.overflowY)) out.push(`${name} yükseklik ${el.scrollHeight}>${el.clientHeight}`);
      }
      return out;
    };
    for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, locale: 'tr-TR' });
      await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      await page.goto(URL0, { waitUntil: 'networkidle' });
      const nb = notebook(page);
      const card = (id) => nb.getByRole('region', { name: new RegExp(`^${id} ·`) });
      const openCard = async (id) => {
        if (!(await card(id).count())) await nb.getByRole('button', { name: new RegExp(`^${id} ·`) }).first().click();
        await page.waitForTimeout(400);
      };
      const found = [];
      const measure = async (label, region) => { for (const o of await region.evaluate(overflowing)) found.push(`${label}: ${o}`); };
      await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
      await (await pickExample(page, (p) => p.getByRole('button', { name: 'BF245A ile ortak kaynaklı yükselteç (kazanç 10)', exact: true }))).click(); await page.waitForTimeout(500);
      await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(1000);
      let scopeTitle = '';
      for (const id of ['OSC1', 'FG1', 'PS1']) {
        await openCard(id);
        await measure(id, card(id));
        if (id === 'OSC1') scopeTitle = ((await card(id).locator('h3').textContent()) ?? '').trim();
        const more = card(id).getByRole('button', { name: /^(Gelişmiş|Diğer ayarlar)/ });
        for (let i = 0; i < (await more.count()); i++) await more.nth(i).click();
        await page.waitForTimeout(200);
        await measure(`${id} açık`, card(id));
        if (id === 'OSC1') {
          for (const mode of ['A + B', 'X-Y', 'A ve B']) {
            await card(id).getByRole('radiogroup', { name: 'Kip' }).getByRole('radio', { name: mode, exact: true }).click(); await page.waitForTimeout(200);
            await measure(`OSC1 ${mode}`, card(id));
          }
        }
      }
      const sema = found.splice(0);
      await benchButton(page).click();
      await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
      let focusInHeader = 0;
      for (const id of ['OSC1', 'FG1', 'PS1']) {
        await openCard(id);
        await measure(`${id} 3B`, card(id));
        focusInHeader += await card(id).locator('h3').locator('xpath=../..').getByRole('button', { name: '3B’de yaklaş' }).count();
      }
      const bench = found.splice(0);
      await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
      await (await pickExample(page, (p) => p.getByRole('button', { name: 'Baraj uyarısı: tek ışık', exact: true }))).click(); await page.waitForTimeout(500);
      await nb.getByRole('button', { name: /^H1 · Su haznesi/ }).first().click(); await page.waitForTimeout(400);
      await measure('H1', nb.getByRole('region', { name: /^H1 · Su haznesi/ }));
      sema.push(...found.splice(0));
      check(`cihaz kartları (${width} px, şema): osiloskop, fonksiyon üreteci, güç kaynağı ve su haznesinde yazı taşmıyor ("${scopeTitle}" tam, "200 mV/b" kesilmiyor, "A ve B" ile "A + B" ayrı; açılır bölümler ve üç kip)`,
        sema.length === 0 && scopeTitle === 'OSC1 · Osiloskop', sema.slice(0, 4).join(' | ') || 'taşma yok');
      check(`cihaz kartları (${width} px, 3B): başlıklar tam ("3B’de yaklaş" gövdede), yazı taşmıyor`,
        bench.length === 0 && focusInHeader === 0, bench.slice(0, 4).join(' | ') || `taşma yok · başlıkta yaklaş düğmesi ${focusInHeader}`);
      await ctx.close();
    }
  }

  // --- Cihaz kartları: yazılarda tekrar yok ------------------------------------------------------
  // Fonksiyon üretecinin Genlik satırı "AMPL · tepe-tepe, açık devre" ("tepe-tepe" iki kez değil); uç
  // düğmelerinin adı "FG1 COM ucunu tuvalde göster" (görünen uç adı ada ikinci kez eklenmez).
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const nb = notebook(page);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'BF245A ile ortak kaynaklı yükselteç (kazanç 10)', exact: true }))).click(); await page.waitForTimeout(500);
    const jackNames = [];
    let amplitude = '';
    for (const id of ['FG1', 'OSC1', 'PS1']) {
      await nb.getByRole('button', { name: new RegExp(`^${id} ·`) }).first().click(); await page.waitForTimeout(300);
      const card = nb.getByRole('region', { name: new RegExp(`^${id} ·`) });
      if (id === 'OSC1') await card.getByRole('button', { name: /^Gelişmiş/ }).click();
      if (id === 'FG1') amplitude = await card.locator('span', { has: page.locator('small', { hasText: 'AMPL' }) }).last().evaluate((el) => [...el.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(' '));
      jackNames.push(...(await card.getByRole('button', { name: /ucunu tuvalde göster/ }).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? document.getElementById(e.getAttribute('aria-labelledby') ?? '')?.textContent ?? '').trim()))));
    }
    // Uç adı ("COM") adın sonunda ikinci kez: "FG1 COM ucunu tuvalde göster: COM ⏚".
    const repeated = jackNames.filter((n) => { const m = n.match(/^\S+ (.+?) ucunu tuvalde göster: (.+?)( ⏚)?$/); return m !== null && m[1] === m[2]; });
    check('cihaz kartları: Genlik satırı "Genlik AMPL · tepe-tepe, açık devre"; uç düğmelerinin adında uç adı bir kez (FG1, OSC1, PS1)',
      amplitude === 'Genlik AMPL · tepe-tepe, açık devre' && jackNames.length === 10 && repeated.length === 0, `"${amplitude}" · ${jackNames.length} uç · ${repeated.join(' | ') || 'tekrar yok'}`);
    await ctx.close();
  }

  // --- Tam ekran (masaüstü, tablet): tarayıcı tam ekranı, yalnızca devre şeması -------------
  {
    const fsCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const fp = await fsCtx.newPage();
    fp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await fp.goto(URL0, { waitUntil: 'networkidle' });
    const fsElement = () => fp.evaluate(() => document.fullscreenElement?.tagName ?? null);
    const inspectorShown = () => notebook(fp).count();
    const canvasWidth = async () => (await fp.locator('svg.schematic').boundingBox())?.width ?? 0;
    const w0 = await canvasWidth();
    // v4: üst çubukta tam ekran düğmesi yok; Daha fazla → "Tam ekran" (F11).
    const noBarButton = (await fp.getByRole('button', { name: 'Tam ekran', exact: true }).count()) === 0;
    await (await openMore(fp)).getByRole('menuitem', { name: 'Tam ekran F11', exact: true }).click(); await fp.waitForTimeout(500);
    const w1 = await canvasWidth();
    check('masaüstü: Daha fazla → Tam ekran tarayıcıyı tam ekrana alıyor; defter gizleniyor (üst çubukta ayrı tam ekran düğmesi yok)', noBarButton && (await fsElement()) === 'HTML' && (await inspectorShown()) === 0 && w1 > 1400, `tuval ${Math.round(w0)} → ${Math.round(w1)} px`);
    await fp.getByRole('button', { name: 'Defter', exact: true }).click(); await fp.waitForTimeout(300);
    const pressed = await fp.getByRole('button', { name: 'Defter', exact: true }).getAttribute('aria-pressed');
    const exitItem = await (await openMore(fp)).getByRole('menuitem', { name: 'Tam ekrandan çık F11', exact: true }).count();
    await fp.keyboard.press('Escape'); await fp.waitForTimeout(100);
    check('masaüstü: tam ekranda üst çubuğun sağındaki Defter düğmesi defteri açıyor; menüde "Tam ekrandan çık"', (await inspectorShown()) === 1 && pressed === 'true' && exitItem === 1 && (await fsElement()) === 'HTML');
    await fp.evaluate(() => document.exitFullscreen()); await fp.waitForTimeout(400);
    const enterItem = await (await openMore(fp)).getByRole('menuitem', { name: 'Tam ekran F11', exact: true }).count();
    await fp.keyboard.press('Escape'); await fp.waitForTimeout(100);
    check('masaüstü: tarayıcının tam ekranından çıkınca (Esc) kip kapanıyor, defter yerinde; menüde yine "Tam ekran"', enterItem === 1 && (await fp.getByRole('button', { name: 'Defter', exact: true }).count()) === 0 && (await inspectorShown()) === 1);
    await fsCtx.close();

    const tCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const tp = await tCtx.newPage();
    tp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await tp.goto(URL0, { waitUntil: 'networkidle' });
    // v4: Daha fazla menüsünden (dokunmatikte kısayol yazısı yok, öğeler 44 px).
    const tabletMore = async () => { await tp.locator('header').getByRole('button', { name: 'Daha fazla', exact: true }).tap(); await tp.waitForTimeout(200); return tp.getByRole('menu', { name: 'Daha fazla' }); };
    const fsItem = (await tabletMore()).getByRole('menuitem', { name: 'Tam ekran', exact: true });
    const itemBox = await fsItem.boundingBox();
    await fsItem.tap(); await tp.waitForTimeout(500);
    const hidden = (await notebook(tp).count()) === 0;
    const toggle = tp.getByRole('button', { name: 'Defter', exact: true });
    const toggleBox = await toggle.boundingBox();
    await toggle.tap(); await tp.waitForTimeout(300);
    const back = (await notebook(tp).count()) === 1;
    await (await tabletMore()).getByRole('menuitem', { name: 'Tam ekrandan çık', exact: true }).tap(); await tp.waitForTimeout(400);
    check('tablet: Daha fazla → Tam ekran (44 px öğe) defteri gizliyor, 44 px Defter düğmesiyle açılıyor; Tam ekrandan çık ile defter yerinde',
      hidden && back && Math.round(itemBox?.height ?? 0) === 44 && toggleBox !== null && Math.round(toggleBox.height) === 44 && (await notebook(tp).count()) === 1 && (await tp.evaluate(() => document.fullscreenElement)) === null,
      `öğe ${Math.round(itemBox?.height ?? 0)} px · Defter ${Math.round(toggleBox?.height ?? 0)} px`);
    await tCtx.close();
  }

  // --- 3B tezgâh (telefon): Şema | 3B düğmesi, tek parmakla döndürme, sayfa kaymıyor -------------
  {
    const { page, cdp } = await phone();
    await openExample(page, 'Arduino: yanıp sönen LED');
    const group = page.getByRole('group', { name: 'Görünüm' });
    const sizes = await group.getByRole('button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    const area = await page.locator('svg.schematic').boundingBox();
    const toggle = await group.boundingBox();
    check('3B: telefonda Şema | 3B düğmeleri en az 44 px ve şema kutusunun sol üstünde (E3)', sizes.every((s) => s >= 44) && toggle.y < area.y + 20 && toggle.x < area.x + 20, sizes.map((s) => Math.round(s)).join(', '));
    await group.getByRole('button', { name: '3B' }).tap();
    // 3B tembel yüklenir (canlıda ağdan): sahne hazır olana kadar bekle.
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.__tezgah?.camera.position.toArray().map((v) => v.toFixed(2)).join(','));
    const box = await page.locator('main canvas').boundingBox();
    await drag(page, cdp, { x: box.x + box.width * 0.5, y: box.y + box.height * 0.35 }, { x: box.x + box.width * 0.8, y: box.y + box.height * 0.45 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__tezgah?.camera.position.toArray().map((v) => v.toFixed(2)).join(','));
    const scrolled = await page.evaluate(() => window.scrollY + document.scrollingElement.scrollTop);
    check('3B: tek parmakla sürükleyince kamera dönüyor, sayfa kaymıyor', Boolean(before) && before !== after && scrolled === 0, `${before} → ${after}`);
    await shot(page, 'ios-3b.png');
    // Karta aktar (K4, L2): tam ekran sayfa; iki sekme, 3B kart, sabit alt düğmeler; hedefler 44 px.
    await page.getByRole('button', { name: 'Karta aktar' }).tap();
    const karta = page.getByRole('dialog', { name: 'Karta aktar' });
    await karta.waitFor(); // tembel yüklenir
    await page.waitForFunction(() => window.__kart !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500);
    const kartaSmall = async () => karta.evaluate((root) => [...root.querySelectorAll('button, a, [role=tab]')]
      .map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), w: r.width, h: r.height }; })
      .filter((r) => r.w > 0 && r.h > 0 && (r.h < 43.5 || r.w < 43.5)).map((r) => `${r.n} ${Math.round(r.w)}×${Math.round(r.h)}`));
    await karta.getByRole('tab', { name: 'Delikli plaket' }).tap(); await page.waitForTimeout(400);
    const phoneAll = (await karta.getByRole('img', { name: /^Delikli plaket 3B/ }).getAttribute('aria-label')) ?? '';
    const startBox = await karta.getByRole('button', { name: 'Adım adım başla' }).boundingBox();
    const allSmall = await kartaSmall();
    await karta.getByRole('button', { name: 'Adım adım başla' }).tap(); await page.waitForTimeout(400);
    const perfSmall = [...allSmall, ...(await kartaSmall())];
    const counter0 = (await karta.locator('[aria-label$=". adımı"]').getAttribute('aria-label')) ?? '';
    await karta.getByRole('button', { name: /^Sonraki/ }).tap(); await page.waitForTimeout(400);
    const counter1 = (await karta.locator('[aria-label$=". adımı"]').getAttribute('aria-label')) ?? '';
    const kartaBefore = await page.evaluate(() => window.__kart?.camera.position.toArray().map((v) => v.toFixed(2)).join(','));
    const kbox = await karta.locator('canvas').boundingBox();
    await drag(page, cdp, { x: kbox.x + kbox.width * 0.5, y: kbox.y + kbox.height * 0.3 }, { x: kbox.x + kbox.width * 0.8, y: kbox.y + kbox.height * 0.4 });
    await page.waitForTimeout(400);
    const kartaAfter = await page.evaluate(() => window.__kart?.camera.position.toArray().map((v) => v.toFixed(2)).join(','));
    const kartaScroll = await page.evaluate(() => window.scrollY + document.scrollingElement.scrollTop);
    const next = await karta.getByRole('button', { name: /^Sonraki/ }).boundingBox();
    await shot(page, 'ios-karta-plaket.png');
    check('Karta aktar (telefon, L2): Delikli plaket 3B "Tamamı" ile açılıyor, altta "Adım adım başla"; Sonraki adımı ilerletiyor; parmakla kart dönüyor, sayfa kaymıyor; Sonraki altta sabit; hedefler ≥ 44 px',
      perfSmall.length === 0 && phoneAll.includes('bütün parçalar takılı') && startBox !== null && startBox.y + startBox.height > 780 && /adımın 1\. adımı$/.test(counter0) && /adımın 2\. adımı$/.test(counter1) && Boolean(kartaBefore) && kartaBefore !== kartaAfter && kartaScroll === 0 && next !== null && next.y + next.height > 780,
      perfSmall.join(', ') || `${counter0} → ${counter1}`);
    await karta.getByRole('tab', { name: 'Baskı devre (PCB)' }).tap();
    await karta.getByText('Üretime hazır').waitFor({ timeout: 10000 }).catch(() => {});
    const pcbSmall = await kartaSmall();
    await karta.getByRole('button', { name: /^Siparişte seç/ }).tap(); await page.waitForTimeout(200);
    const specs = (await karta.textContent()) ?? '';
    await shot(page, 'ios-karta-pcb.png');
    const [kicad] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), karta.getByRole('button', { name: 'KiCad projesi', exact: true }).tap()]);
    const [fab] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), karta.getByRole('button', { name: /^Üretim dosyalarını indir/ }).tap()]);
    check('Karta aktar (telefon, K4): PCB "Üretime hazır"; Siparişte seç açılıyor; KiCad ve Üretim (Gerber) zip indiriyor; hedefler ≥ 44 px',
      pcbSmall.length === 0 && specs.includes('Kurşunsuz HASL') && kicad !== null && kicad.suggestedFilename().endsWith('-kicad.zip') && fab !== null && fab.suggestedFilename().endsWith('-uretim.zip'),
      pcbSmall.join(', ') || `${kicad?.suggestedFilename() ?? 'KiCad yok'}, ${fab?.suggestedFilename() ?? 'üretim yok'}`);
    await karta.getByRole('button', { name: 'Kapat', exact: true }).tap(); await page.waitForTimeout(300);
    const closed = (await page.getByRole('dialog', { name: 'Karta aktar' }).count()) === 0;
    await page.getByRole('button', { name: 'Karta aktar' }).tap();
    await karta.waitFor(); await page.waitForTimeout(300);
    const remembered = await karta.getByRole('tab', { name: 'Baskı devre (PCB)' }).getAttribute('aria-selected');
    await karta.getByRole('button', { name: 'Kapat', exact: true }).tap(); await page.waitForTimeout(300);
    check('Karta aktar (telefon): Kapat kapatıyor, yeniden açınca son seçilen sekme (PCB) açılıyor', closed && remembered === 'true' && (await page.getByRole('dialog', { name: 'Karta aktar' }).count()) === 0);
    await group.getByRole('button', { name: 'Şema' }).tap(); await page.waitForTimeout(500);
    check('3B: Şema’ya dönünce tuval geri geliyor, 3B sahnesi kapanıyor', (await page.locator('svg.schematic').count()) === 1 && (await page.evaluate(() => window.__tezgah === undefined)));
    await page.context().close();
  }

  // --- Baraj sayfası (/baraj/): v3 düzeni (docs/tasarim-v3 → B1–B5) ---------------------------
  const BARAJ = `${URL0.replace(/\/?$/, '/')}baraj/`;
  /** Su seviyesi (%): üst çubuktaki seviye çubuğunun değeri. */
  const barajLevel = async (pg) => Number(await pg.getByRole('slider', { name: 'Su seviyesi' }).first().getAttribute('aria-valuenow'));
  /** Seçili su akışı (düğmeler yalnızca simge: adı aria-label'da). */
  const flowChecked = async (pg) => (await pg.getByRole('radiogroup', { name: 'Su akışı' }).getByRole('radio', { checked: true }).getAttribute('aria-label')) ?? '';
  const sceneLabel = async (pg) => (await pg.getByRole('img', { name: /Baraj kesiti/ }).getAttribute('aria-label')) ?? '';
  const levelCard = async (pg) => (await pg.getByRole('status', { name: /^Su seviyesi yüzde/ }).getAttribute('aria-label')) ?? '';
  /** Seviye `n` olana kadar bekler (en çok `ms`). */
  const waitLevel = async (pg, n, ms) => { const end = Date.now() + ms; while (Date.now() < end && (await barajLevel(pg)) !== n) await pg.waitForTimeout(150); return barajLevel(pg); };
  {
    const { page, cdp } = await phone();
    await page.goto(BARAJ, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    const sceneBox = await page.getByRole('region', { name: 'Baraj ve ışık kulesi' }).boundingBox();
    check('baraj (telefon, B3): sayfa kaymıyor; açılışta su %20, akış Durdur; kumanda üstte, sahne ekranın altına kadar, sol üstte yüzde',
      !(await pageScrolls(page)) && (await barajLevel(page)) === 20 && (await flowChecked(page)) === 'Durdur' && sceneBox !== null && sceneBox.y + sceneBox.height >= 843 && (await levelCard(page)).startsWith('Su seviyesi yüzde 20'),
      `%${await barajLevel(page)} · ${await flowChecked(page)} · ${await levelCard(page)}`);
    await page.getByRole('button', { name: 'Seviye 1: %37,5' }).tap();
    const reached = await waitLevel(page, 50, 9000); await page.waitForTimeout(900);
    check('baraj (telefon): seviye çubuğundaki 1 noktası suyu %50’ye doldurup durduruyor; yeşil yanıyor, kartta "Normal"',
      reached === 50 && (await flowChecked(page)) === 'Durdur' && (await sceneLabel(page)).includes('yeşil yanıyor') && (await levelCard(page)).endsWith('Normal'), `%${reached} · ${await levelCard(page)}`);
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a:not([href="#kumanda"]), [role=tab], [role=radio], [role=slider], input')]
      .map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20), w: r.width, h: r.height }; })
      .filter((r) => r.w > 0 && r.h > 0 && (r.h < 43.5 || r.w < 43.5)).map((r) => `${r.n} ${Math.round(r.w)}×${Math.round(r.h)}`));
    check('baraj (telefon): bütün dokunma hedefleri en az 44 px', small.length === 0, small.join(', '));
    const phoneView = await page.evaluate(() => window.__baraj3b?.view ?? null);
    check('baraj (telefon, 3B): sahne three.js ile (WebGL), dar alanda telefon kamerası; yeşil lamba yanıyor', phoneView === 'phone' && (await page.evaluate(() => (window.__baraj3b?.lamps[2]?.lens.emissiveIntensity ?? 0) > 0.3)), String(phoneView));
    await page.getByRole('button', { name: 'İçini göster' }).tap(); await page.waitForTimeout(1100);
    const phoneInset = await page.getByRole('img', { name: /^Kumanda evinin içi/ }).boundingBox();
    const phoneIciButton = await page.getByRole('button', { name: 'İçini göster' }).boundingBox();
    const phoneIciScroll = await pageScrolls(page);
    await page.getByRole('button', { name: 'İçini göster' }).tap(); await page.waitForTimeout(900);
    check('baraj (telefon, B6): sağ altta "İçini göster" (44 px); basınca evin yakın planı sahnenin üstünde tam genişlik, sayfa kaymıyor',
      phoneInset !== null && phoneInset.width > 340 && phoneIciButton !== null && phoneIciButton.height >= 43.5 && phoneIciButton.x > 200 && !phoneIciScroll && (await page.getByRole('img', { name: /^Kumanda evinin içi/ }).count()) === 0,
      phoneInset ? `${Math.round(phoneInset.width)}×${Math.round(phoneInset.height)}` : 'yok');
    await page.getByRole('radio', { name: 'Tek ışık' }).tap(); await page.waitForTimeout(1200);
    check('baraj (telefon): Tek ışık’a geçince su aynı yerde kalıyor, devre çalışmaya devam ediyor', (await barajLevel(page)) === 50 && (await sceneLabel(page)).includes('yeşil yanıyor'), `%${await barajLevel(page)}`);
    await page.getByRole('button', { name: 'Soru', exact: true }).tap(); await page.waitForTimeout(300);
    const sheet = page.getByRole('dialog', { name: 'Soru' });
    const hiddenAnswer = (await sheet.getByRole('status').count()) === 0;
    await sheet.getByRole('button', { name: 'Cevabı göster' }).tap(); await page.waitForTimeout(200);
    const answer = (await sheet.getByRole('status').textContent()) ?? '';
    check('baraj (telefon): Soru alt sayfada; cevap yalnızca "Cevabı göster" ile açılıyor; kumanda açık kalıyor',
      hiddenAnswer && answer.includes('Q4') && (await page.getByRole('button', { name: 'Seviye 2: %62,5' }).isVisible()), answer.slice(0, 40));
    await sheet.getByRole('button', { name: 'Soruyu kapat' }).tap(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: /^Diğer/ }).tap(); await page.waitForTimeout(200);
    await page.getByRole('menuitem', { name: 'Ayarlar' }).tap(); await page.waitForTimeout(300);
    const settings = page.getByRole('dialog', { name: 'Ayarlar' });
    await settings.getByRole('radio', { name: /Saf su/ }).tap(); await page.waitForTimeout(200);
    const pure = await settings.getByRole('radio', { name: /Saf su/ }).getAttribute('aria-checked');
    const resistance = (await settings.getByText('1 MΩ', { exact: true }).count()) > 0;
    await settings.getByRole('button', { name: 'Varsayılanlara dön' }).tap(); await page.waitForTimeout(200);
    const tapWater = await settings.getByRole('radio', { name: /Musluk suyu/ }).getAttribute('aria-checked');
    await settings.getByRole('button', { name: 'Ayarları kapat' }).tap(); await page.waitForTimeout(200);
    check('baraj (telefon): ⋯ menüsünden Ayarlar; Saf su 1 MΩ seçiliyor, Varsayılanlara dön musluk suyuna döndürüyor',
      pure === 'true' && resistance && tapWater === 'true' && (await page.getByRole('dialog', { name: 'Ayarlar' }).count()) === 0);
    check('baraj (telefon): sahnede su yüzeyi tutamağı yok (seviye çubuktan)', (await page.getByRole('slider', { name: 'Su seviyesi' }).count()) === 1);
    const handle = await page.getByRole('slider', { name: 'Su seviyesi' }).boundingBox();
    await drag(page, cdp, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + handle.width / 2 + 60, y: handle.y + handle.height / 2 }, 40);
    await page.waitForTimeout(600);
    const dragged = await barajLevel(page);
    check('baraj (telefon): seviye çubuğu sürüklenince su bırakılan yerde kalıyor, akış Durdur', dragged > 60 && dragged <= 100 && (await flowChecked(page)) === 'Durdur', `%50 → %${dragged}`);
    await page.getByRole('button', { name: 'Devreyi gör ›' }).tap(); await page.waitForTimeout(300);
    const circuitDialog = page.getByRole('dialog', { name: 'Devre' });
    const full = await circuitDialog.boundingBox();
    const drawingOf = async (root) => (await root.getByRole('tabpanel').locator('svg[role=img]').getAttribute('aria-label')) ?? '';
    const phoneKat = await drawingOf(circuitDialog);
    /** Çizim ve yazıları ekranın içinde mi (yatay kaydırma gerekmeden). */
    const fitsScreen = (root) => root.evaluate((d) => {
      const svg = d.querySelector('[role=tabpanel] svg[role=img]');
      const r = svg.getBoundingClientRect();
      const right = Math.max(r.right, ...[...svg.querySelectorAll('text')].map((t) => t.getBoundingClientRect().right));
      const panel = d.querySelector('[role=tabpanel]');
      return { ok: r.left >= 0 && right <= window.innerWidth - 4 && panel.scrollWidth <= panel.clientWidth + 1, right: Math.round(right) };
    });
    const fitKat = await fitsScreen(circuitDialog);
    const phoneTabs = await circuitDialog.getByRole('tab').count();
    const dialogSmall = await circuitDialog.evaluate((root) => [...root.querySelectorAll('button, a, [role=tab]')]
      .map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20), w: r.width, h: r.height }; })
      .filter((r) => r.w > 0 && r.h > 0 && (r.h < 43.5 || r.w < 43.5)).map((r) => `${r.n} ${Math.round(r.w)}×${Math.round(r.h)}`));
    await circuitDialog.getByRole('tab', { name: 'Tüm devre' }).tap(); await page.waitForTimeout(250);
    const phoneAll = await drawingOf(circuitDialog);
    const fitAll = await fitsScreen(circuitDialog);
    const dialogScrolls = await pageScrolls(page);
    await circuitDialog.getByRole('button', { name: 'Devreyi kapat' }).tap(); await page.waitForTimeout(200);
    check('baraj (telefon): "Devreyi gör ›" devreyi tam ekran açıyor (Kat 1, 2, 3, Tüm devre sekmeleri; sayfa kaymaz; hedefler ≥ 44 px); Kapat kapatıyor',
      full !== null && full.height >= 840 && phoneTabs === 4 && phoneKat.startsWith('Kat 1 devresi:') && phoneAll.startsWith('Tüm devre:') && !dialogScrolls && dialogSmall.length === 0 && (await circuitDialog.count()) === 0,
      dialogSmall.join(', ') || phoneKat.slice(0, 40));
    check('baraj (telefon): Kat 1 (LED, RC1 dahil) ve Tüm devre çizimi açılışta ekran genişliğine sığıyor (yana kaydırma yok)', fitKat.ok && fitAll.ok, `sağ kenar ${fitKat.right} / ${fitAll.right} px`);
    await page.context().close();
  }
  {
    const lCtx = await browser.newContext({
      viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });
    const lp = await lCtx.newPage();
    lp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await lp.goto(BARAJ, { waitUntil: 'networkidle' }); await lp.waitForTimeout(400);
    const header = await lp.locator('header').boundingBox();
    const flowBox = await lp.getByRole('radiogroup', { name: 'Su akışı' }).boundingBox();
    const sceneBox = await lp.getByRole('region', { name: 'Baraj ve ışık kulesi' }).boundingBox();
    check('baraj (yatay telefon): sayfa kaymıyor; devre seçimi ve kumanda üst çubukta tek satır, sahne altta', !(await pageScrolls(lp)) && header !== null && flowBox !== null && flowBox.y < header.y + header.height && sceneBox !== null && sceneBox.y >= header.y + header.height - 1,
      `çubuk ${Math.round(header?.height ?? 0)} px`);
    await lCtx.close();
  }
  // Devre paneli (B2, B4): kat çizimleri panele sığıyor, dikeyde geniş, değerler hemen altında; Tüm devre
  // (B5): sahne 600 px, kamera dar sahne ayarında ("all"), tutamak, problar ve ışık kulesi kadrajda.
  for (const width of [1440, 1180]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'tr-TR' });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await pg.goto(BARAJ, { waitUntil: 'networkidle' }); await pg.waitForTimeout(500);
    await pg.getByRole('button', { name: 'Devre', exact: true }).click(); await pg.waitForTimeout(300);
    const aside = pg.getByRole('complementary', { name: 'Devre' });
    const layoutOf = () => aside.evaluate((a) => {
      const box = a.getBoundingClientRect();
      const out = [...a.querySelectorAll('text, a, p, [role=tabpanel] span')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > box.right - 1 || b.left < box.left);
      }).map((e) => e.textContent.trim().slice(0, 24));
      const svg = a.querySelector('[role=tabpanel] svg[role=img]').getBoundingClientRect();
      const link = [...a.querySelectorAll('a')].find((e) => e.textContent.includes('simülatörde aç'))?.getBoundingClientRect();
      const foot = [...a.querySelectorAll('[role=tabpanel] span, [role=tabpanel] p')].map((e) => e.getBoundingClientRect().top).filter((t) => t > svg.bottom - 2);
      return { out, h: svg.height, gap: foot.length ? Math.min(...foot) - svg.bottom : 999, link: link ? link.right <= box.right - 8 : false };
    });
    const rows = [];
    for (const variant of ['Çubuk gösterge', 'Tek ışık']) {
      await pg.getByRole('radio', { name: variant }).click(); await pg.waitForTimeout(400);
      for (const k of ['Kat 1', 'Kat 2', 'Kat 3']) {
        await aside.getByRole('tab', { name: k, exact: true }).click(); await pg.waitForTimeout(250);
        rows.push({ name: `${variant} ${k}`, ...(await layoutOf()) });
      }
    }
    const bad = rows.filter((r) => r.out.length > 0 || !r.link || r.gap > 24 || r.h < (width >= 1280 ? 480 : 400));
    check(`baraj (masaüstü ${width}): Kat 1, 2, 3 ve Tek ışık çizimleri panele sığıyor ("LED … · sönük" ve "Tüm devreyi simülatörde aç" kesilmiyor), dikeyde büyük, değerler hemen altında`,
      bad.length === 0, bad.map((r) => `${r.name}: ${r.out.join('/') || ''} h ${Math.round(r.h)} ara ${Math.round(r.gap)} bağlantı ${r.link}`).join(' | ') || `çizim ${Math.round(rows[0].h)} px`);
    await pg.getByRole('radio', { name: 'Çubuk gösterge' }).click(); await pg.waitForTimeout(300);
    await aside.getByRole('tab', { name: 'Tüm devre', exact: true }).click(); await pg.waitForTimeout(900);
    const scene = await pg.getByRole('region', { name: 'Baraj ve ışık kulesi' }).boundingBox();
    const handle = await pg.getByRole('region', { name: 'Baraj ve ışık kulesi' }).getByRole('slider', { name: 'Su seviyesi' }).boundingBox();
    const framing = await pg.evaluate(() => {
      const s = window.__baraj3b;
      const pts = [0, 1, 2, 3].map((k) => s.screen(s.points.tip(k))).concat([1, 2, 3].map((n) => s.screen(s.points.lamp(n))));
      return { view: s.view, xs: pts.map((p) => p.x), ys: pts.map((p) => p.y) };
    });
    const margin = Math.min(handle ? handle.x - scene.x : -1, ...framing.xs, ...framing.xs.map((x) => scene.width - x));
    check(`baraj (masaüstü ${width}, B5): Tüm devrede sahne 600 px, kamera dar sahne ayarında (all); tutamak, problar ve ışık kulesi kadrajda`,
      Math.abs(scene.width - 600) < 1.5 && framing.view === 'all' && handle !== null && handle.x >= scene.x + 8 && handle.x + handle.width <= scene.x + scene.width - 8 && margin >= 8 && framing.ys.every((y) => y > 8 && y < scene.height - 8),
      `sahne ${Math.round(scene.width)} px, ${framing.view}, en dar pay ${Math.round(margin)} px`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', colorScheme: 'dark' });
    const pg = await ctx.newPage();
    await pg.goto(BARAJ, { waitUntil: 'networkidle' }); await pg.waitForTimeout(800);
    const label = pg.getByRole('group', { name: 'Göster' }).getByText('Göster:');
    const ratio = await contrastOf(pg, label);
    check('baraj (koyu tema): sol alttaki "Göster:" yazısı okunuyor (zeminle kontrastı WCAG AA, ≥ 4,5)', ratio >= 4.5, `${ratio.toFixed(2)} : 1`);
    await ctx.close();
  }
  {
    const bCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const bp = await bCtx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    bp.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await bp.goto(BARAJ, { waitUntil: 'networkidle' }); await bp.waitForTimeout(400);
    const flowNames = await bp.getByRole('radiogroup', { name: 'Su akışı' }).getByRole('radio').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-label')}|${e.textContent.trim()}`));
    const sceneBox = await bp.getByRole('region', { name: 'Baraj ve ışık kulesi' }).boundingBox();
    check('baraj (masaüstü, B1): sayfa kaymıyor; yalnızca sahne (devre kapalı, tablo yok, alt kumanda yok); akış yalnızca simge',
      !(await pageScrolls(bp)) && (await bp.getByRole('table').count()) === 0 && (await bp.locator('svg.schematic').count()) === 0 && sceneBox !== null && sceneBox.width > 1400 && sceneBox.y + sceneBox.height >= 899 &&
      flowNames.join(',') === 'Boşalt|,Durdur|,Doldur|', flowNames.join(','));
    const sceneRegion = bp.getByRole('region', { name: 'Baraj ve ışık kulesi' });
    const scaleBefore = await sceneRegion.locator('svg text', { hasText: '%100' }).count();
    await bp.getByRole('button', { name: 'Yüzde ölçeği' }).click(); await bp.waitForTimeout(150);
    const scaleAfter = await sceneRegion.locator('svg text', { hasText: '%100' }).count();
    await bp.getByRole('button', { name: 'Yüzde ölçeği' }).click();
    check('baraj (masaüstü): yüzde ölçeği varsayılan gizli, "Göster: Yüzde ölçeği" ile açılıyor', scaleBefore === 0 && scaleAfter === 1);
    // Ayarlar: ⋯ menüsünde; dolma süresini kısalt (klavye denemesi hızlı bitsin).
    await bp.getByRole('button', { name: /^Diğer/ }).click(); await bp.waitForTimeout(150);
    await bp.getByRole('menuitem', { name: 'Ayarlar' }).click(); await bp.waitForTimeout(200);
    const card = bp.getByRole('dialog', { name: 'Ayarlar' });
    for (let i = 0; i < 3; i++) await card.getByRole('button', { name: /Dolma süresi.*azalt|azalt.*Dolma süresi/ }).click().catch(() => {});
    const fillText = (await card.textContent()) ?? '';
    const switchOn = await card.getByRole('switch', { name: /Tek tuş kısayolları/ }).getAttribute('aria-checked');
    await bp.keyboard.press('Escape'); await bp.waitForTimeout(200);
    check('baraj (masaüstü): ⋯ → Ayarlar kartı açılıyor (dolma süresi, tek tuş kısayolları), Esc ile kapanıyor', fillText.includes('2 s') && switchOn === 'true' && (await bp.getByRole('dialog', { name: 'Ayarlar' }).count()) === 0, fillText.match(/\d+ s/)?.[0] ?? '');
    await bp.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await bp.keyboard.press('ArrowUp'); await bp.waitForTimeout(200);
    const upFlow = await flowChecked(bp);
    await bp.keyboard.press(' '); await bp.waitForTimeout(200);
    const spaceFlow = await flowChecked(bp);
    await bp.keyboard.press('2');
    const at2 = await waitLevel(bp, 75, 4000);
    await bp.keyboard.press('PageDown');
    const at3 = await waitLevel(bp, 95, 4000);
    await bp.keyboard.press('r'); await bp.waitForTimeout(400);
    check('baraj (masaüstü): klavye: ↑ Doldur, Boşluk Durdur, 2 → %75, Sayfa Aşağı → %95, R başa alır (%20)',
      upFlow === 'Doldur' && spaceFlow === 'Durdur' && at2 === 75 && at3 === 95 && (await barajLevel(bp)) === 20 && (await flowChecked(bp)) === 'Durdur', `${upFlow}, ${spaceFlow}, %${at2}, %${at3}, %${await barajLevel(bp)}`);
    // Devre paneli (B2, B4, B5): kat sekmeleri, akım yolu ve akımlar, lambaya tıklama, tüm devre, tek ışıkta susturma.
    await bp.keyboard.press('1'); await waitLevel(bp, 50, 4000); await bp.waitForTimeout(700);
    await bp.getByRole('button', { name: 'Devre', exact: true }).click(); await bp.waitForTimeout(300);
    const aside = bp.getByRole('complementary', { name: 'Devre' });
    const view3d = async () => bp.evaluate(() => window.__baraj3b?.view ?? null);
    const openView = await view3d();
    const tabSelected = async (name) => (await aside.getByRole('tab', { name, exact: true }).getAttribute('aria-selected')) === 'true';
    const drawing = async () => (await aside.getByRole('tabpanel').locator('svg[role=img]').getAttribute('aria-label')) ?? '';
    const panelBox = await aside.boundingBox();
    const kat1 = await drawing();
    const readings = (await aside.getByRole('tabpanel').textContent()) ?? '';
    check('baraj (masaüstü, B2): Devre paneli sağda (600 px), Kat 1 seçili: prob ıslak, Q1 doyumda, baz ve LED akımı yazıyor; "Tüm devreyi simülatörde aç"',
      panelBox !== null && panelBox.x > 800 && Math.abs(panelBox.width - 600) < 2 && (await aside.getByRole('tab').count()) === 4 && (await tabSelected('Kat 1')) &&
      kat1.includes('Prob 1 ıslak') && kat1.includes('Q1 doyumda') && /Baz akımı≈ 0,[2-6]\d mA/.test(readings) && /LED akımı≈ 1[3-5],\d mA/.test(readings) &&
      (await aside.getByRole('link', { name: 'Tüm devreyi simülatörde aç' }).count()) === 1, `${kat1.slice(0, 50)} · ${readings.match(/Baz akımı[^A-Z]*/)?.[0] ?? ''}`);
    await bp.getByRole('button', { name: /^Kat 2 devresini göster/ }).click(); await bp.waitForTimeout(200);
    const kat2Selected = await tabSelected('Kat 2');
    const kat2 = await drawing();
    await aside.getByRole('tab', { name: 'Kat 2', exact: true }).focus(); await bp.keyboard.press('ArrowRight'); await bp.waitForTimeout(150);
    check('baraj (masaüstü): sahnede sarı lambaya tıklamak Kat 2’yi gösteriyor (prob kuru, açık); sekmede → Kat 3’e geçiyor, su seviyesi değişmiyor',
      kat2Selected && kat2.includes('Prob 2 kuru, açık') && (await tabSelected('Kat 3')) && (await barajLevel(bp)) === 50, kat2.slice(0, 60));
    await aside.getByRole('tab', { name: 'Tüm devre', exact: true }).click(); await bp.waitForTimeout(300);
    const allBox = await aside.boundingBox();
    const sceneAll = await bp.getByRole('region', { name: 'Baraj ve ışık kulesi' }).boundingBox();
    const allText = (await aside.textContent()) ?? '';
    const openMarks = await aside.locator('svg[role=img] text', { hasText: /^açık$/ }).count();
    check('baraj (masaüstü, B5): Tüm devre: panel 840 px, sahne 600 px; "Kat 1 devresi tamamlandı: B1 + → … → B1 −"; kuru iki probda "açık"',
      allBox !== null && Math.abs(allBox.width - 840) < 2 && sceneAll !== null && Math.abs(sceneAll.width - 600) < 2 &&
      allText.includes('Kat 1 devresi tamamlandı: B1 + → ortak prob → su → Prob 1 → RB1 → Q1 → toprak → B1 −') && allText.includes('Prob 2, 3 kuru: devre açık') && openMarks === 2,
      `${Math.round(allBox?.width ?? 0)}/${Math.round(sceneAll?.width ?? 0)} px · açık ×${openMarks}`);
    // Su seviyesi değişince Tüm devrenin durum satırları (tamamlanan katlar, kuru prob notu) çizimi
    // aşağı yukarı oynatmıyor: alanın yüksekliği sabit (kullanıcı isteği, 31 Ekim).
    const drawingTop = async () => Math.round((await aside.locator('svg[role=img]').first().boundingBox())?.y ?? -1);
    const top50 = await drawingTop();
    await bp.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await bp.keyboard.press('3'); const at95 = await waitLevel(bp, 95, 15000); await bp.waitForTimeout(1200);
    const top95 = await drawingTop();
    const rows95 = await aside.locator('svg[role=img]').count() > 0 ? ((await aside.textContent()) ?? '').match(/devresi tamamlandı/g)?.length ?? 0 : 0;
    await bp.keyboard.press('r'); await waitLevel(bp, 20, 15000); await bp.waitForTimeout(800);
    const top20 = await drawingTop();
    await bp.keyboard.press('1'); await waitLevel(bp, 50, 15000); await bp.waitForTimeout(800);
    check('baraj (masaüstü): Tüm devrede su doldukça ve alçaldıkça durum satırları değişse de çizim yerinde kalıyor (%20, %50, %95’te üst kenarı aynı)',
      top50 > 0 && top50 === top95 && top50 === top20 && at95 === 95 && rows95 === 3, `üst ${top20} / ${top50} / ${top95} px · %${at95}’te ${rows95} satır`);
    const allView = await view3d();
    await aside.getByRole('button', { name: 'Devreyi tam ekran aç' }).click(); await bp.waitForTimeout(200);
    const wideBox = await aside.boundingBox();
    const sceneHidden = !(await bp.getByRole('region', { name: 'Baraj ve ışık kulesi' }).isVisible());
    await aside.getByRole('button', { name: 'Devreyi küçült' }).click(); await bp.waitForTimeout(200);
    const backBox = await aside.boundingBox();
    check('baraj (masaüstü): Tüm devrede "Devreyi tam ekran aç" sayfa genişliğine açıyor, "Devreyi küçült" geri alıyor',
      wideBox !== null && wideBox.width > 1400 && sceneHidden && backBox !== null && Math.abs(backBox.width - 840) < 2, `${Math.round(wideBox?.width ?? 0)} px`);
    await bp.getByRole('radio', { name: 'Tek ışık' }).click(); await bp.waitForTimeout(300);
    await bp.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await bp.keyboard.press('2'); await waitLevel(bp, 75, 4000); await bp.waitForTimeout(800);
    await aside.getByRole('tab', { name: 'Kat 1', exact: true }).click(); await bp.waitForTimeout(300);
    const tekText = (await aside.textContent()) ?? '';
    const tekKat1 = await drawing();
    check('baraj (masaüstü, B4): Tek ışık %75: öncelik kuralı satırı; Kat 1’de Q4 susturucu doyumda, baz düğümü ≈ 0,0x V, Q1 kesimde, açıklama cümlesi',
      tekText.includes('Öncelik:') && tekText.includes('Yeşil = 1 VE 2 değil') && tekText.includes('susturucu · doyumda') && /≈ 0,0\d V/.test(tekText) &&
      tekText.includes('Prob 2 ıslanınca Q4 doyuma girer ve Q1’in bazını toprağa çeker; yeşil söner, sarı yanar.') && tekKat1.includes('Q1 kesimde'), tekKat1.slice(0, 70));
    await bp.getByRole('radio', { name: 'Çubuk gösterge' }).click(); await bp.waitForTimeout(200);
    await aside.getByRole('button', { name: 'Devreyi kapat' }).click(); await bp.waitForTimeout(200);
    await bp.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await bp.keyboard.press('r'); await waitLevel(bp, 20, 2000);
    await bp.waitForTimeout(300);
    const deskView = await view3d();
    check('baraj (masaüstü, 3B): kamera sahnenin en-boy oranına göre: tam genişlik "desk", devre açık "open", tüm devre "all"',
      deskView === 'desk' && openView === 'open' && allView === 'all', `${deskView} / ${openView} / ${allView}`);
    // Su yüzeyindeki tutamak: yukarı sürükleyince su yükseliyor, akış Durdur.
    const handle3d = await sceneRegion.getByRole('slider', { name: 'Su seviyesi' }).boundingBox();
    await bp.mouse.move(handle3d.x + handle3d.width / 2, handle3d.y + handle3d.height / 2);
    await bp.mouse.down(); await bp.mouse.move(handle3d.x + handle3d.width / 2, handle3d.y - 120, { steps: 6 }); await bp.mouse.up();
    await bp.waitForTimeout(300);
    const raised = await barajLevel(bp);
    check('baraj (masaüstü, 3B): su yüzeyindeki tutamak sürüklenince su bırakılan yerde kalıyor, akış Durdur', raised > 30 && (await flowChecked(bp)) === 'Durdur', `%20 → %${raised}`);
    await bp.keyboard.press('1'); await waitLevel(bp, 50, 4000); await bp.waitForTimeout(900);
    const bubbles = await bp.evaluate(() => (window.__baraj3b?.bubbles ?? []).map((pool) => pool.filter((b) => b.visible).length));
    const lit = await bp.evaluate(() => (window.__baraj3b?.lamps ?? []).map((l) => Math.round(l.lens.emissiveIntensity * 100) / 100));
    check('baraj (masaüstü, 3B): %50’de ortak prob ve Prob 1 ıslak: uçlarında elektroliz kabarcıkları; yalnız yeşil lamba yanıyor',
      bubbles[0] > 0 && bubbles[1] > 0 && bubbles[2] === 0 && bubbles[3] === 0 && lit[2] > 0.3 && lit[0] === 0 && lit[1] === 0, `kabarcık ${bubbles.join('/')} · lamba ${lit.join('/')}`);
    // İçini göster (B6): beton yarı saydam, kamera eve ve kanala yaklaşır, sağ üstte evin yakın planı.
    const iciButton = sceneRegion.getByRole('button', { name: 'İçini göster' });
    await iciButton.click(); await bp.waitForTimeout(1100);
    const ici = await bp.evaluate(() => {
      const s = window.__baraj3b;
      return s ? { view: s.view, state: s.xrayState, dam: Math.round((s.ghosts[0]?.material.opacity ?? 1) * 100) / 100, outlines: s.outlines.filter((l) => l.visible).length } : null;
    });
    const iciText = (await sceneRegion.textContent()) ?? '';
    const inset = sceneRegion.getByRole('img', { name: /^Kumanda evinin içi/ });
    const insetBox = await inset.boundingBox();
    const regionBox = await sceneRegion.boundingBox();
    await bp.keyboard.press('2'); await waitLevel(bp, 75, 4000);
    const iciLevel = await barajLevel(bp);
    check('baraj (masaüstü, B6): "İçini göster" basılı: beton yarı saydam ve kenarları çizgili, kamera eve ve kanala yaklaşıyor; sağ üstte evin yakın planı ve etiketleri; su yine ayarlanıyor',
      (await iciButton.getAttribute('aria-pressed')) === 'true' && ici?.view === 'xray' && ici.state.on && ici.state.settled && ici.dam < 0.3 && ici.outlines > 0 &&
      insetBox !== null && regionBox !== null && insetBox.x + insetBox.width > regionBox.x + regionBox.width - 40 && insetBox.y < regionBox.y + 40 &&
      ['Kablo kanalı · beton içinde', 'Kumanda evi', 'Devre kartı · 3 kat', 'Klemens', '9 V pil', 'Prob kabloları', 'Lamba kablosu → kule'].every((t) => iciText.includes(t)) && iciLevel === 75,
      JSON.stringify(ici));
    await iciButton.click(); await bp.waitForTimeout(1100);
    const iciOff = await bp.evaluate(() => ({ view: window.__baraj3b?.view, dam: window.__baraj3b?.ghosts[0]?.material.opacity, outlines: window.__baraj3b?.outlines.filter((l) => l.visible).length }));
    check('baraj (masaüstü): "İçini göster"e yeniden basınca normal görünüm (kamera, opak beton, yakın plan kapalı)',
      (await iciButton.getAttribute('aria-pressed')) === 'false' && iciOff.view === 'desk' && iciOff.dam === 1 && iciOff.outlines === 0 && (await inset.count()) === 0, JSON.stringify(iciOff));
    await bp.keyboard.press('r'); await waitLevel(bp, 20, 2000);
    await bp.keyboard.press('s'); await bp.waitForTimeout(200);
    const strip = bp.getByRole('region', { name: 'Soru' });
    await strip.getByRole('button', { name: 'Cevabı göster' }).click(); await bp.waitForTimeout(200);
    const shown = (await strip.getByRole('status').textContent()) ?? '';
    await bp.getByRole('radio', { name: 'Tek ışık' }).click(); await bp.waitForTimeout(400);
    check('baraj (masaüstü): Soru şeridi (S); cevap düğmeyle açılıyor, devre değişince yeniden gizleniyor',
      shown.includes('%37,5') && (await strip.getByRole('status').count()) === 0 && (await strip.getByRole('button', { name: 'Cevabı göster' }).isVisible()), shown.slice(0, 30));
    await bp.keyboard.press('s'); await bp.waitForTimeout(150);
    await bp.getByRole('button', { name: /^Diğer/ }).click(); await bp.waitForTimeout(150);
    await bp.getByRole('menuitem', { name: 'Tam ekran', exact: true }).click(); await bp.waitForTimeout(500);
    const cardSize = await bp.getByRole('status', { name: /^Su seviyesi yüzde/ }).locator('span.font-mono').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const fsOn = await bp.evaluate(() => document.fullscreenElement?.tagName ?? null);
    await bp.evaluate(() => document.exitFullscreen()); await bp.waitForTimeout(300);
    check('baraj (masaüstü): ⋯ → Tam ekran (projeksiyon); doluluk yazısı büyüyor', fsOn === 'HTML' && cardSize >= 44, `${cardSize} px`);
    await bp.getByRole('button', { name: 'Seviye 1: %37,5' }).click();
    await waitLevel(bp, 50, 9000);
    await bp.getByRole('button', { name: /^Diğer/ }).click(); await bp.waitForTimeout(150);
    await bp.getByRole('menuitem', { name: 'Simülatörde aç' }).click();
    await bp.waitForURL((u) => !u.pathname.includes('/baraj'));
    // Canlıda simülatör paketi yüklenip devreyi kaydetmesi ≈ 1,4 s sürebilir: sabit bekleme yerine yokla.
    let opened = null;
    for (let k = 0; k < 20 && !opened?.parts?.some((q) => q.type === 'tank'); k++) opened = await doc(bp);
    const tankPart = opened?.parts.find((q) => q.type === 'tank');
    check('baraj (masaüstü): ⋯ → "Simülatörde aç" devreyi o anki seviyeyle simülatörde açıyor', tankPart !== undefined && Math.abs(tankPart.props.level - 50) < 1 && opened.parts.filter((q) => q.type === 'led').length === 3, `${opened?.parts.length ?? 0} parça, %${tankPart?.props.level}`);
    await bCtx.close();
  }

  // --- Kablo yolu (masaüstü): sıfırdan kurulan devrelerde beklenmeyen bağlantı yok -----------------------
  // Kullanıcı testinde L biçimli yolun köşesi başka bir kablonun köşesine ya da bir uca düşmüş, kablo başka
  // bir kablonun ucunun üstünden geçmişti: multimetre LED yerine pilin − ucunu ölçtü, fonksiyon üretecinin
  // OUT'u COM'a kısa devre oldu. Parçalar Parça ekle kutusundan eklenip fareyle yerine taşınır (gerekirse
  // R ile döndürülür), kablolar uçtan uca sürüklenir; sonunda ağlar beklenenle aynı olmalı ve "beklenmeyen
  // bağlantı" bildirimi çıkmamalı. Eski yol (routeL) bu yerleşimlerde iki devrede de kısa devre kuruyordu.
  {
    // Parça uçlarının yerleri (katalogdaki gibi, ızgara birimi) ve döndürme (saat yönünde: (x, y) ↦ (−y, x)).
    const PINS = {
      battery: [[-4, 0], [4, 0]], resistor: [[-4, 0], [4, 0]], led: [[-4, 0], [4, 0]], multimeter: [[-4, 0], [4, 0]],
      diode: [[-4, 0], [4, 0]], ground: [[0, 0]], funcgen: [[5, -2], [5, 0], [5, 2]], oscilloscope: [[-5, -2], [-5, 0], [-5, 2]],
    };
    const rot = ([x, y], r) => (r === 90 ? [-y, x] : r === 180 ? [-x, -y] : r === 270 ? [y, -x] : [x, y]);
    const pinsOf = (p) => PINS[p.type].map((o) => { const [dx, dy] = rot(o, p.rotation); return { x: p.x + dx, y: p.y + dy }; });
    /** Belgedeki kablo noktası ([x, y]) → { x, y }. */
    const pt = (q) => (Array.isArray(q) ? { x: q[0], y: q[1] } : q);
    /** Belgenin ağları (connectivity.ts'in kuralları): "ETİKET:uç" gruplarının sıralı yazısı. */
    function nets(doc) {
      const wires = doc.wires.map((w) => ({ id: w.id, points: w.points.map(pt) }));
      const parent = new Map();
      const find = (k) => { if (!parent.has(k)) parent.set(k, k); let r = k; while (parent.get(r) !== r) r = parent.get(r); parent.set(k, r); return r; };
      const union = (a, b) => parent.set(find(a), find(b));
      const at = new Map();
      const put = (p, k) => { const key = `${p.x},${p.y}`; if (!at.has(key)) at.set(key, []); at.get(key).push(k); };
      for (const p of doc.parts) pinsOf(p).forEach((q, i) => { find(`${p.label}:${i}`); put(q, `${p.label}:${i}`); });
      for (const w of wires) w.points.forEach((q) => put(q, `w:${w.id}`));
      for (const keys of at.values()) for (const k of keys.slice(1)) union(keys[0], k);
      const inside = (p, a, b) => (a.x === b.x ? p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y) : a.y === b.y && p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x));
      for (const w of wires) for (const end of [w.points[0], w.points.at(-1)]) for (const o of wires) {
        if (o.id !== w.id && o.points.some((q, i) => i > 0 && inside(end, o.points[i - 1], q))) union(`w:${w.id}`, `w:${o.id}`);
      }
      const groups = new Map();
      for (const p of doc.parts) PINS[p.type].forEach((_, i) => { const k = `${p.label}:${i}`; const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); });
      return [...groups.values()].map((g) => g.sort().join(' ')).sort().join(' | ');
    }
    const canonical = (groups) => groups.map((g) => g.slice().sort().join(' ')).sort().join(' | ');

    const saved = async (page) => { await page.waitForTimeout(400); return page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre'))); };
    const screen = (page, gx, gy) => page.evaluate(([x, y]) => {
      const svg = document.querySelector('svg.schematic'); const g = svg.querySelector('g[transform]');
      const m = g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/); const r = svg.getBoundingClientRect();
      return { x: r.left + Number(m[1]) + x * 10 * Number(m[3]), y: r.top + Number(m[2]) + y * 10 * Number(m[3]) };
    }, [gx, gy]);
    /** Tuvalin ortasındaki ızgara noktası (yerleşim buna göre). */
    const centerGrid = (page) => page.evaluate(() => {
      const svg = document.querySelector('svg.schematic'); const g = svg.querySelector('g[transform]');
      const m = g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/); const r = svg.getBoundingClientRect();
      const s = Number(m[3]) * 10;
      return { x: Math.round((r.width / 2 - Number(m[1])) / s), y: Math.round((r.height / 2 - Number(m[2])) / s) };
    });
    const notebook = (page) => page.getByRole('complementary', { name: /^Defter/ });
    async function deskAdd(page) {
      const box = notebook(page).getByRole('combobox', { name: /Parça ekle/ });
      if ((await box.count()) === 0) { await notebook(page).getByRole('button', { name: 'Parça ekle', exact: true }).click(); await page.waitForTimeout(150); }
      return box;
    }
    /** Parçayı Parça ekle kutusundan ekler, R ile döndürür ve gövdesinden sürükleyip (x, y)'ye taşır. */
    async function addPart(page, query, option, label, x, y, rotation = 0, grab = [0, 0]) {
      const box = await deskAdd(page);
      await box.fill(query); await page.waitForTimeout(200);
      await page.getByRole('option', { name: option }).first().click(); await page.waitForTimeout(300);
      let p = (await saved(page)).parts.find((q) => q.label === label);
      // Tuvale tıklayıp (parça seçili kalır) R ile döndür.
      for (let k = 0; k < rotation / 90; k++) {
        const s = await screen(page, p.x + grab[0], p.y + grab[1]);
        await page.mouse.click(s.x, s.y); await page.waitForTimeout(100);
        await page.keyboard.press('r'); await page.waitForTimeout(150);
        p = (await saved(page)).parts.find((q) => q.label === label);
      }
      const [gx, gy] = rot(grab, p.rotation);
      for (let attempt = 0; attempt < 3 && (p.x !== x || p.y !== y); attempt++) {
        const a = await screen(page, p.x + gx, p.y + gy);
        const b = await screen(page, x + gx, y + gy);
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200);
        p = (await saved(page)).parts.find((q) => q.label === label);
      }
      await page.keyboard.press('Escape');
      return p;
    }
    /** Bir uçtan öbür uca fareyle sürükleyerek kablo; bildirim çıktıysa metni. */
    async function wire(page, from, to) {
      const a = await screen(page, from.x, from.y);
      const b = await screen(page, to.x, to.y);
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(250);
      const alert = page.getByRole('alert').filter({ hasText: 'bıraktığın' });
      return (await alert.count()) > 0 ? await alert.first().textContent() : null;
    }
    const pin = (doc, label, i) => pinsOf(doc.parts.find((p) => p.label === label))[i];

    /** Masaüstü sayfası; devre `seed` (varsayılan boş) ile açılır. */
    async function desk(seed = { version: 1, parts: [], wires: [] }) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
      await ctx.addInitScript((d) => {
        try {
          localStorage.setItem('devre-simulatoru:hosgeldin', '1');
          if (!sessionStorage.getItem('yuklendi')) { localStorage.setItem('devre-simulatoru:devre', d); sessionStorage.setItem('yuklendi', '1'); }
        } catch {}
      }, JSON.stringify(seed));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => { errors.push(e.message); problems.push('pageerror: ' + e.message); });
      await page.goto(URL0, { waitUntil: 'networkidle' });
      return { ctx, page, errors };
    }

    // --- 1. LED devresi ve multimetre (kullanıcı testi) ---------------------------------------------------
    {
      const { ctx, page, errors } = await desk();
      const c = await centerGrid(page);
      const o = { x: c.x - 10, y: c.y - 4 };
      await addPart(page, 'pil', /^Pil/, 'B1', o.x, o.y, 90);
      await addPart(page, 'direnç', /^Direnç/, 'R1', o.x + 8, o.y - 8);
      await addPart(page, 'led', /^LED/, 'LED1', o.x + 20, o.y, 90);
      await addPart(page, 'toprak', /^Toprak/, 'GND1', o.x, o.y + 8, 0, [0, 1]);
      await addPart(page, 'multimetre', /Multimetre/, 'MM1', o.x + 4, o.y + 14);
      let d = await saved(page);
      const placed = d.parts.map((p) => `${p.label}(${p.x - o.x},${p.y - o.y},${p.rotation})`).join(' ');
      const steps = [
        ['B1', 0, 'R1', 0], ['R1', 1, 'LED1', 0], ['LED1', 1, 'B1', 1], ['B1', 1, 'GND1', 0],
        ['MM1', 0, 'LED1', 0],
      ];
      const alerts = [];
      for (const [la, ia, lb, ib] of steps) {
        d = await saved(page);
        const t = await wire(page, pin(d, la, ia), pin(d, lb, ib));
        if (t) alerts.push(`${la}:${ia}→${lb}:${ib}: ${t}`);
      }
      // Son kablo: MM1 COM'dan boşluğa sürükleyip bırak → "Tıklayarak yol çiz" kipi açıkça görünüyor, bütün
      // parça uçları kabloların üstünde; LED1'in katoduna tıklayınca kablo biter.
      d = await saved(page);
      const com = pin(d, 'MM1', 1);
      const a = await screen(page, com.x, com.y);
      const free = await screen(page, com.x + 6, com.y + 3);
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(free.x, free.y, { steps: 8 });
      const dragging = { hint: await page.getByText('Uca bırak: bağla').count(), pins: await page.locator('[data-wiring-pins] > circle').count() };
      await page.mouse.up(); await page.waitForTimeout(200);
      const pill = page.locator('[data-click-route]');
      const clickMode = { pill: await pill.count(), text: ((await pill.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' '), pins: await page.locator('[data-wiring-pins] > circle').count() };
      const totalPins = d.parts.reduce((n, p) => n + PINS[p.type].length, 0);
      const k = pin(d, 'LED1', 1);
      const kp = await screen(page, k.x, k.y);
      await page.mouse.click(kp.x, kp.y); await page.waitForTimeout(300);
      const t = page.getByRole('alert').filter({ hasText: 'bıraktığın' });
      if (await t.count()) alerts.push(`MM1:1→LED1:1 (tıklayarak): ${await t.first().textContent()}`);
      const pillAfter = await pill.count();
      check('masaüstü kablo: pinden çekerken "Uca bırak: bağla" ve bütün parça uçları görünüyor; boşlukta bırakınca "Tıklayarak yol çiz" kipi (vurgulu şerit) açılıyor, uca tıklayınca kablo bitiyor ve şerit kapanıyor',
        dragging.hint === 1 && dragging.pins === totalPins && clickMode.pill === 1 && /Tıklayarak yol çiz/.test(clickMode.text) && clickMode.pins === totalPins && pillAfter === 0,
        `${JSON.stringify(dragging)} · ${JSON.stringify(clickMode)} · ${totalPins} uç · sonra ${pillAfter}`);
      d = await saved(page);
      const want = canonical([['B1:0', 'R1:0'], ['R1:1', 'LED1:0', 'MM1:0'], ['LED1:1', 'B1:1', 'GND1:0', 'MM1:1']]);
      if (OUT) await page.screenshot({ path: `${OUT}/1-led-multimetre.png` });
      check('sıfırdan LED devresi ve multimetre (masaüstü, fareyle): 6 kablo; ağlar beklenen gibi (multimetre LED’in uçlarında), beklenmeyen bağlantı bildirimi yok',
        d.wires.length === 6 && nets(d) === want && alerts.length === 0, `${placed} · ${d.wires.length} kablo · ${nets(d) === want ? 'ağlar doğru' : nets(d)}${alerts.length ? ' · ' + alerts.join(' / ') : ''}${errors.length ? ' · ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }

    // --- 2. Osiloskoplu yarım dalga doğrultucu (fonksiyon üretecinin OUT–COM kısa devresi) -----------------
    {
      const { ctx, page, errors } = await desk();
      const c = await centerGrid(page);
      const o = { x: c.x - 20, y: c.y + 2 };
      await addPart(page, 'fonksiyon', /Fonksiyon üreteci/, 'FG1', o.x, o.y);
      await addPart(page, 'diyot', /^Diyot/, 'D1', o.x + 14, o.y - 14);
      await addPart(page, 'direnç', /^Direnç/, 'R1', o.x + 24, o.y - 8, 90);
      await addPart(page, 'toprak', /^Toprak/, 'GND1', o.x + 8, o.y + 8, 0, [0, 1]);
      await addPart(page, 'osiloskop', /Osiloskop/, 'OSC1', o.x + 40, o.y - 6);
      let d = await saved(page);
      const placed = d.parts.map((p) => `${p.label}(${p.x - o.x},${p.y - o.y},${p.rotation})`).join(' ');
      const steps = [
        ['FG1', 0, 'D1', 0], ['D1', 1, 'R1', 0], ['R1', 1, 'FG1', 2], ['FG1', 2, 'GND1', 0],
        ['OSC1', 0, 'FG1', 0], ['OSC1', 1, 'R1', 0], ['OSC1', 2, 'R1', 1],
      ];
      const alerts = [];
      for (const [la, ia, lb, ib] of steps) {
        d = await saved(page);
        const t = await wire(page, pin(d, la, ia), pin(d, lb, ib));
        if (t) alerts.push(`${la}:${ia}→${lb}:${ib}: ${t}`);
      }
      d = await saved(page);
      const want = canonical([['FG1:0', 'D1:0', 'OSC1:0'], ['D1:1', 'R1:0', 'OSC1:1'], ['R1:1', 'FG1:2', 'GND1:0', 'OSC1:2'], ['FG1:1']]);
      if (OUT) await page.screenshot({ path: `${OUT}/2-yarim-dalga.png` });
      check('sıfırdan osiloskoplu yarım dalga doğrultucu (masaüstü, fareyle): 7 kablo; ağlar beklenen gibi (FG1 OUT ile COM ayrı), beklenmeyen bağlantı bildirimi yok',
        d.wires.length === 7 && nets(d) === want && alerts.length === 0, `${placed} · ${d.wires.length} kablo · ${nets(d) === want ? 'ağlar doğru' : nets(d)}${alerts.length ? ' · ' + alerts.join(' / ') : ''}${errors.length ? ' · ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }

    // --- 3. Beklenmeyen bağlantı: uca bırakılan kablo, o ucun üstünden geçen kabloya da bağlanıyor ---------
    {
      // R1'in 2. ucunun üstünden geçen (ona bağlı olmayan) bir kablo: R2'nin 2. ucundan yukarı.
      const { ctx, page, errors } = await desk({
        version: 1,
        parts: [
          { id: 'p1', type: 'resistor', label: 'R1', x: 0, y: 0, rotation: 0, props: { resistance: 1000 } },
          { id: 'p2', type: 'resistor', label: 'R2', x: 0, y: 12, rotation: 0, props: { resistance: 1000 } },
          { id: 'p3', type: 'resistor', label: 'R3', x: 16, y: 0, rotation: 0, props: { resistance: 1000 } },
        ],
        wires: [{ id: 'w1', points: [[4, 12], [4, -6]] }],
      });
      await page.waitForTimeout(400);
      let d = await saved(page);
      const before = nets(d);
      const text = await wire(page, pin(d, 'R3', 0), pin(d, 'R1', 1));
      d = await saved(page);
      const joined = nets(d);
      const flashing = await page.locator('svg.schematic circle.alarm-blink').count();
      await page.getByRole('alert').getByRole('button', { name: 'Geri al' }).click().catch(() => {});
      await page.waitForTimeout(300);
      d = await saved(page);
      check('masaüstü kablo: uca bırakılan kablo, o ucun üstünden geçen kabloya da bağlanınca bildirim ("… şuna da bağlandı: R2 2. uç"), uç yanıp sönüyor; Geri al kabloyu kaldırıyor',
        /bıraktığın iki uçtan başka şuna da bağlandı: R2 2\. uç/.test(text ?? '') && joined.includes('R1:1 R2:1 R3:0') && flashing >= 1 && d.wires.length === 1 && nets(d) === before,
        `${text} · ${flashing} yanıp sönen · ${d.wires.length} kablo${errors.length ? ' · ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }

  // --- Telefon hızı: 4 kat yavaş işlemcide (iPhone 13 öykünmesi) bütün örnekler çalışırken ---------------
  // Kare hızı en az 30/s, 100 ms'yi aşan görev yok (çözücünün süre sınırı kesin; çizim uzun sürünce hesap
  // süresi kısalır). Simülasyon gerçek zamana yetişemeyince "yetişemiyor" simgesi üst çubukta, açıklaması
  // Durum sayfasında. Örneklerin adları i18n/tr.ts'ten (EXAMPLES); her örnek yavaşlatılmadan açılır,
  // 4 kat yavaşta oynatılır, 1,5 s sonra 2 s ölçülür.
  {
    const trText = readFileSync(new URL('../src/i18n/tr.ts', import.meta.url), 'utf8');
    const block = trText.slice(trText.indexOf('const EXAMPLES: Record<ExampleId, ExampleTexts> = {'));
    const titles = [...block.slice(0, block.indexOf('\n};')).matchAll(/^ {4}title: '([^']+)',$/gm)].map((m) => m[1]);
    const { page, cdp } = await phone();
    await page.addInitScript(() => {
      window.__kareAraliklari = [];
      window.__uzunGorevler = [];
      let last = performance.now();
      const tick = (now) => { window.__kareAraliklari.push(now - last); last = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__uzunGorevler.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
    });
    await page.reload({ waitUntil: 'networkidle' });
    const rows = [];
    let lagShown = null;
    for (const title of titles) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await page.locator('header').getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(300);
      await page.getByRole('searchbox', { name: 'Örnek ara' }).fill(title); await page.waitForTimeout(200);
      await page.getByRole('button', { name: title, exact: true }).first().tap(); await page.waitForTimeout(700);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await phoneBar(page).getByRole('button', { name: 'Oynat' }).tap();
      await page.waitForTimeout(1500);
      const t0 = await page.evaluate(() => { window.__kareAraliklari.length = 0; window.__uzunGorevler.length = 0; return performance.now(); });
      await page.waitForTimeout(2000);
      const r = await page.evaluate((t) => ({ n: window.__kareAraliklari.length, dt: performance.now() - t, long: Math.max(0, ...window.__uzunGorevler) }), t0);
      // Yarım dalga doğrultmaç 4 kat yavaşta gerçek zamana yetişemez: simge üst çubukta, açıklama Durum sayfasında.
      if (title === 'Yarım dalga doğrultmaç') {
        const icon = await page.locator('header [data-lagging]').count();
        await phoneBar(page).getByRole('button', { name: /: hız$/ }).tap(); await page.waitForTimeout(300);
        const note = await page.getByRole('dialog').locator('[data-lagging]').textContent().catch(() => '');
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        if ((await page.getByRole('dialog').count()) > 0) await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).first().tap().catch(() => {});
        lagShown = { icon, note: note ?? '' };
      }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await phoneBar(page).getByRole('button', { name: 'Durdur' }).tap(); await page.waitForTimeout(250);
      rows.push({ title, fps: (r.n / r.dt) * 1000, long: r.long });
    }
    const slow = rows.filter((x) => x.fps < 30 || x.long > 100);
    const worst = rows.slice().sort((a, b) => a.fps - b.fps).slice(0, 3).map((x) => `${x.title} ${x.fps.toFixed(1)}`).join(', ');
    check(`telefon hızı (4 kat yavaş işlemci, CDP Emulation.setCPUThrottlingRate 4): ${titles.length} örneğin hepsi çalışırken en az 30 kare/s, 100 ms'yi aşan görev yok`,
      titles.length >= 81 && rows.length === titles.length && slow.length === 0,
      `en yavaş: ${worst} kare/s · en uzun görev ${Math.max(0, ...rows.map((x) => x.long))} ms${slow.length ? ' · KALAN: ' + slow.map((x) => `${x.title} ${x.fps.toFixed(1)} kare/s, ${x.long} ms`).join('; ') : ''}`);
    check('telefon hızı: gerçek zamana yetişemeyen devrede (yarım dalga, 4 kat yavaş) üst çubukta "yetişemiyor" simgesi; Durum sayfasında açıklaması',
      lagShown?.icon === 1 && /yetişemiyor/.test(lagShown?.note ?? ''), JSON.stringify(lagShown));
    await page.context().close();
  }

  // --- 3B laboratuvar cihazları: dik, ön paneli öne bakan multimetre, güç kaynağı, üreteç, osiloskop ----------
  // Ön paneldeki soketler kameraya (+z) bakar, kablolar oradan çıkar; ekranlar canlı (osiloskop izi, üretecin
  // dalga biçimi lambası, güç kaynağının C.V lambası, multimetrenin anahtarı kipte); kablolar gövdelerden
  // geçmez; Tahtada kur'un Tepeden görünümünde cihaz kartları tahtanın hemen arkasında yan yana.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:gorunum', 'bench'); } catch {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const state = () => page.evaluate(() => {
      const t = window.__tezgah;
      return [...t.parts.values()].filter((p) => ['dcsupply', 'funcgen', 'oscilloscope', 'multimeter', 'voltmeter', 'ammeter'].includes(p.part.type)).map((p) => ({
        label: p.part.label,
        type: p.part.type,
        front: p.dirs.length > 0 && p.dirs.every((d) => d && d.z > 0.9),
        dial: p.model.root.userData.dial ?? null,
        lamps: p.model.root.userData.lamps ?? null,
        wave: p.model.root.userData.wave ?? null,
        traces: p.model.root.userData.traces ?? null,
        screen: p.model.root.userData.screen ?? null,
      }));
    });
    const open = async (id) => {
      await page.goto('about:blank');
      await page.goto(`${URL0}embed/?ornek=${id}&gorunum=tam`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(400);
    };
    const play = async () => { await page.getByRole('button', { name: /^Oynat/ }).first().click().catch(() => {}); await page.waitForTimeout(1500); };
    await open('yarim-dalga');
    await play();
    const yd = await state();
    const ydHits = await page.evaluate(() => window.__tezgah.cableHits());
    await open('diyot-dc');
    await play();
    const dd = await state();
    const ddHits = await page.evaluate(() => window.__tezgah.cableHits());
    const by = (list, label) => list.find((x) => x.label === label) ?? {};
    check('3B cihazlar (yarım dalga, 1N4001 DC): üreteç, osiloskop, güç kaynağı ve iki el multimetresinin ön soketleri kameraya bakıyor; kablolar gövdelerden geçmiyor',
      yd.length === 2 && dd.length === 3 && [...yd, ...dd].every((x) => x.front) && ydHits === 0 && ddHits === 0, `${[...yd, ...dd].map((x) => `${x.label}:${x.front}`).join(' ')} · çakışma ${ydHits}/${ddHits}`);
    check('3B cihazlar canlı: osiloskopta iki iz, üretecin sinüs lambası; güç kaynağında C.V; ampermetrenin anahtarı mA, voltmetreninki V⎓ ve ekranı defter kartıyla aynı okuma',
      by(yd, 'OSC1').traces === 2 && by(yd, 'FG1').wave === 'sine' && by(dd, 'PS1').lamps === 'C.V|C.V' && by(dd, 'A1').dial === 'mA' && by(dd, 'V1').dial === 'V⎓' && /\d,\d+ V$/.test(by(dd, 'V1').screen ?? ''),
      `${by(yd, 'OSC1').traces} iz · ${by(yd, 'FG1').wave} · ${by(dd, 'PS1').lamps} · A1 ${by(dd, 'A1').dial} · V1 ${by(dd, 'V1').dial} ${by(dd, 'V1').screen}`);
    await ctx.close();
  }
  {
    // Tahtada kur, Tepeden: cihaz kartları tahtanın arkasında yan yana; tahta kadrajın en az yarısı genişlikte.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await (await pickExample(page, (p) => p.getByRole('button', { name: 'Yarım dalga doğrultmaç', exact: true }))).click(); await page.waitForTimeout(600);
    await benchButton(page).click();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Tahtada kur' }).click(); await page.waitForTimeout(1500);
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-anchor="footprint"]')].map((e) => e.getBoundingClientRect()).map((r) => ({ x0: r.left, x1: r.right, y1: r.bottom }));
      const canvas = document.querySelector('canvas')?.getBoundingClientRect();
      // Tahtanın ekrandaki genişliği ve arka kenarı (breadboard.ts: genişlik sütun + 3, derinlik 21,6).
      const region = document.querySelector('[role=region][aria-label^="Breadboard"]');
      const r = region.getBoundingClientRect();
      const t = window.__tezgah.topTransform();
      const cols = /63 sütun/.test(region.getAttribute('aria-label')) ? 63 : 30;
      return { cards, canvasW: canvas?.width ?? 0, boardW: (cols + 3) * t.scale, boardTop: r.top + t.oy - 10.8 * t.scale };
    });
    const overlap = layout.cards.some((a, i) => layout.cards.some((b, j) => i < j && a.x0 < b.x1 && b.x0 < a.x1));
    const behind = layout.cards.every((c) => c.y1 <= layout.boardTop + 4);
    check('Tahtada kur (Tepeden, yarım dalga): FG1 ve OSC1 kartları tahtanın arkasında yan yana, üst üste binmiyor; tahta kadrajın en az yarısı genişlikte (okunaklı)',
      layout.cards.length === 2 && !overlap && behind && layout.boardW >= 0.5 * layout.canvasW, `${layout.cards.length} kart · arkada ${behind} · tahta ${Math.round(layout.boardW)} / ${Math.round(layout.canvasW)} px`);
    await ctx.close();
  }
  {
    // Varsayılan (Serbest) kadraj, masa üstü cihaz varken: tahta masaüstünde kadraj genişliğinin en az %45'i,
    // telefonda %70'i, alttaki 3B denetimlerinin ([data-fit-reserve]) üstünde; cihazların ön panelleri
    // tahtanın arkasında (üstleri kırpılabilir); görünen etiketler üst üste binmiyor. Cihazlar: masaüstünde
    // bütün cihazlar kadrajda, telefonda tek cihaz (önce osiloskop), yeniden seçince sıradaki.
    const frame = (page) => page.evaluate(() => {
      const t = window.__tezgah;
      const c = document.querySelector('canvas').getBoundingClientRect();
      const b = t.boardRect();
      const reserve = [...document.querySelectorAll('[data-fit-reserve]')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0)
        .map((r) => ({ x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left }));
      const labels = [...document.querySelectorAll('[data-anchor="part"]')].filter((e) => getComputedStyle(e).opacity === '1')
        .map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; });
      const devices = t.deviceRects().map((d) => ({ id: d.id, x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1, vis: Math.max(0, Math.min(d.x1, c.width) - Math.max(d.x0, 0)) / (d.x1 - d.x0) }));
      return {
        w: c.width,
        share: b ? (b.x1 - b.x0) / c.width : 0,
        under: b ? reserve.some((r) => b.x0 < r.x1 && r.x0 < b.x1 && b.y1 > r.y0) : true,
        boardTop: b?.y0 ?? 0,
        clash: labels.some((a, i) => labels.some((d, j) => i < j && a.x0 < d.x1 && d.x0 < a.x1 && a.y0 < d.y1 && d.y0 < a.y1)),
        labels: labels.map((l) => l.id),
        devices,
      };
    });
    const open = async (page, id) => {
      await page.goto(`${URL0}embed/?ornek=${id}&gorunum=tam`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
    };
    const pickCam = async (page, name, tapIt) => {
      const button = page.getByRole('button', { name: /^Kamera:/ });
      await (tapIt ? button.tap() : button.click()); await page.waitForTimeout(200);
      const item = page.getByRole('menuitemradio', { name });
      if (!(await item.count())) return false;
      await (tapIt ? item.tap() : item.click()); await page.waitForTimeout(600);
      return true;
    };
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:gorunum', 'bench'); localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await open(page, 'diyot-dc');
    await page.getByRole('button', { name: /^Oynat/ }).first().click(); await page.waitForTimeout(1200);
    const dd = await frame(page);
    const behind = dd.devices.length === 3 && dd.devices.every((d) => d.y1 <= dd.boardTop + 4 && d.y1 > 0) && dd.devices.some((d) => d.vis > 0.95);
    check('3B kadraj (masaüstü, 1N4001 DC): tahta kadraj genişliğinin en az %45’i, alttaki 3B düğmelerinin üstünde; cihazların ön panelleri tahtanın arkasında; etiketler üst üste binmiyor',
      dd.share >= 0.45 && !dd.under && behind && !dd.clash && dd.labels.length >= 2,
      `tahta %${Math.round(dd.share * 100)} · altta ${dd.under} · arkada ${behind} · etiket ${dd.labels.length}, çakışma ${dd.clash}`);
    await open(page, 'bjt-yukseltec');
    const menu = await pickCam(page, 'Cihazlar', false);
    const bench = await frame(page);
    const span = bench.devices.length ? (Math.max(...bench.devices.map((d) => d.x1)) - Math.min(...bench.devices.map((d) => d.x0))) / bench.w : 0;
    const onlyDevices = bench.labels.every((id) => bench.devices.some((d) => d.id === id));
    check('3B kadraj (masaüstü, BC107 yükselteç): kamera menüsünde “Cihazlar”; üç cihaz da kadrajda, sıra kadraj genişliğinin en az %85’i; yalnızca cihazların etiketleri',
      menu && bench.devices.length === 3 && bench.devices.every((d) => d.vis > 0.99) && span >= 0.85 && onlyDevices,
      `${menu} · ${bench.devices.map((d) => Math.round(d.vis * 100)).join('/')} · %${Math.round(span * 100)} · ${bench.labels.length} etiket`);
    await ctx.close();

    const { page: ph } = await phone();
    await ph.context().addInitScript(() => { try { localStorage.setItem('devre-simulatoru:gorunum', 'bench'); } catch {} });
    await open(ph, 'diyot-dc');
    const pd = await frame(ph);
    check('3B kadraj (telefon, 1N4001 DC): tahta kadraj genişliğinin en az %70’i, alttaki 3B düğmelerinin üstünde; cihazlar tahtanın arkasında',
      pd.share >= 0.7 && !pd.under && pd.devices.every((d) => d.y1 <= pd.boardTop + 4),
      `tahta %${Math.round(pd.share * 100)} · altta ${pd.under}`);
    await open(ph, 'bjt-yukseltec');
    await pickCam(ph, 'Cihazlar', true);
    const first = await frame(ph);
    const scope = first.devices.find((d) => d.vis > 0.99 && d.x1 - d.x0 >= 0.8 * first.w);
    await pickCam(ph, 'Cihazlar', true);
    const second = await frame(ph);
    const next = second.devices.find((d) => d.vis > 0.99 && d.x1 - d.x0 >= 0.6 * second.w);
    check('3B kadraj (telefon, BC107 yükselteç): Cihazlar tek cihaza yaklaşıyor (osiloskop kadraj genişliğinin en az %80’i, tamamı görünür); yeniden seçince sıradaki cihaz',
      scope !== undefined && next !== undefined && next.id !== scope.id,
      `${scope?.id ?? '—'} → ${next?.id ?? '—'} · ${first.devices.map((d) => `${d.id}:${Math.round(d.vis * 100)}`).join(' ')}`);
    await ph.context().close();
  }
  // --- 3B cihaz kabloları: timsah kıskaç, bir delikte tek tel, birleşme etiketi, ağ vurgusu ------------------
  // Cihaz kabloları deliğe girmez: kıskaç eksenli parçanın bacağını ya da kısa dik telin ucunu tutar, aynı ağdakiler
  // zincirlenir; tahtada hiçbir delikte iki şey yok; birleşme noktasında "GND · 3 kablo". Fare kablonun üstüne
  // gelince (telefonda dokununca) o ağın kabloları ve bacakları parlar, öbürleri soluklaşır, küçük şemada düğüm.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:gorunum', 'bench'); localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const report = async (id) => {
      await page.goto('about:blank');
      await page.goto(`${URL0}embed/?ornek=${id}&gorunum=tam`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      return page.evaluate(() => {
        const r = window.__tezgah.clipReport();
        const labels = [...document.querySelectorAll('[data-anchor="junction"]')].map((e) => ({ net: e.dataset.net, text: e.textContent, shown: getComputedStyle(e).opacity === '1' }));
        return { ...r, labels };
      });
    };
    const jf = await report('jfet-karakteristik');
    const yd = await report('yarim-dalga');
    const kinds = (r) => r.clips.map((c) => c.kind[0]).join('');
    const label = (r, net) => r.labels.find((l) => l.net === net);
    const gnd = (r) => r.junctions.find((j) => /GND/.test(label(r, j.net)?.text ?? ''));
    check('3B kıskaç (BF245A, yarım dalga): hiçbir delikte iki tel ya da bacak yok; bütün cihaz kabloları kıskaçla (bacak, kısa tel ya da zincir), deliğe takılı cihaz kablosu yok',
      jf.doubled === 0 && yd.doubled === 0 && jf.plugged === 0 && yd.plugged === 0 && jf.clips.length === 8 && yd.clips.length === 5 && jf.clips.some((c) => c.kind === 'leg') && jf.clips.some((c) => c.kind === 'chain'),
      `BF245A ${kinds(jf)} · iki şey ${jf.doubled} · fişli ${jf.plugged} | yarım dalga ${kinds(yd)} · iki şey ${yd.doubled} · fişli ${yd.plugged}`);
    check('3B kıskaç: birleşme etiketi ağın adı ve kablo sayısı (BF245A: "GND · 3 kablo", "RD 2. uç · 2 kablo"; yarım dalga: GND iki kablo), etiketler görünür',
      label(jf, gnd(jf)?.net)?.text === 'GND · 3 kablo' && jf.labels.some((l) => l.text === 'RD 2. uç · 2 kablo') && jf.labels.every((l) => l.shown) && jf.junctions.length === 2 &&
        /^GND · 2 kablo$/.test(label(yd, gnd(yd)?.net)?.text ?? '') && yd.labels.length === yd.junctions.length,
      `${jf.labels.map((l) => `${l.text}${l.shown ? '' : ' (gizli)'}`).join(' | ')} || ${yd.labels.map((l) => l.text).join(' | ')}`);
    // Fare birleşme noktasının (ilk kıskacın ağzı) üstüne gelince GND ağı vurgulanır.
    await page.goto(`${URL0}embed/?ornek=jfet-karakteristik`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const net = jf.junctions.find((j) => j.count === 3)?.net;
    const at = await page.evaluate((net) => {
      const t = window.__tezgah; const p = t.junctionAt.get(net).clone().project(t.camera); const c = document.querySelector('canvas').getBoundingClientRect();
      return { x: c.left + ((p.x + 1) / 2) * c.width, y: c.top + ((1 - p.y) / 2) * c.height };
    }, net);
    let lit = { net: null };
    for (let dy = 0; dy < 40 && !lit.net; dy += 3) {
      await page.mouse.move(at.x, at.y - dy); await page.waitForTimeout(120);
      lit = await page.evaluate(() => window.__tezgah.netHighlight());
    }
    const mini = await page.locator('polyline[data-highlight]').count();
    await page.mouse.move(5, 300); await page.waitForTimeout(300);
    const off = await page.evaluate(() => window.__tezgah.netHighlight());
    check('3B ağ vurgusu (masaüstü, BF245A): fare GND birleşme noktasının üstüne gelince GND kabloları parlıyor, öbürleri soluk, bacağı işaretli; küçük şemada düğümün kabloları vurgulu; fare çekilince kalkıyor',
      lit.net === net && lit.lit >= 4 && lit.dim >= 4 && lit.legs >= 1 && mini >= 1 && off.net === null && off.lit === 0 && off.dim === 0,
      `${lit.net} · parlak ${lit.lit} · soluk ${lit.dim} · bacak ${lit.legs} · küçük şema ${mini} · sonra ${off.net}`);
    await ctx.close();
    // Telefonda dokununca: kıskaca dokunmak vurgular, yeniden dokunmak kaldırır.
    const { page: ph, cdp } = await phone();
    await ph.context().addInitScript(() => { try { localStorage.setItem('devre-simulatoru:gorunum', 'bench'); } catch {} });
    await ph.goto(`${URL0}embed/?ornek=jfet-karakteristik&gorunum=tam`, { waitUntil: 'networkidle' });
    await ph.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {});
    await ph.waitForTimeout(800);
    const pt = await ph.evaluate((net) => {
      const t = window.__tezgah; const p = t.junctionAt.get(net).clone().project(t.camera); const c = document.querySelector('canvas').getBoundingClientRect();
      return { x: c.left + ((p.x + 1) / 2) * c.width, y: c.top + ((1 - p.y) / 2) * c.height };
    }, net);
    let tapped = { net: null };
    for (let dy = 0; dy < 30 && !tapped.net; dy += 3) {
      await tap(ph, cdp, { x: pt.x, y: pt.y - dy }); await ph.waitForTimeout(150);
      tapped = await ph.evaluate(() => window.__tezgah.netHighlight());
    }
    check('3B ağ vurgusu (telefon, BF245A): kıskaca dokununca o ağ vurgulanıyor (öbürleri soluk)', tapped.net !== null && tapped.lit >= 1 && tapped.dim >= 1, `${tapped.net} · parlak ${tapped.lit ?? 0} · soluk ${tapped.dim ?? 0}`);
    await ph.context().close();
  }
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(problems.length ? problems.join('\n') : 'konsol hatası yok');
console.log(failed ? `\n${failed} madde KALDI.` : `\n${results.length} maddenin hepsi geçti.`);
process.exit(failed || problems.length ? 1 : 0);
