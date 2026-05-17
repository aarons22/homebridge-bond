import { BondState } from '../../src/interface/Bond';

export class BondStateFactory {
  static create(overrides?: Partial<BondState>): BondState {
    return {
      power: 0,
      speed: 0,
      light: 0,
      ...overrides,
    };
  }

  static fanOn(speed = 2): BondState {
    return { power: 1, speed, direction: 1, light: 0 };
  }

  static fanOff(): BondState {
    return { power: 0, speed: 0 };
  }

  static fanWithLight(speed = 2, brightness = 75): BondState {
    return { power: 1, speed, light: 1, brightness };
  }

  static fanWithUpDownLight(): BondState {
    return { power: 1, speed: 2, light: 1, up_light: 1, down_light: 0 };
  }

  static shadesOpen(): BondState {
    return { open: 1, position: 100 };
  }

  static shadesClosed(): BondState {
    return { open: 0, position: 0 };
  }

  static shadesAtPosition(position: number): BondState {
    return { position };
  }

  static fireplaceOn(flame = 60): BondState {
    return { power: 1, flame };
  }

  static fireplaceOff(): BondState {
    return { power: 0 };
  }
}
