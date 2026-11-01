// Hazır arıza senaryosundan görev (B2, Örnekler → Arıza bul): örneğin devresi, belirti ve gizli arıza;
// kartın üstündeki deney ve "Bulundu" açıklaması senaryonun kimliğinden tr.ts'te.

import { exampleDoc } from '../../examples';
import { FAULT_SCENARIOS, faultScenario, type FaultScenarioId } from '../../examples/faultScenarios';
import { tr } from '../../i18n/tr';
import { DEFAULT_FAULT_TOOLS, type TaskDef } from '../../model/task';
import type { CircuitDoc } from '../../model/types';

export function scenarioTask(id: FaultScenarioId): { doc: CircuitDoc; task: TaskDef } | null {
  const s = faultScenario(id);
  const doc = s ? exampleDoc(s.base) : null;
  if (!s || !doc) return null;
  const t = tr.fault.scenarios[id];
  return {
    doc,
    task: {
      name: t.title,
      instruction: '',
      editable: [],
      allowNew: false,
      targets: [],
      predict: false,
      circuit: tr.examples.texts[s.base].title,
      fault: { symptom: t.symptom, faults: s.faults, tools: DEFAULT_FAULT_TOOLS, hideIndicators: true, askExpected: false, scenario: id },
    },
  };
}

/** Senaryonun metinleri (kimlik bilinmiyorsa null). */
export function scenarioTexts(id: string | undefined) {
  return id && faultScenario(id) ? tr.fault.scenarios[id as FaultScenarioId] : null;
}

/** "Yeni arıza dene": listedeki sonraki senaryo (sonuncudan sonra ilki). */
export function nextScenario(id: string): FaultScenarioId {
  const i = FAULT_SCENARIOS.findIndex((s) => s.id === id);
  return FAULT_SCENARIOS[(i + 1) % FAULT_SCENARIOS.length]!.id;
}
