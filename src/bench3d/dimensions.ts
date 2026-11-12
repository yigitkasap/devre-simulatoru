// 3B modellerin gerçek ölçüleri (mm; three'siz). Modeller bu sayılardan kurulur, birim testi
// (tests/model-olcek.test.ts) hem sayıları veri sayfalarındaki aralıklarla hem de kurulan gövdelerin
// kutularını bu sayılarla karşılaştırır. Kaynaklar docs/KARARLAR.md → "3B modeller: gerçek ölçüler".
//
// Ölçek: 1 birim = 2,54 mm (devre tahtasının delik aralığı).

/** mm → birim. */
export const MM = 1 / 2.54;
export const mm = (value: number): number => value * MM;

/** TO-18 metal kılıf (BC107; NXP/Philips SOT18/13: A 4,74–5,31, D 5,30–5,45, D1 4,55–4,70, j 0,94–1,03, k 0,9–1,1, b 0,41–0,47). */
export const TO18 = {
  /** Kapağın çapı (D1). */
  can: 4.65,
  /** Alt flanşın çapı (D). */
  flange: 5.4,
  /** Oturma düzleminden kapağın tepesine (A). */
  height: 5.0,
  /** Flanşın kalınlığı (veri sayfasında yok; JEDEC TO-206AA çizimlerinde ≈ 0,3–0,5). */
  flangeThickness: 0.4,
  /** Sekmenin genişliği (j) ve flanştan taşan boyu (k). */
  tabWidth: 1.0,
  tabLength: 1.0,
  /** Bacakların dizildiği dairenin çapı (a) ve bacak çapı (b). */
  leadCircle: 2.54,
  lead: 0.45,
} as const;

/** TO-92 plastik kılıf (onsemi CASE 29-11 / JEDEC TO-226AA: çap 4,45–5,20, yükseklik 4,32–5,33, derinlik 3,18–4,19, bacak 0,407–0,533, aralık 1,27). */
export const TO92 = {
  diameter: 4.8,
  height: 4.8,
  /** Düz yüzden yuvarlak sırta. */
  depth: 3.7,
  lead: 0.46,
  pitch: 1.27,
} as const;

/** TO-220AB (IRF510, L7805CV, LM317T; Vishay IRF510: E 10,0–10,51, A 4,25–4,65, D 14,85–15,49, ØP 3,54–3,94, e 2,54). */
export const TO220 = {
  width: 10.0,
  /** Plastik gövdenin boyu. */
  body: 9.2,
  thickness: 4.5,
  /** Gövdenin altından tırnağın tepesine. */
  overall: 15.4,
  tabThickness: 1.3,
  hole: 3.66,
  pitch: 2.54,
} as const;

/** Aktif buzzer Same Sky (CUI) CMI-1295IC-0585T: Ø 12 × 9,5 mm; bacak aralığı 6,5 mm. */
export const BUZZER = { diameter: 12, height: 9.5, pitch: 6.5 } as const;

/** Omron G2R-1 (kart tipi, tek kontak): en çok 29 × 13 × 25,5 mm (boy × en × yükseklik). */
export const RELAY = { length: 29, width: 13, height: 25.5 } as const;

/** maxon A-max 26 (110937): Ø 26 mm, boy 44,7 mm; mil Ø 4 mm. */
export const MOTOR = { diameter: 26, length: 44.7, shaft: 4, shaftLength: 12 } as const;

/** Visaton FRS 5 (8 Ω): sepet Ø 50,5 mm, kulaklarla 68 mm, derinlik 31,5 mm; mıknatıs ≈ Ø 30 × 11 mm (çizimden). */
export const SPEAKER = { basket: 50.5, lugs: 68, depth: 31.5, magnet: 30, magnetHeight: 11 } as const;

/** 9 V pil 6LR61 (IEC 60086-2): en çok 48,5 × 26,5 × 17,5 mm; kopça merkezleri 12,7 mm. */
export const PP3 = { length: 48.5, width: 26.5, height: 17.5, snapPitch: 12.7 } as const;

/** AA pil LR6 (IEC 60086-2): en çok Ø 14,5 × 50,5 mm; yatağı hücre başına 15,5 mm, boyu 58 mm. */
export const AA = { diameter: 14.5, length: 50.5, holderPitch: 15.5, holderLength: 58 } as const;

/** E10 (MES) minyatür lamba: vida dişi Ø 10 mm (IEC 60061), cam balon Ø 11 mm, toplam boy ≈ 24 mm. */
export const E10 = { thread: 10, bulb: 11, length: 24, threadLength: 9.5 } as const;

/** Kutupsuz kondansatörler: seramik disk (≤ 10 nF), radyal çok katmanlı seramik (≤ 1 µF), kutu film (daha büyük). */
export const CERAMIC_DISC = { diameter: 5, thickness: 2.5 } as const;
export const MLCC = { width: 4.2, height: 3.8, thickness: 2.5 } as const;
export const FILM_BOX = { width: 7.2, height: 6.5, thickness: 2.5 } as const;

/** Kutupsuz kondansatörün kılıfı kapasiteye göre. */
export function nonPolarPackage(farads: number): 'disc' | 'mlcc' | 'film' {
  return farads <= 10e-9 * 1.0001 ? 'disc' : farads <= 1e-6 * 1.0001 ? 'mlcc' : 'film';
}

/** Pilin görünüşü gerilime göre: 9 V'luk blok (7,5–10,5 V) ya da AA pil yatağı (1,5 V'luk hücreler, en çok 8). */
export function batteryPack(volts: number): { kind: 'pp3' } | { kind: 'aa'; cells: number; layers: 1 | 2; perLayer: number } {
  const v = Math.abs(volts);
  if (v >= 7.5 && v <= 10.5) return { kind: 'pp3' };
  const cells = Math.max(1, Math.min(8, Math.round(v / 1.5)));
  const layers = cells > 4 ? 2 : 1;
  return { kind: 'aa', cells, layers, perLayer: Math.ceil(cells / layers) };
}

/** Pilin masada kapladığı yer (birim): boy (x; uçtaki kablolarla) ve en (z). */
export function batteryFootprint(volts: number): { w: number; d: number } {
  const pack = batteryPack(volts);
  if (pack.kind === 'pp3') return { w: mm(PP3.length) + 5, d: mm(PP3.width) };
  return { w: mm(AA.holderLength) + 3.5, d: mm(AA.holderPitch) * pack.perLayer + mm(3) };
}

/** Transistörün kılıfı modele göre (föyün parçaları): BC107 metal TO-18, IRF510 TO-220, öbürleri TO-92. */
export function transistorPackage(model: string): 'to18' | 'to220' | 'to92' {
  return model === 'BC107' ? 'to18' : model === 'IRF510' ? 'to220' : 'to92';
}
