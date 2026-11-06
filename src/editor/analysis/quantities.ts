// Büyüklük seçici (analiz v2): devredeki bütün çizilebilir büyüklükler, üç grupta. Ölçü aletleri
// (voltmetre ve ampermetrenin okuması, osiloskobun A ve B kanalı), parçalar (iki uçlu parçanın uçları
// arası gerilimi, akımı ve gücü; transistörde V_BE, V_CE, I_C, I_B ya da V_GS, V_DS, I_D) ve düğümler
// (toprağa göre gerilim; ad ağa bağlı bacaklardan: "J1 drain · RD 2. uç").

import { tr } from '../../i18n/tr';
import type { Quantity, TerminalQuantity } from '../../model/analysis';
import { CATALOG } from '../../model/catalog';
import { pinKey } from '../../model/connectivity';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc, Part } from '../../model/types';
import { byLabel, pinName, traceLabel, type NetIndex } from './traces';

export type QuantityGroup = 'meters' | 'parts' | 'nodes';

export interface QuantityOption {
  /** Seçimin kimliği (aynı büyüklük iki kez eklenmesin). */
  readonly key: string;
  readonly group: QuantityGroup;
  /** Kısa ad (grafikte, CSV'de): "V1", "J1 · VGS", "R1 · P". */
  readonly name: string;
  /** Açıklama: "V1 voltmetresinin okuduğu gerilim". */
  readonly detail: string;
  readonly unit: 'V' | 'A' | 'W';
  readonly quantity: Quantity;
}

const BJT: ReadonlySet<string> = new Set(['npn', 'pnp']);
const FET: ReadonlySet<string> = new Set(['njfet', 'pjfet', 'nmos', 'pmos']);
const METERS: ReadonlySet<string> = new Set(['voltmeter', 'ammeter']);
/** Parçalar grubunda gösterilmeyenler (ölçü aletleri kendi grubunda; toprak ve kablosuz işaretler). */
const SKIP: ReadonlySet<string> = new Set(['ground', 'voltmeter', 'ammeter', 'oscilloscope', 'multimeter']);

/** Büyüklüğün seçimdeki kimliği (aynı büyüklük aynı anahtar). */
export function quantityKey(q: Quantity): string {
  switch (q.kind) {
    case 'voltage':
      return `v:${q.node}:${q.ref ?? ''}`;
    case 'scope':
      return `s:${q.part}:${q.channel}`;
    case 'terminal':
      return `t:${q.part}:${q.quantity}`;
    default:
      return `${q.kind}:${q.part}`;
  }
}

function terminalOptions(part: Part): TerminalQuantity[] {
  if (BJT.has(part.type)) return ['vbe', 'vce', 'ic', 'ib'];
  if (FET.has(part.type)) return ['vgs', 'vds', 'id'];
  return [];
}

/** Düğümün seçicideki adı: ağa bağlı (toprak dışı) ilk iki bacak, "J1 drain · RD 2. uç". */
export function nodeLabel(net: number, idx: NetIndex): string {
  const pins = idx.pins(net).filter((p) => p.part.type !== 'ground').sort(byLabel);
  return pins.slice(0, 2).map((p) => pinName(p, idx)).join(' · ') || '?';
}

/** Devredeki bütün büyüklükler (gruplar sırasıyla). */
export function quantityOptions(doc: CircuitDoc, idx: NetIndex): QuantityOption[] {
  const out: QuantityOption[] = [];
  const add = (group: QuantityGroup, quantity: Quantity, name?: string) => {
    const label = traceLabel(quantity, doc, idx);
    out.push({ key: quantityKey(quantity), group, name: name ?? label.name, detail: label.detail, unit: label.unit, quantity });
  };
  const parts = [...doc.parts].sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
  for (const part of parts) {
    if (METERS.has(part.type)) add('meters', { kind: 'meter', part: part.id });
    if (part.type === 'oscilloscope') {
      add('meters', { kind: 'scope', part: part.id, channel: 0 });
      add('meters', { kind: 'scope', part: part.id, channel: 1 });
    }
  }
  for (const part of parts) {
    if (SKIP.has(part.type)) continue;
    const terminals = terminalOptions(part);
    if (terminals.length > 0) {
      for (const q of terminals) add('parts', { kind: 'terminal', part: part.id, quantity: q });
      continue;
    }
    if (CATALOG[part.type].pins.length !== 2) continue;
    add('parts', { kind: 'across', part: part.id });
    add('parts', { kind: 'current', part: part.id }, `${part.label} · I`);
    add('parts', { kind: 'power', part: part.id });
  }
  // Düğümler: her ağ bir kez, toprak hariç; etiketin yeri ağdaki ilk bacak.
  const seen = new Set<number>();
  for (const part of parts) {
    if (part.type === 'ground') continue;
    const positions = pinPositions(part);
    positions.forEach((at, pin) => {
      const key = pinKey(part.id, pin);
      const net = idx.netOf(key);
      if (net === undefined || net === idx.ground || seen.has(net)) return;
      seen.add(net);
      const name = nodeLabel(net, idx);
      out.push({ key: `n:${net}`, group: 'nodes', name, detail: tr.analysis.picker.nodeDetail(name), unit: 'V', quantity: { kind: 'voltage', node: key, at, ref: null, refAt: null } });
    });
  }
  return out;
}

/** Aramayla süzme: ad ya da açıklama aranan sözcüklerin hepsini içerir (büyük-küçük harf, Türkçe). */
export function filterOptions(options: readonly QuantityOption[], query: string): QuantityOption[] {
  const words = query.toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...options];
  return options.filter((o) => {
    const text = `${o.name} ${o.detail}`.toLocaleLowerCase('tr-TR');
    return words.every((w) => text.includes(w));
  });
}
