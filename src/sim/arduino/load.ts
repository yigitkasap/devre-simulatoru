// İşlemciyi ve derlenmiş programları kaydeder (içe aktarılınca). Tembel yüklenen parça budur.

import { FIRMWARE } from './firmware.gen';
import { Atmega328, decodeFirmware } from './mcu';
import { setArduinoRuntime } from './runtime';

setArduinoRuntime({
  create(program) {
    const image = FIRMWARE[program];
    return image ? new Atmega328(decodeFirmware(image.firmware), image.idle) : null;
  },
});
