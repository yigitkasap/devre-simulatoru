// Hazır örnek devreler. Devreler bu klasördeki JSON dosyalarında (belge biçimi, sürüm 1);
// başlık, açıklama, tahmin sorusu ve cevap metinleri i18n/tr.ts → examples içindedir.
// Yeni bir örnek eklemek için: JSON dosyasını ekle, aşağıdaki listeye yaz, tr.ts'e metinlerini ekle.

import { parseDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';
import ampermetreEtkisi from './ampermetre-etkisi.json';
import diyotYonu from './diyot-yonu.json';
import gerilimBolucu from './gerilim-bolucu.json';
import ledOnDirenc from './led-on-direnc.json';
import rcDolma from './rc-dolma.json';
import voltmetreYukleme from './voltmetre-yukleme.json';

export const EXAMPLE_IDS = [
  'led-on-direnc',
  'gerilim-bolucu',
  'voltmetre-yukleme',
  'ampermetre-etkisi',
  'rc-dolma',
  'diyot-yonu',
] as const;

export type ExampleId = (typeof EXAMPLE_IDS)[number];

const DATA: Record<ExampleId, unknown> = {
  'led-on-direnc': ledOnDirenc,
  'gerilim-bolucu': gerilimBolucu,
  'voltmetre-yukleme': voltmetreYukleme,
  'ampermetre-etkisi': ampermetreEtkisi,
  'rc-dolma': rcDolma,
  'diyot-yonu': diyotYonu,
};

/** Örneğin devresi; JSON bozuksa null (testler bunu yakalar). */
export function exampleDoc(id: ExampleId): CircuitDoc | null {
  return parseDoc(DATA[id]);
}
