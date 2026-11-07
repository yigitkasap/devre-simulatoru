// Föydeki grafikler (analiz v2): her föy şeklinin adımlarına bağlı hazır grafikler. Başlangıç ekranında
// açık örnek föydeyse "Föydeki grafikler · Deney N · Şekil-M" bölümünde kart olarak görünür; tıklanınca
// grafik kurulur ve çizilir. Büyüklükler parçaların adıyla yazılır (devrede kimliğe çevrilir:
// editor/analysis/foyPlan.ts). Sonuçları testte simülasyonla ölçülür (tests/analiz-foy.test.ts).
// Adım numaraları föydeki gibi (i18n/foy.ts → LAB_FIGURE_TEXTS); föyde numarasız adımda boş.
//
// Adlar föydeki gibidir (şekillerdeki ve adımlardaki adlar; alt simge `_{...}`): eksenler, eğri ve iz
// adları, CSV ve tablo bunlarla yazılır. Föy dışı grafiklerde (ya da kullanıcı büyüklüğü değiştirince)
// devredeki adlar kalır. Föyde adı olmayan tek büyüklük Deney 9'da LED'in akımı: I_{LED}.

import type { FoyGraphRef, TerminalQuantity } from '../model/analysis';
import { ek } from './ek';

/**
 * Parçanın adıyla büyüklük ve föydeki adı: "A1" okuması, "OSC1" kanalı, "D1" uçları arası, "J1"
 * büyüklüğü, uç gerilimi.
 */
export type FoyQuantity = (
  | { readonly kind: 'meter'; readonly part: string }
  | { readonly kind: 'scope'; readonly part: string; readonly channel: 0 | 1 }
  | { readonly kind: 'across'; readonly part: string }
  | { readonly kind: 'current'; readonly part: string }
  | { readonly kind: 'terminal'; readonly part: string; readonly quantity: TerminalQuantity }
  /** İki ucun arası (b yoksa toprağa göre): üretecin TTL'i COM'a göre, katlayıcıda A − B ve COM − B (B ters). */
  | { readonly kind: 'pins'; readonly a: { readonly part: string; readonly pin: number }; readonly b?: { readonly part: string; readonly pin: number } }
) & { readonly name: string };

/** Taranan ya da her eğri için değişen değer ve föydeki adı. */
export interface FoyParam {
  readonly part: string;
  readonly prop: string;
  readonly name: string;
  /** Föydeki büyüklük değerin eksisi (V_{GS} = −V_{GG}): değerler eksiyle yazılır. */
  readonly sign?: -1;
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
      /**
       * Grafikte işaretlenecek değerler (Deney 5 transfer): V_{P}, akımın sıfırlandığı V_{GS}; V_{GS} = 0'daki
       * akım ve o noktada `zero` ile ölçülen gerilim (V_{DS}). Bu akım I_{DSS} değildir: föy kartındaki
       * I_{DSS} doyum doğrusunun V_{DS} = 0'a uzatılmasıyla bulunur.
       */
      readonly marks?: { readonly vp: boolean; readonly zero?: FoyQuantity };
    }
  /** Giriş (üreteç) ve çıkış (osiloskobun kanalı), föydeki adlarıyla; kazancın adı (K_{υ}). */
  | {
      readonly kind: 'bode';
      readonly input: { readonly part: string; readonly name: string };
      readonly output: { readonly part: string; readonly channel: 0 | 1; readonly name: string };
      readonly gain: string;
    };

export interface FoyGraphDef {
  readonly key: string;
  /** Föydeki adım numaraları ("2–3"); föyde numarasız adımda boş, ek grafikte "EK". */
  readonly steps: string;
  /** Üst yazının ikinci kısmı ("ÇIKIŞ KARAKTERİSTİĞİ"). */
  readonly topic: string;
  readonly title: string;
  /** Alt satır: taranan ve basamak değerleri, eksenler; föydeki ad, yanında parantez içinde devredeki adı. */
  readonly detail: string;
  readonly plan: FoyPlan;
}

const A = (name: string) => ({ kind: 'scope', part: 'OSC1', channel: 0, name }) as const;
const B = (name: string) => ({ kind: 'scope', part: 'OSC1', channel: 1, name }) as const;

/** Giriş (OSC1 · A) ve çıkış (OSC1 · B) zamana göre; föydeki adlarıyla (Vi ve Vo, Vg ve Vç, Vs ve VDS). */
const inOut = (steps: string, input: string, output: string, topic = 'GİRİŞ VE ÇIKIŞ'): FoyGraphDef => ({
  key: 'giris-cikis',
  steps,
  topic,
  title: 'Giriş ve çıkış dalgası',
  detail: `${input} (OSC1 A) ve ${output} (OSC1 B) zamana göre`,
  plan: { kind: 'time', y: [A(input), B(output)] },
});

/**
 * Diyot, zener ve LED'in I–V eğrisi osiloskobun X-Y'si gibi (Şekil-3): x giriş V_{i}, y 1 kΩ'un gerilimi
 * (= akım, 1 V ↔ 1 mA; Şekil-2'de V_{o}).
 */
const xy = (steps: string, part: string): readonly FoyGraphDef[] => [
  {
    key: 'iv-xy',
    steps,
    topic: 'I–V EĞRİSİ (X-Y)',
    title: `${ek(part, 'in')} I–V eğrisi`,
    detail: 'x: V_{i} (OSC1 A), y: V_{o} (OSC1 B; 1 kΩ’un gerilimi, 1 V ↔ 1 mA)',
    plan: { kind: 'time', y: [B('V_{o}')], x: A('V_{i}') },
  },
  { ...inOut(steps, 'V_{i}', 'V_{o}', 'NORMAL KİP'), key: 'zaman', title: 'Giriş ve 1 kΩ’un gerilimi' },
];

/** Bode (föyde yok, ek): girişten çıkışa kazanç (föyde K_{υ}) ve faz. */
const bode = (output: string, steps = 'EK'): FoyGraphDef => ({
  key: 'bode',
  steps,
  topic: 'FREKANS YANITI',
  title: 'Kazancın frekansla değişimi',
  detail: `Bode: V_{s} (FG1) girişten ${output} (OSC1 B) çıkışa, K_{υ} ve faz`,
  plan: { kind: 'bode', input: { part: 'FG1', name: 'V_{s}' }, output: { part: 'OSC1', channel: 1, name: output }, gain: 'K_{υ}' },
});

/** Deney 9: üretecin TTL çıkışı (föyde V_{S}) ve LED'in akımı zamana göre. */
const anahtar = (steps: string): FoyGraphDef => ({
  key: 'anahtar',
  steps,
  topic: 'ANAHTARLAMA',
  title: 'TTL çıkışı ve LED akımı',
  detail: 'V_{S} (FG1 TTL, COM’a göre) ve I_{LED} (LED1) zamana göre',
  plan: {
    kind: 'time',
    y: [
      { kind: 'pins', a: { part: 'FG1', pin: 1 }, b: { part: 'FG1', pin: 2 }, name: 'V_{S}' },
      { kind: 'current', part: 'LED1', name: 'I_{LED}' },
    ],
  },
});

/** Örnek kimliği → o şeklin föy grafikleri. */
export const FOY_GRAPHS: Readonly<Record<string, readonly FoyGraphDef[]>> = {
  'diyot-dc': [
    {
      key: 'iv-dc',
      steps: '1',
      topic: 'I–V EĞRİSİ (DC)',
      title: 'D1’in I–V eğrisi',
      detail: 'V_{i} 0 → 1 V (0,1 V) ve 1 → 5 V (1 V) · x: V_{D} (D1), y: I (A1)',
      plan: {
        kind: 'sweep',
        param: { part: 'PS1', prop: 'voltage1', name: 'V_{i}' },
        ranges: [{ from: 0, to: 1, step: 0.1 }, { from: 1, to: 5, step: 1 }],
        x: { kind: 'across', part: 'D1', name: 'V_{D}' },
        y: [{ kind: 'meter', part: 'A1', name: 'I' }],
      },
    },
  ],
  'diyot-karakteristigi': xy('2a', 'D1'),
  'zener-karakteristigi': xy('3', 'Z1'),
  'led-karakteristigi': xy('3', 'LED1'),
  'yarim-dalga': [inOut('1–2', 'V_{i}', 'V_{o}')],
  // Köprüde osiloskop yükün iki ucunda (A +, B −; COM üretecin COM'unda): çıkış A − B, giriş üretecin OUT − COM'u.
  'kopru-dogrultmac': [
    {
      key: 'giris-cikis',
      steps: '3',
      topic: 'GİRİŞ VE ÇIKIŞ',
      title: 'Giriş ve çıkış dalgası',
      detail: 'V_{i} (FG1 OUT − COM) ve V_{o} (OSC1 A − B, yükün uçları) zamana göre',
      plan: {
        kind: 'time',
        y: [
          { kind: 'pins', a: { part: 'FG1', pin: 0 }, b: { part: 'FG1', pin: 2 }, name: 'V_{i}' },
          { kind: 'pins', a: { part: 'OSC1', pin: 0 }, b: { part: 'OSC1', pin: 1 }, name: 'V_{o}' },
        ],
      },
    },
  ],
  'negatif-kenetleyici': [inOut('1', 'V_{g}', 'V_{ç}')],
  'pozitif-kenetleyici': [inOut('1', 'V_{g}', 'V_{ç}')],
  // Föyde iki kondansatörün gerilimi de pozitif V_{p} (Şekil-10, V_{ç} = 2V_{p}). Osiloskobun COM'u ortada:
  // C1'inki A'da, C2'ninki B'de eksi görünür; B ters çevrilir (COM − B), ikisi de pozitif.
  'gerilim-katlayici': [
    {
      key: 'katlayici',
      steps: '2',
      topic: 'GERİLİM KATLAYICI',
      title: 'V_{ç}, V_{p} (C1) ve V_{p} (C2)',
      detail: 'V_{p} (C1) = OSC1 A, V_{p} (C2) = OSC1 B ters çevrilmiş, V_{ç} = A − B zamana göre',
      plan: {
        kind: 'time',
        y: [
          A('V_{p} (C1)'),
          { kind: 'pins', a: { part: 'OSC1', pin: 2 }, b: { part: 'OSC1', pin: 1 }, name: 'V_{p} (C2)' },
          { kind: 'pins', a: { part: 'OSC1', pin: 0 }, b: { part: 'OSC1', pin: 1 }, name: 'V_{ç}' },
        ],
      },
    },
  ],
  'seri-kirpici': [inOut('', 'V_{g}', 'V_{ç}')],
  'paralel-kirpici': [inOut('', 'V_{g}', 'V_{ç}')],
  'cift-kirpici': [inOut('', 'V_{g}', 'V_{ç}')],
  'alt-kirpici': [inOut('', 'V_{g}', 'V_{ç}')],
  'jfet-karakteristik': [
    {
      key: 'id-vds',
      steps: '2–3',
      topic: 'ÇIKIŞ KARAKTERİSTİĞİ',
      title: 'I_{D} – V_{DS} ailesi',
      detail: 'V_{DD} 0 → 8 V (0,2 V), 8 → 15 V (1 V) · V_{GS} 0; −0,2; −0,4 V · x: V_{DS} (V1), y: I_{D} (A1)',
      plan: {
        kind: 'sweep',
        param: { part: 'PS1', prop: 'voltage1', name: 'V_{DD}' },
        ranges: [{ from: 0, to: 8, step: 0.2 }, { from: 8, to: 15, step: 1 }],
        // 2. çıkış ters bağlı: V_{GS} = −V_{GG}.
        family: { param: { part: 'PS1', prop: 'voltage2', name: 'V_{GS}', sign: -1 }, values: [0, 0.2, 0.4] },
        x: { kind: 'meter', part: 'V1', name: 'V_{DS}' },
        y: [{ kind: 'meter', part: 'A1', name: 'I_{D}' }],
      },
    },
    {
      key: 'id-vgs',
      steps: '4–5',
      topic: 'TRANSFER KARAKTERİSTİĞİ',
      title: 'I_{D} – V_{GS} ve V_{P}',
      detail: 'V_{GG} 0 → 2 V (0,05 V) · V_{DD} 10 V · x: V_{GS} (J1), y: I_{D} (A1)',
      plan: {
        kind: 'sweep',
        param: { part: 'PS1', prop: 'voltage2', name: 'V_{GG}' },
        ranges: [{ from: 0, to: 2, step: 0.05 }],
        family: { param: { part: 'PS1', prop: 'voltage1', name: 'V_{DD}' }, values: [10] },
        x: { kind: 'terminal', part: 'J1', quantity: 'vgs', name: 'V_{GS}' },
        y: [{ kind: 'meter', part: 'A1', name: 'I_{D}' }],
        marks: { vp: true, zero: { kind: 'meter', part: 'V1', name: 'V_{DS}' } },
      },
    },
  ],
  'fet-yukseltec': [inOut('2–2b', 'V_{s}', 'V_{DS}'), bode('V_{DS}')],
  'bjt-yukseltec': [inOut('2', 'V_{s}', 'V_{CE}'), bode('V_{CE}', '3')],
  'mosfet-yukseltec': [inOut('2–4', 'V_{s}', 'V_{DS}'), bode('V_{DS}')],
  'bjt-anahtar': [anahtar('2–3')],
  'bjt-anahtar-emetor': [anahtar('4')],
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
