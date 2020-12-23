import { Bond } from './interface/Bond';
import { BondPlatform } from './platform';
import { Device } from './interface/Device';
import { Characteristic, PlatformAccessory } from 'homebridge';
import { Observer } from './Observer';

export class FanService {
  on: Characteristic
  rotationSpeed?: Characteristic
  rotationDirection?: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory) {
    let service = accessory.getService(platform.Service.Fan);
    const device: Device = accessory.context.device;
    if (service === undefined) {
      service = accessory.addService(platform.Service.Fan, accessory.displayName);
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);
    if (Device.canSetSpeed(device)) {
      this.rotationSpeed = service.getCharacteristic(platform.Characteristic.RotationSpeed);
    }

    if (Device.hasReverseSwitch(device)) {
      this.rotationDirection = service.getCharacteristic(platform.Characteristic.RotationDirection);
    }
  }
}

export class LightbulbService {
  on: Characteristic
  brightness?: Characteristic
  subType?: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType?: string) {
    let service = accessory.getService(platform.Service.Lightbulb);
    const device: Device = accessory.context.device;
    if (subType) {
      service = accessory.getServiceById(platform.Service.Lightbulb, subType);
    }
    
    if (service === undefined) {
      service = accessory.addService(platform.Service.Lightbulb, name, subType);
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);

    const brightness = service.getCharacteristic(platform.Characteristic.Brightness);
    if (Device.LThasBrightness(device)) {
      this.brightness = brightness;
    } else {
      // Fixing bug from 3.1.0 where brightness was added to lights unintentionally
      service.removeCharacteristic(brightness);
    }
    
    this.subType = subType;
  }

  observe(platform: BondPlatform, bond: Bond, accessory: PlatformAccessory) {
    const device: Device = accessory.context.device;
    this.observeLight(platform, bond, device, accessory);
    this.observeLightBrightness(platform, bond, device, accessory);
  }

  private observeLight(platform: BondPlatform, bond: Bond, device: Device, accessory: PlatformAccessory) {
    if (!this.on) {
      return;
    }
    
    Observer.set(this.on, (value, callback) => {
      let promise: Promise<void>;

      const subtype = this.subType;
      if(subtype === 'UpLight') {
        promise = bond.api.toggleUpLight(device, callback);
      } else if(subtype === 'DownLight') {
        promise = bond.api.toggleDownLight(device, callback);
      } else {
        promise = bond.api.toggleLight(device, callback);
      }

      promise
        .then(() => {
          platform.debug(accessory, `Set light power: ${value}`);
        })
        .catch((error: string) => {
          platform.error(accessory, `Error setting light power: ${error}`);
        });
    });
  }
  
  private observeLightBrightness(platform: BondPlatform, bond: Bond, device: Device, accessory: PlatformAccessory) {
    if (!this.brightness) {
      return;
    }

    Observer.set(this.brightness, (value, callback) => {
      if (value === 0) {
        // Value of 0 is the same as turning the light off.
        return;
      } 

      bond.api.setBrightness(device, value, callback)
        .then(() => {
          platform.debug(accessory, `Set light brightness: ${value}`);
        })
        .catch((error: string) => {
          platform.error(accessory, `Error setting light brightness: ${error}`);
        });
    });
  }
}

export class SwitchService {
  on: Characteristic
  subType: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType: string) {
    // Check for service by subtype
    let service = accessory.getServiceById(platform.Service.Switch, subType);
    if (service === undefined) {
      service = accessory.addService(platform.Service.Switch, name, subType);
    }
    // Set the subtype if not defined
    if (service.subtype === undefined) {
      service.subtype = subType;
    }
    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.subType = subType;
  }
}

// ButtonService is a switch that resets itself after 500ms. This provides a 
// button like experience that isn't available in homebridge.
export class ButtonService {
  on: Characteristic
  subType: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType: string) {
    // Check for service by subtype
    let service = accessory.getServiceById(platform.Service.Switch, subType);
    if (service === undefined) {
      service = accessory.addService(platform.Service.Switch, name, subType);
    }
    // Set the subtype if not defined
    if (service.subtype === undefined) {
      service.subtype = subType;
    }
    
    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.on.setValue(false);

    this.on.on('set', () => {
      const timer = setInterval(() => {
        this.on.updateValue(false);
        clearInterval(timer);
      }, 500);
    });
    this.subType = subType;
  }
}

export class WindowCoveringService {
  currentPosition: Characteristic
  targetPosition: Characteristic
  positionState: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory) {
    let service = accessory.getService(platform.Service.WindowCovering);
    if (service === undefined) {
      service = accessory.addService(platform.Service.WindowCovering, accessory.displayName);
    }
    this.currentPosition = service.getCharacteristic(platform.Characteristic.CurrentPosition);
    this.targetPosition = service.getCharacteristic(platform.Characteristic.TargetPosition);
    this.positionState = service.getCharacteristic(platform.Characteristic.PositionState);
  }
}