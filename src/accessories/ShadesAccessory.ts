import { Bond, BondState } from '../interface/Bond';
import { BondAccessory } from '../platformAccessory';
import { BondPlatform } from '../platform';
import { Device } from '../interface/Device';
import { Observer } from '../Observer';
import { PlatformAccessory } from 'homebridge';
import { ButtonService, WindowCoveringService } from '../Services';

export class ShadesAccessory implements BondAccessory  {
  platform: BondPlatform
  accessory: PlatformAccessory
  windowCoveringService: WindowCoveringService
  toggleStateService?: ButtonService

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    this.platform = platform;
    this.accessory = accessory;
    this.windowCoveringService = new WindowCoveringService(platform, accessory);
    if (platform.config.include_toggle_state) {
      this.toggleStateService = new ButtonService(platform, accessory, 'Toggle State', 'ToggleState');
    } else {  
      this.removeService('Toggle State');
    }
    
    this.observe(bond);
    this.observeToggle(bond);
  }

  updateState(state: BondState) {
    if (this.windowCoveringService) {
      // Always return either 0 or 100
      this.windowCoveringService.currentPosition.updateValue(state.open === 1 ? 100 : 0);
      this.windowCoveringService.targetPosition.updateValue(state.open === 1 ? 100 : 0);
    }
  }

  private observe(bond: Bond) {
    const device: Device = this.accessory.context.device;
    if (!Device.MShasToggle(device)) {
      this.platform.error(this.accessory, 'ShadesAccessory does not have required ToggleOpen action.');
      return;
    }

    // Set initial state
    bond.api.getState(device.id).then(state => {
      this.updateState(state);
    });
    
    const props = {
      minValue: 0,
      maxValue: 100,
      minStep: 100,
    };
    this.windowCoveringService.targetPosition.setProps(props);

    Observer.set(this.windowCoveringService.targetPosition, (value, callback) => {
      // Since we can't really track state, just toggle open / closed
      bond.api.toggleOpen(device, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Toggled open: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling open: ${error}`);
        });
    });
  }

  private observeToggle(bond: Bond) {
    if (!this.toggleStateService) {
      return;
    }
    const device: Device = this.accessory.context.device;

    Observer.set(this.toggleStateService.on, (_, callback) => {
      bond.api.toggleState(device, 'open', callback)
        .then(() => {
          this.platform.debug(this.accessory, `${device.name} open state toggled`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling open state: ${error}`);
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