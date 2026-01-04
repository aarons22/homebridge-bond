import { Bond, BondState } from './interface/Bond';
import { BondPlatform } from './platform';
import { Device } from './interface/Device';
import { Characteristic, PlatformAccessory, Service } from 'homebridge';
import { Observer } from './Observer';

export class FanService {
  on: Characteristic
  rotationSpeed?: Characteristic
  rotationDirection?: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory) {
    let service = accessory.getService(platform.Service.Fan);
    const device: Device = accessory.context.device;
    if (service === undefined) {
      service = accessory.addService(platform.Service.Fan, accessory.displayName);
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);
    if (Device.canSetSpeed(device)) {
      this.rotationSpeed = service.getCharacteristic(platform.Characteristic.RotationSpeed);
    }

    if (Device.hasReverseSwitch(device)) {
      this.rotationDirection = service.getCharacteristic(platform.Characteristic.RotationDirection);
    }
  }
}

export class LightbulbService {
  on: Characteristic
  brightness?: Characteristic
  subType?: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType?: string) {
    let service = accessory.getService(platform.Service.Lightbulb);
    const device: Device = accessory.context.device;
    if (subType) {
      service = accessory.getServiceById(platform.Service.Lightbulb, subType);
    }

    if (service === undefined) {
      service = accessory.addService(platform.Service.Lightbulb, name, subType);
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);

    const brightness = service.getCharacteristic(platform.Characteristic.Brightness);
    // Add brightness if device is a Light type with brightness OR if it's any device with brightness control
    if (Device.LThasBrightness(device) || Device.HasBrightnessControl(device)) {
      this.brightness = brightness;
    } else {
      // Fixing bug from 3.1.0 where brightness was added to lights unintentionally
      service.removeCharacteristic(brightness);
    }

    this.subType = subType;
  }

  updateState(state: BondState) {
    if (this.subType === 'UpLight') {
      this.on.updateValue(state.up_light === 1 && state.light === 1);
    } else if (this.subType === 'DownLight') {
      this.on.updateValue(state.down_light === 1 && state.light === 1);
    } else {
      this.on.updateValue(state.light === 1);
    }

    if (this.brightness && state.brightness) {
      this.brightness.updateValue(state.brightness);
    }
  }

  observe(platform: BondPlatform, bond: Bond, accessory: PlatformAccessory) {
    const device: Device = accessory.context.device;
    this.observeLight(platform, bond, device, accessory);
    this.observeLightBrightness(platform, bond, device, accessory);
  }

  private observeLight(platform: BondPlatform, bond: Bond, device: Device, accessory: PlatformAccessory) {
    Observer.set(this.on, async (value) => {
      let promise: Promise<void>;

      const subtype = this.subType;
      if (subtype === 'UpLight') {
        promise = bond.api.toggleUpLight(device);
      } else if (subtype === 'DownLight') {
        promise = bond.api.toggleDownLight(device);
      } else {
        promise = bond.api.toggleLight(device);
      }

      await promise
        .then(() => {
          platform.debug(accessory, `Set light power: ${value}`);
        })
        .catch((error: string) => {
          platform.error(accessory, `Error setting light power: ${error}`);
        });
    });
  }

  private observeLightBrightness(platform: BondPlatform, bond: Bond, device: Device, accessory: PlatformAccessory) {
    if (!this.brightness) {
      return;
    }

    // Check if device has absolute brightness control (SetBrightness)
    if (Device.LThasAbsoluteBrightness(device)) {
      // Handle absolute brightness
      Observer.set(this.brightness, async (value) => {
        if (value === 0) {
          // Value of 0 is the same as turning the light off. 
          // Ignore and return.
          return;
        }

        await bond.api.setBrightness(device, value)
          .then(() => {
            platform.debug(accessory, `Set light brightness: ${value}`);
          })
          .catch((error: string) => {
            platform.error(accessory, `Error setting light brightness: ${error}`);
          });
      });
    } else if (Device.HasIncrementalBrightness(device)) {
      // Handle incremental brightness (StartDimmer or StartIncreasing/DecreasingBrightness)
      Observer.set(this.brightness, async (value) => {
        if (value === 0) {
          // Value of 0 is the same as turning the light off. 
          // Ignore and return.
          return;
        }

        const currentBrightness = this.brightness!.value as number;
        const targetBrightness = value as number;
        
        // If already at target, do nothing
        if (currentBrightness === targetBrightness) {
          return;
        }

        // Determine direction
        const increasing = targetBrightness > currentBrightness;
        const delta = Math.abs(targetBrightness - currentBrightness);
        
        // Start dimming in the appropriate direction
        let promise: Promise<void>;
        if (Device.HasSeparateDimmers(device)) {
          // Use directional dimmers
          promise = increasing ? 
            bond.api.startIncreasingBrightness(device) : 
            bond.api.startDecreasingBrightness(device);
        } else {
          // Use StartDimmer (or up/down light specific dimmers)
          const subtype = this.subType;
          if (subtype === 'UpLight') {
            promise = bond.api.startUpLightDimmer(device);
          } else if (subtype === 'DownLight') {
            promise = bond.api.startDownLightDimmer(device);
          } else {
            promise = bond.api.startDimmer(device);
          }
        }

        await promise
          .then(() => {
            platform.debug(accessory, `Started dimming light: current=${currentBrightness}, target=${targetBrightness}`);
            
            // Estimate time needed: assume ~10% per 100ms for dimming speed
            // This is a rough estimate and may need adjustment
            const estimatedTime = delta * 10; // 10ms per 1% brightness change
            
            // Stop dimming after estimated time
            setTimeout(async () => {
              await bond.api.stop(device)
                .then(() => {
                  platform.debug(accessory, 'Stopped dimming light');
                  // Update to target value - the actual state will come from BPUP
                  this.brightness!.updateValue(targetBrightness);
                })
                .catch((error: string) => {
                  platform.error(accessory, `Error stopping dimmer: ${error}`);
                });
            }, estimatedTime);
          })
          .catch((error: string) => {
            platform.error(accessory, `Error setting light brightness: ${error}`);
          });
      });
    }
  }
}

export class SwitchService {
  on: Characteristic
  subType: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType: string) {
    // Check for service by subtype
    let service = accessory.getServiceById(platform.Service.Switch, subType);
    if (service === undefined) {
      service = accessory.addService(platform.Service.Switch, name, subType);
    }
    // Set the subtype if not defined
    if (service.subtype === undefined) {
      service.subtype = subType;
    }
    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.subType = subType;
  }
}

// ButtonService is a switch that resets itself after 500ms. This provides a 
// button like experience that isn't available in homebridge.
export class ButtonService {
  on: Characteristic
  subType: string

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType: string) {
    // Check for service by subtype
    let service = accessory.getServiceById(platform.Service.Switch, subType);
    if (service === undefined) {
      service = accessory.addService(platform.Service.Switch, name, subType);
    }
    // Set the subtype if not defined
    if (service.subtype === undefined) {
      service.subtype = subType;
    }

    this.on = service.getCharacteristic(platform.Characteristic.On);
    this.on.setValue(false);

    this.on.on('set', () => {
      const timer = setInterval(() => {
        this.on.updateValue(false);
        clearInterval(timer);
      }, 500);
    });
    this.subType = subType;
  }
}

export class WindowCoveringService {
  currentPosition: Characteristic
  targetPosition: Characteristic
  positionState: Characteristic

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
  }
}

export class FlameService {
  on: Characteristic
  flame?: Characteristic

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    name: string,
    subType?: string) {
    const device: Device = accessory.context.device;

    let service: Service | undefined;
    // If the device has a flame, treat it as a Lightbulb
    if (Device.FPhasFlame(device)) {
      service = accessory.getService(platform.Service.Lightbulb);
      if (subType) {
        service = accessory.getServiceById(platform.Service.Lightbulb, subType);
      }

      if (service === undefined) {
        service = accessory.addService(platform.Service.Lightbulb, name, subType);
      }

      const flame = service.getCharacteristic(platform.Characteristic.Brightness);
      this.flame = flame;
    } else {
      // Otherwise, treat it as a Switch
      service = accessory.getService(platform.Service.Switch);
      if (subType) {
        service = accessory.getServiceById(platform.Service.Switch, subType);
      }

      if (service === undefined) {
        service = accessory.addService(platform.Service.Switch, name, subType);
      }
    }
    this.on = service.getCharacteristic(platform.Characteristic.On);
  }

  updateState(state: BondState) {
    if (this.flame && state.flame) {
      this.flame.updateValue(state.flame);
    }
  }

  observe(platform: BondPlatform, bond: Bond, accessory: PlatformAccessory) {
    const device: Device = accessory.context.device;
    this.observePower(platform, bond, device, accessory);
    this.observeFlame(platform, bond, device, accessory);
  }

  private observePower(platform: BondPlatform, bond: Bond, device: Device, accessory: PlatformAccessory) {
    Observer.set(this.on, async (value) => {
      await bond.api.togglePower(device)
        .then(() => {
          platform.debug(accessory, `Set flame power: ${value}`);
        })
        .catch((error: string) => {
          platform.error(accessory, `Error setting flame power: ${error}`);
        });
    });
  }

  private observeFlame(platform: BondPlatform, bond: Bond, device: Device, accessory: PlatformAccessory) {
    if (!this.flame) {
      return;
    }

    Observer.set(this.flame, async (value) => {
      if (value === 0) {
        // Value of 0 is the same as turning the flame off. 
        // Ignore and return.
        return;
      }

      await bond.api.setFlame(device, value)
        .then(() => {
          platform.debug(accessory, `Set flame brightness: ${value}`);
        })
        .catch((error: string) => {
          platform.error(accessory, `Error setting flame brightness: ${error}`);
        });
    });
  }
}