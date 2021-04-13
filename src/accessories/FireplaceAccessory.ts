import { Bond, BondState } from '../interface/Bond';
import { BondAccessory } from '../platformAccessory';
import { BondPlatform } from '../platform';
import { Device } from '../interface/Device';
import { Observer } from '../Observer';
import { PlatformAccessory } from 'homebridge';
import { ButtonService, FlameService } from '../Services';

export class FireplaceAccessory implements BondAccessory {
  platform: BondPlatform
  accessory: PlatformAccessory
  flameService: FlameService
  toggleStateService?: ButtonService

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    this.platform = platform;
    this.accessory = accessory;
    this.flameService = new FlameService(platform, accessory, accessory.displayName, 'Flame');
    if (platform.config.include_toggle_state) {
      this.toggleStateService = new ButtonService(platform, accessory, 'Toggle State', 'ToggleState');
    } else {
      this.removeService('Toggle State');
    }

    this.observe(bond);
  }

  updateState(state: BondState) {
    this.flameService.updateState(state);
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;
    if (Device.FPhasToggle(device)) {
      this.flameService.observe(this.platform, bond, this.accessory);
    } else {
      this.platform.error(this.accessory, 'FireplaceAccessory does not have required TogglePower action.');
    }
    this.observeToggle(bond);

    // Set initial state
    bond.api.getState(device.id).then(state => {
      this.updateState(state);
    });
  }

  private observeToggle(bond: Bond) {
    if (!this.toggleStateService) {
      return;
    }
    const device: Device = this.accessory.context.device;

    Observer.set(this.toggleStateService.on, (_, callback) => {
      bond.api.toggleState(device, 'power', callback)
        .then(() => {
          this.platform.debug(this.accessory, `${device.name} power state toggled`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling power state: ${error}`);
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