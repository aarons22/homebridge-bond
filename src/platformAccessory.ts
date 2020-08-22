import { Bond, BondState } from './interface/Bond';
import { BondPlatform } from './platform';
import { CeilingFanAccessory } from './accessories/CeilingFanAccessory';
import { Device } from './interface/Device';
import { DeviceType } from './enum/DeviceType';
import { FireplaceAccessory } from './accessories/FireplaceAccessory';
import { GenericAccessory } from './accessories/GenericAccessory';
import { PlatformAccessory } from 'homebridge';
import { ShadesAccessory } from './accessories/ShadesAccessory';

export interface BondAccessory {
  platform: BondPlatform
  accessory: PlatformAccessory
  updateState(state: BondState): void
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BondAccessory {
  export function create(platform: BondPlatform, accessory: PlatformAccessory, bond: Bond): BondAccessory {
    const device: Device = accessory.context.device;
    accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.SerialNumber, device.id);

    switch (device.type) {
      case DeviceType.CeilingFan:
        return new CeilingFanAccessory(platform, accessory, bond);
      case DeviceType.Generic:
        return new GenericAccessory(platform, accessory, bond);
      case DeviceType.Fireplace: 
        return new FireplaceAccessory(platform, accessory, bond);
      case DeviceType.Shades:
        return new ShadesAccessory(platform, accessory, bond);
      default: {
        throw 'Invalid Device Type';
      }
    }
  }
}