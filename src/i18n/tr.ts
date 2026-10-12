// Arayüzdeki TÜM metinler. Dil şimdilik yalnızca Türkçe.
//
// Yazım notları:
//   - Fizik terimleri: "gerilim" (voltaj değil), "akım", "iç direnç", "toprak", "kısa devre", "ön direnç".
//   - Bileşen adlarına (R1, B1...) ek getirilmez; okunuşa göre değişen ekler yerine
//     "R1 direncinin", "B1 pilinin" gibi yapılar kullanılır.
//   - Sayılar src/sim/units.ts ile Türkçe biçimde (4,7 kΩ) yazılır.
//   - Formüllerdeki alt simgeler `_{...}` ile işaretlenir (R_{iç}); ekranda editor/Rich.tsx
//     bunları gerçek alt simge (<sub>) olarak çizer.

import { SITE_NAME } from '../config';
import type { Diagnostic } from '../sim/diagnostics';
import type { ExampleId } from '../examples';
import type { DeviceType } from '../sim/netlist';
import { formatSI } from '../sim/units';

export interface DiagnosticContext {
  /** Bileşenin tuvaldeki adı (R1, B2...). */
  label(id: string): string;
  /** Bileşenin türü. */
  type(id: string): DeviceType | undefined;
}

const DEVICE_NAMES: Record<DeviceType, string> = {
  battery: 'Pil',
  ground: 'Toprak',
  resistor: 'Direnç',
  capacitor: 'Kondansatör',
  diode: 'Diyot',
  led: 'LED',
  switch: 'Anahtar',
  voltmeter: 'Voltmetre',
  ammeter: 'Ampermetre',
};

/** "R1 direnci", "B1 pili" gibi tamlamalar için tür adının küçük harfli, belirtme durumlu hali. */
const DEVICE_GENITIVE: Record<DeviceType, string> = {
  battery: 'pilinin',
  ground: 'toprak sembolünün',
  resistor: 'direncinin',
  capacitor: 'kondansatörünün',
  diode: 'diyotunun',
  led: 'LED’inin',
  switch: 'anahtarının',
  voltmeter: 'voltmetresinin',
  ammeter: 'ampermetresinin',
};

const PIN_NAMES: Record<DeviceType, readonly string[]> = {
  battery: ['+ ucu', '− ucu'],
  ground: ['ucu'],
  resistor: ['1. ucu', '2. ucu'],
  capacitor: ['+ ucu', '− ucu'],
  diode: ['anot ucu', 'katot ucu'],
  led: ['anot ucu', 'katot ucu'],
  switch: ['1. ucu', '2. ucu'],
  voltmeter: ['+ ucu', '− ucu'],
  ammeter: ['+ ucu', '− ucu'],
};

function list(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} ve ${labels[labels.length - 1]}`;
}

function describeDiagnostic(d: Diagnostic, ctx: DiagnosticContext): { title: string; detail: string } {
  const labels = d.elementIds.map((id) => ctx.label(id));
  const first = d.elementIds[0];
  const firstLabel = labels[0] ?? '';
  const p = d.params ?? {};
  switch (d.code) {
    case 'no-ground':
      return {
        title: 'Devrede toprak yok',
        detail: 'Devrede toprak (0 V referansı) yok. Bir toprak sembolü ekleyip devreye bağla.',
      };
    case 'ground-unconnected':
      return {
        title: 'Toprak bağlı değil',
        detail: 'Toprak sembolü devreye bağlı değil. Toprağın ucunu bir kabloyla devreye bağla.',
      };
    case 'voltage-loop':
      return {
        title: 'Direnç içermeyen döngü',
        detail:
          d.elementIds.length === 1
            ? `${firstLabel} kaynağının iki ucu doğrudan kabloyla birleştirilmiş ve iç direnci yok. ` +
              'Akımı sınırlayan hiçbir şey olmadığı için devre çözülemez. Pile iç direnç ver ya da araya bir direnç ekle.'
            : `${list(labels)} yalnızca ideal kaynaklar ve kablolardan oluşan, hiç direnç içermeyen bir döngü kuruyor. ` +
              'Böyle bir döngüde gerilimler çelişir ya da akım belirsiz kalır; devre çözülemez. ' +
              'Kaynaklardan birine iç direnç ver ya da döngüye bir direnç ekle.',
      };
    case 'floating-pin': {
      const type = first ? ctx.type(first) : undefined;
      const owner = type ? `${firstLabel} ${DEVICE_GENITIVE[type]}` : firstLabel;
      const pin = type && d.pin !== undefined ? (PIN_NAMES[type][d.pin] ?? 'bir ucu') : 'bir ucu';
      return { title: 'Boşta uç', detail: `${owner} ${pin} hiçbir yere bağlı değil.` };
    }
    case 'floating-island':
      return {
        title: 'Toprağa bağlı olmayan parça',
        detail: `${list(labels)} toprağa bağlı değil. Bu parçadaki gerilimler belirsizdir; parçayı bir kabloyla toprağa bağla.`,
      };
    case 'ammeter-parallel':
      return {
        title: 'Ampermetre paralel bağlanmış',
        detail:
          `${labels[0] ?? ''} ampermetresi doğrudan ${labels[1] ?? ''} pilinin iki ucuna bağlanmış. ` +
          'Ampermetre seri bağlanır; iç direnci çok küçük olduğu için paralel bağlanınca kısa devre olur.',
      };
    case 'short-circuit': {
      const r = p.internalResistance ?? 0;
      return {
        title: 'Kısa devre',
        detail:
          `${firstLabel} pilinden ${formatSI(p.current ?? 0, 'A')} akım çekiliyor. ` +
          (r > 0
            ? `Dış devrenin direnci pilin iç direncinden (${formatSI(r, 'Ω', { trim: true })}) küçük. `
            : 'Dış devrenin direnci neredeyse sıfır. ') +
          'Gerçek bir pil bu durumda hızla ısınır ve boşalır.',
      };
    }
    case 'led-burned':
      return {
        title: 'LED yandı',
        detail:
          `${firstLabel}: LED’den ${formatSI(p.current ?? 0, 'A')} geçti, ama bu LED en fazla ` +
          `${formatSI(p.maxCurrent ?? 0, 'A', { trim: true })}’e dayanabilir. ` +
          'Seri bir ön direnç ekle: R = (V_{kaynak} − V_{f}) / I. ' +
          `(Bu LED için V_{f} ≈ ${formatSI(p.forwardVoltage ?? 0, 'V', { trim: true })}, I için 20 mA seçebilirsin.)`,
      };
    case 'nr-failed':
      return {
        title: 'Çözüm yakınsamadı',
        detail:
          'Newton-Raphson yöntemi en küçük zaman adımında (1 ns) da yakınsamadı. ' +
          (labels.length > 0 ? `Sorun çıkaran bileşenler: ${list(labels)}. ` : '') +
          'Bu bileşenlerin bağlantılarını ve değerlerini kontrol et.',
      };
    case 'singular-matrix':
      return {
        title: 'Devre denklemleri çözülemedi',
        detail:
          'Denklem sisteminin matrisi tekil çıktı (sıfır pivot). Genellikle şu durumlarda olur: ideal kaynaklar birbirine ' +
          'doğrudan bağlanmıştır, ya da çok küçük ve çok büyük değerler (ör. 1 nΩ ile 1 GΩ) aynı devrede kullanılmıştır. ' +
          (labels.length > 0 ? `İlgili bileşenler: ${list(labels)}.` : ''),
      };
  }
}

const DEVICE_DESCRIPTIONS: Record<DeviceType, string> = {
  battery: 'Uçları arasında sabit bir gerilim tutan doğru akım kaynağı; iç direnci ayarlanabilir.',
  ground: 'Devrenin 0 V referans noktası; her devrede en az bir tane olmalı.',
  resistor: 'Üzerinden geçen akımla orantılı bir gerilim düşümü oluşturur: V = I · R.',
  capacitor: 'Yük depolar; bir direnç üzerinden zamanla dolar ya da boşalır.',
  diode: 'Akımı yalnızca bir yönde, anottan katoda geçirir; ileri yönde yaklaşık 0,6-0,7 V düşürür.',
  led: 'Işık yayan diyot; fazla akım geçerse yanar, bu yüzden seri bir ön direnç gerekir.',
  switch: 'Devreyi açar ya da kapatır; simülasyon sırasında üzerine tıklayarak değiştirilir.',
  voltmeter: 'İki nokta arasındaki gerilimi ölçer; ölçülen parçaya paralel bağlanır.',
  ammeter: 'İçinden geçen akımı ölçer; devreye seri bağlanır.',
};

/** Özellik penceresindeki alan adları (tür + özellik anahtarı). */
function fieldLabel(type: DeviceType, key: string): string {
  if ((type === 'voltmeter' || type === 'ammeter') && key === 'resistance') return 'İç direnç';
  if (type === 'voltmeter' && key === 'ideal') return 'İdeal voltmetre (iç direnç ∞)';
  if (type === 'ammeter' && key === 'ideal') return 'İdeal ampermetre (iç direnç 0 Ω)';
  const labels: Record<string, string> = {
    voltage: 'Gerilim',
    internalResistance: 'İç direnç',
    resistance: 'Direnç',
    capacitance: 'Kapasite',
    initialVoltage: 'Başlangıç gerilimi',
    color: 'Renk',
    closed: 'Anahtar kapalı (akım geçirir)',
  };
  return labels[key] ?? key;
}

export interface ExampleTexts {
  readonly title: string;
  /** Devrenin kurulumu (cevabı vermeden). */
  readonly description: string;
  /** Simülasyonu başlatmadan önce öğrencinin tahmin etmesi için soru. */
  readonly question: string;
  /** Simülasyon çalıştırılınca gösterilen cevap ve deneme önerisi. */
  readonly answer: string;
}

const EXAMPLES: Record<ExampleId, ExampleTexts> = {
  'led-on-direnc': {
    title: 'LED ve ön direnç',
    description:
      'İdeal 5 V’luk pil, 330 Ω’luk ön direnç ve kırmızı bir LED seri bağlı; ampermetre devreden geçen akımı ölçüyor. Ön direnç, LED’den geçen akımı sınırlar.',
    question: 'Ampermetre kaç mA gösterir? LED’in üzerinde yaklaşık 1,8 V düştüğünü düşünerek önce hesapla, sonra Oynat’a bas.',
    answer:
      'Yaklaşık 9,7 mA: I = (5 V − 1,8 V) / 330 Ω. Ön direnci 100 Ω’a düşürürsen akım 30 mA’i aşar ve LED yanar; dene ve açıklamayı oku.',
  },
  'gerilim-bolucu': {
    title: 'Gerilim bölücü',
    description:
      'İki eşit direnç (1 kΩ + 1 kΩ) ideal 9 V’luk bir pile seri bağlı. Voltmetre, dirençlerin birleştiği orta noktanın gerilimini ölçüyor.',
    question: 'Voltmetre kaç volt gösterir? Önce hesapla, sonra Oynat’a bas.',
    answer:
      '4,5 V: V_{çıkış} = V · R_{2} / (R_{1} + R_{2}) = 9 V · 1 kΩ / 2 kΩ. Dirençlerden birinin değerini değiştirip çıkış geriliminin nasıl değiştiğine bak.',
  },
  'voltmetre-yukleme': {
    title: 'Voltmetrenin yükleme etkisi',
    description:
      '12 V’luk ideal kaynağa seri bağlı 200 kΩ’luk direnç, iç direnci büyük bir sensörü temsil ediyor. Çıkışı iç direnci 1 MΩ olan bir voltmetreyle ölçüyoruz.',
    question: 'Voltmetre kaç volt gösterir? Önce hesapla, sonra Oynat’a bas.',
    answer:
      'Voltmetre 12 V yerine 10 V gösterir: voltmetre de devrenin bir parçasıdır ve 200 kΩ ile bir gerilim bölücü kurar, V = 12 V · R_{V} / (200 kΩ + R_{V}) = 10 V. Voltmetrenin iç direncini 20 MΩ’a çıkarıp farkı gör.',
  },
  'ampermetre-etkisi': {
    title: 'Ampermetrenin etkisi',
    description: '12 V’luk ideal kaynak, 100 Ω’luk direnç ve seri bağlı, iç direnci 1 Ω olan bir ampermetre.',
    question: 'Ampermetre kaç mA gösterir? Önce hesapla, sonra Oynat’a bas.',
    answer:
      'Ampermetre 120 mA yerine 118,8 mA gösterir: ampermetrenin iç direnci de akıma karşı koyar, I = 12 V / (100 Ω + R_{A}) = 12 V / 101 Ω. İdeal ampermetreye geçip farkı gör.',
  },
  'rc-dolma': {
    title: 'RC dolma',
    description:
      '10 V’luk pil, anahtar, 1 kΩ’luk direnç ve 100 µF’lık kondansatör seri bağlı; voltmetre kondansatörün gerilimini ölçüyor. Zaman sabiti τ = R · C = 0,1 s; t = τ anında kondansatör yaklaşık %63 dolar.',
    question:
      'Anahtarı kapattıktan 0,1 s sonra voltmetre kaç volt gösterir? Önce hesapla; sonra hızı ×0,1’e çek, Oynat’a bas ve anahtara tıkla.',
    answer:
      'Yaklaşık 6,3 V: V = 10 V · (1 − e⁻¹), yani 10 V’un %63’ü. 5τ = 0,5 s sonra kondansatör neredeyse tamamen dolar (≈ 9,9 V). Anahtarı açınca kondansatör yükünü korur; yalnızca voltmetrenin 10 MΩ’luk iç direnci üzerinden çok yavaş boşalır.',
  },
  'diyot-yonu': {
    title: 'Diyot yönü',
    description: 'İdeal 5 V’luk pil, 1 kΩ’luk direnç, ileri yönde bağlı bir silisyum diyot ve seri bir ampermetre.',
    question:
      'Ampermetre kaç mA gösterir? Diyotun üzerinde yaklaşık 0,65 V düştüğünü düşünerek önce hesapla, sonra Oynat’a bas.',
    answer:
      'Yaklaşık 4,35 mA: I = (5 V − 0,65 V) / 1 kΩ. Şimdi diyotu seçip F’ye bas (ya da sağ tıklayıp “Ters çevir”i seç) ve yeniden Oynat’a bas: akım neredeyse sıfıra düşer, çünkü ters yönde diyot yalnızca çok küçük bir sızıntı akımı geçirir.',
  },
};

export const tr = {
  site: {
    name: SITE_NAME,
  },
  app: {
    noScript: `${SITE_NAME} tarayıcıda JavaScript ile çalışır. Lütfen JavaScript’i etkinleştir.`,
    loading: 'Yükleniyor…',
  },
  devices: {
    names: DEVICE_NAMES,
    pins: PIN_NAMES,
    descriptions: DEVICE_DESCRIPTIONS,
    ledColors: { red: 'Kırmızı', green: 'Yeşil', blue: 'Mavi' } as Record<string, string>,
  },
  library: {
    title: 'Parçalar',
    search: 'Parça ara…',
    searchLabel: 'Parça ara',
    noResults: 'Bu aramayla eşleşen parça yok.',
    categories: {
      sources: 'Kaynaklar',
      passive: 'Pasif',
      semiconductors: 'Yarı iletkenler',
      switches: 'Anahtarlar',
      meters: 'Ölçü aletleri',
    },
    hint: 'Sürükleyip tuvale bırak ya da seçip tuvale tıkla.',
    close: 'Kütüphaneyi kapat',
  },
  toolbar: {
    library: 'Parça kütüphanesi',
    select: 'Seç',
    selectTitle: 'Seç ve taşı',
    wire: 'Kablo',
    wireTitle: 'Kablo çek (W)',
    rotate: 'Döndür',
    rotateTitle: 'Döndür (R)',
    remove: 'Sil',
    removeTitle: 'Seçileni sil (Delete)',
    undo: 'Geri al',
    undoTitle: 'Geri al (Ctrl+Z)',
    redo: 'Yinele',
    redoTitle: 'Yinele (Ctrl+Y)',
    zoomIn: 'Yakınlaştır',
    zoomOut: 'Uzaklaştır',
    fit: 'Devreyi ekrana sığdır',
    settings: 'Ayarlar',
  },
  settings: {
    title: 'Ayarlar',
    resistorStyle: 'Direnç sembolü',
    zigzag: 'Zigzag',
    iec: 'Kutu (IEC)',
  },
  canvas: {
    label: 'Devre şeması',
    empty: 'Başlamak için soldaki kütüphaneden bir parça sürükle.',
    emptyMobile: 'Parça eklemek için sol üstteki kütüphane düğmesine dokun.',
    wiringActive: 'Kablo çiziliyor: bir pine ya da kabloya dokun',
    cancelWire: 'İptal',
  },
  sim: {
    play: 'Oynat',
    pause: 'Duraklat',
    stop: 'Durdur',
    stopTitle: 'Durdur: LED’ler onarılır, kondansatörler başlangıç gerilimine döner',
    time: 'Zaman',
    speed: 'Hız',
    speedTitle: 'Simülasyon hızı: simülasyon zamanının gerçek zamana oranı',
    electronFlow: 'Elektron akışını göster',
    electronNote: 'Elektronlar, geleneksel akım yönünün tersine hareket eder.',
    conventionalNote: 'Noktalar geleneksel akım yönünü gösterir: dış devrede + uçtan − uca.',
    stoppedByEdit: 'Devrenin yapısı değiştiği için simülasyon durduruldu.',
    cannotRun: 'Simülasyon çalışamıyor:',
    status: { running: 'Çalışıyor', paused: 'Duraklatıldı', stopped: 'Durduruldu' },
    legend: 'Kablo gerilimi',
  },
  readout: {
    voltage: 'Gerilim',
    current: 'Akım',
    power: 'Güç',
    powerUsed: 'Harcanan güç',
    terminalVoltage: 'Uç gerilimi',
    outputCurrent: 'Verdiği akım',
    powerDelivered: 'Verdiği güç',
    internalLoss: 'İç dirençte kaybolan güç',
    energy: 'Depolanan enerji (½CV²)',
    forwardVoltage: 'Gerilim (anot − katot)',
    brightness: 'Parlaklık',
    state: 'Durum',
    open: 'Açık',
    closed: 'Kapalı',
    burned: 'Yanmış',
    voltageAcross: 'Uçları arasındaki gerilim',
    reading: 'Gösterge',
    drawnCurrent: 'Devreden çektiği akım',
    voltageDrop: 'Üzerindeki gerilim düşümü',
    charging: 'Kondansatör doluyor.',
    discharging: 'Kondansatör boşalıyor.',
    steady: 'Akım yok: kondansatörün gerilimi değişmiyor.',
    forwardBiased: 'İleri yönde kutuplanmış: akım anottan katoda geçer.',
    reverseBiased: 'Ters yönde kutuplanmış: yalnızca çok küçük bir sızıntı akımı geçer.',
    burnedNote: 'Yanmış LED açık devredir. Durdur’a bas ya da sağ tıklayıp “Onar”ı seç.',
    ledLimits: (vf: string, max: string) => `20 mA’de ileri gerilim ≈ ${vf}; en fazla ${max}.`,
    switchClosedNote: (r: string) => `Kapalı anahtar ${r} değerinde bir dirençtir.`,
    switchOpenNote: 'Açık anahtar akım geçirmez; uçları arasındaki gerilim devrenin geri kalanına bağlıdır.',
    idealVoltmeter: 'İdeal voltmetre devreden hiç akım çekmez.',
    realVoltmeter: (r: string, i: string) => `İç direnci ${r}: ölçtüğü devreden ${i} çekiyor.`,
    idealAmmeter: 'İdeal ampermetrenin direnci sıfırdır; üzerinde gerilim düşmez.',
    realAmmeter: (r: string, drop: string) => `İç direnci ${r}: devrede ${drop} gerilim düşümüne yol açıyor.`,
  },
  examples: {
    section: 'Örnekler',
    texts: EXAMPLES,
    badge: 'Örnek',
    predict: 'Tahmin et',
    answer: 'Cevap',
    answerHidden: 'Cevabı görmek için Oynat’a bas.',
    close: 'Örnek açıklamasını kapat',
    collapse: 'Örnek açıklamasını küçült',
    expand: 'Örnek açıklamasını aç',
    loaded: 'Örnek yüklendi. Önceki devrene dönmek için Geri al (Ctrl+Z).',
  },
  file: {
    menu: 'Dosya',
    newCircuit: 'Yeni devre',
    exportJson: 'JSON olarak dışa aktar',
    importJson: 'JSON dosyası içe aktar…',
    share: 'Paylaşım bağlantısı…',
    fileName: 'devre',
    newDone: 'Yeni devre açıldı. Önceki devrene dönmek için Geri al (Ctrl+Z).',
    imported: 'Devre içe aktarıldı. Önceki devrene dönmek için Geri al (Ctrl+Z).',
    importError: 'Bu dosya geçerli bir devre dosyası değil (sürüm 1 JSON bekleniyor).',
    sharedLoaded: 'Paylaşılan devre açıldı.',
    sharedError: 'Paylaşım bağlantısındaki devre okunamadı; bağlantı eksik kopyalanmış olabilir.',
  },
  shareDialog: {
    title: 'Paylaşım bağlantısı',
    description:
      'Devre bu bağlantının içine sıkıştırılarak yazıldı; bir sunucuya gönderilmedi. Bağlantıyı açan kişi aynı devreyi görür.',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    copyFailed: 'Kopyalanamadı; bağlantıyı seçip elle kopyala.',
    close: 'Kapat',
    length: (n: number) => `${n} karakter`,
  },
  messages: {
    title: 'Mesajlar',
    errors: (n: number) => `${n} hata`,
    warnings: (n: number) => `${n} uyarı`,
    none: 'Sorun yok',
    show: 'Mesajları göster',
    hide: 'Mesajları gizle',
    hint: 'Bir mesaja tıklayınca ilgili parça tuvalde vurgulanır.',
  },
  contextMenu: {
    properties: 'Özellikler…',
    rotate: 'Döndür (R)',
    flip: 'Ters çevir (F)',
    remove: 'Sil',
    repair: 'Onar',
  },
  balloon: {
    repair: 'Onar',
    close: 'Kapat',
  },
  hints: {
    touchAdded:
      'Parça eklendi. Sürükle: taşı · pin ucuna dokun: kablo · çift dokun: özellikler · basılı tut: menü (Döndür, Ters çevir, Sil)',
    simulating:
      'Simülasyon sırasında: anahtarı açıp kapatmak için üzerine tıkla · değer değiştirmek için çift tıkla · parça eklemek ya da taşımak simülasyonu durdurur',
    select:
      'Kablo çekmek için bir pinin ucuna tıkla. Çift tık: özellikler · R: döndür · F: ters çevir · Delete: sil · Boşluk + sürükle: tuvali kaydır',
    place: (name: string) =>
      `${name}: yerleştirmek için tuvale tıkla · R: döndür · F: ters çevir · Shift + tıkla: birden çok · Esc: iptal`,
    wireIdle: 'Kablo: başlamak için bir pine, kabloya ya da boş bir noktaya tıkla · Esc: seçme aracına dön',
    wiring: 'Köşe için tıkla · bitirmek için bir pine ya da kabloya tıkla · çift tık: boşta bitir · Esc: iptal',
    selected: (count: number) => `${count} öğe seçili · R: döndür · F: ters çevir · Delete: sil · Ctrl+Z: geri al`,
  },
  status: {
    zoom: 'Yakınlık',
  },
  properties: {
    title: (label: string) => `${label} — özellikler`,
    name: 'Ad',
    ok: 'Tamam',
    cancel: 'İptal',
    fieldLabel,
    unitHint: 'SI önekleri: p, n, µ (ya da u), m, k, M, G. Büyük M mega, küçük m mili demektir.',
    notes: {
      battery: 'İç direnç, pilin verebileceği akımı sınırlar: kısa devrede I = V / R_{iç}.',
      capacitor: 'Başlangıç gerilimi, simülasyon başladığında (ve Durdur’dan sonra) kondansatörün + ucu ile − ucu arasındaki gerilimdir.',
      diode: 'Genel amaçlı silisyum diyot: 1 mA’de ≈ 0,60 V, 20 mA’de ≈ 0,70 V ileri gerilim. Ters yönde yalnızca çok küçük bir sızıntı akımı geçer.',
      voltmeter:
        'Gerçek voltmetrelerin iç direnci sonludur. Ölçtüğün kaynağın iç direnci büyükse voltmetre gerçek değerden düşük okur (yükleme etkisi).',
      ammeter:
        'Gerçek ampermetrelerin de küçük bir iç direnci vardır; seri bağlandığı devrenin akımını biraz azaltır.',
    } as Partial<Record<DeviceType, string>>,
    ledSpec: (vf: string, max: string) => `20 mA’de ileri gerilim ≈ ${vf}; en fazla ${max} akıma dayanır.`,
    errors: {
      empty: 'Bir değer yaz.',
      invalid: 'Bu bir sayı değil. Örnekler: 4,7k · 100µ · 2,2M · 0,5',
      wrongUnit: (unit: string) => `Bu alanın birimi ${unit}.`,
      positive: 'Değer sıfırdan büyük olmalı.',
      nonNegative: 'Değer negatif olamaz.',
      labelEmpty: 'Bir ad yaz.',
      labelTaken: 'Bu ad başka bir parçada kullanılıyor.',
    },
  },
  diagnostics: {
    describe: describeDiagnostic,
    severity: { error: 'Hata', warning: 'Uyarı' } as const,
  },
};

export type Translations = typeof tr;
