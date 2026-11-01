import { SWITCH_ON_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { boolProp, strProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement } from './device';

/** Kontak türü: normalde açık (basılınca kapanır) ya da normalde kapalı (basılınca açılır). */
export const PUSHBUTTON_CONTACTS = ['no', 'nc'] as const;
export const PUSHBUTTON_DEFAULTS = { contact: 'no' as (typeof PUSHBUTTON_CONTACTS)[number] };

/**
 * Basılı tutulunca kontağı değişen düğme. `pressed` belgede durmaz: şemada, 3B'de ya da kartta
 * basılı tutulurken simülasyonun devresine eklenir (Simulator), bırakınca kalkar.
 */
export function pushbuttonClosed(props: Props): boolean {
  const pressed = boolProp(props, 'pressed', false);
  return strProp(props, 'contact', PUSHBUTTON_CONTACTS, PUSHBUTTON_DEFAULTS.contact) === 'nc' ? !pressed : pressed;
}

/** Basmalı düğme. Pinler: [0], [1]. Kontağı bugünkü anahtarınki gibi: kapalıyken 1 mΩ, açıkken açık devre. */
export class PushButtonDevice extends Device {
  readonly type = 'pushbutton';
  readonly pressed: boolean;
  readonly closed: boolean;

  constructor(init: DeviceInit) {
    super(init);
    this.pressed = boolProp(init.props, 'pressed', false);
    this.closed = pushbuttonClosed(init.props);
  }

  override stampStatic(sys: MnaSystem): void {
    if (this.closed) sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / SWITCH_ON_RESISTANCE);
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return this.closed ? [this.nodes] : [];
  }

  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return this.twoTerminal(x, this.closed ? voltage / SWITCH_ON_RESISTANCE : 0);
  }

  override status(): DeviceStatus {
    return { pressed: this.pressed };
  }
}

export const pushbuttonModel: DeviceModel = {
  type: 'pushbutton',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  couplingPins: (props) => (pushbuttonClosed(props) ? [[0, 1]] : []),
  create: (init) => new PushButtonDevice(init),
};
