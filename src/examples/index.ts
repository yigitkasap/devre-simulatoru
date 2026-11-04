// Hazır örnek devreler. Devreler bu klasördeki JSON dosyalarında (belge biçimi, sürüm 1);
// başlık, açıklama, "Ne işe yarar?" ve "Günlük hayatta" metinleri i18n/tr.ts → examples içindedir.
// Yeni bir örnek eklemek için: JSON dosyasını ekle, aşağıdaki gruplardan birine yaz, tr.ts'e
// metinlerini ekle. Örnekler üst çubuktaki "Örnekler" penceresinde bu gruplarla listelenir.

import { parseDoc } from '../model/serialize';
import type { CircuitDoc } from '../model/types';
import ampermetreEtkisi from './ampermetre-etkisi.json';
import ardBlink from './ard-blink.json';
import ardDugme from './ard-dugme.json';
import ardSayac from './ard-sayac.json';
import ardTrafikIsigi from './ard-trafik-isigi.json';
import ardFade from './ard-fade.json';
import ardPotansiyometre from './ard-potansiyometre.json';
import ardGeceLambasi from './ard-gece-lambasi.json';
import ardTermometre from './ard-termometre.json';
import ardPwmFiltre from './ard-pwm-filtre.json';
import ardMelodi from './ard-melodi.json';
import ardRole from './ard-role.json';
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
import akimKaynagiOhm from './akim-kaynagi-ohm.json';
import besleme7805 from './7805-besleme.json';
import lm317Ayarli from './lm317-ayarli.json';
import optokuplorLed from './optokuplor-led.json';
import schottky1n4001 from './schottky-1n4001.json';
import kopruDiyot from './kopru-diyot.json';
import tristorMandal from './tristor-mandal.json';

/**
 * Örnekler penceresindeki klasörler: içindeki gruplar ana listede değil, klasörün kendi görünümünde.
 * Akdeniz Üniversitesi Fizik Bölümü'nün Temel Elektronik Laboratuvarı (site bu ders için yapıldı):
 * föyün dokuz deneyi, baraj projesi ve föye dayanan arıza bulma görevleri. Adı tr.ts → examples.folders.
 */
export const EXAMPLE_FOLDERS = [{ id: 'akdeniz', logo: 'akdeniz-universitesi-96.png' }] as const;

export type ExampleFolderId = (typeof EXAMPLE_FOLDERS)[number]['id'];

/**
 * Örnek grupları (pencerede bu sırayla). Grup adları tr.ts → examples.groups içindedir; `folder` olan
 * gruplar o klasörde gösterilir (?ornek= adresleri ve örnek kimlikleri klasörden bağımsız).
 * "Deney" grupları Fizik 2. sınıf Elektronik Laboratuvarı föyünün dokuz deneyidir; devreler föydeki
 * parçalar ve değerlerle kuruludur. Föyde olmayan ek örnekler (EXTRA_EXAMPLES) deney grubunun sonunda.
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
      'akim-kaynagi-ohm',
    ],
  },
  { id: 'aletler', ids: ['toprak-tuzagi'] },
  { id: 'elektromanyetizma', ids: ['transformator', 'adaptor', 'transformator-dc', 'role', 'role-transistor', 'role-muhurleme', 'dc-motor', 'motor-jenerator', 'motor-h-koprusu'] },
  { id: 'sensorler', ids: ['potansiyometre', 'ldr-gece-lambasi', 'ntc-termometre', 'lamba-ani-akim'] },
  { id: 'ses', ids: ['hoparlor', 'buzzer-sicaklik', 'sigorta'] },
  { id: 'entegreler', ids: ['opamp-evirmeyen', 'opamp-eviren', 'opamp-karsilastirici', '555-astabil', '555-monostabil', '555-ses', '7805-besleme', 'lm317-ayarli', 'optokuplor-led'] },
  // Arduino Uno: önceden derlenmiş örnek programlar (src/arduino/sketches).
  { id: 'arduino', ids: ['ard-blink', 'ard-dugme', 'ard-sayac', 'ard-trafik-isigi', 'ard-fade', 'ard-potansiyometre', 'ard-gece-lambasi', 'ard-termometre', 'ard-pwm-filtre', 'ard-melodi', 'ard-role'] },
  { id: 'diyot-karakteristigi', folder: 'akdeniz', ids: ['diyot-dc', 'diyot-karakteristigi', 'zener-karakteristigi', 'led-karakteristigi', 'schottky-1n4001'] },
  { id: 'dogrultucu', folder: 'akdeniz', ids: ['yarim-dalga', 'kopru-dogrultmac', 'kopru-diyot'] },
  { id: 'kenetleyici', folder: 'akdeniz', ids: ['negatif-kenetleyici', 'pozitif-kenetleyici', 'gerilim-katlayici'] },
  { id: 'kirpici', folder: 'akdeniz', ids: ['paralel-kirpici', 'cift-kirpici'] },
  { id: 'fet-karakteristigi', folder: 'akdeniz', ids: ['jfet-karakteristik'] },
  { id: 'fet-yukseltec', folder: 'akdeniz', ids: ['fet-yukseltec'] },
  { id: 'bjt-yukseltec', folder: 'akdeniz', ids: ['bjt-yukseltec'] },
  { id: 'mosfet-yukseltec', folder: 'akdeniz', ids: ['mosfet-yukseltec'] },
  { id: 'anahtar', folder: 'akdeniz', ids: ['bjt-anahtar', 'bjt-anahtar-emetor', 'tristor-mandal'] },
  // Proje: baraj su seviyesi uyarısı (ayrı sayfası da var: /baraj).
  { id: 'baraj', folder: 'akdeniz', ids: ['baraj-cubuk', 'baraj-tek-isik'] },
] as const;

export type ExampleGroupId = (typeof EXAMPLE_GROUPS)[number]['id'];
export type ExampleId = (typeof EXAMPLE_GROUPS)[number]['ids'][number];

/**
 * Föyde olmayan ama deneyin konusunu sürdüren ek örnekler: pencerede ve örnek kartında "Föyde yok · ek"
 * etiketiyle, deney grubunun sonunda (Parça Dalga 1'in Schottky, KBP307 köprü ve tristör örnekleri).
 */
export const EXTRA_EXAMPLES: ReadonlySet<ExampleId> = new Set<ExampleId>(['schottky-1n4001', 'kopru-diyot', 'tristor-mandal']);

/** Bütün örnekler, pencerede göründükleri sırayla. */
export const EXAMPLE_IDS: readonly ExampleId[] = EXAMPLE_GROUPS.flatMap((g) => g.ids);

type ExampleGroup = (typeof EXAMPLE_GROUPS)[number];

/** Grubun klasörü; ana listedeki gruplarda null. */
export function groupFolder(id: ExampleGroupId): ExampleFolderId | null {
  const group: ExampleGroup | undefined = EXAMPLE_GROUPS.find((g) => g.id === id);
  return group && 'folder' in group ? group.folder : null;
}

/** Klasörün grupları (null: ana liste), pencerede bu sırayla. */
export function folderGroups(folder: ExampleFolderId | null): readonly ExampleGroup[] {
  return EXAMPLE_GROUPS.filter((g) => groupFolder(g.id) === folder);
}

/** Örneğin grubu. */
export function exampleGroup(id: ExampleId): ExampleGroupId | undefined {
  return EXAMPLE_GROUPS.find((g) => (g.ids as readonly ExampleId[]).includes(id))?.id;
}

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
  'ard-blink': ardBlink,
  'ard-dugme': ardDugme,
  'ard-sayac': ardSayac,
  'ard-trafik-isigi': ardTrafikIsigi,
  'ard-fade': ardFade,
  'ard-potansiyometre': ardPotansiyometre,
  'ard-gece-lambasi': ardGeceLambasi,
  'ard-termometre': ardTermometre,
  'ard-pwm-filtre': ardPwmFiltre,
  'ard-melodi': ardMelodi,
  'ard-role': ardRole,
  'akim-kaynagi-ohm': akimKaynagiOhm,
  '7805-besleme': besleme7805,
  'lm317-ayarli': lm317Ayarli,
  'optokuplor-led': optokuplorLed,
  'schottky-1n4001': schottky1n4001,
  'kopru-diyot': kopruDiyot,
  'tristor-mandal': tristorMandal,
};

/** Örneğin devresi; JSON bozuksa null (testler bunu yakalar). */
export function exampleDoc(id: ExampleId): CircuitDoc | null {
  return parseDoc(DATA[id]);
}
