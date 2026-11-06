// Föydeki grafikler (analiz v2): her föy şeklinin adımlarına bağlı hazır grafikler. Başlangıç ekranında
// açık örnek föydeyse "Föydeki grafikler · Deney N · Şekil-M" bölümünde kart olarak görünür; tıklanınca
// grafik kurulur ve çizilir. Büyüklükler parçaların adıyla yazılır (devrede kimliğe çevrilir:
// editor/analysis/foyPlan.ts). Sonuçları testte simülasyonla ölçülür (tests/analiz-foy.test.ts).
// Adım numaraları föydeki gibi (i18n/foy.ts → LAB_FIGURE_TEXTS); föyde numarasız adımda boş.

import type { FoyGraphRef, TerminalQuantity } from '../model/analysis';
import { ek } from './ek';

/** Parçanın adıyla büyüklük: "A1" okuması, "OSC1" kanalı, "D1" uçları arası, "J1" büyüklüğü, uç gerilimi. */
export type FoyQuantity =
  | { readonly kind: 'meter'; readonly part: string }
  | { readonly kind: 'scope'; readonly part: string; readonly channel: 0 | 1 }
  | { readonly kind: 'across'; readonly part: string }
  | { readonly kind: 'current'; readonly part: string }
  | { readonly kind: 'terminal'; readonly part: string; readonly quantity: TerminalQuantity }
  /** İki ucun arası (b yoksa toprağa göre): üretecin TTL'i COM'a göre, katlayıcıda A − B. */
  | { readonly kind: 'pins'; readonly a: { readonly part: string; readonly pin: number }; readonly b?: { readonly part: string; readonly pin: number } };

export interface FoyParam {
  readonly part: string;
  readonly prop: string;
}

export type FoyPlan =
  | { readonly kind: 'time'; readonly y: readonly FoyQuantity[]; readonly x?: FoyQuantity }
  | {
      readonly kind: 'sweep';
      readonly param: FoyParam;
      readonly ranges: readonly { readonly from: number; readonly to: number; readonly step: number }[];
      readonly family?: { readonly param: FoyParam; readonly values: readonly number[] };
      readonly x: FoyQuantity | null;
      readonly y: readonly FoyQuantity[];
      /** Grafikte işaretlenecek değerler: V_P (akımın sıfırlandığı V_GS) ve I_DSS (V_GS = 0'daki akım). */
      readonly marks?: readonly ('vp' | 'idss')[];
    }
  | { readonly kind: 'bode' };

export interface FoyGraphDef {
  readonly key: string;
  /** Föydeki adım numaraları ("2–3"); föyde numarasız adımda boş, ek grafikte "EK". */
  readonly steps: string;
  /** Üst yazının ikinci kısmı ("ÇIKIŞ KARAKTERİSTİĞİ"). */
  readonly topic: string;
  readonly title: string;
  /** Alt satır: taranan ve basamak değerleri ya da çizilen büyüklükler. */
  readonly detail: string;
  readonly plan: FoyPlan;
}

const A = { kind: 'scope', part: 'OSC1', channel: 0 } as const;
const B = { kind: 'scope', part: 'OSC1', channel: 1 } as const;

/** Giriş (OSC1 · A) ve çıkış (OSC1 · B) zamana göre. */
const inOut = (steps: string, topic = 'GİRİŞ VE ÇIKIŞ'): FoyGraphDef => ({
  key: 'giris-cikis',
  steps,
  topic,
  title: 'Giriş ve çıkış dalgası',
  detail: 'OSC1 · A (giriş) ve OSC1 · B (çıkış) zamana göre',
  plan: { kind: 'time', y: [A, B] },
});

/** Diyot, zener ve LED'in I–V eğrisi osiloskobun X-Y'si gibi: x giriş, y 1 kΩ'un gerilimi (= akım, 1 V ↔ 1 mA). */
const xy = (steps: string, part: string): readonly FoyGraphDef[] => [
  {
    key: 'iv-xy',
    steps,
    topic: 'I–V EĞRİSİ (X-Y)',
    title: `${ek(part, 'in')} I–V eğrisi`,
    detail: 'x = OSC1 · A (giriş), y = OSC1 · B (1 kΩ’un gerilimi: 1 V ↔ 1 mA)',
    plan: { kind: 'time', y: [B], x: A },
  },
  { ...inOut(steps, 'NORMAL KİP'), key: 'zaman', title: 'Giriş ve 1 kΩ’un gerilimi', detail: 'OSC1 · A ve OSC1 · B zamana göre' },
];

const bode: FoyGraphDef = {
  key: 'bode',
  steps: 'EK',
  topic: 'FREKANS YANITI',
  title: 'Kazancın frekansla değişimi',
  detail: 'Bode: FG1 girişten çıkışa, kazanç ve faz',
  plan: { kind: 'bode' },
};

/** Örnek kimliği → o şeklin föy grafikleri. */
export const FOY_GRAPHS: Readonly<Record<string, readonly FoyGraphDef[]>> = {
  'diyot-dc': [
    {
      key: 'iv-dc',
      steps: '1',
      topic: 'I–V EĞRİSİ (DC)',
      title: 'D1’in I–V eğrisi',
      detail: 'PS1 0 → 1 V (0,1 V) ve 1 → 5 V (1 V) · x = D1 gerilimi, y = A1',
      plan: {
        kind: 'sweep',
        param: { part: 'PS1', prop: 'voltage1' },
        ranges: [{ from: 0, to: 1, step: 0.1 }, { from: 1, to: 5, step: 1 }],
        x: { kind: 'across', part: 'D1' },
        y: [{ kind: 'meter', part: 'A1' }],
      },
    },
  ],
  'diyot-karakteristigi': xy('2a', 'D1'),
  'zener-karakteristigi': xy('3', 'Z1'),
  'led-karakteristigi': xy('3', 'LED1'),
  'yarim-dalga': [inOut('1–2')],
  // Köprüde osiloskop yükün iki ucunda (A +, B −; COM üretecin COM'unda): çıkış A − B, giriş üretecin OUT − COM'u.
  'kopru-dogrultmac': [
    {
      key: 'giris-cikis',
      steps: '3',
      topic: 'GİRİŞ VE ÇIKIŞ',
      title: 'Giriş ve çıkış dalgası',
      detail: 'Giriş FG1 OUT − COM, çıkış OSC1 A − B (yükün uçları) zamana göre',
      plan: {
        kind: 'time',
        y: [
          { kind: 'pins', a: { part: 'FG1', pin: 0 }, b: { part: 'FG1', pin: 2 } },
          { kind: 'pins', a: { part: 'OSC1', pin: 0 }, b: { part: 'OSC1', pin: 1 } },
        ],
      },
    },
  ],
  'negatif-kenetleyici': [inOut('1')],
  'pozitif-kenetleyici': [inOut('1')],
  'gerilim-katlayici': [
    {
      key: 'katlayici',
      steps: '2',
      topic: 'GERİLİM KATLAYICI',
      title: 'Vç, Vp1 ve Vp2',
      detail: 'Vp1 = OSC1 · A, Vp2 = OSC1 · B, Vç = A − B zamana göre',
      plan: { kind: 'time', y: [A, B, { kind: 'pins', a: { part: 'OSC1', pin: 0 }, b: { part: 'OSC1', pin: 1 } }] },
    },
  ],
  'seri-kirpici': [inOut('')],
  'paralel-kirpici': [inOut('')],
  'cift-kirpici': [inOut('')],
  'alt-kirpici': [inOut('')],
  'jfet-karakteristik': [
    {
      key: 'id-vds',
      steps: '2–3',
      topic: 'ÇIKIŞ KARAKTERİSTİĞİ',
      title: 'ID – VDS ailesi',
      detail: 'VDD 0 → 8 V (0,2 V), 8 → 15 V (1 V) · VGG 0; 0,2; 0,4 V · x = V1, y = A1',
      plan: {
        kind: 'sweep',
        param: { part: 'PS1', prop: 'voltage1' },
        ranges: [{ from: 0, to: 8, step: 0.2 }, { from: 8, to: 15, step: 1 }],
        family: { param: { part: 'PS1', prop: 'voltage2' }, values: [0, 0.2, 0.4] },
        x: { kind: 'meter', part: 'V1' },
        y: [{ kind: 'meter', part: 'A1' }],
      },
    },
    {
      key: 'id-vgs',
      steps: '4–5',
      topic: 'TRANSFER KARAKTERİSTİĞİ',
      title: 'ID – VGS (VP ve IDSS)',
      detail: 'VGG 0 → 2 V (0,05 V) · VDD 10 V · x = J1 · VGS, y = A1',
      plan: {
        kind: 'sweep',
        param: { part: 'PS1', prop: 'voltage2' },
        ranges: [{ from: 0, to: 2, step: 0.05 }],
        family: { param: { part: 'PS1', prop: 'voltage1' }, values: [10] },
        x: { kind: 'terminal', part: 'J1', quantity: 'vgs' },
        y: [{ kind: 'meter', part: 'A1' }],
        marks: ['vp', 'idss'],
      },
    },
  ],
  'fet-yukseltec': [inOut('2–2b'), bode],
  'bjt-yukseltec': [inOut('2'), { ...bode, steps: '3' }],
  'mosfet-yukseltec': [inOut('2–4'), bode],
  'bjt-anahtar': [
    {
      key: 'anahtar',
      steps: '2–3',
      topic: 'ANAHTARLAMA',
      title: 'TTL çıkışı ve LED akımı',
      detail: 'FG1 TTL (COM’a göre) ve LED1 akımı zamana göre',
      plan: { kind: 'time', y: [{ kind: 'pins', a: { part: 'FG1', pin: 1 }, b: { part: 'FG1', pin: 2 } }, { kind: 'current', part: 'LED1' }] },
    },
  ],
  'bjt-anahtar-emetor': [
    {
      key: 'anahtar',
      steps: '4',
      topic: 'ANAHTARLAMA',
      title: 'TTL çıkışı ve LED akımı',
      detail: 'FG1 TTL (COM’a göre) ve LED1 akımı zamana göre',
      plan: { kind: 'time', y: [{ kind: 'pins', a: { part: 'FG1', pin: 1 }, b: { part: 'FG1', pin: 2 } }, { kind: 'current', part: 'LED1' }] },
    },
  ],
};

export function foyGraph(ref: FoyGraphRef): FoyGraphDef | null {
  return FOY_GRAPHS[ref.example]?.find((g) => g.key === ref.key) ?? null;
}

/** Kartın üst yazısı: "ADIM 2–3 · ÇIKIŞ KARAKTERİSTİĞİ"; numarasız adımda yalnızca konu, ekte "EK · …". */
export function foyEyebrow(g: FoyGraphDef): string {
  if (g.steps === '') return g.topic;
  if (g.steps === 'EK') return `EK · ${g.topic}`;
  return `ADIM ${g.steps} · ${g.topic}`;
}
