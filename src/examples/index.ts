// Hazır örnek devreler. Devreler bu klasördeki JSON dosyalarında (belge biçimi, sürüm 1);
// başlık, açıklama, "Ne işe yarar?" ve "Günlük hayatta" metinleri i18n/tr.ts → examples içindedir.
// Yeni bir örnek eklemek için: JSON dosyasını ekle, aşağıdaki gruplardan birine yaz, tr.ts'e
// metinlerini ekle. Örnekler üst çubuktaki "Örnekler" penceresinde bu gruplarla listelenir.

import { parseDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';
import ampermetreEtkisi from './ampermetre-etkisi.json';
import barajCubuk from './baraj-cubuk.json';
import barajTekIsik from './baraj-tek-isik.json';
import bobinSerbestGecis from './bobin-serbest-gecis.json';
import bjtAnahtar from './bjt-anahtar.json';
import bjtAnahtarEmetor from './bjt-anahtar-emetor.json';
import bjtYukseltec from './bjt-yukseltec.json';
import ciftKirpici from './cift-kirpici.json';
import diyotDc from './diyot-dc.json';
import diyotKarakteristigi from './diyot-karakteristigi.json';
import diyotYonu from './diyot-yonu.json';
import fetYukseltec from './fet-yukseltec.json';
import gerilimBolucu from './gerilim-bolucu.json';
import gerilimKatlayici from './gerilim-katlayici.json';
import jfetKarakteristik from './jfet-karakteristik.json';
import kopruDogrultmac from './kopru-dogrultmac.json';
import ledKarakteristigi from './led-karakteristigi.json';
import ledOnDirenc from './led-on-direnc.json';
import mosfetYukseltec from './mosfet-yukseltec.json';
import negatifKenetleyici from './negatif-kenetleyici.json';
import paralelKirpici from './paralel-kirpici.json';
import pozitifKenetleyici from './pozitif-kenetleyici.json';
import rcDolma from './rc-dolma.json';
import rcKareDalga from './rc-kare-dalga.json';
import rlDevresi from './rl-devresi.json';
import toprakTuzagi from './toprak-tuzagi.json';
import transformator from './transformator.json';
import adaptor from './adaptor.json';
import transformatorDc from './transformator-dc.json';
import role from './role.json';
import roleTransistor from './role-transistor.json';
import roleMuhurleme from './role-muhurleme.json';
import dcMotor from './dc-motor.json';
import motorJenerator from './motor-jenerator.json';
import motorHKoprusu from './motor-h-koprusu.json';
import potansiyometre from './potansiyometre.json';
import ldrGeceLambasi from './ldr-gece-lambasi.json';
import ntcTermometre from './ntc-termometre.json';
import lambaAniAkim from './lamba-ani-akim.json';
import hoparlor from './hoparlor.json';
import buzzerSicaklik from './buzzer-sicaklik.json';
import sigorta from './sigorta.json';
import opampEvirmeyen from './opamp-evirmeyen.json';
import opampEviren from './opamp-eviren.json';
import opampKarsilastirici from './opamp-karsilastirici.json';
import astabil555 from './555-astabil.json';
import ses555 from './555-ses.json';
import monostabil555 from './555-monostabil.json';
import voltmetreYukleme from './voltmetre-yukleme.json';
import yarimDalga from './yarim-dalga.json';
import zenerKarakteristigi from './zener-karakteristigi.json';

/**
 * Örnek grupları (pencerede bu sırayla). Grup adları tr.ts → examples.groups içindedir.
 * "Temel" ve "aletler" dışındaki gruplar Fizik 2. sınıf Elektronik Laboratuvarı föyünün dokuz
 * deneyidir; devreler föydeki parçalar ve değerlerle kuruludur.
 */
export const EXAMPLE_GROUPS = [
  {
    id: 'temel',
    ids: [
      'led-on-direnc',
      'gerilim-bolucu',
      'voltmetre-yukleme',
      'ampermetre-etkisi',
      'rc-dolma',
      'rc-kare-dalga',
      'rl-devresi',
      'bobin-serbest-gecis',
      'diyot-yonu',
    ],
  },
  { id: 'aletler', ids: ['toprak-tuzagi'] },
  { id: 'elektromanyetizma', ids: ['transformator', 'adaptor', 'transformator-dc', 'role', 'role-transistor', 'role-muhurleme', 'dc-motor', 'motor-jenerator', 'motor-h-koprusu'] },
  { id: 'sensorler', ids: ['potansiyometre', 'ldr-gece-lambasi', 'ntc-termometre', 'lamba-ani-akim'] },
  { id: 'ses', ids: ['hoparlor', 'buzzer-sicaklik', 'sigorta'] },
  { id: 'entegreler', ids: ['opamp-evirmeyen', 'opamp-eviren', 'opamp-karsilastirici', '555-astabil', '555-monostabil', '555-ses'] },
  { id: 'diyot-karakteristigi', ids: ['diyot-dc', 'diyot-karakteristigi', 'zener-karakteristigi', 'led-karakteristigi'] },
  { id: 'dogrultucu', ids: ['yarim-dalga', 'kopru-dogrultmac'] },
  { id: 'kenetleyici', ids: ['negatif-kenetleyici', 'pozitif-kenetleyici', 'gerilim-katlayici'] },
  { id: 'kirpici', ids: ['paralel-kirpici', 'cift-kirpici'] },
  { id: 'fet-karakteristigi', ids: ['jfet-karakteristik'] },
  { id: 'fet-yukseltec', ids: ['fet-yukseltec'] },
  { id: 'bjt-yukseltec', ids: ['bjt-yukseltec'] },
  { id: 'mosfet-yukseltec', ids: ['mosfet-yukseltec'] },
  { id: 'anahtar', ids: ['bjt-anahtar', 'bjt-anahtar-emetor'] },
  // Proje: baraj su seviyesi uyarısı (ayrı sayfası da var: /baraj).
  { id: 'baraj', ids: ['baraj-cubuk', 'baraj-tek-isik'] },
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
  'rl-devresi': rlDevresi,
  'bobin-serbest-gecis': bobinSerbestGecis,
  'diyot-yonu': diyotYonu,
  'toprak-tuzagi': toprakTuzagi,
  transformator,
  adaptor,
  'transformator-dc': transformatorDc,
  role,
  'role-transistor': roleTransistor,
  'role-muhurleme': roleMuhurleme,
  'dc-motor': dcMotor,
  'motor-jenerator': motorJenerator,
  'motor-h-koprusu': motorHKoprusu,
  potansiyometre,
  'ldr-gece-lambasi': ldrGeceLambasi,
  'ntc-termometre': ntcTermometre,
  'lamba-ani-akim': lambaAniAkim,
  hoparlor,
  'buzzer-sicaklik': buzzerSicaklik,
  sigorta,
  'opamp-evirmeyen': opampEvirmeyen,
  'opamp-eviren': opampEviren,
  'opamp-karsilastirici': opampKarsilastirici,
  '555-astabil': astabil555,
  '555-ses': ses555,
  '555-monostabil': monostabil555,
  'diyot-dc': diyotDc,
  'diyot-karakteristigi': diyotKarakteristigi,
  'zener-karakteristigi': zenerKarakteristigi,
  'led-karakteristigi': ledKarakteristigi,
  'yarim-dalga': yarimDalga,
  'kopru-dogrultmac': kopruDogrultmac,
  'negatif-kenetleyici': negatifKenetleyici,
  'pozitif-kenetleyici': pozitifKenetleyici,
  'gerilim-katlayici': gerilimKatlayici,
  'paralel-kirpici': paralelKirpici,
  'cift-kirpici': ciftKirpici,
  'jfet-karakteristik': jfetKarakteristik,
  'fet-yukseltec': fetYukseltec,
  'bjt-yukseltec': bjtYukseltec,
  'mosfet-yukseltec': mosfetYukseltec,
  'bjt-anahtar': bjtAnahtar,
  'bjt-anahtar-emetor': bjtAnahtarEmetor,
  'baraj-cubuk': barajCubuk,
  'baraj-tek-isik': barajTekIsik,
};

/** Örneğin devresi; JSON bozuksa null (testler bunu yakalar). */
export function exampleDoc(id: ExampleId): CircuitDoc | null {
  return parseDoc(DATA[id]);
}
