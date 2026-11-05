// Hazır arıza bulma senaryoları (B2): föy deneylerinin örnek devreleri, her birinde gizli bir arıza.
// Örnekler penceresinde "Arıza bul" grubu. Başlık, belirti ve çözüm açıklaması tr.ts → fault.scenarios;
// açıklamadaki sayılar simülatörde ölçüldü (tests/ariza.test.ts aynı sayıları denetler).

import type { Fault } from '../model/faults';
import { groupFolder, type ExampleFolderId, type ExampleGroupId, type ExampleId } from '.';

export interface FaultScenario {
  readonly id: string;
  /** Devrenin alındığı örnek. */
  readonly base: ExampleId;
  /** Föydeki deney (kartta "Arıza bul · Deney 7"). */
  readonly group: ExampleGroupId;
  readonly faults: readonly Fault[];
}

export const FAULT_SCENARIOS = [
  // Temel devre: LED yanmış.
  { id: 'ariza-led', base: 'led-on-direnc', group: 'temel', faults: [{ kind: 'burnt', part: 'p4' }] },
  // Deney 1: diyot ters takılmış.
  { id: 'ariza-diyot', base: 'diyot-dc', group: 'diyot-karakteristigi', faults: [{ kind: 'reversed', part: 'p4' }] },
  // Deney 2: köprüde D2'nin anot bacağı kopuk (yarım dalga).
  { id: 'ariza-dogrultucu', base: 'kopru-dogrultmac', group: 'dogrultucu', faults: [{ kind: 'open', at: { part: 'p4', pin: 0 } }] },
  // Deney 5: JFET'in source bacağı kopuk.
  { id: 'ariza-jfet', base: 'jfet-karakteristik', group: 'fet-karakteristigi', faults: [{ kind: 'open', at: { part: 'p3', pin: 2 } }] },
  // Deney 7: RC'nin kollektör tarafındaki bacağı kopuk (tasarımdaki örnek, R1–R5).
  { id: 'ariza-bjt', base: 'bjt-yukseltec', group: 'bjt-yukseltec', faults: [{ kind: 'open', at: { part: 'p3', pin: 1 } }] },
] as const satisfies readonly FaultScenario[];

export type FaultScenarioId = (typeof FAULT_SCENARIOS)[number]['id'];

export function faultScenario(id: string): FaultScenario | undefined {
  return FAULT_SCENARIOS.find((s) => s.id === id);
}

/** Senaryonun klasörü: deneyinin grubunun klasörü (föye dayanmayan senaryo ana listede, null). */
export function faultFolder(scenario: FaultScenario): ExampleFolderId | null {
  return groupFolder(scenario.group);
}
