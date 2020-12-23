import { Bond, BondState } from '../interface/Bond';
import { BondAccessory } from '../platformAccessory';
import { BondPlatform } from '../platform';
import { Device } from '../interface/Device';
import { Observer } from '../Observer';
import { PlatformAccessory } from 'homebridge';
import { ButtonService, LightbulbService } from '../Services';

export class LightAccessory implements BondAccessory {
  platform: BondPlatform
  accessory: PlatformAccessory
  lightService: LightbulbService
  toggleLightService?: ButtonService

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    this.platform = platform;
    this.accessory = accessory;
    this.lightService = new LightbulbService(platform, accessory, `${accessory.displayName} Light`);
    if (platform.config.include_toggle_state) {
      this.toggleLightService = new ButtonService(platform, accessory, 'Toggle Light State', 'ToggleState');
    } else {
      this.removeService('Toggle Light State');
    }

    this.observe(bond);
  }

  updateState(state: BondState) {
    this.lightService.updateState(state);
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;
    
    if (Device.LThasLightbulb(device)) {
      this.lightService.observe(this.platform, bond, this.accessory);
    } else {
      this.platform.error(this.accessory, 'LightAccessory does not have required ToggleLight action.');
    }

    this.observeLightToggle(bond, device);
  }

  private observeLightToggle(bond: Bond, device: Device) {
    if (!this.toggleLightService) {
      return;
    }

    Observer.set(this.toggleLightService.on, (_, callback) => {
      bond.api.toggleState(device, 'light', callback)
        .then(() => {
          this.platform.debug(this.accessory, `${device.name} light state toggled`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling light state: ${error}`);
        });
    });
  }

  private removeService(serviceName: string) {
    const service = this.accessory.getService(serviceName);
    if (service) {
      this.accessory.removeService(service);
    }
  }
}