// Örnekler penceresinin içeriği: gruplar (yan listedeki sırayla), kısa adları, üst yazıları ve
// arama. Saf modül: pencere (ExamplesDialog) ve testler kullanır.

import { EXAMPLE_FOLDERS, EXTRA_EXAMPLES, exampleDoc, folderGroups, labExperiment, type ExampleFolderId, type ExampleGroupId, type ExampleId } from '../examples';
import { FAULT_SCENARIOS, faultFolder, type FaultScenarioId } from '../examples/faultScenarios';
import { LAB_EXPERIMENT_TEXTS, labAim, labFigure } from '../i18n/foy';
import { tr } from '../i18n/tr';

/** Listede bir kart: örnek ya da arıza görevi. */
export type ExampleEntry = { readonly kind: 'example'; readonly id: ExampleId } | { readonly kind: 'fault'; readonly id: FaultScenarioId };

export interface ExampleSection {
  /** Grup kimliği; arıza görevlerinde "ariza:<klasör>" ya da "ariza". */
  readonly key: string;
  readonly folder: ExampleFolderId | null;
  /** Yan listedeki işaret: Deney 1–9 için 1–9, baraj P, arıza bulma !, genel gruplarda boş. */
  readonly mark: string;
  /** Yan listedeki kısa ad. */
  readonly short: string;
  /** Başlığın üstündeki küçük yazı (DENEY 1, PROJE, ARIZA BULMA); genel gruplarda null. */
  readonly overline: string | null;
  /** Föydeki tam ad (genel gruplarda grubun adı). */
  readonly title: string;
  /** Föyün amaç cümlesi (deney gruplarında). */
  readonly aim: string | null;
  readonly entries: readonly ExampleEntry[];
}

const b = () => tr.examples.browser;

/** "Diyot karakteristiklerinin incelenmesi" → "Diyot karakteristiklerinin incelenmesi" (ilk harf büyük). */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}

function groupSection(id: ExampleGroupId, folder: ExampleFolderId | null, ids: readonly ExampleId[]): ExampleSection {
  const n = labExperiment(id);
  const entries = ids.map((x) => ({ kind: 'example', id: x }) as const);
  if (n !== null) {
    return { key: id, folder, mark: String(n), short: b().short[id] ?? tr.examples.groups[id], overline: b().experiment(n), title: capitalize(LAB_EXPERIMENT_TEXTS[n].title), aim: labAim(id), entries };
  }
  if (id === 'baraj') return { key: id, folder, mark: 'P', short: b().short.baraj!, overline: b().project, title: b().barajTitle, aim: null, entries };
  return { key: id, folder, mark: '', short: tr.examples.groups[id], overline: null, title: tr.examples.groups[id], aim: null, entries };
}

function faultSection(folder: ExampleFolderId | null): ExampleSection | null {
  const ids = FAULT_SCENARIOS.filter((s) => faultFolder(s) === folder).map((s) => ({ kind: 'fault', id: s.id }) as const);
  if (ids.length === 0) return null;
  return { key: folder ? `ariza:${folder}` : 'ariza', folder, mark: '!', short: b().short.ariza!, overline: b().faults, title: b().faultTitle, aim: tr.fault.groupNote, entries: ids };
}

/** Bütün gruplar pencerenin sırasıyla: önce klasörler (Akdeniz: Deney 1–9, baraj, arıza bulma), sonra genel gruplar. */
export function exampleSections(): ExampleSection[] {
  const sections: ExampleSection[] = [];
  for (const f of EXAMPLE_FOLDERS) {
    for (const g of folderGroups(f.id)) sections.push(groupSection(g.id, f.id, g.ids as readonly ExampleId[]));
    const faults = faultSection(f.id);
    if (faults) sections.push(faults);
  }
  for (const g of folderGroups(null)) sections.push(groupSection(g.id, null, g.ids as readonly ExampleId[]));
  const faults = faultSection(null);
  if (faults) sections.push(faults);
  return sections;
}

/** Türkçe karakterlere duyarsız arama için sadeleştirme; uzunluğu korur (eşleşmeyi başlıkta işaretlemek için). */
export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLocaleLowerCase('tr-TR');
    const c = lower.length === 1 ? lower : ch.toLowerCase();
    out += ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' } as Record<string, string>)[c] ?? c;
  }
  return out;
}

/** Devredeki parçaların adları ve modelleri (aramada "zener", "555", "BC107" bulunsun diye). */
const partWords = new Map<ExampleId, string>();
function partsText(id: ExampleId): string {
  let text = partWords.get(id);
  if (text === undefined) {
    const doc = exampleDoc(id);
    const words = new Set<string>();
    for (const p of doc?.parts ?? []) {
      words.add(tr.devices.names[p.type]);
      if (typeof p.props.model === 'string') words.add(p.props.model);
    }
    text = normalize([...words].join(' '));
    partWords.set(id, text);
  }
  return text;
}

/** Kartın başlığı, tek satırlık cümlesi ve aramada bakılan öbür metinleri. */
export function entryTexts(entry: ExampleEntry): { title: string; cue: string; chip: string | null; extra: boolean; haystack: string } {
  if (entry.kind === 'fault') {
    const t = tr.fault.scenarios[entry.id];
    const base = FAULT_SCENARIOS.find((s) => s.id === entry.id)!.base;
    return { title: t.title, cue: t.symptom, chip: null, extra: false, haystack: normalize([t.title, t.symptom, t.experiment].join(' ')) + ' ' + partsText(base) };
  }
  const t = tr.examples.texts[entry.id];
  const extra = EXTRA_EXAMPLES.has(entry.id);
  const figure = extra ? null : labFigure(entry.id);
  const cue = tr.examples.cues[entry.id];
  return { title: t.title, cue, chip: figure ? figure.figure : null, extra, haystack: normalize([t.title, cue, t.description].join(' ')) + ' ' + partsText(entry.id) };
}

/** Kartın küçük şemasının devresi: örneğin kendisi, arıza görevinde dayandığı örnek. */
export function entryExample(entry: ExampleEntry): ExampleId {
  return entry.kind === 'example' ? entry.id : FAULT_SCENARIOS.find((s) => s.id === entry.id)!.base;
}

export function entryKey(entry: ExampleEntry): string {
  return `${entry.kind}:${entry.id}`;
}

/**
 * Arama: başlıkta, cümlede, açıklamada, grup adında ve devredeki parça adlarında (Türkçe karakterlere
 * duyarsız). Grupların sırası korunur; eşleşmeyen kartlar çıkar (grup boş kalabilir).
 */
export function searchSections(sections: readonly ExampleSection[], query: string): ExampleSection[] {
  const q = normalize(query.trim());
  if (!q) return [...sections];
  return sections.map((s) => {
    const groupHit = normalize(`${s.title} ${s.short} ${s.overline ?? ''}`).includes(q);
    return { ...s, entries: s.entries.filter((e) => groupHit || entryTexts(e).haystack.includes(q)) };
  });
}

/** Başlıkta aramanın eşleştiği yer (işaretlemek için); yoksa null. */
export function titleMatch(title: string, query: string): readonly [number, number] | null {
  const q = normalize(query.trim());
  if (!q) return null;
  const i = normalize(title).indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}

/** Bütün devrelerin sayısı (örnekler ve arıza görevleri). */
export function entryCount(sections: readonly ExampleSection[]): number {
  return sections.reduce((n, s) => n + s.entries.length, 0);
}

/** Açık örneğin (ya da arıza görevinin) grubu. */
export function sectionOf(sections: readonly ExampleSection[], activeExample: ExampleId | null, activeFault: string | null): ExampleSection | null {
  return (
    sections.find((s) => s.entries.some((e) => (e.kind === 'example' && e.id === activeExample) || (e.kind === 'fault' && e.id === activeFault))) ?? null
  );
}
