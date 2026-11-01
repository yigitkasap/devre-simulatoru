import { SWITCH_ON_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { strProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';

/** Ortak ucun (C) bağlı olduğu uç. */
export const SPDT_THROWS = ['a', 'b'] as const;
export type SpdtThrow = (typeof SPDT_THROWS)[number];
export const SPDT_DEFAULTS = { to: 'a' as SpdtThrow };

export function spdtThrow(props: Props): SpdtThrow {
  return strProp(props, 'to', SPDT_THROWS, SPDT_DEFAULTS.to);
}

/**
 * Çift yollu anahtar (SPDT). Pinler: [0] = C (ortak), [1] = A, [2] = B. C, A ya da B ile birleşir
 * (bugünkü anahtarın kapalı kontağı gibi 1 mΩ); öbür uç açıkta kalır.
 */
export class SpdtDevice extends Device {
  readonly type = 'spdt';
  readonly to: SpdtThrow;

  constructor(init: DeviceInit) {
    super(init);
    this.to = spdtThrow(init.props);
  }

  private get closedPin(): number {
    return this.to === 'a' ? 1 : 2;
  }

  override stampStatic(sys: MnaSystem): void {
    sys.conductance(this.nodes[0]!, this.nodes[this.closedPin]!, 1 / SWITCH_ON_RESISTANCE);
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [[this.nodes[0]!, this.nodes[this.closedPin]!]];
  }

  /** Ölçüm: C ile bağlı uç arası gerilim ve C'ye giren akım. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, this.closedPin);
    const current = voltage / SWITCH_ON_RESISTANCE;
    return { voltage, current, power: voltage * current };
  }

  override pinCurrents(x: Float64Array): number[] {
    const { current } = this.measure(x);
    return this.to === 'a' ? [current, -current, 0] : [current, 0, -current];
  }
}

export const spdtModel: DeviceModel = {
  type: 'spdt',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  couplingPins: (props) => [[0, spdtThrow(props) === 'a' ? 1 : 2]],
  create: (init) => new SpdtDevice(init),
};
