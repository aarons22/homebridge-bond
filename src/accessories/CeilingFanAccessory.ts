import { Bond, BondState } from '../interface/Bond';
import { BondAccessory } from '../platformAccessory';
import { BondPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';
import { Device } from '../interface/Device';
import { ButtonService, FanService, LightbulbService, SwitchService } from '../Services';
import { Observer } from '../Observer';

export class CeilingFanAccessory implements BondAccessory  {
  platform: BondPlatform
  accessory: PlatformAccessory
  fanService: FanService

  lightService?: LightbulbService
  toggleLightService?: ButtonService
  dimmerService?: SwitchService

  upLightService?: LightbulbService
  toggleUpLightService?: ButtonService
  upLightDimmerService?: SwitchService

  downLightService?: LightbulbService
  toggleDownLightService?: ButtonService
  downLightDimmerService?: SwitchService

  dimmerUpService?: SwitchService
  dimmerDownService?: SwitchService

  fanSpeedValues: boolean
  minStep: number
  maxValue: number
  values: number[]

  constructor(
    platform: BondPlatform,
    accessory: PlatformAccessory,
    bond: Bond) {
    this.platform = platform;
    this.accessory = accessory;
    this.fanSpeedValues = platform.config.fan_speed_values;

    const includeDimmer = platform.config.include_dimmer;
    const includeToggle = platform.config.include_toggle_state;
    const device: Device = accessory.context.device;

    this.values = Device.fanSpeeds(device);
    this.minStep = Math.floor(100 / this.values.length);
    this.maxValue = this.minStep * this.values.length;
    if (this.fanSpeedValues) {
      this.minStep = 1;
      this.maxValue = this.values.length;
    }
    
    this.fanService = new FanService(platform, accessory);

    if (device.properties.max_speed === undefined) {
      this.platform.log(`${accessory.displayName} Fan is not supported (missing max_speed property).`);
    }

    if (Device.CFhasUpDownLight(device)) {
      this.upLightService = new LightbulbService(platform, accessory, `${accessory.displayName} Up Light`, 'UpLight');
      this.downLightService = new LightbulbService(platform, accessory, `${accessory.displayName} Down Light`, 'DownLight');

      if (includeToggle) {
        this.toggleUpLightService = new ButtonService(platform, accessory, 'Toggle Up Light State', 'UpLight');
        this.toggleDownLightService = new ButtonService(platform, accessory, 'Toggle Down Light State', 'DownLight');
      } else {
        // Remove services if previously added
        this.removeService('Toggle Up Light State');
        this.removeService('Toggle Down Light State');
      } 

      if (includeDimmer && Device.HasDimmer(device)) {
        this.upLightDimmerService = new SwitchService(platform, accessory, `${accessory.displayName} Up Light Dimmer`, 'UpLight');
        this.downLightDimmerService = new SwitchService(platform, accessory, `${accessory.displayName} Down Light Dimmer`, 'DownLight');
      } else {
        // Remove services if previously added
        this.removeService(`${accessory.displayName} Up Light Dimmer`);
        this.removeService(`${accessory.displayName} Down Light Dimmer`);
      }
    } else if (Device.CFhasLightbulb(device)) {
      this.lightService = new LightbulbService(platform, accessory, `${accessory.displayName} Light`);
      if (includeToggle) {
        this.toggleLightService = new ButtonService(platform, accessory, 'Toggle Light State');
      } else {
        this.removeService('Toggle Light State');
      } 
    }

    if (includeDimmer && Device.HasDimmer(device)) {
      this.dimmerService = new SwitchService(platform, accessory, `${accessory.displayName} Dimmer`);
    } else {
      // Remove service if previously added
      this.removeService(`${accessory.displayName} Dimmer`);
    }

    if (includeDimmer && Device.HasSeparateDimmers(device)) {
      this.dimmerUpService = new SwitchService(platform, accessory, `${accessory.displayName} DimmerDown`, 'up');
      this.dimmerDownService = new SwitchService(platform, accessory, `${accessory.displayName} DimmerUp`, 'down');
    } else {
      // Remove service if previously added
      this.removeService(`${accessory.displayName} DimmerUp`);
      this.removeService(`${accessory.displayName} DimmerDown`);
    }

    this.observe(bond);
  }

  updateState(state: BondState) {
    // Power
    this.fanService.on.updateValue(state.power === 1);
    
    // Speed
    if (this.fanService.rotationSpeed) {
      let value = 0;
      if (state.speed && state.power === 1) {
        const index = this.values.indexOf(state.speed) + 1;
        const step = index * this.minStep;
        value = step;
      }
      this.fanService.rotationSpeed.updateValue(value);
    }

    // Rotation direction
    if (this.fanService.rotationDirection) {
      let direction = 0;
      if (state.direction) {
        // Bond state direction is 1 / -1, Homekit direction is 1 / 0
        direction = state.direction === 1 ? 1 : 0;
        this.fanService.rotationDirection.updateValue(direction);
      }
    }

    // Light
    if (this.lightService) {
      this.lightService.on.updateValue(state.light === 1);
    }

    // Up Light
    if (this.upLightService) {
      this.upLightService.on.updateValue(state.up_light === 1 && state.light === 1);
    }

    // Down Light
    if (this.downLightService) {
      this.downLightService.on.updateValue(state.down_light === 1 && state.light === 1);
    }
  }

  private observe(bond: Bond): void {
    const device: Device = this.accessory.context.device;
    this.fanPowerObservers(bond, device);
    this.fanSpeedObservers(bond, device);
    this.fanDirectionObservers(bond, device);

    this.observeLight(bond, device, this.lightService);
    this.observeLightToggle(bond, device, this.toggleLightService);
    this.observeLightDimmer(bond, device, this.dimmerService);

    this.observeLight(bond, device, this.upLightService);
    this.observeLightToggle(bond, device, this.toggleUpLightService);
    this.observeLightDimmer(bond, device, this.upLightDimmerService);

    this.observeLight(bond, device, this.downLightService);
    this.observeLightToggle(bond, device, this.toggleDownLightService);
    this.observeLightDimmer(bond, device, this.downLightDimmerService);

    this.lightbulbDimmerUpObserver(bond, device, this.dimmerDownService);
    this.lightbulbDimmerDownObserver(bond, device, this.dimmerUpService);

    // Set initial state
    bond.api.getState(device.id).then(state => {
      this.updateState(state);
    });
  }

  fanPowerObservers(bond: Bond, device: Device) {
    if (!(Device.hasFan(device))) {
      this.platform.error(this.accessory, 'CeilingFanAccessory does not have required actions for fan service.');
      return;
    }

    Observer.set(this.fanService.on, (value, callback) => {
      bond.api.toggleFan(device, value, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Toggled fan: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling fan: ${error}`);
        });
    });
  }

  fanSpeedObservers(bond: Bond, device: Device) {
    if (!this.fanService.rotationSpeed) {
      return;
    }

    const props = {
      maxValue: this.maxValue,
      minStep: this.minStep,
    };
    this.fanService.rotationSpeed.setProps(props);

    Observer.set(this.fanService.rotationSpeed, (step, callback) => {
      if (step === 0) {
        // Step of 0 is the same as turning the fan off. This is handled in the fan power observer
        callback(null);
        return;
      } 
      const index = step as number / this.minStep - 1;
      const speed = this.values[index];

      bond.api.setFanSpeed(device, speed, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Set fan speed: ${speed}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error setting fan speed: ${error}`);
        });
    });
  }

  fanDirectionObservers(bond: Bond, device: Device) {
    if (!this.fanService.rotationDirection) {
      return;
    }

    Observer.set(this.fanService.rotationDirection, (value, callback) => {
      bond.api.toggleDirection(device, callback)
        .then(() => {
          this.platform.debug(this.accessory, `Toggled direction: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling direction: ${error}`);
        });
    });
  }

  private observeLight(bond: Bond, device: Device, service?: LightbulbService) {
    if (!service) {
      return;
    }
    
    Observer.set(service.on, (value, callback) => {
      let promise: Promise<void>;

      const subtype = service.subType;
      if(subtype === 'UpLight') {
        promise = bond.api.toggleUpLight(device, callback);
      } else if(subtype === 'DownLight') {
        promise = bond.api.toggleDownLight(device, callback);
      } else {
        promise = bond.api.toggleLight(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Toggled light: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling light: ${error}`);
        });
    });
  }

  private observeLightToggle(bond: Bond, device: Device, service?: ButtonService) {
    if (!service) {
      return;
    }

    Observer.set(service.on, (_, callback) => {
      let promise: Promise<void>;

      const subtype = service.subType;
      if(subtype === 'UpLight') {
        promise = bond.api.toggleState(device, 'up_light', callback);
      } else if(subtype === 'DownLight') {
        promise = bond.api.toggleState(device, 'down_light', callback);
      } else {
        promise = bond.api.toggleState(device, 'light', callback);
      }
      
      promise
        .then(() => {
          this.platform.debug(this.accessory, `${device.name} light state toggled`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling light state: ${error}`);
        });
    });
  }

  private observeLightDimmer(bond: Bond, device: Device, service?: SwitchService) {
    if (!service) {
      return;
    }

    Observer.set(service.on, (value, callback) => {
      let promise: Promise<void>;

      if (value === true) {
        const subtype = service.subType;
        if(subtype === 'UpLight') {
          promise = bond.api.startUpLightDimmer(device, callback);
        } else if(subtype === 'DownLight') {
          promise = bond.api.startDownLightDimmer(device, callback);
        } else {
          promise = bond.api.startDimmer(device, callback);
        }
      } else {
        promise = bond.api.stop(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Toggled dimmer: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling dimmer: ${error}`);
        });
    });
  }

  lightbulbDimmerUpObserver(bond: Bond, device: Device, downService?: SwitchService) {
    if (!this.dimmerUpService) {
      return;
    }

    Observer.set(this.dimmerUpService.on, (value, callback) => {
      let promise: Promise<void>;

      if (value === true) {
        if (downService) {
          bond.api.stop(device);
          downService.on.updateValue(false);
        }
        promise = bond.api.startIncreasingBrightness(device, callback);
      } else {
        promise = bond.api.stop(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Toggled dimmer up: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling dimmer up: ${error}`);
        });
    });
  }

  lightbulbDimmerDownObserver(bond: Bond, device: Device, upService?: SwitchService) {
    if (!this.dimmerDownService) {
      return;
    }

    Observer.set(this.dimmerDownService.on, (value, callback) => {
      let promise: Promise<void>;

      if (value === true) {
        if (upService) {
          bond.api.stop(device);
          upService.on.updateValue(false);
        }
        promise = bond.api.startDecreasingBrightness(device, callback);
      } else {
        promise = bond.api.stop(device, callback);
      }

      promise
        .then(() => {
          this.platform.debug(this.accessory, `Toggled dimmer down: ${value}`);
        })
        .catch((error: string) => {
          this.platform.error(this.accessory, `Error toggling dimmer down: ${error}`);
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