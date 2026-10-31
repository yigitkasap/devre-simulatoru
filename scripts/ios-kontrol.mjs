// iOS / dokunmatik kontrol listesi. Tuvale, alt sayfalara ya da olay işleyicilerine dokunan her
// değişiklikten sonra çalıştırılır (README → "Dokunmatik ekran ve iOS Safari").
//
//   npm run dev                          (ayrı bir terminalde)
//   npm run ios-kontrol [-- <adres> [<ekran-görüntüsü-klasörü>]]
//
// Chromium'un iPhone öykünmesiyle (CDP dokunma olayları) çalışır; Edge kullanır. playwright-core bu
// projeye kurulu değildir: yolu PLAYWRIGHT_CORE ile verilir (varsayılan: thejarrus-site'takiler).
// Uyarı: öykünme gerçek iOS Safari'nin her davranışını yakalamaz (ör. dokunma alanı hatası burada
// görünmüyordu); bu yüzden ilk bölüm iOS için konan kuralların yerinde durduğunu doğrudan denetler.
// Dokunmatik davranışı değiştiren işlerde gerçek bir iPhone'da da denenmelidir.
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
browser.newContext = async ({ welcome = false, ...options } = {}) => {
  const ctx = await rawNewContext(options);
  if (!welcome) await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
  return ctx;
};
const results = [];
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  results.push(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}${extra ? ' — ' + extra : ''}`);
};
const problems = [];

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
const screen = (page, gx, gy) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('svg.schematic'); const g = svg.querySelector('g[transform]');
  const m = g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/); const r = svg.getBoundingClientRect();
  return { x: r.left + Number(m[1]) + x * 10 * Number(m[3]), y: r.top + Number(m[2]) + y * 10 * Number(m[3]), scale: Number(m[3]) };
}, [gx, gy]);
const doc = async (page) => { await page.waitForTimeout(500); return page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre'))); };
const part = async (page, label) => (await doc(page)).parts.find((p) => p.label === label);
/** Telefonda ⋯ → Örnekler; arayıp örneğe dokunarak açar. */
async function openExample(page, name) {
  await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(400);
  await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
  await page.getByRole('searchbox', { name: 'Örnek ara' }).fill(name); await page.waitForTimeout(200);
  await page.getByRole('button', { name, exact: true }).tap(); await page.waitForTimeout(600);
}
/** Telefonun üst çubuğundaki durum satırı ("Kur · kaydedildi", "Çalışıyor · 2,58 s"); kablo bağlarken "Kablo bağla". */
const mode = async (page) => {
  if ((await page.getByRole('button', { name: 'Bitti' }).count()) > 0) return 'Kablo bağla';
  return (await page.getByRole('button', { name: /: durdur ve hız$/ }).getAttribute('aria-label').catch(() => '')) ?? '';
};
/** Telefonda sol alttaki Parça ekle → "<ad> ekle" (sayfa açık kalır). */
async function addPart(page, name) {
  if ((await page.getByRole('dialog', { name: 'Parça ekle' }).count()) === 0) {
    await page.getByRole('button', { name: 'Parça ekle', exact: true }).tap(); await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: `${name} ekle` }).tap(); await page.waitForTimeout(500);
}
/** Telefonda şema kutusunun altındaki defter (v3). */
const phoneNotebook = (page) => page.getByRole('region', { name: /^Defter/ });
const selectedCount = (page) => page.locator('svg.schematic rect[data-selected]').count();
/** Masaüstünde sağdaki defter (v3). */
const notebook = (page) => page.getByRole('complementary', { name: /^Defter/ });
/** Sayfa (belge) kayıyor mu (dikey ya da yatay). */
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
    for (const loc of [page.locator('header button'), page.getByRole('button', { name: 'Kablo bağla' }), page.getByRole('button', { name: 'Şemayı tam ekran aç' }), page.getByRole('button', { name: 'Parça ekle', exact: true }), page.getByRole('button', { name: 'Oynat', exact: true })]) {
      for (const b of await loc.all()) { const r = await b.boundingBox(); if (r) sizes.push(Math.min(r.width, r.height)); }
    }
    const play = await page.getByRole('button', { name: 'Oynat', exact: true }).boundingBox();
    check('telefon (v3): üst çubuk, şema kutusu ve yüzen düğmeler en az 44 px; Oynat 64 px', sizes.length >= 6 && Math.min(...sizes) >= 43.5 && Math.round(play.width) === 64 && Math.round(play.height) === 64, `${sizes.length} düğme, en küçüğü ${Math.round(Math.min(...sizes))} px`);
    await shot(page, 'ios-1-telefon.png');
    await page.context().close();
  }

  // --- Parça ekle sayfası: liste kayar, sayfa kaymaz, arama 16 px -------------------------
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const { page, cdp } = await phone(w, h);
    await page.getByRole('button', { name: 'Parça ekle', exact: true }).tap(); await page.waitForTimeout(400);
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
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(400);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
    const list = page.getByRole('dialog', { name: 'Örnek devreler' }).locator('.overflow-y-auto');
    const box = await list.boundingBox();
    await drag(page, cdp, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, { x: box.x + box.width / 2, y: box.y + 40 });
    await page.waitForTimeout(300);
    const top = await list.evaluate((el) => el.scrollTop);
    check(`örnekler parmakla kaydırılıyor (${w}x${h})`, top > 0, `scrollTop ${top}`);
    const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('örnekler açıkken tuvalin touch-action değeri none değil', touchAction !== 'none', touchAction);
    await page.waitForTimeout(1000);
    const group = page.getByRole('button', { name: /^Proje · Baraj su seviyesi uyarısı/ });
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

  // --- Parça ekle sayfası: daha açık başlar, başlıktan çekilerek tam boy olur, aşağı çekince kapanır --
  {
    const { page, cdp } = await phone();
    const examples = page.getByRole('button', { name: 'Örneklerden başla' });
    const before = await examples.boundingBox();
    check('boş devrede "Kablo bağla" yok (bağlanacak uç yok)', (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 0);
    await page.getByRole('button', { name: 'Parça ekle', exact: true }).tap(); await page.waitForTimeout(500);
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
    check('tutamaçtan aşağı çekince sayfa kapanıyor; Parça ekle düğmesi geri geliyor', (await sheet.count()) === 0 && (await page.getByRole('button', { name: 'Parça ekle', exact: true }).count()) === 1);
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
    await page.locator('header').getByRole('button', { name: 'Geri al' }).tap(); await page.waitForTimeout(200);
    check('üst çubuktaki Geri al son kabloyu siliyor', (await doc(page)).wires.length === 0);
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
    await tap(page, cdp, s); await page.waitForTimeout(80); await tap(page, cdp, s); await page.waitForTimeout(400);
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

  // --- Ölç kipi: kilit, kart, anahtar, canlı değer, durdurma sorusu ---------------------------
  {
    const { page, cdp } = await phone();
    await openExample(page, 'RC dolma');
    await page.getByRole('button', { name: 'Oynat', exact: true }).tap(); await page.waitForTimeout(600);
    check('Oynat’tan sonra durum satırında "Çalışıyor" ve zaman; Geri al, Parça ekle ve Kablo bağla gizli', /Çalışıyor · [\d,]+/.test(await mode(page)) && (await page.locator('header').getByRole('button', { name: 'Geri al' }).count()) === 0 && (await page.getByRole('button', { name: 'Parça ekle', exact: true }).count()) === 0 && (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 0, await mode(page));
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
    await page.getByRole('button', { name: /: durdur ve hız$/ }).tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('dialog', { name: 'Simülasyon' });
    await sheet.getByRole('radio', { name: /^Yavaş/ }).tap(); await page.waitForTimeout(200);
    const slow = await sheet.getByRole('radio', { name: /^Yavaş/ }).getAttribute('aria-checked');
    check('durum satırına dokununca Simülasyon sayfası: Durdur ve Hız; hız seçiliyor', (await sheet.getByRole('button', { name: /^Durdur/ }).count()) === 1 && slow === 'true');
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
    check('Oto ayar 5 ms/bölme ve 5 V/bölme seçiyor', auto.timePerDiv === 0.005 && auto.voltsPerDivA === 5, `${auto.timePerDiv} s, ${auto.voltsPerDivA} V`);
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
    check('yatay telefonda dikeyle aynı düzen: üst çubuk, kısa şema kutusu, altında defter', head !== null && head.height <= 57.5 && box !== null && box.height >= 130 && box.height <= 160 && nb !== null && nb.height >= 150, `şema ${Math.round(box?.height ?? 0)} px, defter ${Math.round(nb?.height ?? 0)} px`);
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
    const addRow = notebook(page).getByRole('combobox', { name: /Parça ekle/ });
    await addRow.tap(); await addRow.fill('direnç'); await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const field = notebook(page).getByLabel('Direnç', { exact: true });
    const fs = await field.evaluate((el) => getComputedStyle(el).fontSize).catch(() => '');
    check('tablette defterin Parça ekle satırından eklenen parçanın kartı açık; dokunmatik alan (≥ 16 px)', (await part(page, 'R1')) !== undefined && parseFloat(fs) >= 16, fs);
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
    await page.getByRole('button', { name: 'LED ve ön direnç', exact: true }).tap(); await page.waitForTimeout(600);
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
    await page.getByRole('button', { name: 'Yarım dalga doğrultmaç', exact: true }).tap(); await page.waitForTimeout(600);
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
    await page.getByRole('button', { name: 'Gerilim bölücü', exact: true }).click(); await page.waitForTimeout(500);
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
    await dp.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }).click(); await dp.waitForTimeout(500);
    await dp.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await dp.waitForTimeout(600);
    for (const name of [/^OSC1 ·/, /^FG1 ·/]) {
      await notebook(dp).getByRole('button', { name }).click(); await dp.waitForTimeout(200);
      found.push(...await unnamed(dp));
    }
    await dp.getByRole('button', { name: '3B', exact: true }).click();
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

  // --- Karta aktar (masaüstü, K1–K2, L1): Dosya menüsünden; delikli plaket (Tamamı, adım adım), PCB --
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', colorScheme: 'dark' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole('button').filter({ hasText: '555 ile yanıp sönen LED (astabil)' }).first().click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Dosya|^555/ }).first().click(); await page.waitForTimeout(150);
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
    check('Karta aktar (masaüstü, L1): Dosya menüsünden açılıyor (16 px kenar boşluğu, panel 368 px); bilgi çipi; delik etiketleri; → ve ← adımı değiştiriyor; 19. adımda C1 · 10c ↔ 11c, + ve − etiketi',
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
    await page.getByRole('button', { name: 'LED ve ön direnç', exact: true }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: '3B', exact: true }).click();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
    const main = await page.locator('main').boundingBox();
    const schemaButton = await page.locator('main').getByRole('button', { name: 'Şema', exact: true }).boundingBox();
    const options = await Promise.all(['Etiketler', 'Akım', 'Karta aktar'].map((n) => page.locator('main').getByRole('button', { name: n, exact: true }).boundingBox()));
    const mini = await page.getByRole('button', { name: 'Şemaya dön' }).boundingBox();
    const right = main.x + main.width;
    const bottom = main.y + main.height;
    check('3B (masaüstü): sol üstte Şema | 3B yok; Şema ve öbür seçenekler sağ altta; sol altta küçük şema',
      (await page.getByRole('group', { name: 'Görünüm' }).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().top > window.innerHeight - 90))) && schemaButton !== null && schemaButton.x > right - 120 && schemaButton.y > bottom - 70 &&
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
    await page.getByRole('button').filter({ hasText: /^\d*RC dolma/ }).first().click(); await page.waitForTimeout(500);
    const button = page.getByRole('button', { name: 'Analiz', exact: true });
    const examplesBox = await page.getByRole('button', { name: 'Örnekler', exact: true }).boundingBox();
    const buttonBox = await button.boundingBox();
    await button.click(); await page.waitForTimeout(300);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    const dBox = await drawer.boundingBox();
    const mainBox = await page.locator('main').boundingBox();
    const nbBox = await notebook(page).boundingBox();
    const tabs = await drawer.getByRole('tab').allTextContents();
    check('analiz (masaüstü, N1): üst çubukta Örnekler’in yanında "Analiz" (basılı); tezgâhın altında 380 px çekmece, defter yerinde; sekmeler Grafik | Tablo | Eğri izleyici | Bode',
      buttonBox !== null && examplesBox !== null && buttonBox.x > examplesBox.x && buttonBox.x - (examplesBox.x + examplesBox.width) < 24 && (await button.getAttribute('aria-pressed')) === 'true' &&
      dBox !== null && Math.abs(dBox.height - 380) < 2 && mainBox !== null && dBox.y >= mainBox.y + mainBox.height - 1 && nbBox !== null && nbBox.x >= dBox.x + dBox.width - 1 && tabs.join('|') === 'Grafik|Tablo|Eğri izleyici|Bode',
      `${Math.round(dBox?.height ?? 0)} px · ${tabs.join('|')}`);
    // İz ekle: kabloya tıkla (düğüm, toprağa göre), parçaya tıkla (akım).
    await drawer.getByRole('button', { name: 'İz ekle' }).click(); await page.waitForTimeout(150);
    let at = await screen(page, 28, -8); await page.mouse.click(at.x, at.y); await page.waitForTimeout(150);
    const pickText = (await drawer.getByRole('status').textContent().catch(() => '')) ?? '';
    await drawer.getByRole('button', { name: 'Toprağa göre ekle' }).click(); await page.waitForTimeout(150);
    await drawer.getByRole('button', { name: 'İz ekle' }).click(); await page.waitForTimeout(150);
    at = await screen(page, 20, -8); await page.mouse.click(at.x, at.y); await page.waitForTimeout(200);
    const names = await drawer.locator('b.font-mono').allTextContents();
    const marks = await page.locator('svg.schematic text').allTextContents();
    check('analiz: "İz ekle" → düğüme tıklayınca V(C1) (fark için ikinci düğüm sorulur), parçaya tıklayınca I(R1); şemada izin renginde etiketler',
      pickText.startsWith('C1 seçildi') && names.slice(0, 2).join(',') === 'V(C1),I(R1)' && marks.includes('V(C1)') && marks.includes('I(R1) →'), `${names.slice(0, 2).join(',')} · ${pickText.slice(0, 30)}`);
    // Kayıt: S1 çalışırken kapanır, kondansatör dolar.
    const sim = page.getByRole('region', { name: 'Simülasyon' });
    await sim.getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(150);
    at = await screen(page, 8, -8); await page.mouse.click(at.x, at.y); await page.waitForTimeout(900);
    await sim.getByRole('button', { name: 'Duraklat' }).click(); await page.waitForTimeout(400);
    const info = ((await drawer.locator('dl').textContent()) ?? '').replace(/\s+/g, ' ');
    const chartLabel = (await drawer.getByRole('img').getAttribute('aria-label')) ?? '';
    const slider = drawer.getByRole('slider', { name: 'İmleç zamanı' });
    await slider.focus(); await page.keyboard.press('End'); await page.waitForTimeout(150);
    const endValue = ((await drawer.locator('.shadow-lg').first().textContent()) ?? '').replace(/\s+/g, ' ');
    check('analiz: kayıt yalnız seçili izler, 5 ms aralıkla; grafik role="img" açıklamalı; imleç klavyeyle sona gidiyor, değer kutusunda V(C1) ≈ 9,9 V',
      /Aralık ?5 ms · \d{2,} nokta/.test(info) && chartLabel.startsWith('Grafik: V(C1), I(R1)') && /V\(C1\) ?9,[89]\d\d V/.test(endValue), `${info} · ${endValue.slice(0, 60)}`);
    // Kablo gerilimi kutusu (analiz düzeltmeleri, 2): çekmece açıkken ve çalışırken toprak sembolüne ve
    // alt kabloya binmiyor (Sığdır kutuyu dışarıda bırakır); yakınlaşınca devreye değen kutu tek satır.
    {
      const legendBox = async () => page.locator('main').getByRole('note', { name: 'Gösterim' }).boundingBox();
      const lb = await legendBox();
      const a = await screen(page, 0, 8);
      const b = await screen(page, 44, 8);
      const covers = lb !== null && a.y >= lb.y - 4 && a.y <= lb.y + lb.height + 4 && Math.max(a.x, b.x) >= lb.x && Math.min(a.x, b.x) <= lb.x + lb.width;
      await page.getByRole('button', { name: 'Yakınlaştır' }).click(); await page.getByRole('button', { name: 'Yakınlaştır' }).click(); await page.waitForTimeout(250);
      const zoomed = await legendBox();
      await page.getByRole('button', { name: 'Devreyi ekrana sığdır' }).click(); await page.waitForTimeout(250);
      const back = await legendBox();
      check('kablo gerilimi kutusu: çekmece açık ve çalışırken RC dolmada toprağa ve alt kabloya binmiyor; yakınlaşınca tek satıra küçülüyor, Sığdır’la geri geliyor',
        lb !== null && lb.height > 60 && !covers && zoomed !== null && zoomed.height <= 40 && back !== null && back.height > 60,
        `kutu ${Math.round(lb?.width ?? 0)}×${Math.round(lb?.height ?? 0)} · alt kablo y ${Math.round(a.y)} · yakın ${Math.round(zoomed?.height ?? 0)} px`);
    }
    await drawer.getByRole('button', { name: 'Tabloya ekle' }).click(); await page.waitForTimeout(200);
    const [csv] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'CSV indir' }).click()]);
    const csvText = Buffer.concat(await (await csv.createReadStream()).toArray()).toString('utf8');
    const [png] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'PNG' }).click()]);
    check('analiz: "Tabloya ekle" imleçteki değerleri tabloya geçiriyor; CSV (noktalı virgül, ondalık virgül) ve PNG indiriliyor',
      /^grafik-verisi-.*\.csv$/.test(csv.suggestedFilename()) && csvText.startsWith('﻿t (s);V(C1) (V);I(R1) (A)') && /\r\n0,00\d+;/.test(csvText) && /^grafik-.*\.png$/.test(png.suggestedFilename()),
      `${csv.suggestedFilename()} · ${png.suggestedFilename()}`);
    await drawer.getByRole('tab', { name: 'Tablo' }).click(); await page.waitForTimeout(150);
    const tableText = (await drawer.getByRole('tabpanel').textContent()) ?? '';
    const sep = drawer.getByRole('separator', { name: 'Analiz çekmecesinin yüksekliği' });
    await sep.focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
    const taller = (await drawer.boundingBox())?.height ?? 0;
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre')).analysis ?? null);
    check('analiz: Tablo sekmesinde eklenen satırlar; tutamak (↑) çekmeceyi büyütüyor; izler ve tablo devreyle kaydediliyor',
      tableText.includes('V(C1)') && tableText.includes('imleç') && Math.abs(taller - 420) < 2 && saved?.traces?.length === 2 && saved?.rows?.length === 2, `${Math.round(taller)} px · ${saved?.traces?.length}/${saved?.rows?.length}`);
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
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(500);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await sheet.getByRole('button', { name: 'İz ekle' }).tap(); await page.waitForTimeout(200);
    const at = await screen(page, 28, -8);
    await page.touchscreen.tap(at.x, at.y); await page.waitForTimeout(250);
    await sheet.getByRole('button', { name: 'Toprağa göre ekle' }).tap(); await page.waitForTimeout(250);
    const chips = await sheet.locator('span.font-mono').allTextContents();
    const tabSizes = await sheet.getByRole('tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const small = await sheet.evaluate((root) => [...root.querySelectorAll('button, [role=tab]')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16), w: r.width, h: r.height }; }).filter((r) => r.w > 0 && (r.h < 43.5 || r.w < 35)).map((r) => `${r.n} ${Math.round(r.w)}×${Math.round(r.h)}`));
    const bottom = await sheet.getByRole('button', { name: 'CSV paylaş' }).boundingBox();
    check('analiz (telefon, N9): ⋯ → Analiz alt sayfası; dört sekme, + İz ile şemadan V(C1); hedefler ≥ 44 px; altta "Tabloya ekle" ve "CSV paylaş"; sayfa kaymıyor',
      chips.includes('V(C1)') && tabSizes.length === 4 && tabSizes.every((h) => h >= 44) && small.length === 0 && bottom !== null && bottom.y + bottom.height <= 844 && !(await pageScrolls(page)),
      small.join(', ') || chips.join(','));
    await sheet.getByRole('tab', { name: 'Tablo' }).tap(); await page.waitForTimeout(200);
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
    await page.getByRole('button').filter({ hasText: /BF245A: çıkış ve transfer/ }).first().click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(200);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    await drawer.getByRole('tab', { name: 'Eğri izleyici' }).click();
    const summary = drawer.getByText(/noktalık DC tarama$/);
    await summary.waitFor({ timeout: 30000 }).catch(() => {});
    const pill = ((await drawer.locator('p.rounded-full').textContent()) ?? '').replace(/\s+/g, ' ');
    const loadSwitch = drawer.getByRole('switch', { name: /Yük doğrusu ve Q noktası/ });
    const marks = await page.locator('svg.schematic text').allTextContents();
    const chips = await drawer.getByRole('button', { name: /basamağını kaldır$/ }).count();
    check('eğri izleyici (N3): BF245A çıkış ailesi Worker’da taranıyor (4 × 31); V_DS = 10 V’ta I_D 4,14 / 3,25 / 2,46 / 1,78 mA; R_D yokken yük doğrusu soluk; şemada "Taranan parça: J1"',
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
    await page.getByRole('button').filter({ hasText: /BC107 ile ortak emetörlü yükselteç/ }).first().click(); await page.waitForTimeout(500);
    await drawer.getByText(/noktalık DC tarama$/).waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const bjtSwitch = drawer.getByRole('switch', { name: /Yük doğrusu ve Q noktası/ });
    const qText = await drawer.getByRole('img', { name: /^Eğri izleyici: Q1/ }).locator('text', { hasText: /^Q$/ }).count();
    check('eğri izleyici: BC107 yükselteçte basamak I_B (µA), yük doğrusu R_C · 12 V ve Q noktası çiziliyor',
      !(await bjtSwitch.isDisabled()) && (await bjtSwitch.getAttribute('aria-checked')) === 'true' && ((await bjtSwitch.textContent()) ?? '').includes('RC · kaynak 12,0 V') && qText === 1 &&
      (await drawer.getByRole('button', { name: '10 µA basamağını kaldır' }).count()) === 1, ((await bjtSwitch.textContent()) ?? '').slice(0, 60));
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BF245A: çıkış ve transfer karakteristiği');
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await sheet.getByRole('tab', { name: 'Eğri' }).tap();
    await sheet.locator('p.rounded-full').waitFor({ timeout: 30000 }).catch(() => {});
    const pill = ((await sheet.locator('p.rounded-full').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
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
    await page.getByRole('button').filter({ hasText: /BC107 ile ortak emetörlü yükselteç/ }).first().click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Analiz', exact: true }).click(); await page.waitForTimeout(200);
    const drawer = page.getByRole('region', { name: 'Analiz' });
    await drawer.getByRole('tab', { name: 'Bode' }).click();
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
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
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
    await openExample(page, 'BC107 ile ortak emetörlü yükselteç');
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(300);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Analiz', exact: true }).tap(); await page.waitForTimeout(400);
    const sheet = page.getByRole('region', { name: 'Analiz' });
    await sheet.getByRole('tab', { name: 'Bode' }).tap();
    await sheet.getByText('✓ Ölçüm bitti').waitFor({ timeout: 60000 }).catch(() => {});
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
    await page.getByRole('button').filter({ hasText: /BC107 ile ortak emetörlü yükselteç/ }).first().click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Dosya|^BC107/ }).first().click(); await page.waitForTimeout(150);
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
    check('görev (hoca, N6): Dosya → "Görev oluştur"; ad, yönerge, değiştirilebilir parça çipleri, "Yeni parça eklenebilir", hedefler dört grupta (DC çalışma noktası, Bode, düğüm, parça); uyarı kutusu; #g= bağlantısı, önizleme yeni sekmede, görev dosyası',
      url.startsWith(URL0) && url.includes('#g=') && warning.includes('öğrenci görebilir') && warning.includes('notlu sınav için değil') && preview === '_blank' &&
      groups.join('|') === 'DC çalışma noktası|Bode|Düğüm gerilimi|Parça ölçümleri (canlı)' && nodeOptions.includes('V(Q1 kollektör)') && /^gorev-deney-7-.*\.json$/.test(taskFile.suggestedFilename()) && sizeText !== '' &&
      (await dlg.getByRole('alert').count()) === 0,
      `${url.length} karakter · ${sizeText} · ${taskFile.suggestedFilename()} · ${nodeOptions.join(', ')}`);
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
    const locks = await notebook(st).locator('[data-card]').filter({ has: st.locator('[title="kilitli"]') }).count();
    const canvasLocks = await st.locator('svg.schematic g[aria-hidden="true"] circle[r="7.5"]').count();
    check('görev (öğrenci, N5): defterin en üstünde görev kartı (0 / 3; adlar <sub> ile: VCE, fH; "not vermez"); "Görev kipi · yalnızca RB ve RC değişir"; defterde RB, RC kalemli, öbürleri kilitli; şemada kilit rozetleri',
      (await card.count()) === 1 && /V<sub[^>]*>CE<\/sub>/.test(cardHtml) && /f<sub[^>]*>H<\/sub>/.test(cardHtml) && !cardHtml.includes('V_') && !cardHtml.includes('f_') && cardHtml.includes('not vermez') &&
      chip === 'Görev kipi · yalnızca RB ve RC değişir' && pencil === 2 && locks >= 5 && canvasLocks >= 5 && (await card.getByLabel('3 hedefin 0 tanesi tuttu').count()) === 1,
      `${chip} · kalem ${pencil}, kilit ${locks}, şemada ${canvasLocks}`);
    // Kilitli Q1'in β'sı değişmiyor, bildirim çıkıyor.
    const q1Card = notebook(st).locator('[data-card]').filter({ hasText: 'Q1' }).first();
    await q1Card.click(); await st.waitForTimeout(300);
    const beta = q1Card.locator('input').first();
    await beta.fill('300').catch(() => {}); await beta.press('Enter').catch(() => {}); await st.waitForTimeout(400);
    const toast = (await st.getByText('Bu parça görevde kilitli: değiştirilemez.').count()) > 0;
    const q1 = await st.evaluate(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre')).parts.find((p) => p.label === 'Q1').props.beta);
    check('görev (öğrenci): kilitli parçanın değeri değiştirilemiyor (Q1 β = 200 kalıyor), "Bu parça görevde kilitli" bildirimi', q1 === 200 && toast, `β = ${q1}`);
    await st.keyboard.press('Escape');
    await st.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await st.waitForTimeout(1500);
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
    // Görev dosyası Dosya → JSON dosyası içe aktar ile açılıyor.
    await st.locator('input[type=file]').setInputFiles(taskPath); await st.waitForTimeout(600);
    check('görev: görev dosyası Dosya → JSON dosyası içe aktar ile açılınca görev kartı geliyor', (await st.getByRole('region', { name: /^Görev: Deney 7/ }).count()) === 1);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BC107 ile ortak emetörlü yükselteç');
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(400);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Dosya', exact: true }).tap(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^Görev oluştur/ }).tap(); await page.waitForTimeout(400);
    const dlg = page.getByRole('dialog', { name: 'Görev oluştur' });
    await dlg.getByRole('button', { name: 'RC', exact: true }).tap();
    await dlg.getByRole('button', { name: 'Hedef ekle' }).tap();
    const sel = dlg.getByRole('combobox', { name: 'Hedefin büyüklüğü' }).first();
    await sel.selectOption(await sel.locator('option', { hasText: 'Üst kesim fH' }).first().getAttribute('value'));
    const small = await dlg.evaluate((root) => [...root.querySelectorAll('button, select, input, textarea, a')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18), h: r.height, fs: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName }; })
      .filter((r) => r.h > 0 && (r.h < 43.5 || (['INPUT', 'SELECT', 'TEXTAREA'].includes(r.tag) && r.fs < 16))).map((r) => `${r.n} ${Math.round(r.h)}/${r.fs}`));
    const url = await dlg.getByRole('textbox', { name: 'Görev bağlantısı' }).inputValue();
    check('görev (telefon, N6): ⋯ → Dosya → Görev oluştur; hedefler ≥ 44 px, yazı alanları 16 px; sayfa kaymıyor', small.length === 0 && !(await pageScrolls(page)), small.join(', '));
    // Yalnız # değişirse tarayıcı sayfayı yeniden yüklemez: önce boş sayfa.
    await page.goto('about:blank'); await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const card = page.getByRole('region', { name: /^Görev:/ });
    const bodeBox = await card.getByRole('button', { name: 'Bode ile ölç' }).boundingBox({ timeout: 5000 }).catch(() => null);
    check('görev (telefon, N5): görev kartı defterin en üstünde; "Bode ile ölç" ≥ 44 px; yeni parça kapalıyken Kablo bağla ve Parça ekle yok; sayfa kaymıyor',
      (await card.count()) === 1 && bodeBox !== null && bodeBox.height >= 44 && (await page.getByRole('button', { name: 'Kablo bağla' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Parça ekle' }).count()) === 0 && !(await pageScrolls(page)),
      `Bode ile ölç ${Math.round(bodeBox?.height ?? 0)} px`);
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
    await page.getByRole('button').filter({ hasText: /BC107 ile ortak emetörlü yükselteç/ }).first().click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Dosya|^BC107/ }).first().click(); await page.waitForTimeout(150);
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
    await drawer.getByRole('tab', { name: 'Bode' }).click(); await st.waitForTimeout(300);
    const blockedBode = (await drawer.getByText('Önce görev kartında tahminlerini yaz ve kaydet.').count()) === 1 && (await drawer.getByRole('button', { name: 'Yeniden ölç' }).count()) === 0;
    check('tahmin (öğrenci, B1): kart "Önce tahmin et", her hedefe tahmin alanı, ölçülen gizli; kaydetmeden Oynat ve Analiz → Bode kapalı (nedeni yazıyor); "Tahminleri kaydet" hepsi yazılınca etkin',
      before.startsWith('Önce tahmin et') && (await inputs.count()) === 2 && !/5,9\d V/.test(before) && blockedPlay && blockedBode && !(await lock.isEnabled()),
      before.slice(0, 60));
    await inputs.nth(0).fill('6 V'); await inputs.nth(0).blur();
    await inputs.nth(1).fill('180'); await inputs.nth(1).blur();
    await st.waitForTimeout(150);
    const enabled = await lock.isEnabled();
    await lock.click(); await st.waitForTimeout(300);
    await st.getByRole('button', { name: 'Oynat', exact: true }).first().click(); await st.waitForTimeout(1500);
    await drawer.getByText('✓ Ölçüm bitti').waitFor({ timeout: 60000 }).catch(() => {});
    await st.waitForTimeout(400);
    const rows = (await card.locator('li').allTextContents()).map((r) => r.replace(/\s+/g, ' '));
    check('tahmin (öğrenci): kaydedince Oynat ve Bode çalışıyor; satırda "Tahmin 6 V · fark %0,2" ve ölçülen 5,99 V, kazançta "Tahmin 180 · fark %13" ve 205,8',
      enabled && (await st.getByRole('button', { name: 'Duraklat' }).count()) === 1 && rows.some((r) => /Tahmin 6 V · fark %0,\d/.test(r) && /5,9\d V/.test(r)) && rows.some((r) => r.includes('Tahmin 180 · fark %1') && /20[4-7],\d/.test(r)),
      rows.map((r) => r.slice(-40)).join(' | '));
    const [sub] = await Promise.all([st.waitForEvent('download'), card.getByRole('button', { name: 'Teslim dosyası (.json)' }).click()]);
    const subJson = JSON.parse(Buffer.concat(await (await sub.createReadStream()).toArray()).toString('utf8'));
    await st.reload({ waitUntil: 'networkidle' }); await st.waitForTimeout(600);
    const kept = ((await st.getByRole('region', { name: /^Görev:/ }).textContent()) ?? '').includes('Tahmin 6 V');
    check('tahmin (öğrenci): teslim dosyasında her hedefin tahmini; sayfa yenilenince tahminler kaydedilmiş hâliyle duruyor',
      subJson.teslim.hedefler.map((h) => h.tahmin).join(',') === '6,180' && kept);
    await ctx.close();
  }
  {
    const { page } = await phone();
    await openExample(page, 'BC107 ile ortak emetörlü yükselteç');
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(400);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Dosya', exact: true }).tap(); await page.waitForTimeout(400);
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
  // --- Gömme (C4, C5, C8; N7, N8): Paylaş → Sayfaya göm, /embed/ sade görünüm, salt okunur, Moodle ------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole('button').filter({ hasText: /RC dolma/ }).first().click(); await page.waitForTimeout(500);
    const savedBefore = await page.evaluate(() => localStorage.getItem('devre-simulatoru:devre'));
    await page.getByRole('button', { name: /^Dosya|^RC dolma/ }).first().click(); await page.waitForTimeout(150);
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
    await page.getByRole('button', { name: /^Daha fazla/ }).tap(); await page.waitForTimeout(400);
    await page.getByRole('dialog', { name: 'Daha fazla' }).getByRole('button', { name: 'Dosya', exact: true }).tap(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Sayfaya göm' }).tap(); await page.waitForTimeout(400);
    const dlg = page.getByRole('dialog', { name: 'Paylaş' });
    const small = await dlg.evaluate((root) => [...root.querySelectorAll('button, a, input, textarea, [role=tab]')].map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16), h: r.height, fs: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName }; })
      .filter((r) => r.h > 0 && (r.h < 43.5 || (['INPUT', 'TEXTAREA'].includes(r.tag) && r.fs < 16))).map((r) => `${r.n} ${Math.round(r.h)}/${r.fs}`));
    check('gömme (telefon): ⋯ → Dosya → Sayfaya göm, Paylaş penceresi Sayfaya göm sekmesinde; hedefler ≥ 44 px, yazı alanları 16 px; sayfa kaymıyor',
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
    await page.getByRole('button').filter({ hasText: '555 ile yanıp sönen LED (astabil)' }).first().click(); await page.waitForTimeout(500);
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
    await page.getByRole('button', { name: '3B', exact: true }).click();
    await page.waitForFunction(() => window.__tezgah !== undefined, null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800);
    const bench = await readings();
    await sim.getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(900);
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
    const button = page.getByRole('button', { name: /^Tema:/ });
    await button.click(); await page.waitForTimeout(150);
    const items = await page.getByRole('menuitemradio').count();
    await page.getByRole('menuitemradio', { name: /^Açık/ }).click(); await page.waitForTimeout(200);
    const light = (await themeOf()) === 'light' && (await bg()) === 'rgb(238, 240, 243)';
    await page.reload({ waitUntil: 'networkidle' });
    check('tema: üst çubuktaki düğmeden Açık seçilince açık; sistem koyu olsa da yeniden açılışta açık kalıyor', items === 3 && light && (await themeOf()) === 'light', `${items} seçenek`);
    await page.getByRole('button', { name: /^Tema:/ }).click(); await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: /^Koyu/ }).click(); await page.waitForTimeout(200);
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
    await page.getByRole('button', { name: 'Yardım', exact: true }).click(); await page.waitForTimeout(200);
    const help = page.getByRole('dialog', { name: 'Yardım' });
    const tabs = await help.getByRole('tab').count();
    await help.getByRole('tab', { name: 'Simgeler ve renkler' }).click();
    const symbols = (await help.getByRole('tabpanel').textContent()) ?? '';
    check('Yardım penceresi dört sekmeli; simgeler sekmesi açılıyor', tabs === 4 && symbols.includes('Kablo gerilimi'), `${tabs} sekme`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Gerilim bölücü', exact: true }).click(); await page.waitForTimeout(500);
    const undo = page.getByRole('status').filter({ hasText: 'Örnek yüklendi.' }).getByRole('button', { name: 'Geri al' });
    const hadUndo = (await undo.count()) === 1;
    if (hadUndo) await undo.click();
    await page.waitForTimeout(300);
    check('örnek yüklenince bildirimde Geri al; dokununca önceki devre geri geliyor', hadUndo && (await doc(page)).parts.length === 0);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Gerilim bölücü', exact: true }).click(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Ayarlar', exact: true }).click(); await page.waitForTimeout(150);
    await page.getByRole('switch', { name: /Düğüm gerilimlerini yaz/ }).click(); await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).click(); await page.waitForTimeout(600);
    const labels = await page.locator('svg.schematic text', { hasText: /^4,50 V$/ }).count();
    check('Ayarlar → Düğüm gerilimlerini yaz: düğümlerin yanında gerilim etiketi', labels >= 1, `${labels} etiket`);
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
    await page.getByRole('button', { name: /Daha fazla/ }).tap(); await page.waitForTimeout(300);
    const more = (await page.getByRole('dialog', { name: 'Daha fazla' }).textContent()) ?? '';
    check('telefonda ⋯: Örnekler, Dosya, Paylaş, Sığdır; Yardım sekmesinde dokunma hareketleri (P14)', more.includes('Uca dokun') && more.includes('Örnekler') && more.includes('Dosya'), more.slice(0, 40));
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
    // v3: defterin sonundaki Parça ekle satırı; yaz, oklarla seç, Enter ekler.
    const addRow = page.getByRole('combobox', { name: /Parça ekle/ });
    await addRow.focus(); await page.keyboard.type('diyot'); await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    const pick = (await page.getByRole('option', { selected: true }).textContent()) ?? '';
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    check('masaüstü (v3): Parça ekle satırında yazıp okla seçilen parça Enter’la ekleniyor', pick.startsWith('Zener diyot') && (await doc(page)).parts.some((p) => p.type === 'zener'), pick.slice(0, 30));
    await page.getByRole('button', { name: 'Örnekler', exact: true }).focus();
    await page.keyboard.press('Space'); await page.waitForTimeout(300);
    const examplesOpen = (await page.getByRole('dialog', { name: 'Örnek devreler' }).count()) === 1;
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
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check('? Yardım’ı açıyor, Esc kapatıyor', helpOpen && (await page.getByRole('dialog', { name: 'Yardım' }).count()) === 0);
    await ctx.close();
  }

  // --- Masaüstü kabuğu: kütüphane bilgi alanı, ipucu şeridi, hız penceresi ---------------
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const dp = await desk.newPage();
  dp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await dp.goto(URL0, { waitUntil: 'networkidle' });
  const canvas = await dp.locator('svg.schematic').boundingBox();
  // v3: sol kütüphane yok; "Bütün parçalara göz at (35)" kategorili ızgarayı açar, tıklanan parça eklenir.
  await notebook(dp).getByRole('button', { name: /Bütün parçalara göz at \(35\)/ }).click(); await dp.waitForTimeout(200);
  const grid = dp.getByRole('dialog', { name: 'Bütün parçalar' });
  const tiles = await grid.locator('button[data-part]').count();
  await grid.getByRole('button', { name: 'Kondansatör', exact: true }).click(); await dp.waitForTimeout(300);
  check('masaüstü (v3): kütüphane yok; "Bütün parçalar" 35 parçayı gösteriyor, tıklanan parça ekleniyor, pencere kapanıyor',
    (await dp.getByPlaceholder(/Parça ara/).count()) === 0 && tiles === 35 && (await doc(dp)).parts.some((p) => p.type === 'capacitor') && (await grid.count()) === 0, `${tiles} parça`);
  await dp.getByRole('button', { name: 'Geri al', exact: true }).click(); await dp.waitForTimeout(150);
  // v3: alt simülasyon çubuğu ve ipucu şeridi yok; tuval alta kadar, görünüm düğmeleri sağ altında.
  const view = await dp.getByRole('group', { name: 'Görünüm' }).boundingBox();
  check('masaüstü (v3): alt çubuk yok, tuval alta iniyor; görünüm düğmeleri tuvalin sağ altında',
    canvas.y + canvas.height >= 899 && view !== null && view.x + view.width <= canvas.x + canvas.width && view.y + view.height >= canvas.y + canvas.height - 24,
    view ? `tuval altı ${Math.round(canvas.y + canvas.height)} · düğmeler ${Math.round(view.x)},${Math.round(view.y)}` : 'yok');
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
  await dp.getByRole('button', { name: 'LED ve ön direnç', exact: true }).click(); await dp.waitForTimeout(500);
  const exampleCard = notebook(dp).getByRole('region', { name: /^Örnek ·/ });
  const folded = (await exampleCard.textContent()) ?? '';
  await exampleCard.getByRole('button').first().click(); await dp.waitForTimeout(150);
  const exampleText = (await exampleCard.textContent()) ?? '';
  check('masaüstü (v3): örnek kartı katlı ("Örnek · grup" ve kısa başlık); açılınca "Ne işe yarar?" ve "Günlük hayatta", soru yok', folded.includes('Örnek · Temel devreler') && !folded.includes('Ne işe yarar?') && exampleText.includes('Ne işe yarar?') && exampleText.includes('Günlük hayatta') && !exampleText.includes('Tahmin'), folded.slice(0, 60));
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
    await ap.getByRole('button', { name: 'Arduino: yanıp sönen LED', exact: true }).click(); await ap.waitForTimeout(500);
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
  await rp.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }).click(); await rp.waitForTimeout(500);
  const rackCanvas = await rp.locator('svg.schematic').boundingBox();
  const fgClosed = (await notebook(rp).getByRole('button', { name: /^FG1 ·/ }).textContent()) ?? '';
  check('masaüstü (v3): cihaz rafı yok, tuval alta kadar; kapalı üreteç kartında ayar özeti',
    (await rp.getByRole('region', { name: 'Cihaz rafı' }).count()) === 0 && rackCanvas.y + rackCanvas.height >= 899 && fgClosed.includes('Sinüs · 1 kHz · 10 Vpp'), fgClosed.slice(0, 60));
  await notebook(rp).getByRole('button', { name: /^OSC1 ·/ }).click(); await rp.waitForTimeout(200);
  const screenBox = await notebook(rp).getByRole('img', { name: /^Osiloskop ekranı/ }).first().boundingBox();
  const voltsBefore = (await part(rp, 'OSC1')).props.voltsPerDivA ?? 2;
  await notebook(rp).getByRole('button', { name: 'A volt/bölme artır' }).click();
  const voltsAfter = (await part(rp, 'OSC1')).props.voltsPerDivA;
  check('masaüstü (v3): osiloskop kartında kart genişliğinde ekran ve kademeli ayar', voltsAfter > voltsBefore && screenBox !== null && screenBox.width >= 400, `${voltsBefore} → ${voltsAfter}; ekran ${Math.round(screenBox?.width ?? 0)} px`);
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
  const fgOuts = [];
  for (let i = 0; i < 8; i++) {
    fgOuts.push(((await fgRegion.textContent()) ?? '').match(/Çıkış \(OUT − COM\) ([^·]+)·/)?.[1]?.trim() ?? '');
    await rp.waitForTimeout(100);
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
      await rp.waitForTimeout(100);
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
  await ep.getByRole('button', { name: 'LED ve ön direnç', exact: true }).click(); await ep.waitForTimeout(400);
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
  await tp.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }).click(); await tp.waitForTimeout(400);
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
    await notebook(bp).getByRole('combobox', { name: /Parça ekle/ }).fill('bobin'); await bp.waitForTimeout(150);
    const inLibrary = await bp.getByRole('option', { name: /^Bobin/ }).count();
    await notebook(bp).getByRole('combobox', { name: /Parça ekle/ }).fill('');
    await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
    await bp.getByRole('button', { name: 'RL devresi', exact: true }).click(); await bp.waitForTimeout(400);
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

  // --- Sıkışık masaüstü (1100 px): defter 400 px, parça defterden eklenir (v3) ---------------
  const compact = await browser.newContext({ viewport: { width: 1100, height: 760 }, locale: 'tr-TR' });
  const cp = await compact.newPage();
  cp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await cp.goto(URL0, { waitUntil: 'networkidle' });
  const nbBox = await notebook(cp).boundingBox();
  const addRowCp = notebook(cp).getByRole('combobox', { name: /Parça ekle/ });
  await addRowCp.fill('kondansatör'); await addRowCp.press('Enter');
  // Otomatik kayıt 0,4 s gecikmeli; uzun çalıştırmada yük altında daha geç düşebilir (3 s'ye kadar beklenir).
  const placed = await cp.waitForFunction(() => JSON.parse(localStorage.getItem('devre-simulatoru:devre') ?? 'null')?.parts?.some((p) => p.type === 'capacitor'), null, { timeout: 3000 }).then(() => true, () => false);
  check('1100 px (v3): defter 400 px; Parça ekle satırından eklenen parça şemaya geliyor', nbBox !== null && Math.round(nbBox.width) === 400 && placed, nbBox ? `${Math.round(nbBox.width)} px` : 'yok');
  await compact.close();

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
    await fp.getByRole('button', { name: 'Tam ekran', exact: true }).click(); await fp.waitForTimeout(500);
    const w1 = await canvasWidth();
    check('masaüstü: Tam ekran tarayıcıyı tam ekrana alıyor; defter gizleniyor', (await fsElement()) === 'HTML' && (await inspectorShown()) === 0 && w1 > 1400, `tuval ${Math.round(w0)} → ${Math.round(w1)} px`);
    await fp.getByRole('button', { name: 'Defter', exact: true }).click(); await fp.waitForTimeout(300);
    const pressed = await fp.getByRole('button', { name: 'Defter', exact: true }).getAttribute('aria-pressed');
    check('masaüstü: tam ekranda üst çubuğun sağındaki Defter düğmesi defteri açıyor', (await inspectorShown()) === 1 && pressed === 'true' && (await fsElement()) === 'HTML');
    await fp.evaluate(() => document.exitFullscreen()); await fp.waitForTimeout(400);
    check('masaüstü: tarayıcının tam ekranından çıkınca (Esc) kip kapanıyor, defter yerinde', (await fp.getByRole('button', { name: 'Tam ekran', exact: true }).count()) === 1 && (await fp.getByRole('button', { name: 'Defter', exact: true }).count()) === 0 && (await inspectorShown()) === 1);
    await fsCtx.close();

    const tCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const tp = await tCtx.newPage();
    tp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await tp.goto(URL0, { waitUntil: 'networkidle' });
    await tp.getByRole('button', { name: 'Tam ekran', exact: true }).tap(); await tp.waitForTimeout(500);
    const hidden = (await notebook(tp).count()) === 0;
    const toggle = tp.getByRole('button', { name: 'Defter', exact: true });
    const toggleBox = await toggle.boundingBox();
    await toggle.tap(); await tp.waitForTimeout(300);
    const back = (await notebook(tp).count()) === 1;
    await tp.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).tap(); await tp.waitForTimeout(400);
    check('tablet: Tam ekran defteri gizliyor, 44 px Defter düğmesiyle açılıyor, çıkınca yerinde', hidden && back && toggleBox !== null && Math.round(toggleBox.height) === 44 && (await notebook(tp).count()) === 1 && (await tp.evaluate(() => document.fullscreenElement)) === null);
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
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(problems.length ? problems.join('\n') : 'konsol hatası yok');
console.log(failed ? `\n${failed} madde KALDI.` : `\n${results.length} maddenin hepsi geçti.`);
process.exit(failed || problems.length ? 1 : 0);
