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
    this.lightService.on.updateValue(state.light === 1);

    if (this.lightService.brightness && state.brightness) {
      this.lightService.brightness.updateValue(state.brightness);
    }
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;
    
    this.observeLight(bond, device);
    this.observeLightToggle(bond, device);
    this.observeBrightness(bond, device);
  }

  private observeLight(bond: Bond, device: Device): void {
    if (!Device.LThasLightbulb(device)) {
      this.platform.error(this.accessory, 'LightAccessory does not have required ToggleLight action.');
      return;
    }

    // Set initial state
    bond.api.getState(device.id).then(state => {
      this.updateState(state);
    });

    Observer.set(this.lightService.on, (value, callback) => {
      bond.api.toggleLight(device, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Set light power: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error setting light power: ${error}`);
        });
    });
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

  private observeBrightness(bond: Bond, device: Device) {
    if (!this.lightService.brightness) {
      return;
    }

    Observer.set(this.lightService.brightness, (value, callback) => {
      if (value === 0) {
        // Value of 0 is the same as turning the light off.
        this.platform.debug(this.accessory, 'Brightness is 0, turning light off.');
        bond.api.turnLightOff(device, callback)
          .then(() => {
            this.platform.debug(this.accessory, `Turned light off: ${value}`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error turning light off: ${error}`);
          });
        return;
      } 

      bond.api.setFanSpeed(device, value, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Set light brightness: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error setting light brightness: ${error}`);
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