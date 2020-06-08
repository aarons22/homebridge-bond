import { PlatformAccessory } from 'homebridge';
import { Device } from './interface/Device';
import { BondPlatform } from './platform';
import { DeviceType } from './enum/DeviceType';

export class BondAccessory {
  constructor(
    private readonly platform: BondPlatform,
    accessory: PlatformAccessory,
    device: Device,
  ) {
    // Set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.id);

    if (device.type === DeviceType.CeilingFan) {
      if (device.properties.max_speed === undefined) {
        this.platform.log(`${accessory.displayName} Fan is not supported (missing max_speed property).`);
      }
      if (Device.CFhasFan(device)) {
        accessory.addService(this.platform.Service.Fan, accessory.displayName);
      }

      if (Device.CFhasUpDownLight(device)) {
        accessory.addService(this.platform.Service.Lightbulb, `${accessory.displayName} Light`, 'up');
        accessory.addService(this.platform.Service.Lightbulb, `${accessory.displayName} Light`, 'down');
      } else if (Device.CFhasLightbulb(device)) {
        accessory.addService(this.platform.Service.Lightbulb, `${accessory.displayName} Light`);
      }

      if (this.platform.config.include_dimmer && Device.HasDimmer(device)) {
        accessory.addService(this.platform.Service.Switch, `${accessory.displayName} Dimmer`);
      }
      if (this.platform.config.include_dimmer && Device.HasSeparateDimmers(device)) {
        accessory.addService(new this.platform.Service.Switch(`${accessory.displayName} DimmerUp`, 'up'));
        accessory.addService(new this.platform.Service.Switch(`${accessory.displayName} DimmerDown`, 'down'));
      }
    }

    if (device.type === DeviceType.Generic) {
      if (Device.GXhasToggle(device)) {
        accessory.addService(this.platform.Service.Switch, accessory.displayName);
      }
    }

    if (device.type === DeviceType.Fireplace) {
      if (Device.FPhasToggle(device)) {
        accessory.addService(this.platform.Service.Switch, accessory.displayName);
      }
    }
  }
}