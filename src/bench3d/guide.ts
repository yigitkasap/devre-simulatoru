// Lehim rehberi (three'siz, saf hesap): breadboard yerleşiminden delikli plaket (Perma-Proto)
// için malzeme listesi ve adım adım takma sırası. Perma-Proto'nun delik düzeni breadboard'unkiyle
// aynıdır: aynı sütun numaraları, aynı a–j satırları, aynı raylar.

import { tr } from '../i18n/tr';
import { partValueText } from '../editor/PartView';
import type { CircuitDoc, Part } from '../model/types';
import { boolProp, numProp, strProp } from '../sim/netlist';
import { LED_COLORS } from '../sim/devices/led';
import { resistorColorCode } from './bands';
import { holeXZ, railX, type BreadboardPlan, type Hole } from './breadboard';

const ROWS = 'abcdefghij';

/** Deliğin adı: şeritte "12c", rayda "üst + rayı (12. sütun hizası)"; birden çok kartta kart numarası. */
export function holeName(h: Hole, plan: BreadboardPlan): string {
  const board = plan.boards > 1 ? `${h.board + 1}. kart, ` : '';
  if (h.kind === 'strip') return `${board}${h.col}${ROWS[h.row]}`;
  const side = h.rail <= 1 ? 'üst' : 'alt';
  const sign = h.rail === 0 || h.rail === 3 ? '+' : '−';
  const col = Math.round(railX(h.k, plan.cols) + (plan.cols + 1) / 2);
  return `${board}${side} ${sign} rayı (${col}. sütun hizası)`;
}

/** İki delik arası düz uzaklık (mm; delik aralığı 2,54 mm). */
export function holeDistanceMm(a: Hole, b: Hole, plan: BreadboardPlan): number {
  const pa = holeXZ(a, plan.cols);
  const pb = holeXZ(b, plan.cols);
  return Math.hypot(pa.x - pb.x, pa.z - pb.z) * 2.54;
}

export { resistorColorCode } from './bands';

/** Malzeme listesindeki bir satır. */
export interface Material {
  readonly name: string;
  readonly detail: string;
  readonly labels: readonly string[];
}

export interface GuideStep {
  /** Sıra: önce alçak parçalar (jumper, direnç), sonra yüksekler, en son dışarıya giden teller. */
  readonly group: 'jumper' | 'axial' | 'ic' | 'transistor' | 'radial' | 'tall' | 'lead';
  readonly title: string;
  readonly holes: string;
  /** Yön ya da kutup uyarısı. */
  readonly note?: string;
}

export interface SolderGuide {
  readonly board: string;
  readonly materials: readonly Material[];
  readonly steps: readonly GuideStep[];
  readonly warnings: readonly string[];
}

const GROUP_ORDER: Record<GuideStep['group'], number> = { jumper: 0, axial: 1, ic: 2, transistor: 3, radial: 4, tall: 5, lead: 6 };

/** Parçanın malzeme listesindeki adı ve ayrıntısı. */
function describe(part: Part): { name: string; detail: string } {
  const p = part.props;
  const value = partValueText(part);
  switch (part.type) {
    case 'resistor': {
      const ohms = numProp(p, 'resistance', 1000);
      return { name: `Direnç ${value}`, detail: `${String(numProp(p, 'powerRating', 0.25)).replace('.', ',')} W; renk kodu ${resistorColorCode(ohms)}` };
    }
    case 'capacitor':
      return strProp(p, 'kind', ['electrolytic', 'film'], 'electrolytic') === 'electrolytic'
        ? { name: `Elektrolitik kondansatör ${value}`, detail: 'en az 16 V; kutuplu' }
        : { name: `Seramik/film kondansatör ${value}`, detail: 'kutupsuz' };
    case 'led': {
      const color = strProp(p, 'color', LED_COLORS, 'red');
      return { name: `LED 5 mm, ${tr.devices.ledColors[color]?.toLocaleLowerCase('tr') ?? color}`, detail: 'uzun bacak anot (+)' };
    }
    case 'diode':
      return { name: 'Diyot 1N4001', detail: 'bantlı uç katot' };
    case 'zener':
      return { name: `Zener diyot ${value}`, detail: 'bantlı uç katot' };
    case 'npn':
    case 'pnp':
    case 'njfet':
    case 'pjfet':
    case 'nmos':
    case 'pmos': {
      const model = typeof p.model === 'string' && p.model !== 'genel' ? p.model : '';
      return { name: `${tr.devices.names[part.type]} ${model}`.trim(), detail: 'TO-92' };
    }
    case 'opamp':
      return { name: 'İşlemsel yükselteç LM741', detail: 'DIP-8; 8 bacaklı soketle' };
    case 'timer555':
      return { name: '555 zamanlayıcı NE555', detail: 'DIP-8; 8 bacaklı soketle' };
    case 'potentiometer':
      return { name: `Potansiyometre ${formatOhm(numProp(p, 'resistance', 10e3))}`, detail: 'dikey trimpot, 3 bacak' };
    case 'switch':
      return { name: 'Anahtar (iki konumlu)', detail: `başlangıçta ${boolProp(p, 'closed', false) ? 'kapalı' : 'açık'}` };
    case 'arduino':
      return { name: 'Arduino Uno', detail: `program: ${value}; USB kablosuyla beslenir` };
    default:
      return { name: `${tr.devices.names[part.type]}${value ? ` ${value}` : ''}`, detail: '' };
  }
}

function formatOhm(ohms: number): string {
  return ohms >= 1e3 ? `${String(ohms / 1e3).replace('.', ',')} kΩ` : `${ohms} Ω`;
}

/** Transistörün bacakları soldan sağa (sütun sırasıyla) hangi uçlar; BC547/BC557 ve 2N7000'de yön. */
function transistorNote(part: Part, holes: readonly Hole[]): string {
  const names = tr.devices.pinShort[part.type];
  const order = holes.map((h, pin) => ({ pin, col: h.kind === 'strip' ? h.col : 0 })).sort((a, b) => a.col - b.col);
  const left = order.map((o) => names[o.pin] ?? '').join(', ');
  const model = typeof part.props.model === 'string' ? part.props.model : '';
  // Düz (yazılı) yüz sana bakarken soldan sağa bacaklar (veri sayfaları).
  const pinout: Record<string, readonly string[]> = { BC547B: ['C', 'B', 'E'], BC557B: ['C', 'B', 'E'], '2N7000': ['S', 'G', 'D'] };
  const physical = pinout[model] ?? null;
  const want = order.map((o) => (names[o.pin] ?? '').charAt(0).toUpperCase());
  if (physical) {
    const facing = physical.join('') === want.join('') ? 'yazılı düz yüzü sana' : physical.slice().reverse().join('') === want.join('') ? 'yazılı düz yüzü arkaya' : null;
    if (facing) return `Soldan sağa: ${left}. ${facing} bakacak.`;
  }
  return `Soldan sağa: ${left}. Bacak sırasını parçanın veri sayfasından denetle.`;
}

export function buildSolderGuide(doc: CircuitDoc, plan: BreadboardPlan): SolderGuide {
  const name = (h: Hole) => holeName(h, plan);
  const steps: GuideStep[] = [];
  const materials = new Map<string, { detail: string; labels: string[] }>();
  const addMaterial = (key: string, detail: string, label: string) => {
    const m = materials.get(key) ?? { detail, labels: [] };
    m.labels.push(label);
    materials.set(key, m);
  };
  const byId = new Map(doc.parts.map((p) => [p.id, p]));

  // Jumper'lar: en alçak, önce takılır.
  const jumperColors = (net: string) => (plan.roles.get(net) === 'ground' ? 'siyah' : plan.roles.get(net) === 'supply' ? 'kırmızı' : 'renkli');
  plan.jumpers.forEach((j, i) => {
    const mm = holeDistanceMm(j.a, j.b, plan);
    steps.push({ group: 'jumper', title: `Jumper ${i + 1} (${jumperColors(j.net)} tel, ≈ ${Math.round(mm + 6)} mm)`, holes: `${name(j.a)} ↔ ${name(j.b)}` });
  });
  if (plan.jumpers.length > 0) addMaterial('Tek damarlı zil teli (jumper)', `${plan.jumpers.length} parça, 0,5–0,6 mm (22–24 AWG)`, '');

  for (const [id, at] of plan.onBoard) {
    const part = byId.get(id)!;
    const { name: material, detail } = describe(part);
    addMaterial(material, detail, part.label);
    const holes = at.holes.map(name);
    const pinNames = tr.devices.pinShort[part.type];
    switch (part.type) {
      case 'resistor':
      case 'fuse':
        steps.push({ group: 'axial', title: `${part.label} · ${material}`, holes: holes.join(' ↔ ') });
        break;
      case 'diode':
      case 'zener':
        steps.push({ group: 'axial', title: `${part.label} · ${material}`, holes: holes.join(' ↔ '), note: `Bantlı uç (katot) ${holes[1]} deliğine.` });
        break;
      case 'switch':
        steps.push({ group: 'tall', title: `${part.label} · ${material}`, holes: holes.join(' ↔ ') });
        break;
      case 'opamp':
      case 'timer555': {
        // 1. bacak: alt sıranın (f) en solundaki delik.
        const bottom = [...at.holes, ...(at.extraHoles ?? [])].filter((h) => h.kind === 'strip' && h.row === 5);
        const first = bottom.reduce((a, b) => (a.kind === 'strip' && b.kind === 'strip' && b.col < a.col ? b : a));
        addMaterial('DIP-8 soket', 'entegre sokete takılır', part.label);
        steps.push({
          group: 'ic',
          title: `${part.label} · DIP-8 soket (entegre en son takılır)`,
          holes: `orta kanalın üstünde, ${at.holes.map((h, i) => `${pinNames[i]} ${name(h)}`).join(', ')}`,
          note: `Çentik sola: 1. bacak ${name(first)} deliğinde (sol alt).`,
        });
        break;
      }
      case 'npn':
      case 'pnp':
      case 'njfet':
      case 'pjfet':
      case 'nmos':
      case 'pmos':
        steps.push({ group: 'transistor', title: `${part.label} · ${material}`, holes: at.holes.map((h, i) => `${pinNames[i]} ${name(h)}`).join(', '), note: transistorNote(part, at.holes) });
        break;
      case 'capacitor':
        steps.push({
          group: 'radial',
          title: `${part.label} · ${material}`,
          holes: holes.join(' ↔ '),
          ...(strProp(part.props, 'kind', ['electrolytic', 'film'], 'electrolytic') === 'electrolytic' ? { note: `+ bacak (uzun) ${holes[0]}, − şeritli bacak ${holes[1]} deliğine.` } : {}),
        });
        break;
      case 'led':
        steps.push({ group: 'tall', title: `${part.label} · ${material}`, holes: holes.join(' ↔ '), note: `Uzun bacak (anot, +) ${holes[0]}, kısa bacak (katot, düz kenar) ${holes[1]} deliğine.` });
        break;
      case 'buzzer':
        steps.push({ group: 'tall', title: `${part.label} · ${material}`, holes: holes.join(' ↔ '), note: `+ işaretli bacak ${holes[0]} deliğine.` });
        break;
      case 'potentiometer':
        steps.push({ group: 'tall', title: `${part.label} · ${material}`, holes: at.holes.map((h, i) => `${pinNames[i]} ${name(h)}`).join(', ') });
        break;
      default:
        steps.push({ group: 'radial', title: `${part.label} · ${material}`, holes: holes.join(' ↔ ') });
    }
  }

  // Karttan dışarı giden teller: pil, Arduino, cihazlar, lamba, motor...
  for (const lead of plan.leads) {
    const part = byId.get(lead.partId)!;
    const pin = tr.devices.pinShort[part.type][lead.pin] ?? `${lead.pin + 1}. uç`;
    steps.push({ group: 'lead', title: `${part.label} ${pin}`, holes: `→ ${name(lead.hole)}` });
  }
  for (const [id] of plan.table) {
    const part = byId.get(id)!;
    const { name: material, detail } = describe(part);
    addMaterial(material, detail, part.label);
  }
  steps.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);

  const warnings: string[] = [];
  if (doc.parts.some((p) => p.type === 'transformer' || p.type === 'acsource')) {
    warnings.push('Bu devrede şebeke (230 V) ya da AC kaynak var. Şebeke gerilimini delikli plakete ve breadboard\'a bağlama: yerine hazır bir AC ya da DC adaptörün düşük gerilim çıkışını kullan.');
  }
  if (doc.parts.some((p) => p.type === 'oscilloscope' || p.type === 'funcgen' || p.type === 'dcsupply' || p.type === 'voltmeter' || p.type === 'ammeter')) {
    warnings.push('Ölçü aletleri ve laboratuvar cihazları karta lehimlenmez: onların teli giden deliklere prob ya da timsah kıskaçla bağlanır.');
  }
  const half = plan.cols < 63;
  return {
    board: `${plan.boards} × ${half ? 'yarım boy (30 sütun, 400 delik)' : 'tam boy (63 sütun, 830 delik)'} breadboard düzeninde delikli plaket (ör. Adafruit Perma-Proto)`,
    materials: [...materials.entries()].map(([name, m]) => ({ name, detail: m.detail, labels: m.labels.filter(Boolean) })),
    steps,
    warnings,
  };
}

