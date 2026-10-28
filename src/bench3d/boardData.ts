// Karta aktar penceresinin verisi (saf fonksiyonlar). Hesap kodu (planBreadboard, buildSolderGuide,
// designPcb, routePcb, checkPcb) değişmez; burada onların çıktısı pencerenin göstereceği biçime çevrilir:
// - Delikli plaket: rehberin her adımının plandaki karşılığı (jumper, parça, dış tel ve delikleri),
//   adımın deliklerinin kısa adları ve kutup işaretleri ("+ 10c", "− 11c"), takma sırasının grupları.
// - Baskı devre: eksik bağlantılar (hangi pedden hangisine, uzaklık), karta eklenen parçalar.

import { tr } from '../i18n/tr';
import { strProp, type DeviceType } from '../sim/netlist';
import type { CircuitDoc, Part } from '../model/types';
import { railX, type BreadboardPlan, type Hole } from './breadboard';
import type { GuideStep, SolderGuide } from './guide';
import type { PcbDesign, PcbFootprint, PcbPad } from './kicad';
import type { Routing } from './router';

// --- Delikli plaket --------------------------------------------------------------------------------

export type StepTarget =
  | { readonly kind: 'jumper'; readonly index: number; readonly holes: readonly Hole[] }
  | { readonly kind: 'part'; readonly part: Part; readonly holes: readonly Hole[] }
  | { readonly kind: 'lead'; readonly index: number; readonly part: Part; readonly holes: readonly Hole[] };

/**
 * Rehberin adımlarının plandaki karşılığı (adım sırasıyla). Eşleme adımın başlığından: "Jumper N (…",
 * "ETİKET · …" (parça), "ETİKET UÇ" (dış tel; uç adı rehberdekiyle aynı formülle). Eşlenemeyen adım null.
 */
export function stepTargets(doc: CircuitDoc, plan: BreadboardPlan, guide: SolderGuide): (StepTarget | null)[] {
  const byId = new Map(doc.parts.map((p) => [p.id, p] as const));
  const parts = new Map<string, StepTarget>();
  for (const [id, at] of plan.onBoard) {
    const part = byId.get(id);
    if (part) parts.set(`${part.label} · `, { kind: 'part', part, holes: at.holes });
  }
  const leads = new Map<string, StepTarget>();
  plan.leads.forEach((lead, index) => {
    const part = byId.get(lead.partId);
    if (!part) return;
    const pin = tr.devices.pinShort[part.type][lead.pin] ?? `${lead.pin + 1}. uç`;
    leads.set(`${part.label} ${pin}`, { kind: 'lead', index, part, holes: [lead.hole] });
  });
  return guide.steps.map((step) => {
    if (step.group === 'jumper') {
      const n = /^Jumper (\d+) /.exec(step.title);
      const j = n ? plan.jumpers[Number(n[1]) - 1] : undefined;
      return j ? { kind: 'jumper', index: Number(n![1]) - 1, holes: [j.a, j.b] } : null;
    }
    if (step.group === 'lead') return leads.get(step.title) ?? null;
    for (const [prefix, target] of parts) if (step.title.startsWith(prefix)) return target;
    return null;
  });
}

const ROWS = 'abcdefghij';

/** Deliğin kısa adı: şeritte "10c", rayda "+ ray 12" (sütun hizası); birden çok kartta başta "2/". */
export function shortHole(h: Hole, plan: BreadboardPlan): string {
  const board = plan.boards > 1 ? `${h.board + 1}/` : '';
  if (h.kind === 'strip') return `${board}${h.col}${ROWS[h.row]}`;
  const sign = h.rail === 0 || h.rail === 3 ? '+' : '−';
  return `${board}${sign} ray ${Math.round(railX(h.k, plan.cols) + (plan.cols + 1) / 2)}`;
}

/** Kutuplu iki bacaklı parçaların bacak işaretleri (rehberdeki notlarla aynı: anot / + ilk delikte). */
function polarity(part: Part): readonly string[] | null {
  switch (part.type) {
    case 'capacitor':
      return strProp(part.props, 'kind', ['electrolytic', 'film'], 'electrolytic') === 'electrolytic' ? ['+', '−'] : null;
    case 'led':
    case 'buzzer':
      return ['+', '−'];
    case 'diode':
    case 'zener':
      return ['A', 'K'];
    default:
      return null;
  }
}

/** Çok bacaklı parçalarda her deliğin yanına bacağın kısa adı (transistör C B E, potansiyometre 1 2 3). */
const PIN_TAGGED: ReadonlySet<DeviceType> = new Set(['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos', 'potentiometer']);

/** Şimdiki adımın deliklerine yazılacak kısa etiketler (delik sırasıyla). Entegrede yalnızca 1. bacak. */
export function holeLabels(target: StepTarget, plan: BreadboardPlan): { readonly hole: Hole; readonly text: string }[] {
  const name = (h: Hole) => shortHole(h, plan);
  if (target.kind === 'jumper') return target.holes.map((hole) => ({ hole, text: name(hole) }));
  if (target.kind === 'lead') return [{ hole: target.holes[0]!, text: `${target.part.label} ${tr.devices.pinShort[target.part.type][plan.leads[target.index]!.pin] ?? ''} → ${name(target.holes[0]!)}`.replace('  ', ' ') }];
  const part = target.part;
  if (part.type === 'timer555' || part.type === 'opamp') {
    const at = plan.onBoard.get(part.id);
    const all = [...(at?.holes ?? []), ...(at?.extraHoles ?? [])];
    const bottom = all.filter((h): h is Extract<Hole, { kind: 'strip' }> => h.kind === 'strip' && h.row === 5);
    const first = bottom.reduce<Extract<Hole, { kind: 'strip' }> | null>((a, b) => (a === null || b.col < a.col ? b : a), null);
    return first ? [{ hole: first, text: `${tr.karta.plaket.pinOne} ${name(first)}` }] : [];
  }
  const signs = polarity(part);
  if (signs) return target.holes.map((hole, i) => ({ hole, text: `${signs[i] ?? ''} ${name(hole)}`.trim() }));
  if (PIN_TAGGED.has(part.type)) {
    const tags = tr.devices.pinTags[part.type] ?? [];
    return target.holes.map((hole, i) => ({ hole, text: `${tags[i] ?? i + 1} ${name(hole)}` }));
  }
  return target.holes.map((hole) => ({ hole, text: name(hole) }));
}

/** Adımın kısa adı ("Sonraki: CV" düğmesi, sıradakiler): parça ve dış telde etiket, jumper'da "Jumper N". */
export function stepRef(step: GuideStep, target: StepTarget | null): string {
  if (target?.kind === 'part') return target.part.label;
  if (target?.kind === 'lead') return step.title;
  const n = /^(Jumper \d+)/.exec(step.title);
  return n ? n[1]! : step.title;
}

/** Takma sırasının grubu (çipler): tür başına; aynı türün adımları sırayla bir arada. */
export function stepCategory(target: StepTarget | null): string {
  if (!target || target.kind === 'jumper') return tr.karta.plaket.groups.jumper;
  if (target.kind === 'lead') return tr.karta.plaket.groups.lead;
  return tr.karta.plaket.groups.byType[target.part.type] ?? tr.devices.names[target.part.type];
}

export interface StepGroup {
  readonly name: string;
  readonly total: number;
  /** Şimdiki adımdan önce biten adım sayısı. */
  readonly done: number;
  /** Şimdiki adım bu grupta mı. */
  readonly current: boolean;
  /** Şimdiki adımın grup içindeki sırası (1'den). */
  readonly position: number;
}

/** Takma sırasının grupları (ilk görünüş sırasıyla) ve şimdiki adıma göre durumları. */
export function stepGroups(targets: readonly (StepTarget | null)[], current: number): StepGroup[] {
  const groups = new Map<string, { total: number; done: number; current: boolean; position: number }>();
  targets.forEach((target, i) => {
    const name = stepCategory(target);
    const g = groups.get(name) ?? { total: 0, done: 0, current: false, position: 0 };
    g.total++;
    if (i < current) g.done++;
    if (i === current) {
      g.current = true;
      g.position = g.done + 1;
    }
    groups.set(name, g);
  });
  return [...groups].map(([name, g]) => ({ name, ...g }));
}

/** Ölçü aletleri ve şebeke: rehberin uyarısı bu parçaların dış tel adımlarının kartında not olarak. */
const INSTRUMENTS: ReadonlySet<DeviceType> = new Set(['oscilloscope', 'funcgen', 'dcsupply', 'voltmeter', 'ammeter']);
const MAINS: ReadonlySet<DeviceType> = new Set(['transformer', 'acsource']);

/** Adımın kartındaki uyarı (yoksa null): rehberin uyarılarından adımın parçasına uyan. */
export function stepWarning(target: StepTarget | null, guide: SolderGuide): string | null {
  if (target?.kind !== 'lead') return null;
  if (MAINS.has(target.part.type)) return guide.warnings.find((w) => w.includes('230 V')) ?? null;
  if (INSTRUMENTS.has(target.part.type)) return guide.warnings.find((w) => w.startsWith('Ölçü aletleri')) ?? null;
  return null;
}

/** Bilgi çipi: "Yarım boy · 30 sütun · breadboard düzeni" (birden çok kartta başta "2 ×"). */
export function perfboardInfo(plan: BreadboardPlan): string {
  return tr.karta.plaket.info(plan.boards, plan.cols < 63, plan.cols);
}

// --- Baskı devre -----------------------------------------------------------------------------------

/** Karta eklenen parça (dekuplaj kondansatörü, klemens, pin başlık): kısa ad ve açıklama. */
export interface AddedPart {
  readonly ref: string;
  readonly short: string;
  readonly explanation: string;
}

/** design.added satırları ("REF: açıklama") kılıflarla eşlenir; kısa ad kılıfın türünden. */
export function addedParts(design: PcbDesign): AddedPart[] {
  const byRef = new Map(design.footprints.map((f) => [f.ref, f] as const));
  return design.added.map((line) => {
    const colon = line.indexOf(': ');
    const ref = colon > 0 ? line.slice(0, colon) : line;
    const explanation = colon > 0 ? line.slice(colon + 2) : line;
    const f = byRef.get(ref);
    const owner = /\(([^()]+)\)$/.exec(f?.bom ?? '')?.[1] ?? '';
    const t = tr.pcb.addedNames;
    const short = ref.startsWith('C_D') ? t.decoupling : f?.name.includes('TerminalBlock') ? t.terminal(owner) : f?.name.includes('PinHeader') ? t.header(owner) : (f?.bom ?? ref);
    return { ref, short, explanation: explanation.replace(/^./, (c) => c.toLocaleUpperCase('tr')) };
  });
}

/** Çizilemeyen bağlantı: hedef ped ve aynı ağdaki en yakın ped, uzaklık (mm) ve orta nokta (kart mm). */
export interface MissingConnection {
  readonly n: number;
  readonly net: string;
  readonly from: string;
  readonly to: string;
  /** Hedef ucun adı: "Q4 baz (B) ucu". */
  readonly pin: string;
  readonly mm: number;
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
}

function padOwnerText(f: PcbFootprint, pad: PcbPad, doc: CircuitDoc): string {
  const part = f.partId ? doc.parts.find((p) => p.id === f.partId) : undefined;
  const index = Number(pad.number) - 1;
  const pin = part ? tr.devices.pins[part.type][index] : undefined;
  if (pin) return `${f.ref} ${pin}`;
  return `${f.ref} ${pad.label ? `${pad.label} ucu` : `${pad.number}. ucu`}`;
}

export function missingConnections(doc: CircuitDoc, design: PcbDesign, routing: Routing): MissingConnection[] {
  const pads = design.footprints.flatMap((f) => f.pads.map((pad) => ({ f, pad })));
  return routing.unrouted.flatMap(({ net, pad: name }, i) => {
    const dot = name.lastIndexOf('.');
    const ref = name.slice(0, dot);
    const number = name.slice(dot + 1);
    const target = pads.find((p) => p.f.ref === ref && p.pad.number === number);
    if (!target) return [];
    let best: (typeof pads)[number] | null = null;
    let bestD = Infinity;
    for (const p of pads) {
      if (p.pad.net !== net || p === target) continue;
      const d = Math.hypot(p.pad.x - target.pad.x, p.pad.y - target.pad.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return [];
    return [
      {
        n: i + 1,
        net,
        from: best.f.ref,
        to: target.f.ref,
        pin: padOwnerText(target.f, target.pad, doc),
        mm: Math.round(bestD),
        a: { x: best.pad.x, y: best.pad.y },
        b: { x: target.pad.x, y: target.pad.y },
      },
    ];
  });
}

/** Parçanın ipucu: "U1 · 555 zamanlayıcı NE555" ve kılıf ("DIP-8_W7.62mm"). */
export function footprintTip(f: PcbFootprint): { readonly name: string; readonly detail: string } {
  return { name: `${f.ref} · ${f.bom ?? f.value}`, detail: f.equivalent.split(':').pop() ?? f.name };
}
