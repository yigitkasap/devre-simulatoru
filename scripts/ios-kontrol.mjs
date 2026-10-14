// iOS / dokunmatik kontrol listesi. Tuvale, çekmeceye ya da olay işleyicilerine dokunan her
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
/** Üst çubuktaki "Örnekler" penceresinden bir örneği dokunarak açar. */
async function openExample(page, name) {
  await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
  await page.getByRole('button', { name, exact: true }).tap(); await page.waitForTimeout(600);
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
    await page.getByRole('button', { name: 'Parça kütüphanesi' }).tap(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Direnç', exact: true }).tap(); await page.waitForTimeout(500);
    // React dinleyicileri display: contents ada öğesinde durur; iOS o alanı dokunma alanı saymaz.
    const onDoc = await listeners(cdp, 'document');
    const passiveTypes = ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup'];
    const missing = passiveTypes.filter((t) => !onDoc.some((l) => l.type === t && l.passive));
    check('belgede bütün dokunma/işaretçi türleri için pasif dinleyici var', missing.length === 0, missing.length ? `eksik: ${missing.join(', ')}` : '');
    // Safari'nin kendi kaydırma/yakınlaştırması işaretçi akışını kesmesin.
    const onSvg = await listeners(cdp, "document.querySelector('svg.schematic')");
    const blocking = ['touchstart', 'touchmove'].filter((t) => onSvg.some((l) => l.type === t && !l.passive));
    check('tuvalde varsayılanı engelleyen touchstart/touchmove dinleyicileri var', blocking.length === 2, blocking.join(', '));
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('çekmece kapalıyken tuvalin touch-action değeri none', ta === 'none', ta);
    // Çizimin hiçbir parçası olay almaz; hedef her zaman SVG (örtük yakalama sürüklemeyi koparmasın).
    const r1 = await part(page, 'R1');
    const s = await screen(page, r1.x, r1.y);
    const target = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class') ?? '', [s.x, s.y]);
    check('parçanın üstündeki dokunma hedefi SVG’nin kendisi', target.split(' ').includes('schematic'), target);
    await page.context().close();
  }

  // --- Çekmece -----------------------------------------------------------------------
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const { page, cdp } = await phone(w, h);
    await page.getByRole('button', { name: 'Parça kütüphanesi' }).tap(); await page.waitForTimeout(400);
    const nav = await page.locator('aside[aria-label="Parçalar"] nav').boundingBox();
    await drag(page, cdp, { x: nav.x + nav.width / 2, y: nav.y + nav.height - 30 }, { x: nav.x + nav.width / 2, y: nav.y + 30 });
    await page.waitForTimeout(300);
    const top = await page.evaluate(() => document.querySelector('aside nav').scrollTop);
    const previewInDrawer = await page.locator('aside[aria-label="Parçalar"] >> text=Sürükleyip tuvale').count();
    check(`çekmece kaydırılıyor (${w}x${h}, liste ${Math.round(nav.height)} px)`, top > 0, `scrollTop ${top}`);
    check(`çekmecede bilgi kartı yok (${w}x${h})`, previewInDrawer === 0);
    const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('çekmece açıkken tuvalin touch-action değeri none değil', touchAction !== 'none', touchAction);
    if (w === 390) await shot(page, 'ios-1-cekmece.png');
    await page.getByRole('button', { name: 'P kanallı MOSFET', exact: true }).tap(); await page.waitForTimeout(500);
    check(`çekmecenin sonundaki parçaya ulaşılıp ekleniyor (${w}x${h})`, (await doc(page)).parts.some((p) => p.type === 'pmos'));
    await page.context().close();
  }

  // --- Örnekler penceresi -------------------------------------------------------------
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const { page, cdp } = await phone(w, h);
    await page.getByRole('button', { name: 'Örnekler', exact: true }).tap(); await page.waitForTimeout(400);
    const list = page.locator('[role=dialog] .overflow-y-auto');
    const box = await list.boundingBox();
    await drag(page, cdp, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, { x: box.x + box.width / 2, y: box.y + 40 });
    await page.waitForTimeout(300);
    const top = await list.evaluate((el) => el.scrollTop);
    check(`örnekler penceresi parmakla kaydırılıyor (${w}x${h})`, top > 0, `scrollTop ${top}`);
    const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('svg.schematic')).touchAction);
    check('örnekler penceresi açıkken tuvalin touch-action değeri none değil', touchAction !== 'none', touchAction);
    // Parmakla kaydırmanın ardından liste bir süre kaymaya devam eder; durunca dokunulur.
    await page.waitForTimeout(1000);
    const last = page.getByRole('button', { name: 'MOSFET’in anahtar olarak kullanılması', exact: true });
    await last.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await last.tap(); await page.waitForTimeout(600);
    check(`penceredeki son örneğe ulaşılıp açılıyor (${w}x${h})`, (await doc(page)).parts.some((p) => p.type === 'nmos'));
    await page.context().close();
  }

  // --- Parça ekleme ve taşıma -------------------------------------------------------
  const { page, cdp } = await phone();
  await page.getByRole('button', { name: 'Parça kütüphanesi' }).tap(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Direnç', exact: true }).tap(); await page.waitForTimeout(500);
  const r1 = await part(page, 'R1');
  check('dokunarak parça eklendi', Boolean(r1));
  let s = await screen(page, r1.x, r1.y);
  await tap(page, cdp, s);
  check('parçaya dokununca seçiliyor', (await page.locator('svg.schematic rect[stroke-dasharray="4 3"]').count()) > 0);
  await drag(page, cdp, s, { x: s.x + 60, y: s.y + 90 });
  const r1b = await part(page, 'R1');
  check('parça hemen sürüklenerek taşınıyor', r1b.x !== r1.x || r1b.y !== r1.y, `(${r1.x},${r1.y}) → (${r1b.x},${r1b.y})`);
  s = await screen(page, r1b.x, r1b.y);
  await drag(page, cdp, s, { x: s.x - 70, y: s.y - 40 }, 750);
  const r1c = await part(page, 'R1');
  const menuOpen = await page.getByRole('menu').count();
  check('basılı tutup sürükleyince parça yine taşınıyor ve menü kapanıyor', (r1c.x !== r1b.x || r1c.y !== r1b.y) && menuOpen === 0, `(${r1b.x},${r1b.y}) → (${r1c.x},${r1c.y}), menü ${menuOpen}`);
  s = await screen(page, r1c.x, r1c.y);
  await drag(page, cdp, { x: s.x, y: s.y - 14 }, { x: s.x + 40, y: s.y + 60 });
  const r1d = await part(page, 'R1');
  check('gövdenin hemen dışından da tutulup taşınıyor', r1d.x !== r1c.x || r1d.y !== r1c.y, `(${r1c.x},${r1c.y}) → (${r1d.x},${r1d.y})`);
  await shot(page, 'ios-2-tasindi.png');
  s = await screen(page, r1d.x, r1d.y);
  await tap(page, cdp, s, 750);
  check('kıpırdamadan uzun basınca menü açılıyor', (await page.getByRole('menu').count()) === 1);
  const empty = await screen(page, r1d.x + 14, r1d.y - 18);
  await tap(page, cdp, empty);
  const selected = await page.locator('svg.schematic rect[stroke-dasharray="4 3"]').count();
  check('boşluğa dokununca menü ve seçim kalkıyor', (await page.getByRole('menu').count()) === 0 && selected === 0, `seçim çerçevesi ${selected}`);
  // Boşlukta tek parmakla kaydırma
  const viewBefore = await screen(page, 0, 0);
  await drag(page, cdp, empty, { x: empty.x + 50, y: empty.y + 70 });
  const viewAfter = await screen(page, 0, 0);
  check('boşlukta tek parmakla tuval kaydırılıyor', Math.abs(viewAfter.x - viewBefore.x - 50) < 2 && Math.abs(viewAfter.y - viewBefore.y - 70) < 2);
  const pinScreen = await screen(page, r1d.x - 4, r1d.y);
  await tap(page, cdp, { x: pinScreen.x - 6, y: pinScreen.y });
  const cancelVisible = await page.getByRole('button', { name: 'İptal', exact: true }).isVisible().catch(() => false);
  check('pine dokununca kablo çizimi başlıyor ve İptal düğmesi görünüyor', cancelVisible);
  if (cancelVisible) await page.getByRole('button', { name: 'İptal', exact: true }).tap();
  await page.waitForTimeout(200);
  check('İptal ile kablo çizimi bitiyor', !(await page.getByRole('button', { name: 'İptal', exact: true }).isVisible().catch(() => false)) && (await doc(page)).wires.length === 0);
  s = await screen(page, r1d.x, r1d.y);
  await tap(page, cdp, s); await page.waitForTimeout(80); await tap(page, cdp, s); await page.waitForTimeout(300);
  const fontSize = await page.evaluate(() => getComputedStyle(document.querySelector('[role=dialog] input')).fontSize);
  check('çift dokunuşla özellik penceresi açılıyor; giriş yazısı 16 px (iOS yakınlaşmasın)', fontSize === '16px', fontSize);
  await page.getByRole('button', { name: 'İptal' }).first().tap(); await page.waitForTimeout(200);
  // Parmaklar parçanın iki yanında: yakınlaşma o noktanın çevresinde olur, parça ekranda kalır.
  const c = await screen(page, r1d.x, r1d.y);
  const cx = Math.min(Math.max(c.x, 110), 280);
  const cy = Math.min(Math.max(c.y, 200), 600);
  const scaleBefore = c.scale;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 35, y: cy, id: 1 }, { x: cx + 35, y: cy, id: 2 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 35 - i * 8, y: cy, id: 1 }, { x: cx + 35 + i * 8, y: cy, id: 2 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(200);
  const scaleAfter = (await screen(page, 0, 0)).scale;
  check('iki parmakla yakınlaştırma çalışıyor', scaleAfter > scaleBefore * 1.3, `${scaleBefore.toFixed(2)} → ${scaleAfter.toFixed(2)}`);
  // Yakınlaştırmadan sonra tek parmak yine çalışıyor mu (takılı işaretçi kaydı kalmamalı)
  const r1e = await part(page, 'R1');
  s = await screen(page, r1e.x, r1e.y);
  await drag(page, cdp, s, { x: s.x + 80, y: s.y });
  const r1f = await part(page, 'R1');
  check('yakınlaştırmadan sonra parça yine tek parmakla taşınıyor', r1f.x !== r1e.x, `(${r1e.x},${r1e.y}) → (${r1f.x},${r1f.y}); dokunuş (${Math.round(s.x)},${Math.round(s.y)})`);
  await openExample(page, 'Voltmetrenin yükleme etkisi');
  await page.getByRole('button', { name: 'Örnek açıklamasını küçült' }).tap().catch(() => {});
  await page.getByRole('button', { name: 'Oynat' }).tap(); await page.waitForTimeout(600);
  const v1 = await part(page, 'V1');
  s = await screen(page, v1.x, v1.y);
  await tap(page, cdp, s); await page.waitForTimeout(300);
  const tooltip = await page.getByRole('tooltip').textContent().catch(() => '');
  check('telefonda seçili parçanın V/I/P kutusu görünüyor', /Gösterge/.test(tooltip ?? ''), (tooltip ?? '').slice(0, 40));
  await shot(page, 'ios-3-vip.png');
  await page.context().close();

  // --- Osiloskop paneli (telefon) -----------------------------------------------------
  {
    const { page: sp, cdp: scdp } = await phone();
    await openExample(sp, 'Yarım dalga doğrultmaç');
    await sp.getByRole('button', { name: 'Örnek açıklamasını küçült' }).tap().catch(() => {});
    const expand = sp.getByRole('button', { name: 'Osiloskop panelini aç' });
    check('telefonda osiloskop paneli küçültülmüş başlıyor', await expand.isVisible().catch(() => false));
    await sp.getByRole('button', { name: 'Oynat' }).tap(); await sp.waitForTimeout(300);
    await expand.tap(); await sp.waitForTimeout(1200);
    const strip = await sp.locator('section[aria-labelledby] .tabular').first().textContent().catch(() => '');
    check('dokununca panel açılıyor; ekran ve ölçümler görünüyor', /Tepe-tepe 20,0 V/.test(strip ?? ''), (strip ?? '').slice(0, 50));
    await sp.getByLabel('Kanal B Volt/bölme').selectOption('2'); await sp.waitForTimeout(200);
    const scopePart = await part(sp, 'OSC1');
    check('panelden ayar değişince parçaya kaydediliyor', scopePart.props.voltsPerDivB === 2, String(scopePart.props.voltsPerDivB));
    await sp.getByRole('button', { name: 'Oto' }).tap(); await sp.waitForTimeout(200);
    const auto = (await part(sp, 'OSC1')).props;
    check('Oto ayar 5 ms/bölme ve 5 V/bölme seçiyor', auto.timePerDiv === 0.005 && auto.voltsPerDivA === 5, `${auto.timePerDiv} s, ${auto.voltsPerDivA} V`);
    // Panel açıkken tuvaldeki bir parçaya dokunmak yine seçmeli.
    const d1 = await part(sp, 'D1');
    const p = await screen(sp, d1.x, d1.y);
    await tap(sp, scdp, p); await sp.waitForTimeout(200);
    const chosen = await sp.locator('svg.schematic rect[stroke-dasharray="4 3"]').count();
    check('panel açıkken tuvalde parçaya dokununca seçiliyor', chosen > 0);
    await shot(sp, 'ios-4-osiloskop.png');
    await sp.context().close();
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
  const banner = gp.getByRole('alert').filter({ hasText: 'devrede toprak yok' });
  check('masaüstü: toprak yokken Oynat’ta afiş ve tek tıkla düzeltme çıkıyor', (await banner.count()) === 1 && (await banner.getByRole('button', { name: 'B1’in − ucuna toprak ekle' }).count()) === 1);
  await banner.getByRole('button', { name: 'B1’in − ucuna toprak ekle' }).click(); await gp.waitForTimeout(700);
  const fixedDoc = await doc(gp);
  const runningText = (await gp.getByRole('region', { name: 'Simülasyon' }).getByRole('status').textContent()) ?? '';
  check('masaüstü: toprak eklenince simülasyon başlıyor', fixedDoc.parts.some((p) => p.type === 'ground') && runningText.includes('Çalışıyor'), runningText);
  await ngCtx.close();

  const trapCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const tp = await trapCtx.newPage();
  tp.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await tp.goto(URL0, { waitUntil: 'networkidle' });
  await tp.getByRole('button', { name: 'Örnekler', exact: true }).click(); await tp.waitForTimeout(200);
  await tp.getByRole('button', { name: 'Toprak tuzağı: köprüde prob toprağı', exact: true }).click(); await tp.waitForTimeout(400);
  const earthLabel = await tp.locator('svg.schematic text', { hasText: 'şebeke toprağı' }).count();
  await tp.getByRole('tab', { name: /Mesajlar/ }).click(); await tp.waitForTimeout(150);
  const trapText = (await tp.getByRole('tabpanel').textContent()) ?? '';
  check('masaüstü: toprak tuzağında uyarı ve şebeke toprağı çizgisi', earthLabel === 1 && trapText.includes('Toprak tuzağı') && trapText.includes('D4 kısa devre oldu'), trapText.slice(0, 50));
  await trapCtx.close();

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
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(problems.length ? problems.join('\n') : 'konsol hatası yok');
console.log(failed ? `\n${failed} madde KALDI.` : `\n${results.length} maddenin hepsi geçti.`);
process.exit(failed || problems.length ? 1 : 0);
