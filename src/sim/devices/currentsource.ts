import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type StepContext } from './device';

export const CURRENT_SOURCE_DEFAULTS = { current: 1e-3 };

/**
 * İdeal DC akım kaynağı. Pinler: [0] = 1. uç, [1] = 2. uç. Akım kaynağın içinden 1'den 2'ye akar: 2.
 * uçtan dış devreye çıkar, 1. uçtan geri girer (sembolde ok 2. ucu gösterir). Uçları arasındaki gerilim
 * dış devreye göre kendiliğinden oluşur.
 *
 * Akacak yol yoksa (açık devre; motor bu uçları "KCL gereği akımı 0" bulur) kaynak akım vermez:
 * ideal kaynak açık devrede sonsuz gerilim isterdi. Topoloji uyarısı: current-source-open.
 */
export class CurrentSourceDevice extends Device {
  readonly type = 'currentsource';
  readonly current: number;
  /** Uçlarından akım geçemiyor (açık devre). */
  private open = false;

  constructor(init: DeviceInit) {
    super(init);
    this.current = numProp(init.props, 'current', CURRENT_SOURCE_DEFAULTS.current);
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    if (!this.open) sys.currentSource(this.nodes[0]!, this.nodes[1]!, this.current * ctx.sourceScale);
  }

  override zeroCurrentPins(zero: readonly boolean[] | undefined): void {
    this.open = zero?.some(Boolean) ?? false;
  }

  /** İdeal akım kaynağı gmin için iletken yol sayılmaz; akım taşıyabilir (olası yol). */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [];
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [this.nodes];
  }

  /** Ölçüm: pin 0'dan girip içinden pin 1'e akan akım (kaynağın verdiği akım), gerilim v(1) − v(2). */
  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.open ? 0 : this.current);
  }
}

export const currentSourceModel: DeviceModel = {
  type: 'currentsource',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new CurrentSourceDevice(init),
};
