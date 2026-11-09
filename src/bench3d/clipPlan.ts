// Laboratuvar cihazlarının kabloları (three'siz, saf hesap): muz fiş – kablo – timsah kıskaç. Cihaz kablosu
// breadboard deliğine doğrudan girmez; kıskaç ağdaki bir parça bacağını ya da deliğe takılan kısa dik telin
// ucunu tutar. Aynı ağa giden öbür cihaz kabloları ilk kıskacın üstüne zincir gibi takılır (ayrı delik yok).
//
// Planın (planBreadboard) delikleri değişmez: Tahtada kur'un hazır kabloları ve görevlerin beklenen delikleri
// aynı kalır. Kısa tel planın o kablo için ayırdığı deliğe takılır; zincirdeki ya da bacağı tutan kabloların
// delikleri boş kalır. Tahtada kur kurulumunda (öğrencinin taktığı delikler) her kablo kendi deliğindeki
// kısa teli tutar: zincir ya da bacak yok (öğrencinin seçtiği delik görünür kalsın).

import type { CircuitDoc } from '../model/types';
import type { DeviceType } from '../sim/netlist';
import type { BreadboardPlan } from './breadboard';

/** Kabloları timsah kıskaçla biten laboratuvar cihazları (ön panelinde muz ya da BNC soketi olanlar). */
export const CLIP_DEVICES: ReadonlySet<DeviceType> = new Set(['dcsupply', 'funcgen', 'oscilloscope', 'voltmeter', 'ammeter', 'multimeter']);

/**
 * Kıskacın tutabileceği bacaklar: eksenli parçalar (direnç, diyot, Schottky, zener). Bacakları gövdeden
 * yatay çıkıp deliğe iner, öbür bacak en az 3 delik ötede: kıskaç başka bacağa değmez. Dik (radyal)
 * parçaların, TO-92'nin ve entegrelerin bacakları bir delik aralığında yan yana: kıskaç komşu bacağa değer.
 */
export const CLIP_LEGS: ReadonlySet<DeviceType> = new Set(['resistor', 'diode', 'schottky', 'zener']);

export interface ClipGroup {
  readonly net: string;
  /** plan.leads sırası: ilki bacağı ya da teli tutar, öbürleri onun üstüne takılır. */
  readonly leads: readonly number[];
}

/**
 * Cihaz kablolarının kıskaç grupları. `chain` (şemanın planı): aynı ağdaki kablolar tek grupta; değilse
 * (Tahtada kur kurulumu) her kablo kendi grubunda.
 */
export function clipGroups(doc: CircuitDoc, plan: BreadboardPlan, chain = true): ClipGroup[] {
  const types = new Map(doc.parts.map((p) => [p.id, p.type]));
  const groups: { net: string; leads: number[] }[] = [];
  const byNet = new Map<string, { net: string; leads: number[] }>();
  plan.leads.forEach((lead, i) => {
    const type = types.get(lead.partId);
    if (!type || !CLIP_DEVICES.has(type)) return;
    const found = chain ? byNet.get(lead.net) : undefined;
    if (found) {
      found.leads.push(i);
      return;
    }
    const group = { net: lead.net, leads: [i] };
    groups.push(group);
    if (chain) byNet.set(lead.net, group);
  });
  return groups;
}

/** Birleşme noktaları: iki ya da daha çok cihaz kablosunun buluştuğu kıskaç grupları (ağ ve kablo sayısı). */
export function clipJunctions(doc: CircuitDoc, plan: BreadboardPlan): { readonly net: string; readonly count: number }[] {
  return clipGroups(doc, plan).filter((g) => g.leads.length > 1).map((g) => ({ net: g.net, count: g.leads.length }));
}
