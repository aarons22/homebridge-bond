import { Bond, BondState } from './interface/Bond';
import { BondPlatform } from './platform';
import { CeilingFanAccessory } from './accessories/CeilingFanAccessory';
import { Device } from './interface/Device';
import { DeviceType } from './enum/DeviceType';
import { FireplaceAccessory } from './accessories/FireplaceAccessory';
import { GenericAccessory } from './accessories/GenericAccessory';
import { LightAccessory } from './accessories/LightAccessory';
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
    const service = accessory.getService(platform.Service.AccessoryInformation)!;
    service
      .setCharacteristic(platform.Characteristic.Manufacturer, bond.version.make ?? `Bond (${bond.version.target})`)
      // FirmwareRevision only supports semantic versioning, so the 'v' in the firmware version needs to be dropped
      .setCharacteristic(platform.Characteristic.FirmwareRevision, bond.version.fw_ver.replace('v',''))
      // SerialNumber must be at least 2 characters. Use uniqueId to prevent warnings.
      .setCharacteristic(platform.Characteristic.SerialNumber, device.uniqueId); 

    if (bond.version.model) {
      service
        .setCharacteristic(platform.Characteristic.Model, bond.version.model);
    }

    if (bond.version.mcu_ver) {
      service
        .setCharacteristic(platform.Characteristic.HardwareRevision, bond.version.mcu_ver);
    }

    switch (device.type) {
      case DeviceType.CeilingFan:
        return new CeilingFanAccessory(platform, accessory, bond);
      case DeviceType.Generic:
        return new GenericAccessory(platform, accessory, bond);
      case DeviceType.Fireplace: 
        return new FireplaceAccessory(platform, accessory, bond);
      case DeviceType.Shades:
        return new ShadesAccessory(platform, accessory, bond);
      case DeviceType.Light:
        return new LightAccessory(platform, accessory, bond);
      default: {
        throw 'Invalid Device Type';
      }
    }
  }
}