import { CharacteristicValue } from 'homebridge';
import { Device } from '../../src/interface/Device';

// Opaque tokens that stand in for HAP Service/Characteristic types.
// Using symbols ensures Fan !== Lightbulb !== Switch etc. at runtime.
export const ServiceTokens = {
  Fan: Symbol('Fan'),
  Lightbulb: Symbol('Lightbulb'),
  Switch: Symbol('Switch'),
  WindowCovering: Symbol('WindowCovering'),
  AccessoryInformation: Symbol('AccessoryInformation'),
};

export const CharacteristicTokens = {
  On: Symbol('On'),
  Name: Symbol('Name'),
  ConfiguredName: Symbol('ConfiguredName'),
  RotationSpeed: Symbol('RotationSpeed'),
  RotationDirection: Symbol('RotationDirection'),
  Brightness: Symbol('Brightness'),
  CurrentPosition: Symbol('CurrentPosition'),
  TargetPosition: Symbol('TargetPosition'),
  PositionState: Symbol('PositionState'),
  Manufacturer: Symbol('Manufacturer'),
  FirmwareRevision: Symbol('FirmwareRevision'),
  SerialNumber: Symbol('SerialNumber'),
  Model: Symbol('Model'),
  HardwareRevision: Symbol('HardwareRevision'),
};

type OnSetHandler = (value: CharacteristicValue) => Promise<void>;

export class MockCharacteristic {
  // Start as undefined so Observer.set de-dup doesn't suppress the first set call.
  value: CharacteristicValue | undefined = undefined;

  private onSetHandler?: OnSetHandler;
  private setHandlers: Array<() => void> = [];
  private props: Record<string, unknown> = {};

  updateValue(v: CharacteristicValue): this {
    this.value = v;
    return this;
  }

  setValue(v: CharacteristicValue): this {
    this.value = v;
    return this;
  }

  onSet(handler: OnSetHandler): this {
    this.onSetHandler = handler;
    return this;
  }

  on(event: string, handler: () => void): this {
    if (event === 'set') {
      this.setHandlers.push(handler);
    }
    return this;
  }

  setProps(p: Record<string, unknown>): this {
    this.props = { ...this.props, ...p };
    return this;
  }

  getProps(): Record<string, unknown> {
    return this.props;
  }

  // Test helper: simulate HomeKit setting a value through Observer.set
  async simulateSet(v: CharacteristicValue): Promise<void> {
    if (this.onSetHandler) {
      await this.onSetHandler(v);
    }
  }
}

export class MockService {
  subtype?: string;
  private characteristics = new Map<unknown, MockCharacteristic>();

  getCharacteristic(token: unknown): MockCharacteristic {
    if (!this.characteristics.has(token)) {
      this.characteristics.set(token, new MockCharacteristic());
    }
    return this.characteristics.get(token)!;
  }

  removeCharacteristic(_c: MockCharacteristic): void {
    // no-op; accessories call this defensively
  }

  setCharacteristic(token: unknown, value: CharacteristicValue): this {
    this.getCharacteristic(token).setValue(value);
    return this;
  }
}

// Key for storing services in the accessory map: token + optional subtype
function serviceKey(type: unknown, subType?: string): string {
  return `${String(type)}::${subType ?? '__default'}`;
}

export class MockPlatformAccessory {
  displayName: string;
  UUID: string;
  context: { device: Device };
  private serviceMap = new Map<string, MockService>();

  constructor(device: Device, name = 'Test Accessory', uuid = 'test-uuid') {
    this.displayName = name;
    this.UUID = uuid;
    this.context = { device };
  }

  getService(type: unknown): MockService | undefined {
    return this.serviceMap.get(serviceKey(type));
  }

  getServiceById(type: unknown, subType: string): MockService | undefined {
    return this.serviceMap.get(serviceKey(type, subType));
  }

  addService(type: unknown, _name?: string, subType?: string): MockService {
    const svc = new MockService();
    svc.subtype = subType;
    const key = serviceKey(type, subType);
    this.serviceMap.set(key, svc);
    return svc;
  }

  removeService(service: MockService): void {
    for (const [key, svc] of this.serviceMap) {
      if (svc === service) {
        this.serviceMap.delete(key);
        return;
      }
    }
  }
}
