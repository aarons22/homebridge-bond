import { Bond, BondState } from '../interface/Bond';
import { BondAccessory } from '../platformAccessory';
import { BondPlatform } from '../platform';
import { Device } from '../interface/Device';
import { Observer } from '../Observer';
import { PlatformAccessory } from 'homebridge';
import { ButtonService, WindowCoveringService } from '../Services';
import { Action } from '../enum/Action';

export class ShadesAccessory implements BondAccessory  {
  platform: BondPlatform
  accessory: PlatformAccessory
  windowCoveringService: WindowCoveringService
  presetService?: ButtonService
  toggleStateService?: ButtonService

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    this.platform = platform;
    this.accessory = accessory;
    const device: Device = accessory.context.device;

    this.windowCoveringService = new WindowCoveringService(platform, accessory);
    if (platform.config.include_toggle_state) {
      this.toggleStateService = new ButtonService(platform, accessory, 'Toggle State', 'ToggleState');
    } else {
      this.removeService('Toggle State');
    }

    if (Device.MShasPreset(device)) {
      this.presetService = new ButtonService(platform, accessory, 'Preset', 'Preset');
    }

    this.observe(bond);
  }

  updateState(state: BondState) {
    if (this.windowCoveringService) {
      // If position is available, use it, otherwise fall back to open state
      if (state.position !== undefined) {
        const device: Device = this.accessory.context.device;
        // Determine if we should invert position values based on device subtype
        // Awnings use 0=closed, 100=open (same as HomeKit), so no inversion needed
        // Other shades use 0=open, 100=closed (opposite of HomeKit), so inversion is needed
        const shouldInvert = !Device.MSisAwning(device);
        const homekitPosition = shouldInvert ? 100 - state.position : state.position;
        this.windowCoveringService.currentPosition.updateValue(homekitPosition);
        this.windowCoveringService.targetPosition.updateValue(homekitPosition);
      } else {
        this.windowCoveringService.currentPosition.updateValue(state.open === 1 ? 100 : 0);
        this.windowCoveringService.targetPosition.updateValue(state.open === 1 ? 100 : 0);
      }
    }
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;

    this.observeWindowCovering(bond, device);
    this.observePreset(bond, device);
    this.observeToggleState(bond, device);
  }

  private observeWindowCovering(bond: Bond, device: Device) {
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
      minStep: Device.MShasPosition(device) ? 1 : 100,
    };
    this.windowCoveringService.targetPosition.setProps(props);

    Observer.set(this.windowCoveringService.targetPosition, (value, callback) => {
      if (Device.MShasPosition(device)) {
        // Determine if we should invert position values based on device subtype
        // Awnings use 0=closed, 100=open (same as HomeKit), so no inversion needed
        // Other shades use 0=open, 100=closed (opposite of HomeKit), so inversion is needed
        const shouldInvert = !Device.MSisAwning(device);
        const bondPosition = shouldInvert ? 100 - (value as number) : (value as number);
        bond.api.setPosition(device, bondPosition, callback)
          .then(() => {
            this.platform.debug(this.accessory, `Set position: ${bondPosition} (HomeKit: ${value})`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error setting position: ${error}`);
          });
      } else {
        // Otherwise, toggle open/closed based on target position
        bond.api.toggleOpen(device, callback)
          .then(() => {
            this.platform.debug(this.accessory, `Toggled open: ${value}`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error toggling open: ${error}`);
          });
      }
    });
  }

  private observePreset(bond: Bond, device: Device) {
    if (!this.presetService) {
      return;
    }

    Observer.set(this.presetService.on, (_, callback) => {
      bond.api.preset(device, callback)
        .then(() => {
          this.platform.debug(this.accessory, 'Executed shade preset');
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error executing preset: ${error}`);
        });
    });
  }

  private observeToggleState(bond: Bond, device: Device) {
    if (!this.toggleStateService) {
      return;
    }

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