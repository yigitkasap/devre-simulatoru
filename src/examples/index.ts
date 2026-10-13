// Hazır örnek devreler. Devreler bu klasördeki JSON dosyalarında (belge biçimi, sürüm 1);
// başlık, açıklama, tahmin sorusu ve cevap metinleri i18n/tr.ts → examples içindedir.
// Yeni bir örnek eklemek için: JSON dosyasını ekle, aşağıdaki gruplardan birine yaz, tr.ts'e
// metinlerini ekle. Örnekler üst çubuktaki "Örnekler" penceresinde bu gruplarla listelenir.

import { parseDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';
import ampermetreEtkisi from './ampermetre-etkisi.json';
import bjtAnahtar from './bjt-anahtar.json';
import bjtYukseltec from './bjt-yukseltec.json';
import diyotKarakteristigi from './diyot-karakteristigi.json';
import diyotYonu from './diyot-yonu.json';
import fetCikisKarakteristigi from './fet-cikis-karakteristigi.json';
import fetTransferKarakteristigi from './fet-transfer-karakteristigi.json';
import fetYukseltec from './fet-yukseltec.json';
import gerilimBolucu from './gerilim-bolucu.json';
import gerilimIkileyici from './gerilim-ikileyici.json';
import kopruFiltre from './kopru-filtre.json';
import ledOnDirenc from './led-on-direnc.json';
import mosfetAnahtar from './mosfet-anahtar.json';
import mosfetYukseltec from './mosfet-yukseltec.json';
import paralelKirpici from './paralel-kirpici.json';
import pozitifKenetleyici from './pozitif-kenetleyici.json';
import rcDolma from './rc-dolma.json';
import rcKareDalga from './rc-kare-dalga.json';
import tamDalgaOrtaUclu from './tam-dalga-orta-uclu.json';
import toprakTuzagi from './toprak-tuzagi.json';
import voltmetreYukleme from './voltmetre-yukleme.json';
import yarimDalga from './yarim-dalga.json';
import zenerKirpici from './zener-kirpici.json';

/** Örnek grupları (pencerede bu sırayla). Grup adları tr.ts → examples.groups içindedir. */
export const EXAMPLE_GROUPS = [
  {
    id: 'temel',
    ids: ['led-on-direnc', 'gerilim-bolucu', 'voltmetre-yukleme', 'ampermetre-etkisi', 'rc-dolma', 'rc-kare-dalga', 'diyot-yonu'],
  },
  { id: 'aletler', ids: ['toprak-tuzagi'] },
  { id: 'diyot-karakteristigi', ids: ['diyot-karakteristigi'] },
  { id: 'dogrultucu', ids: ['yarim-dalga', 'tam-dalga-orta-uclu', 'kopru-filtre'] },
  { id: 'kenetleyici', ids: ['pozitif-kenetleyici', 'gerilim-ikileyici'] },
  { id: 'kirpici', ids: ['paralel-kirpici', 'zener-kirpici'] },
  { id: 'fet-karakteristigi', ids: ['fet-cikis-karakteristigi', 'fet-transfer-karakteristigi'] },
  { id: 'fet-yukseltec', ids: ['fet-yukseltec'] },
  { id: 'bjt-yukseltec', ids: ['bjt-yukseltec'] },
  { id: 'mosfet-yukseltec', ids: ['mosfet-yukseltec'] },
  { id: 'anahtar', ids: ['bjt-anahtar', 'mosfet-anahtar'] },
] as const;

export type ExampleGroupId = (typeof EXAMPLE_GROUPS)[number]['id'];
export type ExampleId = (typeof EXAMPLE_GROUPS)[number]['ids'][number];

/** Bütün örnekler, pencerede göründükleri sırayla. */
export const EXAMPLE_IDS: readonly ExampleId[] = EXAMPLE_GROUPS.flatMap((g) => g.ids);

const DATA: Record<ExampleId, unknown> = {
  'led-on-direnc': ledOnDirenc,
  'gerilim-bolucu': gerilimBolucu,
  'voltmetre-yukleme': voltmetreYukleme,
  'ampermetre-etkisi': ampermetreEtkisi,
  'rc-dolma': rcDolma,
  'rc-kare-dalga': rcKareDalga,
  'diyot-yonu': diyotYonu,
  'diyot-karakteristigi': diyotKarakteristigi,
  'yarim-dalga': yarimDalga,
  'tam-dalga-orta-uclu': tamDalgaOrtaUclu,
  'kopru-filtre': kopruFiltre,
  'pozitif-kenetleyici': pozitifKenetleyici,
  'gerilim-ikileyici': gerilimIkileyici,
  'paralel-kirpici': paralelKirpici,
  'zener-kirpici': zenerKirpici,
  'fet-cikis-karakteristigi': fetCikisKarakteristigi,
  'fet-transfer-karakteristigi': fetTransferKarakteristigi,
  'fet-yukseltec': fetYukseltec,
  'bjt-yukseltec': bjtYukseltec,
  'mosfet-yukseltec': mosfetYukseltec,
  'bjt-anahtar': bjtAnahtar,
  'mosfet-anahtar': mosfetAnahtar,
  'toprak-tuzagi': toprakTuzagi,
};

/** Örneğin devresi; JSON bozuksa null (testler bunu yakalar). */
export function exampleDoc(id: ExampleId): CircuitDoc | null {
  return parseDoc(DATA[id]);
}
