import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';

/**
 * Toprak (0 V referansı). Matrise hiçbir şey eklemez: derleme sırasında ucu toprak düğümüne
 * bağlanır ve o düğümün satır/sütunu sistemden çıkarılır.
 */
export class GroundDevice extends Device {
  readonly type = 'ground';

  constructor(init: DeviceInit) {
    super(init);
  }

  measure(): Measurement {
    return { voltage: 0, current: 0, power: 0 };
  }
}

export const groundModel: DeviceModel = {
  type: 'ground',
  pinCount: 1,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new GroundDevice(init),
};
