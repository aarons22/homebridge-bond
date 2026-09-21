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
  // Slider mode (default)
  windowCoveringService?: WindowCoveringService
  // Switch mode (include_shade_switches)
  openService?: ButtonService
  closeService?: ButtonService
  stopService?: ButtonService
  // Optional extras (available in both modes)
  presetService?: ButtonService
  toggleStateService?: ButtonService

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    this.platform = platform;
    this.accessory = accessory;
    const device: Device = accessory.context.device;

    // When enabled, expose each shade as discrete Open / Close / Stop buttons
    // instead of a single position slider. See `include_shade_switches` in config.
    const useSwitches = platform.config.include_shade_switches === true;

    if (useSwitches) {
      // Drop the slider if it was created under a previous config so we don't
      // leave a stale WindowCovering tile behind on the accessory.
      const windowCovering = accessory.getService(platform.Service.WindowCovering);
      if (windowCovering) {
        accessory.removeService(windowCovering);
      }
      this.setupSwitches(device);
    } else {
      // Drop any switches left over from a previous config.
      this.removeSwitch('ShadeOpen');
      this.removeSwitch('ShadeClose');
      this.removeSwitch('ShadeStop');
      this.windowCoveringService = new WindowCoveringService(platform, accessory);
    }

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
    const windowCovering = this.windowCoveringService;
    if (windowCovering) {
      // If position is available, use it, otherwise fall back to open state
      if (state.position !== undefined) {
        const device: Device = this.accessory.context.device;
        // Determine if we should invert position values based on device subtype
        // Awnings use 0=closed, 100=open (same as HomeKit), so no inversion needed
        // Other shades use 0=open, 100=closed (opposite of HomeKit), so inversion is needed
        const shouldInvert = !Device.MSisAwning(device);
        const homekitPosition = shouldInvert ? 100 - state.position : state.position;
        windowCovering.currentPosition.updateValue(homekitPosition);
        windowCovering.targetPosition.updateValue(homekitPosition);
      } else {
        windowCovering.currentPosition.updateValue(state.open === 1 ? 100 : 0);
        windowCovering.targetPosition.updateValue(state.open === 1 ? 100 : 0);
      }
    }
    // Switch mode buttons are stateless (they reset themselves), so there's
    // nothing to update here.
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;

    this.observeWindowCovering(bond, device);
    this.observeSwitches(bond, device);
    this.observePreset(bond, device);
    this.observeToggleState(bond, device);
  }

  // Switch mode: one stateless button per action, controlled individually.
  // Buttons are only added for the actions the shade actually reports.
  private setupSwitches(device: Device): void {
    if (Device.MShasOpen(device)) {
      this.openService = new ButtonService(this.platform, this.accessory, 'Open', 'ShadeOpen');
    } else {
      this.removeSwitch('ShadeOpen');
      this.platform.error(this.accessory, 'Shade does not support the Open action; Open button not added.');
    }

    if (Device.MShasClose(device)) {
      this.closeService = new ButtonService(this.platform, this.accessory, 'Close', 'ShadeClose');
    } else {
      this.removeSwitch('ShadeClose');
      this.platform.error(this.accessory, 'Shade does not support the Close action; Close button not added.');
    }

    // Bond names the shade "stop" action `Hold`.
    if (Device.MShasStop(device)) {
      this.stopService = new ButtonService(this.platform, this.accessory, 'Stop', 'ShadeStop');
    } else {
      this.removeSwitch('ShadeStop');
    }
  }

  private observeSwitches(bond: Bond, device: Device) {
    if (this.openService) {
      Observer.set(this.openService.on, async (_) => {
        await bond.api.open(device)
          .then(() => {
            this.platform.debug(this.accessory, `${device.name}: Opening shade`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error opening shade: ${error}`);
          });
      }, { resetToFalse: true });
    }

    if (this.closeService) {
      Observer.set(this.closeService.on, async (_) => {
        await bond.api.close(device)
          .then(() => {
            this.platform.debug(this.accessory, `${device.name}: Closing shade`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error closing shade: ${error}`);
          });
      }, { resetToFalse: true });
    }

    if (this.stopService) {
      Observer.set(this.stopService.on, async (_) => {
        await bond.api.hold(device)
          .then(() => {
            this.platform.debug(this.accessory, `${device.name}: Stopping shade`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error stopping shade: ${error}`);
          });
      }, { resetToFalse: true });
    }
  }

  private observeWindowCovering(bond: Bond, device: Device) {
    const windowCovering = this.windowCoveringService;
    if (!windowCovering) {
      return;
    }

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
    windowCovering.targetPosition.setProps(props);

    Observer.set(windowCovering.targetPosition, async (value) => {
      if (Device.MShasPosition(device)) {
        // Determine if we should invert position values based on device subtype
        // Awnings use 0=closed, 100=open (same as HomeKit), so no inversion needed
        // Other shades use 0=open, 100=closed (opposite of HomeKit), so inversion is needed
        const shouldInvert = !Device.MSisAwning(device);
        const bondPosition = shouldInvert ? 100 - (value as number) : (value as number);
        await bond.api.setPosition(device, bondPosition)
          .then(() => {
            this.platform.debug(this.accessory, `Set position: ${bondPosition} (HomeKit: ${value})`);
          })
          .catch((error: string) => {
            this.platform.error(this.accessory, `Error setting position: ${error}`);
          });
      } else {
        // Intentional: RF shade devices without position support typically only
        // have a single toggle RF code — no discrete Open/Close signals exist.
        // ToggleOpen is the only available command for these devices.
        await bond.api.toggleOpen(device)
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

    Observer.set(this.presetService.on, async (_) => {
      await bond.api.preset(device)
        .then(() => {
          this.platform.debug(this.accessory, 'Executed shade preset');
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error executing preset: ${error}`);
        });
    }, { resetToFalse: true });
  }

  private observeToggleState(bond: Bond, device: Device) {
    if (!this.toggleStateService) {
      return;
    }

    Observer.set(this.toggleStateService.on, async (_) => {
      await bond.api.toggleState(device, 'open')
        .then(() => {
          this.platform.debug(this.accessory, `${device.name} open state toggled`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling open state: ${error}`);
        });
    }, { resetToFalse: true });
  }

  private removeService(serviceName: string) {
    const service = this.accessory.getService(serviceName);
    if (service) {
      this.accessory.removeService(service);
    }
  }

  private removeSwitch(subType: string) {
    const service = this.accessory.getServiceById(this.platform.Service.Switch, subType);
    if (service) {
      this.accessory.removeService(service);
    }
  }
}
