
import { BondPlatform } from './platform';
import { Device } from './interface/Device';
import { Characteristic, PlatformAccessory } from 'homebridge';

export class FanService {
  on: Characteristic
  rotationSpeed?: Characteristic
  rotationDirection?: Characteristic
  name?: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory) {
    let service = accessory.getService(platform.Service.Fan);
    const device: Device = accessory.context.device;
    if (service === undefined) {
      service = accessory.addService(platform.Service.Fan, accessory.displayName);
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);
    if (Device.hasFan(device)) {
      this.rotationSpeed = service.getCharacteristic(platform.Characteristic.RotationSpeed);

      if (Device.hasReverseSwitch(device)) {
        this.rotationDirection = service.getCharacteristic(platform.Characteristic.RotationDirection);
      }
    }
    
    this.name = service.getCharacteristic(platform.Characteristic.Name);
  }
}

export class LightbulbService {
  on: Characteristic
  subType?: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType?: string) {
    let service = accessory.getService(platform.Service.Lightbulb);
    if (subType) {
      service = accessory.getServiceByUUIDAndSubType(platform.Service.Lightbulb, subType);
    }
    
    if (service === undefined) {
      service = accessory.addService(platform.Service.Lightbulb, name, subType);
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.subType = subType;
  }
}

export class SwitchService {
  on: Characteristic
  name?: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType?: string) {
    let service = accessory.getService(platform.Service.Switch);
    if (subType) {
      service = accessory.getServiceByUUIDAndSubType(platform.Service.Switch, subType);
    }
    if (service === undefined) {
      service = accessory.addService(platform.Service.Switch, name, subType);
    }
    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.name = service.getCharacteristic(platform.Characteristic.Name);
  }
}

// ButtonService is a switch that resets itself after 500ms. This provides a 
// button like experience that isn't available in homebridge.
export class ButtonService {
  on: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType?: string) {
    let service = accessory.getService(platform.Service.Switch);
    if (subType) {
      service = accessory.getServiceByUUIDAndSubType(platform.Service.Switch, subType);
    }
    if (service === undefined) {
      service = accessory.addService(platform.Service.Switch, name, subType);
    }
    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.on.setValue(false);

    this.on.on('set', () => {
      const timer = setInterval(() => {
        this.on.updateValue(false);
        clearInterval(timer);
      }, 500);
    });
  }
}

export class WindowCoveringService {
  currentPosition: Characteristic
  targetPosition: Characteristic
  positionState: Characteristic
  name?: Characteristic

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
    this.name = service.getCharacteristic(platform.Characteristic.Name);
  }
}