// Arızanın 3B'deki görünüşü (B2, karar 1): şema doğru hâliyle kalır, ama gerçekte gözle görülen arızalar
// tezgâhta görünür. Ters takılmış diyot, LED ya da elektrolitik 180° döner (bandı, düz kenarı, şeridi
// öbür uçta; uçları aynı yerde kalır); yanlış değerli parçanın değeri (direncin renk bantları) değişir;
// yanmış LED ve atmış sigorta yanık görünür. Kopuk bağlantı ve kısa devre görünmez.

import { nextRotation } from '../../model/geometry';
import { VALUE_PROP, type Fault } from '../../model/faults';
import type { CircuitDoc } from '../../model/types';

/** 3B modelin "yanık" görünüşü (simülasyon dururken de). */
export const BURNT_PROP = 'faultBurnt';

export function faultedLook(doc: CircuitDoc, faults: readonly Fault[]): CircuitDoc {
  if (!faults.some((f) => f.kind === 'value' || f.kind === 'reversed' || f.kind === 'burnt')) return doc;
  return {
    ...doc,
    parts: doc.parts.map((part) => {
      let next = part;
      for (const f of faults) {
        if (!('part' in f) || f.part !== part.id) continue;
        if (f.kind === 'reversed') next = { ...next, rotation: nextRotation(nextRotation(next.rotation)) };
        if (f.kind === 'burnt') next = { ...next, props: { ...next.props, [BURNT_PROP]: true } };
        const prop = VALUE_PROP[part.type];
        if (f.kind === 'value' && prop) next = { ...next, props: { ...next.props, [prop]: f.value } };
      }
      return next;
    }),
  };
}
