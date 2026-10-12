// Testlerde devreleri kısa yoldan kurmak için yardımcı.

import type { DeviceType, Netlist, NetlistElement, NetlistLink, PropValue } from '../src/sim';

export class NetlistBuilder {
  private readonly elements: NetlistElement[] = [];
  private readonly links: NetlistLink[] = [];

  add(type: DeviceType, id: string, pins: string[], props: Record<string, PropValue> = {}): this {
    this.elements.push({ id, type, pins, props });
    return this;
  }

  /** Pil: + ucu `plus`, − ucu `minus`. */
  battery(id: string, plus: string, minus: string, voltage: number, internalResistance = 0): this {
    return this.add('battery', id, [plus, minus], { voltage, internalResistance });
  }

  ground(id: string, node: string): this {
    return this.add('ground', id, [node]);
  }

  resistor(id: string, a: string, b: string, resistance: number): this {
    return this.add('resistor', id, [a, b], { resistance });
  }

  capacitor(id: string, plus: string, minus: string, capacitance: number, initialVoltage = 0): this {
    return this.add('capacitor', id, [plus, minus], { capacitance, initialVoltage });
  }

  diode(id: string, anode: string, cathode: string): this {
    return this.add('diode', id, [anode, cathode]);
  }

  led(id: string, anode: string, cathode: string, color: 'red' | 'green' | 'blue' = 'red'): this {
    return this.add('led', id, [anode, cathode], { color });
  }

  switch(id: string, a: string, b: string, closed: boolean): this {
    return this.add('switch', id, [a, b], { closed });
  }

  voltmeter(id: string, plus: string, minus: string, resistance: number | 'ideal' = 10e6): this {
    return this.add('voltmeter', id, [plus, minus], resistance === 'ideal' ? { ideal: true } : { resistance, ideal: false });
  }

  ammeter(id: string, plus: string, minus: string, resistance: number | 'ideal' = 0.1): this {
    return this.add('ammeter', id, [plus, minus], resistance === 'ideal' ? { ideal: true } : { resistance, ideal: false });
  }

  /** İki ağı kabloyla birleştirir. */
  wire(a: string, b: string): this {
    this.links.push({ a, b });
    return this;
  }

  build(): Netlist {
    return { elements: [...this.elements], links: [...this.links] };
  }
}

export const circuit = (): NetlistBuilder => new NetlistBuilder();
