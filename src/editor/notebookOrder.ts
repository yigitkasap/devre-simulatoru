// Defterin sırası ve gruplaması (saf hesap; tasarım v3, "Defter"): önce laboratuvar cihazları ve
// Arduino, ardından diğer parçalar etiket sırasıyla (R2, R10'dan önce). Aynı türden 3 ya da daha
// fazla parça tek satırda toplanır ("Diyotlar · D1, D2, D3, D4"); satır, ilk üyesinin yerinde durur.
// Uyarı ve örnek kartları bu listenin üstünde, defterin kendisinde.

import type { Part } from '../model/types';
import type { DeviceType } from '../sim/netlist';

export type NotebookEntry =
  | { readonly kind: 'part'; readonly part: Part }
  | { readonly kind: 'group'; readonly type: DeviceType; readonly parts: readonly Part[] };

/** Defterin başındaki cihazlar, bu sırayla. */
const DEVICES_FIRST: readonly DeviceType[] = ['oscilloscope', 'funcgen', 'dcsupply', 'arduino'];
/** Bu kadar ya da daha fazla aynı türden parça tek satırda toplanır. */
export const GROUP_MIN = 3;

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
export const compareLabels = (a: Part, b: Part) => collator.compare(a.label, b.label);

export function notebookEntries(parts: readonly Part[]): NotebookEntry[] {
  const devices = parts
    .filter((p) => DEVICES_FIRST.includes(p.type))
    .sort((a, b) => DEVICES_FIRST.indexOf(a.type) - DEVICES_FIRST.indexOf(b.type) || compareLabels(a, b));
  const others = parts.filter((p) => !DEVICES_FIRST.includes(p.type)).sort(compareLabels);
  const counts = new Map<DeviceType, number>();
  for (const p of others) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const entries: NotebookEntry[] = devices.map((part) => ({ kind: 'part', part }));
  const grouped = new Set<DeviceType>();
  for (const part of others) {
    if ((counts.get(part.type) ?? 0) < GROUP_MIN) {
      entries.push({ kind: 'part', part });
    } else if (!grouped.has(part.type)) {
      grouped.add(part.type);
      entries.push({ kind: 'group', type: part.type, parts: others.filter((p) => p.type === part.type) });
    }
  }
  return entries;
}
