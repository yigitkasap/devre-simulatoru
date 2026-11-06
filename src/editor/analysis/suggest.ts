// Başlangıç ekranının "Bu devre için" önerileri (analiz v2): devredeki parçalara göre en çok üç hazır
// grafik. Üreteç ve osiloskop varsa giriş ve çıkış dalgası; transistörlü yükselteçte (üreteç ve
// transistör) kazancın frekansla değişimi (Bode); diyot, zener ya da LED varsa ilkinin I–V eğrisi, yoksa
// transistörün çıkış ailesi (eğri izleyici); ölçü aletleri varsa okumaları zamana göre.

import { ek } from '../../i18n/ek';
import { tr } from '../../i18n/tr';
import type { Quantity } from '../../model/analysis';
import type { CircuitDoc, Part } from '../../model/types';
import type { IconName } from '../icons';
import { FAMILY } from './sweep';

export type SuggestionPlan =
  | { readonly kind: 'time'; readonly traces: readonly Quantity[] }
  | { readonly kind: 'bode' }
  | { readonly kind: 'curve'; readonly part: string };

export interface Suggestion {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly icon: IconName;
  readonly plan: SuggestionPlan;
}

const byLabel = (a: Part, b: Part) => a.label.localeCompare(b.label, 'tr', { numeric: true });
const AMPLIFIERS: ReadonlySet<string> = new Set(['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos', 'opamp']);

export const MAX_SUGGESTIONS = 3;

export function suggestions(doc: CircuitDoc): Suggestion[] {
  const t = tr.analysis.start.suggestions;
  const parts = [...doc.parts].sort(byLabel);
  const of = (types: readonly string[]) => parts.filter((p) => types.includes(p.type));
  const out: Suggestion[] = [];
  const generator = of(['funcgen'])[0];
  const scope = of(['oscilloscope'])[0];
  if (generator && scope) {
    out.push({
      key: 'wave',
      title: t.wave,
      detail: t.waveDetail(scope.label),
      icon: 'chart',
      plan: { kind: 'time', traces: [{ kind: 'scope', part: scope.id, channel: 0 }, { kind: 'scope', part: scope.id, channel: 1 }] },
    });
  }
  const amplifier = parts.find((p) => AMPLIFIERS.has(p.type));
  if (generator && amplifier) out.push({ key: 'gain', title: t.gain, detail: t.gainDetail(generator.label), icon: 'bode', plan: { kind: 'bode' } });
  const diode = parts.find((p) => FAMILY[p.type] === 'diode');
  const transistor = parts.find((p) => FAMILY[p.type] === 'fet' || FAMILY[p.type] === 'bjt');
  if (diode) out.push({ key: 'iv', title: t.iv(ek(diode.label, 'in')), detail: t.curveDetail, icon: 'curve', plan: { kind: 'curve', part: diode.id } });
  else if (transistor) out.push({ key: 'family', title: t.family(ek(transistor.label, 'in')), detail: t.curveDetail, icon: 'curve', plan: { kind: 'curve', part: transistor.id } });
  const meters = of(['ammeter', 'voltmeter']).sort((a, b) => (a.type === b.type ? byLabel(a, b) : a.type === 'ammeter' ? -1 : 1)).slice(0, 4);
  if (meters.length > 0) {
    out.push({
      key: 'meters',
      title: t.meters(meters.map((m) => m.label)),
      detail: t.metersDetail,
      icon: 'chart',
      plan: { kind: 'time', traces: meters.map((m) => ({ kind: 'meter', part: m.id })) },
    });
  }
  return out.slice(0, MAX_SUGGESTIONS);
}
