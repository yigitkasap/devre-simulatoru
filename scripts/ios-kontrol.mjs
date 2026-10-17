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
/** Telefonda üst şeritteki ad → Dosya → Örnekler; arayıp örneğe dokunarak açar. */
async function openExample(page, name) {
  await page.getByRole('button', { name: /^Dosya ve örnekler/ }).tap(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
  await page.getByRole('searchbox', { name: 'Örnek ara' }).fill(name); await page.waitForTimeout(200);
  await page.getByRole('button', { name, exact: true }).tap(); await page.waitForTimeout(600);
}
/** Üst şeritteki kip rozeti (Kur, Bağla, Ölç, Duraklatıldı). */
const mode = async (page) => (await page.locator('header [role=status], aside [role=status]').first().textContent()) ?? '';
const selectedCount = (page) => page.locator('svg.schematic rect[stroke-dasharray="4 3"]').count();
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
    await page.getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Direnç ekle' }).tap(); await page.waitForTimeout(500);
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
    check('Parça sayfasında "Zincirle ekle" yeni parçayı kabloyla bağlıyor', banner.includes('R1’in 1. ucuna bağlanır') && chained.wires.length === 1 && chained.parts.length === 2, banner.slice(0, 60));
    await page.context().close();
  }

  // --- Parça sayfası: liste kayar, sayfa kaymaz, arama 16 px -------------------------
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const { page, cdp } = await phone(w, h);
    await page.getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(400);
    const grid = page.getByRole('dialog', { name: 'Parça ekle' }).locator('.overflow-y-auto').first();
    const box = await grid.boundingBox();
    await drag(page, cdp, { x: box.x + box.width / 2, y: box.y + box.height - 12 }, { x: box.x + box.width / 2, y: box.y + 4 });
    await page.waitForTimeout(300);
    const top = await grid.evaluate((el) => el.scrollTop);
    const pageTop = await page.evaluate(() => document.scrollingElement.scrollTop);
    check(`parça listesi parmakla kayıyor, sayfa kaymıyor (${w}x${h}, liste ${Math.round(box.height)} px)`, top > 0 && pageTop === 0, `scrollTop ${top}`);
    const fs = await page.getByRole('searchbox', { name: 'Parça ara' }).evaluate((el) => getComputedStyle(el).fontSize);
    check(`parça arama alanı 16 px (${w}x${h})`, fs === '16px', fs);
    if (w === 390) await shot(page, 'ios-1-parca.png');
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
    await page.getByRole('button', { name: /^Dosya ve örnekler/ }).tap(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
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
    const example = (await page.getByRole('region', { name: 'Örnek' }).textContent().catch(() => '')) ?? '';
    check(`son gruptaki son örneğe ulaşılıp açılıyor; tahmin sorusu alttaki sayfada (${w}x${h})`, (await doc(page)).parts.some((p) => p.type === 'tank') && (await doc(page)).parts.some((p) => p.label === 'Q5') && example.includes('Tahmin et'));
    await page.context().close();
  }

  // --- Parça ekle sayfası: daha açık başlar, başlıktan çekilerek tam boy olur, aşağı çekince kapanır --
  {
    const { page, cdp } = await phone();
    const examples = page.getByRole('button', { name: 'Örneklerden başla' });
    const before = await examples.boundingBox();
    await page.getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(500);
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
    await page.waitForTimeout(300);
    const full = await sheet.boundingBox();
    const canvas = await page.locator('svg.schematic').boundingBox();
    check('tam boy sayfada boş tuval ipucu gizli (şerit sıkışmıyor)', !(await examples.isVisible()));
    check('başlıktan yukarı çekince sayfa tam boy; tuvalde devre şeridi kalıyor', full !== null && half !== null && full.height > half.height + 60 && canvas !== null && canvas.height >= 100, `${Math.round(full?.height ?? 0)} px, tuval ${Math.round(canvas?.height ?? 0)} px`);
    const handle = await sheet.getByRole('button', { name: /^Sayfanın boyunu değiştir/ }).boundingBox();
    await drag(page, cdp, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + handle.width / 2, y: handle.y + 420 });
    await page.waitForTimeout(300);
    check('tutamaçtan aşağı çekince sayfa kapanıyor', (await sheet.count()) === 0);
    await page.context().close();
  }

  // --- Kur kipi: seç, taşı, menü, kaydır, Bağla, değer sayfası, yakınlaştırma -----------
  {
    const { page, cdp } = await phone();
    await page.getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Direnç ekle' }).tap(); await page.waitForTimeout(500);
    await page.getByRole('dialog', { name: 'Parça ekle' }).getByRole('button', { name: 'Kapat', exact: true }).tap(); await page.waitForTimeout(400);
    const r1 = await part(page, 'R1');
    check('dokunarak parça eklendi', Boolean(r1));
    let s = await screen(page, r1.x, r1.y);
    await tap(page, cdp, { x: s.x + 30, y: s.y + 60 }); // boşluk: seçimi kaldır
    await tap(page, cdp, s);
    const sheetOpen = await page.getByRole('region', { name: 'R1 · Direnç' }).count();
    const bar = (await page.getByRole('navigation', { name: 'Eylemler' }).textContent()) ?? '';
    check('parçaya dokununca seçiliyor; alt çubuk ve parça sayfası açılıyor', (await selectedCount(page)) > 0 && sheetOpen === 1 && bar.includes('Döndür') && bar.includes('Sil'), bar.slice(0, 40));
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
    await shot(page, 'ios-2-tasindi.png');
    s = await screen(page, r1d.x, r1d.y);
    await tap(page, cdp, s, 750);
    const magnifier = await page.locator('use[href^="#scene-"]').count();
    check('kıpırdamadan uzun basınca menü ve büyüteç açılıyor', (await page.getByRole('menu').count()) === 1 && magnifier === 1);
    await shot(page, 'ios-3-menu.png');
    // Boş nokta: tuvalin sol üst köşesine yakın (alt sayfa açıkken tuval kısalır).
    const area = await page.locator('svg.schematic').boundingBox();
    const empty = { x: area.x + 40, y: area.y + 40 };
    const hitEmpty = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class') ?? '', [empty.x, empty.y]);
    await tap(page, cdp, empty);
    const selected = await selectedCount(page);
    check('boşluğa dokununca menü, büyüteç ve seçim kalkıyor', (await page.getByRole('menu').count()) === 0 && selected === 0 && (await page.locator('use[href^="#scene-"]').count()) === 0, `seçim çerçevesi ${selected}; dokunulan ${hitEmpty}`);
    const viewBefore = await screen(page, 0, 0);
    await drag(page, cdp, empty, { x: empty.x + 50, y: empty.y + 70 });
    const viewAfter = await screen(page, 0, 0);
    check('boşlukta tek parmakla tuval kaydırılıyor', Math.abs(viewAfter.x - viewBefore.x - 50) < 2 && Math.abs(viewAfter.y - viewBefore.y - 70) < 2);
    // Uca dokununca Bağla kipi; ikinci uca dokununca kablo; Bitti ile Kur'a dönüş.
    await tap(page, cdp, await screen(page, r1d.x - 4, r1d.y));
    const connectBar = (await page.getByRole('navigation', { name: 'Eylemler' }).textContent()) ?? '';
    check('uca dokununca Bağla kipi başlıyor (uçlar büyük, alt çubukta durum)', (await mode(page)).includes('Bağla') && connectBar.includes('İkinci uca dokun') && connectBar.includes('R1 · 1. uç'), connectBar.slice(0, 50));
    await shot(page, 'ios-4-bagla.png');
    await tap(page, cdp, await screen(page, r1d.x + 4, r1d.y));
    const wired = await doc(page);
    check('ikinci uca dokununca kablo çiziliyor', wired.wires.length === 1, `${wired.wires.length} kablo`);
    await page.getByRole('button', { name: 'Bitti' }).tap(); await page.waitForTimeout(200);
    check('Bitti ile Kur kipine dönülüyor', (await mode(page)).includes('Kur'));
    await page.getByRole('button', { name: 'Geri al' }).tap(); await page.waitForTimeout(200);
    check('Geri al son kabloyu siliyor', (await doc(page)).wires.length === 0);
    s = await screen(page, r1d.x, r1d.y);
    await tap(page, cdp, s); await page.waitForTimeout(80); await tap(page, cdp, s); await page.waitForTimeout(300);
    const field = page.getByLabel('Direnç', { exact: true });
    const fontSize = await field.evaluate((el) => getComputedStyle(el).fontSize).catch(() => '');
    check('çift dokunuşla değer sayfası açılıyor; giriş yazısı en az 16 px (iOS yakınlaşmasın)', parseFloat(fontSize) >= 16, fontSize);
    await page.getByRole('button', { name: 'Direnç: bir adım artır' }).tap(); await page.waitForTimeout(200);
    check('− / + E12 dizisinde bir adım değiştiriyor (1 kΩ → 1,2 kΩ)', (await part(page, 'R1')).props.resistance === 1200);
    // Parmaklar parçanın iki yanında: yakınlaşma o noktanın çevresinde olur, parça ekranda kalır.
    const canvasBox = await page.locator('svg.schematic').boundingBox();
    const c = await screen(page, r1d.x, r1d.y);
    const cx = Math.min(Math.max(c.x, canvasBox.x + 110), canvasBox.x + canvasBox.width - 110);
    const cy = Math.min(Math.max(c.y, canvasBox.y + 60), canvasBox.y + canvasBox.height - 60);
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
    check('seçiciden parça seçiliyor', (await page.getByRole('region', { name: 'R2 · Direnç' }).count()) === 1);
    await ctx.close();
  }

  // --- Ölç kipi: kilit, inceleme, anahtar, canlı değer, durdurma sorusu --------------------
  {
    const { page, cdp } = await phone();
    await openExample(page, 'RC dolma');
    await page.getByRole('button', { name: 'Oynat' }).last().tap(); await page.waitForTimeout(600);
    check('Oynat’tan sonra Ölç kipi (üst şeritte rozet ve zaman)', /Ölç\s*[\d,]+/.test(await mode(page)), await mode(page));
    const r1 = await part(page, 'R1');
    let s = await screen(page, r1.x, r1.y);
    await tap(page, cdp, s); await page.waitForTimeout(300);
    const measure = (await page.getByRole('region', { name: 'Ölçümler' }).textContent().catch(() => '')) ?? '';
    check('Ölç’te parçaya dokununca ölçümleri alttaki sayfada', measure.includes('R1') && measure.includes('canlı') && measure.includes('Gerilim'), measure.slice(0, 50));
    await drag(page, cdp, s, { x: s.x + 50, y: s.y + 40 }, 250);
    const r1b = await part(page, 'R1');
    check('Ölç’te parça sürüklenince taşınmıyor (yapı kilitli)', r1b.x === r1.x && r1b.y === r1.y);
    const s1 = await part(page, 'S1');
    await tap(page, cdp, await screen(page, s1.x, s1.y)); await page.waitForTimeout(300);
    check('Ölç’te anahtara dokununca açılıp kapanıyor', (await part(page, 'S1')).props.closed === true);
    await tap(page, cdp, await screen(page, r1.x, r1.y)); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Direnç: bir adım artır' }).tap(); await page.waitForTimeout(300);
    check('Ölç’te − / + değeri canlı değiştiriyor, simülasyon durmuyor', (await part(page, 'R1')).props.resistance === 1200 && (await mode(page)).includes('Ölç'));
    await shot(page, 'ios-5-olc.png');
    s = await screen(page, r1.x, r1.y);
    await tap(page, cdp, s, 750);
    const ask = page.getByRole('alertdialog', { name: 'Düzenlemek için durdurulsun mu?' });
    check('Ölç’te basılı tutunca "Düzenlemek için durdurulsun mu?" soruluyor', (await ask.count()) === 1);
    await ask.getByRole('button', { name: 'Durdur ve düzenle' }).tap(); await page.waitForTimeout(300);
    check('"Durdur ve düzenle" Kur kipine döndürüyor', (await mode(page)).includes('Kur'));
    await page.context().close();
  }

  // --- Cihazlar sayfası (osiloskop) -------------------------------------------------------
  {
    const { page: sp, cdp: scdp } = await phone();
    await openExample(sp, 'Yarım dalga doğrultmaç');
    await sp.getByRole('button', { name: 'Oynat' }).last().tap(); await sp.waitForTimeout(300);
    await sp.getByRole('button', { name: 'Cihazlar' }).tap(); await sp.waitForTimeout(1200);
    const devices = sp.getByRole('region', { name: 'Cihazlar' });
    const text = (await devices.textContent().catch(() => '')) ?? '';
    check('Cihazlar sayfası tam boy açılıyor; ekran ve ölçümler görünüyor', /Tepe-tepe \d+,\d V/.test(text), text.slice(0, 50));
    const before = (await part(sp, 'OSC1')).props.voltsPerDivB ?? 5;
    await sp.getByRole('button', { name: 'B volt/bölme artır' }).tap(); await sp.waitForTimeout(200);
    const after = (await part(sp, 'OSC1')).props.voltsPerDivB;
    check('sayfadan ayar değişince parçaya kaydediliyor', after !== before, `${before} → ${after}`);
    await sp.getByRole('button', { name: 'Oto' }).tap(); await sp.waitForTimeout(200);
    const auto = (await part(sp, 'OSC1')).props;
    check('Oto ayar 5 ms/bölme ve 5 V/bölme seçiyor', auto.timePerDiv === 0.005 && auto.voltsPerDivA === 5, `${auto.timePerDiv} s, ${auto.voltsPerDivA} V`);
    const body = devices.locator('.overflow-y-auto').first();
    const box = await body.boundingBox();
    await drag(sp, scdp, { x: box.x + 30, y: box.y + box.height - 20 }, { x: box.x + 30, y: box.y + 20 });
    await sp.waitForTimeout(300);
    check('Cihazlar sayfası kendi içinde kayıyor', (await body.evaluate((el) => el.scrollTop)) > 0);
    await shot(sp, 'ios-6-cihazlar.png');
    await sp.waitForTimeout(800);
    const jack = sp.getByRole('button', { name: 'OSC1 A ucunu tuvalde göster' });
    await jack.scrollIntoViewIfNeeded(); await jack.tap(); await sp.waitForTimeout(300);
    const height = (await devices.boundingBox())?.height ?? 0;
    check('jaka dokununca sayfa yarıya iniyor ve uç tuvalde yanıp sönüyor', height < 844 * 0.55 && (await sp.locator('svg.schematic circle.alarm-blink').count()) > 0, `sayfa ${Math.round(height)} px`);
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
    await page.getByRole('button', { name: 'Oynat' }).last().tap(); await page.waitForTimeout(400);
    const zeroMark = page.getByRole('button', { name: /^Sıfır noktası \(0 V\)/ });
    const zeroBox = await zeroMark.boundingBox();
    check('telefonda toprak yokken simülasyon başlıyor (Ölç); sıfır noktasında 44 px "0 V" işareti', (await mode(page)).includes('Ölç') && zeroBox !== null && zeroBox.width >= 43.5 && zeroBox.height >= 43.5, await mode(page));
    await zeroMark.tap(); await page.waitForTimeout(200);
    const zeroTip = (await page.getByRole('tooltip').textContent()) ?? '';
    check('telefonda "0 V" işaretine dokununca açıklama çıkıyor', zeroTip.includes('Devrede toprak yok'), zeroTip.slice(0, 40));
    await page.getByRole('button', { name: /^Dosya ve örnekler/ }).tap(); await page.waitForTimeout(300);
    const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('Dosya sayfası açıkken tuvalin touch-action değeri none değil', touchAction !== 'none', touchAction);
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
    const before = await page.locator('svg.schematic g.earth-line path').count();
    await page.getByRole('button', { name: 'Oynat' }).last().tap(); await page.waitForTimeout(800);
    const dots = await page.locator('svg.schematic path[stroke-dasharray^="0 "]').count();
    const label = await page.locator('svg.schematic g.earth-line text', { hasText: 'toprak hattı' }).count();
    check('telefonda iki toprak sembolü arasında kesikli toprak hattı, çalışırken üstünde akım noktaları', before === 1 && label === 1 && dots >= 2 && (await mode(page)).includes('Ölç'), `${before} hat, ${label} etiket, ${dots} nokta yolu`);
    await ctx.close();
  }

  // --- Yatay telefon (L01, L02) ----------------------------------------------------------
  {
    const { page, cdp } = await phone(844, 390);
    const strip = await page.locator('header').count();
    const rail = await page.getByRole('navigation', { name: 'Eylemler' }).boundingBox();
    const side = await page.locator('aside').boundingBox();
    check('yatay telefonda üst şerit yok; sağda yan panel ve dikey çubuk', strip === 0 && rail !== null && rail.width <= 80 && rail.height > 300 && side !== null && Math.round(side.width) === 280, rail ? `çubuk ${Math.round(rail.width)}×${Math.round(rail.height)}` : 'çubuk yok');
    await openExample(page, 'LED ve ön direnç');
    await page.getByRole('navigation', { name: 'Eylemler' }).getByRole('button', { name: 'Oynat' }).tap(); await page.waitForTimeout(600);
    const r1 = await part(page, 'R1');
    await tap(page, cdp, await screen(page, r1.x, r1.y)); await page.waitForTimeout(300);
    const measure = (await page.getByRole('region', { name: 'Ölçümler' }).textContent().catch(() => '')) ?? '';
    check('yatayda parçaya dokununca ölçümler yan panelde', measure.includes('R1') && measure.includes('Gerilim') && (await mode(page)).includes('Ölç'), measure.slice(0, 40));
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('yatayda tuvalin touch-action değeri none', ta === 'none', ta);
    await shot(page, 'ios-7-yatay.png');
    await page.context().close();
  }
  {
    const { page } = await phone(844, 390);
    await openExample(page, 'Yarım dalga doğrultmaç');
    await page.getByRole('navigation', { name: 'Eylemler' }).getByRole('button', { name: 'Oynat' }).tap(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Cihazlar' }).tap(); await page.waitForTimeout(800);
    const devices = await page.getByRole('region', { name: 'Cihazlar' }).boundingBox();
    const canvasHidden = await page.locator('svg.schematic').evaluate((el) => el.getBoundingClientRect().width === 0);
    check('yatayda Cihazlar tam genişlik (tuvalin ve yan panelin yerine)', devices !== null && devices.width > 600 && canvasHidden, devices ? `${Math.round(devices.width)} px` : 'yok');
    await shot(page, 'ios-8-yatay-osiloskop.png');
    await page.getByRole('button', { name: 'Devreye dön' }).tap(); await page.waitForTimeout(300);
    const back = await page.locator('svg.schematic').boundingBox();
    check('"Devre" ile tuvale dönülüyor', back !== null && back.width > 300);
    await page.context().close();
  }

  // --- 375 × 667 (S01, S02) ----------------------------------------------------------------
  {
    const { page, cdp } = await phone(375, 667);
    await openExample(page, 'Gerilim bölücü');
    const scale = (await screen(page, 0, 0)).scale;
    check('375×667: örnek açılınca devre alt sayfanın üstündeki alana okunur büyüklükte sığıyor', scale >= 0.45, `yakınlık ${scale.toFixed(2)}`);
    await page.getByRole('button', { name: 'Oynat' }).last().tap(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Ölçümler' }).last().tap(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Ölçümler' }).last().tap(); await page.waitForTimeout(300);
    const r1 = await part(page, 'R1');
    await tap(page, cdp, await screen(page, r1.x, r1.y)); await page.waitForTimeout(300);
    const sheet = await page.getByRole('region', { name: 'Ölçümler' }).boundingBox();
    const svgBox = await page.locator('svg.schematic').boundingBox();
    check('375×667: Ölç’te parçanın küçük sayfası 164 px; tuval sayfanın üstünde bitiyor', sheet !== null && Math.round(sheet.height) === 164 && svgBox.y + svgBox.height <= sheet.y + 1, sheet ? `sayfa ${Math.round(sheet.height)} px` : 'yok');
    await shot(page, 'ios-9-kucuk.png');
    await page.context().close();
  }

  // --- Tablet (T01, T02): dokunmatik, ≥ 900 px ---------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    const cdp = await ctx.newCDPSession(page);
    await page.goto(URL0, { waitUntil: 'networkidle' });
    const rail = await page.getByRole('navigation', { name: 'Araçlar' }).boundingBox();
    const library = await page.locator('aside[aria-label="Parçalar"]').count();
    check('tablette solda 72 px araç şeridi, kütüphane paneli yok', rail !== null && Math.round(rail.width) === 72 && library === 0, rail ? `${Math.round(rail.width)} px` : 'yok');
    await page.getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(300);
    const card = page.getByRole('dialog', { name: 'Parça ekle' });
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('tablette parça kartı açılıyor; açıkken tuvalin touch-action değeri none değil', (await card.count()) === 1 && ta !== 'none', ta);
    await card.getByRole('button', { name: 'Direnç ekle' }).tap(); await page.waitForTimeout(400);
    await card.getByRole('button', { name: 'Kapat', exact: true }).tap(); await page.waitForTimeout(300);
    const field = page.getByLabel('Direnç', { exact: true });
    const fs = await field.evaluate((el) => getComputedStyle(el).fontSize).catch(() => '');
    check('tablette eklenen parça seçili; İncele sekmesinde dokunmatik alan (≥ 16 px)', parseFloat(fs) >= 16, fs);
    const r1 = await part(page, 'R1');
    let s = await screen(page, r1.x, r1.y);
    await drag(page, cdp, s, { x: s.x + 80, y: s.y + 40 }, 250);
    const moved = await part(page, 'R1');
    check('tablette parça basılı tutup sürüklenerek taşınıyor', moved.x !== r1.x || moved.y !== r1.y);
    // Ölç: toprağı olan bir örnek devre.
    await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'LED ve ön direnç', exact: true }).tap(); await page.waitForTimeout(600);
    await page.getByRole('region', { name: 'Simülasyon' }).getByRole('button', { name: 'Oynat' }).tap(); await page.waitForTimeout(500);
    const partsDisabled = await page.getByRole('button', { name: 'Parça', exact: true }).isDisabled();
    const before = await part(page, 'R1');
    s = await screen(page, before.x, before.y);
    await drag(page, cdp, s, { x: s.x + 60, y: s.y }, 250);
    const locked = await part(page, 'R1');
    check('tablette Ölç’te Parça kapalı ve devre kilitli', partsDisabled && locked.x === before.x && locked.y === before.y);
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
    const exampleTab = await page.getByRole('tab', { name: 'Örnek' }).getAttribute('aria-selected');
    await page.getByRole('button', { name: /^Cihazlar sekmesini aç/ }).tap(); await page.waitForTimeout(300);
    const devicesTab = await page.getByRole('tab', { name: 'Cihazlar' }).getAttribute('aria-selected');
    const panel = (await page.getByRole('tabpanel').textContent()) ?? '';
    check('tablette örnek Örnek sekmesinde; cihaz düğmesi Cihazlar sekmesini açıyor', exampleTab === 'true' && devicesTab === 'true' && panel.includes('Osiloskop'), panel.slice(0, 30));
    await ctx.close();
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
    await page.getByRole('button', { name: 'Parça', exact: true }).tap(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Direnç ekle' }).tap(); await page.waitForTimeout(400);
    const step2 = (await tour.textContent()) ?? '';
    check('kısa tur gerçek eylemle ilerliyor (parça eklenince 2. adım)', step1.includes('Adım 1 / 4') && step2.includes('Adım 2 / 4'), step2.slice(0, 20));
    await tour.getByRole('button', { name: 'Turu bitir' }).tap(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Daha fazla/ }).tap(); await page.waitForTimeout(300);
    const more = (await page.getByRole('dialog', { name: 'Daha fazla' }).textContent()) ?? '';
    check('telefonda ⋯: Yardım sekmesinde dokunma hareketleri (P14)', more.includes('Uca dokun') && more.includes('Düğüm gerilimleri'), more.slice(0, 40));
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
    // Kütüphane tek durak: oklarla gez, Enter tuvalin ortasına ekler.
    await page.getByRole('button', { name: 'Pil', exact: true }).focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const libFocus = await active();
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const tabStops = await page.locator('[data-lib-item][tabindex="0"]').count();
    check('kütüphane listesi tek durak; oklarla geziliyor, Enter tuvale ekliyor', libFocus.text === 'Toprak' && tabStops === 1 && (await doc(page)).parts.some((p) => p.type === 'ground'), libFocus.text);
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
    await page.keyboard.press('Alt+Digit3'); await page.waitForTimeout(150);
    const messagesTab = await page.getByRole('tab', { name: /Mesajlar/ }).getAttribute('aria-selected');
    check('Alt+3 Mesajlar sekmesine geçiyor', messagesTab === 'true');
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
  await dp.getByRole('button', { name: 'Kondansatör', exact: true }).hover(); await dp.waitForTimeout(200);
  const info = dp.locator('aside[aria-label="Parçalar"] [aria-live="polite"]');
  const infoText = (await info.textContent().catch(() => '')) ?? '';
  const infoBox = await info.boundingBox();
  const canvas = await dp.locator('svg.schematic').boundingBox();
  check('masaüstü: fareyle gelinen parça kütüphanenin bilgi alanında anlatılıyor', infoText.includes('Kondansatör') && infoText.includes('Yük depolar') && infoBox !== null && infoBox.x + infoBox.width <= canvas.x + 1, infoText.slice(0, 40));
  const strip = await dp.locator('main + div').first().boundingBox();
  check('masaüstü: ipucu şeridi tuvalin altında, üstüne binmiyor', strip !== null && strip.y >= canvas.y + canvas.height - 1 && strip.height <= 30, strip ? `y ${Math.round(strip.y)} · tuval altı ${Math.round(canvas.y + canvas.height)}` : 'yok');
  await dp.getByRole('button', { name: /^Hız/ }).click(); await dp.waitForTimeout(200);
  await dp.getByRole('radio', { name: /Ağır çekim/ }).click(); await dp.waitForTimeout(200);
  const speedText = (await dp.getByRole('button', { name: /^Hız/ }).textContent()) ?? '';
  check('masaüstü: hız penceresinde "Ağır çekim" ×10⁻⁶ yapıyor', speedText.includes('10⁻⁶') && speedText.includes('1 µs'), speedText);
  await dp.keyboard.press('Escape'); await dp.waitForTimeout(100);
  check('masaüstü: hız penceresi Esc ile kapanıyor', (await dp.getByRole('dialog', { name: 'Simülasyon hızı' }).count()) === 0);
  // Hızı gerçek zamana geri al (aşağıdaki denetimler için).
  await dp.getByRole('button', { name: /^Hız/ }).click(); await dp.getByRole('radio', { name: /Gerçek zaman/ }).click();
  await dp.keyboard.press('Escape');

  // --- Masaüstü: İnceleme paneli (İncele, Örnek, Mesajlar) ----------------------------
  await dp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await dp.waitForTimeout(200);
  await dp.getByRole('button', { name: 'LED ve ön direnç', exact: true }).click(); await dp.waitForTimeout(500);
  const exampleTab = await dp.getByRole('tab', { name: 'Örnek' }).getAttribute('aria-selected');
  const exampleText = (await dp.getByRole('tabpanel').textContent()) ?? '';
  check('masaüstü: örnek açılınca Örnek sekmesi soruyla açılıyor', exampleTab === 'true' && exampleText.includes('Tahmin et') && exampleText.includes('Cevabı görmek için'));
  const stripText = (await dp.locator('main + div').first().textContent()) ?? '';
  check('masaüstü: ipucu şeridi örnek yönlendirmesini gösteriyor', stripText.includes('Örnek açık'), stripText.slice(0, 40));
  const deskR1 = await part(dp, 'R1');
  const r1At = await screen(dp, deskR1.x, deskR1.y);
  await dp.mouse.dblclick(r1At.x, r1At.y); await dp.waitForTimeout(250);
  const focused = await dp.evaluate(() => (document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null));
  check('masaüstü: çift tıklayınca İncele sekmesinde ilk değer alanına odaklanıyor', focused === '330', `odak: ${focused}`);
  await dp.keyboard.type('1k'); await dp.keyboard.press('Enter');
  check('masaüstü: değer Enter ile uygulanıyor', (await part(dp, 'R1')).props.resistance === 1000);
  const valueField = dp.getByLabel('Direnç', { exact: true });
  await valueField.fill('abc'); await valueField.press('Enter'); await dp.waitForTimeout(150);
  const alert = (await dp.getByRole('tabpanel').getByRole('alert').textContent().catch(() => '')) ?? '';
  check('masaüstü: geçersiz değer uygulanmıyor, hata alanın altında', alert.includes('sayı değil') && (await part(dp, 'R1')).props.resistance === 1000, alert.slice(0, 30));
  await valueField.press('Escape');
  await dp.getByRole('button', { name: 'Oynat' }).first().click(); await dp.waitForTimeout(600);
  await valueField.fill('470'); await valueField.press('Tab'); await dp.waitForTimeout(400);
  const statusText = (await dp.getByRole('region', { name: 'Simülasyon' }).getByRole('status').textContent()) ?? '';
  check('masaüstü: çalışırken alandan çıkınca değer uygulanıyor, simülasyon durmuyor', (await part(dp, 'R1')).props.resistance === 470 && statusText.includes('Çalışıyor'), statusText);
  const live = (await dp.getByRole('tabpanel').textContent()) ?? '';
  check('masaüstü: İncele sekmesinde canlı ölçüm görünüyor', live.includes('canlı') && /Akım\s*[\d,]+\s*mA/.test(live), live.slice(0, 60));
  await dp.getByRole('tab', { name: 'Örnek' }).click(); await dp.waitForTimeout(150);
  const answer = (await dp.getByRole('tabpanel').getByRole('status').textContent().catch(() => '')) ?? '';
  check('masaüstü: Oynat’tan sonra Örnek sekmesinde cevap açık', answer.includes('Cevap'), answer.slice(0, 30));
  await desk.close();

  // --- Masaüstü: cihaz rafı ve Ölç düzeni ------------------------------------------------
  const rackCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const rp = await rackCtx.newPage();
  rp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await rp.goto(URL0, { waitUntil: 'networkidle' });
  await rp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await rp.waitForTimeout(200);
  await rp.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }).click(); await rp.waitForTimeout(500);
  const rack = rp.getByRole('region', { name: 'Cihaz rafı' });
  const rackBox = await rack.boundingBox();
  const rackCanvas = await rp.locator('svg.schematic').boundingBox();
  check('masaüstü: devrede cihaz varken raf tuvalin altında', rackBox !== null && rackBox.y >= rackCanvas.y + rackCanvas.height - 1, rackBox ? `y ${Math.round(rackBox.y)}` : 'yok');
  if ((await rp.getByRole('tab', { name: /OSC1/ }).count()) > 0) { await rp.getByRole('tab', { name: /OSC1/ }).click(); await rp.waitForTimeout(150); }
  const voltsBefore = (await part(rp, 'OSC1')).props.voltsPerDivA ?? 2;
  await rp.getByRole('button', { name: 'A volt/bölme artır' }).click();
  const voltsAfter = (await part(rp, 'OSC1')).props.voltsPerDivA;
  check('masaüstü: osiloskop ön panelinde kademeli ayar çalışıyor', voltsAfter > voltsBefore, `${voltsBefore} → ${voltsAfter}`);
  if ((await rp.getByRole('tab', { name: /FG1/ }).count()) > 0) { await rp.getByRole('tab', { name: /FG1/ }).click(); await rp.waitForTimeout(150); }
  await rp.getByRole('spinbutton', { name: 'Frekans' }).click(); await rp.waitForTimeout(100);
  await rp.keyboard.press('Control+A'); await rp.keyboard.type('2k'); await rp.keyboard.press('Enter'); await rp.waitForTimeout(150);
  check('masaüstü: üretecin frekansı değere tıklayıp yazılarak değişiyor', (await part(rp, 'FG1')).props.frequency === 2000);
  await rp.getByRole('button', { name: 'FG1 OUT ucunu tuvalde göster' }).click(); await rp.waitForTimeout(150);
  check('masaüstü: jaka tıklayınca tuvalde uç yanıp sönüyor', (await rp.locator('svg.schematic circle.alarm-blink').count()) > 0);
  await rp.getByRole('button', { name: 'Örneği kapat' }).click(); await rp.waitForTimeout(150);
  await rp.getByRole('button', { name: 'Oynat' }).first().click(); await rp.waitForTimeout(700);
  const panelStrip = await rp.getByRole('navigation', { name: 'İnceleme paneli (daraltılmış)' }).count();
  const railOpen = await rp.getByRole('button', { name: 'Parça kütüphanesini aç' }).count();
  const measureBox = await rack.boundingBox();
  check('masaüstü: Oynat’tan sonra Ölç düzeni (paneller şeritte, raf büyük)', panelStrip === 1 && railOpen === 1 && measureBox.height > rackBox.height + 40, `raf ${Math.round(rackBox.height)} → ${Math.round(measureBox.height)}`);
  if ((await rp.getByRole('tab', { name: /OSC1/ }).count()) > 0) { await rp.getByRole('tab', { name: /OSC1/ }).click(); await rp.waitForTimeout(150); }
  await rp.getByRole('button', { name: 'Oto' }).click(); await rp.waitForTimeout(300);
  const autoToast = (await rp.getByRole('status').filter({ hasText: 'Oto:' }).count()) > 0;
  check('masaüstü: Oto neyin değiştiğini bildiriyor', autoToast);
  await rp.getByRole('button', { name: 'Durdur', exact: true }).click(); await rp.waitForTimeout(300);
  check('masaüstü: Durdur’la Kur düzenine dönülüyor', (await rp.getByRole('tablist', { name: 'İnceleme paneli' }).count()) === 1 && (await rp.getByRole('navigation', { name: 'İnceleme paneli (daraltılmış)' }).count()) === 0);
  await rackCtx.close();

  // --- Masaüstü: hatalar ve uyarılar (rozet, LED balonu, düzeltmeler, toprak yok, tuzak) ------
  const errCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const ep = await errCtx.newPage();
  ep.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await ep.goto(URL0, { waitUntil: 'networkidle' });
  await ep.getByRole('button', { name: 'Örnekler', exact: true }).click(); await ep.waitForTimeout(200);
  await ep.getByRole('button', { name: 'LED ve ön direnç', exact: true }).click(); await ep.waitForTimeout(400);
  await ep.getByRole('button', { name: 'Oynat' }).first().click(); await ep.waitForTimeout(400);
  await ep.getByRole('tab', { name: 'İncele' }).click();
  await ep.getByRole('button', { name: /^R1/ }).first().click();
  const r1Field = ep.getByLabel('Direnç', { exact: true });
  await r1Field.fill('10'); await r1Field.press('Enter'); await ep.waitForTimeout(900);
  const balloon = ep.getByRole('alertdialog', { name: /LED1 yandı/ });
  check('masaüstü: LED yanınca balon ve Mesajlar sekmesi öne geliyor', (await balloon.count()) === 1 && (await ep.getByRole('tab', { name: /Mesajlar/ }).getAttribute('aria-selected')) === 'true');
  await balloon.getByRole('button', { name: 'Neden?' }).click(); await ep.waitForTimeout(200);
  const fix = ep.getByRole('tabpanel').getByRole('button', { name: /^R1’i .* yap$/ });
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
  await tp.getByRole('tab', { name: /Mesajlar/ }).click(); await tp.waitForTimeout(150);
  const trapText = (await tp.getByRole('tabpanel').textContent()) ?? '';
  check(
    'masaüstü: toprak tuzağında uyarı ve kesikli toprak hattı (tek mesaj)',
    earthLines >= 1 && earthLabel <= 1 && trapText.includes('Toprak tuzağı') && trapText.includes('D4 kısa devre oldu') && !trapText.includes('toprak hattı üzerinden dönüyor'),
    `${earthLines} çizgi, ${earthLabel} etiket; ${trapText.slice(0, 50)}`,
  );
  await tp.getByRole('tabpanel').getByText('Toprak tuzağı', { exact: true }).first().click(); await tp.waitForTimeout(200);
  const earthGlow = await tp.locator('svg.schematic g.earth-line path[stroke-opacity="0.35"]').count();
  check('masaüstü: toprak tuzağı mesajına tıklayınca toprak hattı vurgulanır', earthGlow >= 1, `${earthGlow} vurgu`);
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
    await lp.getByRole('tab', { name: /Mesajlar/ }).click(); await lp.waitForTimeout(200);
    const text = (await lp.getByRole('tabpanel').textContent()) ?? '';
    const hot = await lp.locator('svg.schematic polyline[stroke^="rgb("]').count();
    check(
      'masaüstü: ısınan direnç kızıl, ters LED ve ters elektrolitik için uyarı (Fizik 5)',
      hot >= 1 && text.includes('Direnç ısınıyor') && text.includes('LED ters yönde') && text.includes('elektrolitik kondansatör ters yönde') && text.includes('3 uyarı'),
      `${hot} kızıl gövde; ${text.slice(0, 60)}`,
    );
    await ctx.close();
  }

  // --- Bobin (Fizik 7): kütüphanede, RL örneğinde anahtar açılınca Lenz uyarısı -------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    await ctx.addInitScript(() => { try { localStorage.setItem('devre-simulatoru:hosgeldin', '1'); } catch { /* yok */ } });
    const bp = await ctx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await bp.goto(URL0, { waitUntil: 'networkidle' });
    const inLibrary = await bp.getByRole('button', { name: 'Bobin', exact: true }).count();
    await bp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await bp.waitForTimeout(200);
    await bp.getByRole('button', { name: 'RL devresi', exact: true }).click(); await bp.waitForTimeout(400);
    await bp.getByRole('button', { name: 'Oynat', exact: true }).last().click(); await bp.waitForTimeout(400);
    const box = await bp.locator('svg.schematic text', { hasText: /^S1$/ }).first().boundingBox();
    const toggle = async () => { await bp.mouse.click(box.x + box.width / 2, box.y + box.height + 12); await bp.waitForTimeout(600); };
    await toggle();
    const closedText = (await bp.locator('svg.schematic text', { hasText: /mA$/ }).allTextContents()).join(' ');
    await toggle();
    await bp.getByRole('tab', { name: /Mesajlar/ }).click(); await bp.waitForTimeout(200);
    const text = (await bp.getByRole('tabpanel').textContent()) ?? '';
    check(
      'masaüstü: kütüphanede Bobin; RL örneğinde akım ≈ 89 mA, anahtar açılınca Lenz uyarısı (Fizik 7)',
      inLibrary >= 1 && closedText.includes('89,') && text.includes('Bobin akımı aniden kesildi') && text.includes('Lenz'),
      `${inLibrary} kütüphane; ampermetre ${closedText}; ${text.slice(0, 50)}`,
    );
    await ctx.close();
  }

  // --- Sıkışık masaüstü (1100 px): kütüphane şerit, açılır kart --------------------------
  const compact = await browser.newContext({ viewport: { width: 1100, height: 760 }, locale: 'tr-TR' });
  const cp = await compact.newPage();
  cp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await cp.goto(URL0, { waitUntil: 'networkidle' });
  const railVisible = await cp.getByRole('button', { name: 'Parça kütüphanesini aç' }).isVisible();
  const listHidden = (await cp.getByRole('button', { name: 'Kondansatör', exact: true }).count()) === 0;
  check('1100 px: kütüphane 56 px şerit olarak başlıyor', railVisible && listHidden);
  await cp.getByRole('button', { name: 'Parça kütüphanesini aç' }).click(); await cp.waitForTimeout(200);
  await cp.getByRole('button', { name: 'Kondansatör', exact: true }).click(); await cp.waitForTimeout(200);
  const flyoutClosed = (await cp.getByRole('button', { name: 'Kondansatör', exact: true }).count()) === 0;
  const placeHint = (await cp.locator('main + div').first().textContent().catch(() => '')) ?? '';
  check('1100 px: açılır karttan parça seçilince kart kapanıyor, yerleştirme başlıyor', flyoutClosed && placeHint.includes('Kondansatör:'), placeHint.slice(0, 40));
  await compact.close();

  // --- Tam ekran (masaüstü, tablet): tarayıcı tam ekranı, yalnızca devre şeması -------------
  {
    const fsCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const fp = await fsCtx.newPage();
    fp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await fp.goto(URL0, { waitUntil: 'networkidle' });
    const fsElement = () => fp.evaluate(() => document.fullscreenElement?.tagName ?? null);
    const libraryShown = () => fp.getByPlaceholder(/Parça ara/).count();
    const inspectorShown = () => fp.getByRole('tab', { name: 'İncele' }).count();
    const canvasWidth = async () => (await fp.locator('svg.schematic').boundingBox())?.width ?? 0;
    const w0 = await canvasWidth();
    await fp.getByRole('button', { name: 'Tam ekran', exact: true }).click(); await fp.waitForTimeout(500);
    const w1 = await canvasWidth();
    check('masaüstü: Tam ekran tarayıcıyı tam ekrana alıyor; kütüphane ve İnceleme paneli gizleniyor', (await fsElement()) === 'HTML' && (await libraryShown()) === 0 && (await inspectorShown()) === 0 && w1 > 1400, `tuval ${Math.round(w0)} → ${Math.round(w1)} px`);
    await fp.getByRole('button', { name: 'Parça kütüphanesi', exact: true }).click();
    await fp.getByRole('button', { name: 'İnceleme paneli', exact: true }).click(); await fp.waitForTimeout(300);
    const pressed = await fp.getByRole('button', { name: 'Parça kütüphanesi', exact: true }).getAttribute('aria-pressed');
    check('masaüstü: tam ekranda üst çubuğun iki ucundaki düğmeler sol ve sağ paneli açıyor', (await libraryShown()) === 1 && (await inspectorShown()) === 1 && pressed === 'true' && (await fsElement()) === 'HTML');
    await fp.evaluate(() => document.exitFullscreen()); await fp.waitForTimeout(400);
    check('masaüstü: tarayıcının tam ekranından çıkınca (Esc) kip kapanıyor, paneller yerinde', (await fp.getByRole('button', { name: 'Tam ekran', exact: true }).count()) === 1 && (await fp.getByRole('button', { name: 'Parça kütüphanesi', exact: true }).count()) === 0 && (await libraryShown()) === 1 && (await inspectorShown()) === 1);
    await fsCtx.close();

    const tCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const tp = await tCtx.newPage();
    tp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await tp.goto(URL0, { waitUntil: 'networkidle' });
    await tp.getByRole('button', { name: 'Tam ekran', exact: true }).tap(); await tp.waitForTimeout(500);
    const railHidden = (await tp.getByRole('button', { name: 'Bağla', exact: true }).count()) === 0 && (await tp.getByRole('tab', { name: 'İncele' }).count()) === 0;
    await tp.getByRole('button', { name: 'Araç şeridi (Parça ekle, Bağla)', exact: true }).tap(); await tp.waitForTimeout(300);
    const railBack = (await tp.getByRole('button', { name: 'Bağla', exact: true }).count()) === 1;
    await tp.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).tap(); await tp.waitForTimeout(400);
    check('tablet: Tam ekran araç şeridini ve İnceleme panelini gizliyor, düğmeyle açılıyor, çıkınca geri geliyor', railHidden && railBack && (await tp.getByRole('tab', { name: 'İncele' }).count()) === 1 && (await tp.evaluate(() => document.fullscreenElement)) === null);
    await tCtx.close();
  }

  // --- Baraj sayfası (/baraj/): ders düzeni (docs/tasarim/baraj) ------------------------------
  const BARAJ = `${URL0.replace(/\/?$/, '/')}baraj/`;
  const pageScrolls = (pg) => pg.evaluate(() => document.scrollingElement.scrollHeight > window.innerHeight + 1 || document.scrollingElement.scrollWidth > window.innerWidth + 1);
  /** Sahnedeki tutamağın değeri (su seviyesi, %). */
  const barajLevel = async (pg) => Number(await pg.getByRole('slider', { name: 'Su seviyesi' }).first().getAttribute('aria-valuenow'));
  const flowChecked = async (pg) => (await pg.getByRole('radiogroup', { name: 'Su akışı' }).getByRole('radio', { checked: true }).textContent())?.replace(/[↓↑]|Boşluk/g, '').trim();
  const sceneLabel = async (pg) => (await pg.getByRole('img', { name: /Baraj kesiti/ }).getAttribute('aria-label')) ?? '';
  /** Seviye `n` olana kadar bekler (en çok `ms`). */
  const waitLevel = async (pg, n, ms) => { const end = Date.now() + ms; while (Date.now() < end && (await barajLevel(pg)) !== n) await pg.waitForTimeout(150); return barajLevel(pg); };
  {
    const { page, cdp } = await phone();
    await page.goto(BARAJ, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    const tabs = await page.getByRole('tab').allTextContents();
    check('baraj (telefon): sayfa kaymıyor; açılışta su %20, akış Durdur; Durum | Devre sekmeleri ve kumanda görünür',
      !(await pageScrolls(page)) && (await barajLevel(page)) === 20 && (await flowChecked(page)) === 'Durdur' && tabs.join(',') === 'Durum,Devre' && (await page.getByRole('group', { name: 'Kumanda' }).isVisible()),
      `%${await barajLevel(page)} · ${await flowChecked(page)} · ${tabs.join('/')}`);
    await page.getByRole('button', { name: 'Seviye 1', exact: true }).tap();
    const reached = await waitLevel(page, 50, 9000); await page.waitForTimeout(900);
    const tableText = (await page.getByRole('table').textContent()) ?? '';
    check('baraj (telefon): Seviye 1 suyu %50’ye doldurup durduruyor; yeşil yanıyor, tabloda Q1 doyumda',
      reached === 50 && (await flowChecked(page)) === 'Durdur' && (await sceneLabel(page)).includes('yeşil yanıyor') && /Q1\s*doyum/.test(tableText), `%${reached} · ${tableText.slice(-40)}`);
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a:not([href="#kumanda"]), [role=tab], [role=radio], [role=slider], input')]
      .map((el) => { const r = el.getBoundingClientRect(); return { n: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20), w: r.width, h: r.height }; })
      .filter((r) => r.w > 0 && r.h > 0 && (r.h < 43.5 || r.w < 43.5)).map((r) => `${r.n} ${Math.round(r.w)}×${Math.round(r.h)}`));
    check('baraj (telefon): bütün dokunma hedefleri en az 44 px', small.length === 0, small.join(', '));
    await page.getByRole('radio', { name: 'Tek ışık' }).tap(); await page.waitForTimeout(1200);
    check('baraj (telefon): Tek ışık’a geçince su aynı yerde kalıyor, devre çalışmaya devam ediyor', (await barajLevel(page)) === 50 && (await sceneLabel(page)).includes('yeşil yanıyor'), `%${await barajLevel(page)}`);
    await page.getByRole('button', { name: 'Soru', exact: true }).tap(); await page.waitForTimeout(300);
    const sheet = page.getByRole('dialog', { name: 'Soru' });
    const hiddenAnswer = (await sheet.getByRole('status').count()) === 0;
    await sheet.getByRole('button', { name: 'Cevabı göster' }).tap(); await page.waitForTimeout(200);
    const answer = (await sheet.getByRole('status').textContent()) ?? '';
    check('baraj (telefon): Soru alt sayfada; cevap yalnızca "Cevabı göster" ile açılıyor; kumanda açık kalıyor',
      hiddenAnswer && answer.includes('Q4') && (await page.getByRole('button', { name: 'Seviye 2', exact: true }).isVisible()), answer.slice(0, 40));
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
    const handle = await page.getByRole('slider', { name: 'Su seviyesi' }).first().boundingBox();
    await drag(page, cdp, { x: handle.x + 20, y: handle.y + handle.height / 2 }, { x: handle.x + 20, y: handle.y + handle.height / 2 - 60 }, 40);
    await page.waitForTimeout(600);
    const dragged = await barajLevel(page);
    check('baraj (telefon): sahnedeki tutamak sürüklenince su bırakılan yerde kalıyor, akış Durdur', dragged > 60 && dragged <= 100 && (await flowChecked(page)) === 'Durdur', `%50 → %${dragged}`);
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
    const bar = await lp.getByRole('group', { name: 'Kumanda' }).boundingBox();
    const sceneBox = await lp.getByRole('img', { name: /Baraj kesiti/ }).boundingBox();
    const tableBox = await lp.getByRole('table').boundingBox();
    check('baraj (yatay telefon): sayfa kaymıyor; sahne solda, Durum sağda, kumanda tek satır', !(await pageScrolls(lp)) && bar !== null && bar.height <= 60 && sceneBox !== null && tableBox !== null && tableBox.x > sceneBox.x + sceneBox.width - 2,
      `kumanda ${Math.round(bar?.height ?? 0)} px`);
    await lCtx.close();
  }
  {
    const bCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const bp = await bCtx.newPage();
    bp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    bp.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await bp.goto(BARAJ, { waitUntil: 'networkidle' }); await bp.waitForTimeout(400);
    const bandTexts = await bp.locator('svg.schematic text').allTextContents();
    check('baraj (masaüstü): sayfa kaymıyor; sahne, Durum tablosu, şema (üç seviye bandı) ve kaydırıcılı kumanda',
      !(await pageScrolls(bp)) && (await bp.getByRole('table').isVisible()) && ['Seviye 1 · yeşil', 'Seviye 2 · sarı', 'Seviye 3 · kırmızı'].every((t) => bandTexts.includes(t)) && (await bp.getByRole('slider', { name: 'Su seviyesi' }).count()) === 2);
    // Ayarlar: dolma süresini kısalt (klavye denemesi hızlı bitsin).
    await bp.getByRole('button', { name: 'Ayarlar', exact: true }).click(); await bp.waitForTimeout(200);
    const card = bp.getByRole('dialog', { name: 'Ayarlar' });
    for (let i = 0; i < 3; i++) await card.getByRole('button', { name: /Dolma süresi.*azalt|azalt.*Dolma süresi/ }).click().catch(() => {});
    const fillText = (await card.textContent()) ?? '';
    const switchOn = await card.getByRole('switch', { name: /Tek tuş kısayolları/ }).getAttribute('aria-checked');
    await bp.keyboard.press('Escape'); await bp.waitForTimeout(200);
    check('baraj (masaüstü): Ayarlar kartı açılıyor (dolma süresi, tek tuş kısayolları), Esc ile kapanıyor', fillText.includes('2 s') && switchOn === 'true' && (await bp.getByRole('dialog', { name: 'Ayarlar' }).count()) === 0, fillText.match(/\d+ s/)?.[0] ?? '');
    await bp.locator('body').click({ position: { x: 700, y: 30 } }).catch(() => {});
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
    await bp.keyboard.press('s'); await bp.waitForTimeout(200);
    const strip = bp.getByRole('region', { name: 'Soru' });
    await strip.getByRole('button', { name: 'Cevabı göster' }).click(); await bp.waitForTimeout(200);
    const shown = (await strip.getByRole('status').textContent()) ?? '';
    await bp.getByRole('radio', { name: 'Tek ışık' }).click(); await bp.waitForTimeout(400);
    check('baraj (masaüstü): Soru şeridi (S); cevap düğmeyle açılıyor, devre değişince yeniden gizleniyor',
      shown.includes('%37,5') && (await strip.getByRole('status').count()) === 0 && (await strip.getByRole('button', { name: 'Cevabı göster' }).isVisible()), shown.slice(0, 30));
    await bp.getByRole('button', { name: 'Durum tablosunu gizle' }).click(); await bp.waitForTimeout(200);
    await bp.reload({ waitUntil: 'networkidle' }); await bp.waitForTimeout(300);
    const stillHidden = (await bp.getByRole('table').count()) === 0;
    await bp.getByRole('button', { name: 'Durum tablosunu göster' }).click(); await bp.waitForTimeout(200);
    check('baraj (masaüstü): Durum tablosu Gizle ile kalkıyor, yenileyince gizli kalıyor, Göster ile geri geliyor', stillHidden && (await bp.getByRole('table').count()) === 1);
    await bp.getByRole('button', { name: 'Tam ekran', exact: true }).click(); await bp.waitForTimeout(500);
    const cellSize = await bp.getByRole('cell').nth(1).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const fsOn = await bp.evaluate(() => document.fullscreenElement?.tagName ?? null);
    const keyHints = await bp.getByRole('group', { name: 'Kumanda' }).getByText('Boşluk', { exact: true }).count();
    await bp.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).click(); await bp.waitForTimeout(300);
    check('baraj (masaüstü): tam ekranda (projeksiyon) tablo yazıları en az 16 px, kumandada klavye ipucu yok', fsOn === 'HTML' && cellSize >= 16 && keyHints === 0, `${cellSize} px`);
    await bp.getByRole('button', { name: 'Seviye 1', exact: true }).click();
    await waitLevel(bp, 50, 9000);
    await bp.getByRole('link', { name: /Simülatörde aç/ }).click();
    await bp.waitForURL((u) => !u.pathname.includes('/baraj')); await bp.waitForTimeout(800);
    const opened = await doc(bp);
    const tankPart = opened?.parts.find((q) => q.type === 'tank');
    check('baraj (masaüstü): "Simülatörde aç" devreyi o anki seviyeyle simülatörde açıyor', tankPart !== undefined && Math.abs(tankPart.props.level - 50) < 1 && opened.parts.filter((q) => q.type === 'led').length === 3, `${opened?.parts.length ?? 0} parça, %${tankPart?.props.level}`);
    await bCtx.close();
  }
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(problems.length ? problems.join('\n') : 'konsol hatası yok');
console.log(failed ? `\n${failed} madde KALDI.` : `\n${results.length} maddenin hepsi geçti.`);
process.exit(failed || problems.length ? 1 : 0);
