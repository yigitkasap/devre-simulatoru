// Laboratuvar cihazlarının kabloları (three'siz, saf hesap): muz fiş – kablo – timsah kıskaç. Cihaz kablosu
// breadboard deliğine doğrudan girmez; kıskaç, ağın şeridine (ya da rayına) takılan kısa dik telin soyuk ucunu
// tutar. Kıskaç hiçbir zaman parça bacağını tutmaz (2026-11-10): bacağı kartın 1,4 mm üstünden tutan kıskaç
// parçayı örtüyor, tahtaya saplanmış gibi görünüyordu. Aynı ağa giden her cihaz kablosu kendi kısa teliyle ayrı
// bir boş deliğe takılır; zincir (bir kıskacın öbürünün çenesini tutması) yalnızca yer kalmazsa, en çok 2 kıskaç.
//
// Planın (planBreadboard) delikleri değişmez: Tahtada kur'un hazır kabloları ve görevlerin beklenen delikleri
// aynı kalır. Kısa teller ve kenar köprüleri yalnızca şemanın 3B görünümüne eklenir (clips.ts). Tahtada kur
// kurulumunda (öğrencinin taktığı delikler) her kablo kendi deliğindeki kısa teli tutar.

import type { CircuitDoc } from '../model/types';
import type { DeviceType } from '../sim/netlist';
import type { BreadboardPlan } from './breadboard';

/** Kabloları timsah kıskaçla biten laboratuvar cihazları (ön panelinde muz ya da BNC soketi olanlar). */
export const CLIP_DEVICES: ReadonlySet<DeviceType> = new Set(['dcsupply', 'funcgen', 'oscilloscope', 'voltmeter', 'ammeter', 'multimeter']);

/** Kıskaçla biten cihaz kabloları (plan.leads sırası). */
export function clipLeads(doc: CircuitDoc, plan: BreadboardPlan): number[] {
  const types = new Map(doc.parts.map((p) => [p.id, p.type]));
  return plan.leads.flatMap((lead, i) => {
    const type = types.get(lead.partId);
    return type && CLIP_DEVICES.has(type) ? [i] : [];
  });
}

/**
 * Birden çok cihaz kablosunun gittiği ağlar (ağ ve kablo sayısı): 3B'de kıskaçlarının üstünde "GND · 3 kablo"
 * etiketi. Kablolar ayrı deliklerde olsa da aynı iletkene (şerit, ray) bağlıdır.
 */
export function clipJunctions(doc: CircuitDoc, plan: BreadboardPlan): { readonly net: string; readonly count: number }[] {
  const count = new Map<string, number>();
  for (const i of clipLeads(doc, plan)) {
    const net = plan.leads[i]!.net;
    count.set(net, (count.get(net) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > 1).map(([net, n]) => ({ net, count: n }));
}
