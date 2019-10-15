import Promise from 'bluebird';
import { DeviceType } from './enum/DeviceType';
import { HAP, hap } from './homebridge/hap';
import { Bond } from './interface/Bond';
import { BondPlatformConfig } from './interface/config';
import { Device } from './interface/Device';

let Accessory: any;

export default function(homebridge: any) {
  hap.Service = homebridge.hap.Service;
  hap.Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.platformAccessory;
  hap.UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-bond', 'Bond', BondPlatform, true);
}

export class BondPlatform {
  private accessories: any[] = [];
  private bonds: Bond[] | undefined;
  private config: BondPlatformConfig;

  constructor(private log: HAP.Log, config: BondPlatformConfig, private api: HAP.Platform) {
    this.config = config;

    if (config === null) {
      this.log('No config defined.');
      return;
    }

    if (config.bonds === undefined) {
      this.log('ERR: bonds array is required but missing from config.json');
      return;
    }
    const bonds = Bond.objects(log, config);

    const that = this;

    api.on('didFinishLaunching', () => {
      // Delaying the initialization of bonds property because we need to
      // get the device ids before doing anything
      Bond.updateDeviceIds(bonds).then(() => {
        that.bonds = bonds;
        that.log(`${that.accessories.length} cached accessories were loaded`);
        that.bonds.forEach(bond => {
          that.getDevices(bond);
        });
      });
    });
  }

  public getDevices(bond: Bond) {
    this.log('Getting devices...');

    this.log(`${bond.deviceIds.length} devices were found on this Bond.`);
    const filtered = bond.deviceIds.filter(id => {
      return !this.deviceAdded(id);
    });

    this.log(`Attempting to add ${filtered.length} devices that were not previously added.`);
    bond.api
      .getDevices(filtered)
      .then(devices => {
        devices.forEach(device => {
          this.addAccessory(device);
        });
      })
      .catch(error => {
        this.log(`Error getting devices: ${error}`);
      });
  }

  // Accessory

  public addAccessory(device: Device) {
    if (this.deviceAdded(device.id)) {
      this.log(`${device.id} has already been added.`);
      return;
    }

    if (!Device.isSupported(device)) {
      this.log(`${device.name} has no supported actions.`);
      return;
    }

    const accessory = new Accessory(device.location + ' ' + device.type, hap.UUIDGen.generate(device.id.toString()));
    accessory.context.device = device;
    accessory.reachable = true;
    accessory
      .getService(hap.Service.AccessoryInformation)
      .setCharacteristic(hap.Characteristic.SerialNumber, device.id);

    if (device.type === DeviceType.CeilingFan) {
      if (Device.CFhasFan(device)) {
        accessory.addService(hap.Service.Fan, `${device.location} Fan`);
      }

      if (Device.CFhasLightbulb(device)) {
        accessory.addService(hap.Service.Lightbulb, `${device.location} Light`);
      }
    }

    this.setupObservers(accessory);

    this.api.registerPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
    this.accessories.push(accessory);
    this.log(`Adding accessory ${accessory.displayName}`);
  }

  public removeAccessory(accessory: HAP.Accessory) {
    this.log(`Removing accessory ${accessory.displayName}`);

    const index = this.accessories.indexOf(accessory);
    if (index > -1) {
      this.accessories.splice(index, 1);
    }

    this.api.unregisterPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
  }

  public configureAccessory(accessory: HAP.Accessory) {
    if (this.config === null || this.config.bonds === undefined) {
      return;
    }
    this.accessories.push(accessory);

    // If bonds hasn't been initilized, attempt to configure the accessory
    // after a delay
    if (this.bonds) {
      this.log('Configure Accessory: ' + accessory.displayName);
      this.setupObservers(accessory);
    } else {
      const that = this;
      const timer = setInterval(() => {
        if (this.bonds) {
          that.log('Configure Accessory: ' + accessory.displayName);
          that.setupObservers(accessory);
          clearInterval(timer);
        }
      }, 500);
    }
  }

  private setupObservers(accessory: HAP.Accessory) {
    const device: Device = accessory.context.device;
    const bond = this.bondForDevice(device);

    if (Device.CFhasFan(device)) {
      const fan = accessory.getService(hap.Service.Fan);
      this.setupFanObservers(bond, device, fan);

      // RotationDirection button will appear based on characteristic observations
      if (Device.CFhasReverseSwitch(device)) {
        this.setupFanDirectionObservers(bond, device, fan);
      }
    }

    if (Device.CFhasLightbulb(device)) {
      const bulb = accessory.getService(hap.Service.Lightbulb);
      this.setupLightbulbObservers(bond, device, bulb);
    }
  }

  private bondForDevice(device: Device): Bond {
    if (this.bonds) {
      const bond = this.bonds.find(x => x.deviceIds.includes(device.id));
      if (bond === undefined) {
        throw new Error(`No Bond found for device ${device.name}`);
      }
      return bond;
    } else {
      throw new Error(`config.bonds is not defined`);
    }
  }

  // Lightbulb

  private setupLightbulbObservers(bond: Bond, device: Device, bulb: HAP.Service) {
    const that = this;
    const onChar = bulb.getCharacteristic(hap.Characteristic.On);

    // Capture current state of device and apply characteristics
    this.getLightValue(bond, device).then(isOn => {
      onChar.updateValue(isOn);
    });

    onChar
      .on('set', (value: any, callback: { (): void; (): void }) => {
        // Avoid toggling when the light is already in the requested state. (Workaround for Siri)
        if (value === onChar.value) {
          callback();
          return;
        }
        bond.api
          .toggleLight(device.id)
          .then(() => {
            const val = value ? 'ON' : 'OFF';
            that.verbose(device, `light toggled: ${val}`);
            onChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.error(device, `Error toggling ${device.name} fan light: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        that
          .getLightValue(bond, device)
          .then(isOn => {
            callback(null, isOn);
          })
          .catch(error => {
            that.error(device, `Error getting fan light value: ${error}`);
            callback(null, false);
          });
      });
  }

  private getLightValue(bond: Bond, device: Device): Promise<boolean> {
    return bond.api.getState(device.id).then(state => {
      if (state.light !== undefined) {
        return state.light === 1 ? true : false;
      } else {
        return false;
      }
    });
  }

  // Fan

  private setupFanObservers(bond: Bond, device: Device, fan: HAP.Service) {
    const that = this;
    const speedChar = fan.getCharacteristic(hap.Characteristic.RotationSpeed);

    // Capture current state of device and apply characteristics
    this.getFanSpeedValue(bond, device).then(speed => {
      this.debug(device, `got speed value: ${speed}`);
      speedChar.updateValue(speed);
    });

    const values = Device.fanSpeeds(device);

    const minStep = Math.floor(100 / values.length);
    const maxValue = minStep * values.length;
    this.debug(device, `min step: ${minStep}, max value: ${maxValue}`);

    speedChar
      .setProps({
        maxValue,
        minStep,
      })
      .on('set', (step: number, callback: { (): void; (): void }) => {
        that.debug(device, `new step value: ${step}`);
        if (step === 0) {
          callback();
          return;
        }
        const index = step / minStep - 1;
        that.debug(device, `new index value: ${index}`);
        const speed = values[index];
        that.debug(device, `new speed value: ${speed}`);

        bond.api
          .setFanSpeed(device.id, speed)
          .then(() => {
            that.verbose(device, `set speed value: ${speed}`);
            speedChar.updateValue(step);
            callback();
          })
          .catch((error: string) => {
            that.error(device, `Error setting fan speed: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: number) => void) => {
        that
          .getFanSpeedValue(bond, device)
          .then(speed => {
            that.verbose(device, `got speed value: ${speed}`);
            speedChar.updateValue(speed);
            callback(null, speed);
          })
          .catch((error: string) => {
            that.error(device, `Error getting fan speed: ${error}`);
            callback(null, 0);
          });
      });

    const onChar = fan.getCharacteristic(hap.Characteristic.On);

    // Capture current state of device and apply characteristics
    this.getFanPower(bond, device).then(isOn => {
      onChar.updateValue(isOn);
    });

    onChar
      .on('set', (value: boolean, callback: { (): void; (): void }) => {
        // Avoid toggling when the fan is already in the requested state. (Workaround for Siri)
        if (value === onChar.value) {
          callback();
          return;
        }
        bond.api
          .toggleFan(device, value)
          .then(() => {
            const val = value ? 'ON' : 'OFF';
            that.verbose(device, `fan toggled: ${val}`);
            onChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.error(device, `Error setting fan power: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        that
          .getFanPower(bond, device)
          .then(isOn => {
            callback(null, isOn);
          })
          .catch(error => {
            that.error(device, `Error getting fan power: ${error}`);
            callback(null, false);
          });
      });
  }

  private getFanPower(bond: Bond, device: Device): Promise<boolean> {
    return bond.api.getState(device.id).then(state => {
      return state.power === 1;
    });
  }

  private getFanSpeedValue(bond: Bond, device: Device): Promise<number> {
    const values = Device.fanSpeeds(device);
    const minStep = Math.floor(100 / values.length);

    return bond.api.getState(device.id).then(state => {
      if (state.speed !== undefined && state.power === 1) {
        this.debug(device, `speed value: ${state.speed}`);
        const index = values.indexOf(state.speed!) + 1;
        this.debug(device, `index value: ${index}`);
        const step = index * minStep;
        this.debug(device, `step value: ${step}`);
        return step;
      } else {
        return 0;
      }
    });
  }

  // Fan Rotation Direction

  private setupFanDirectionObservers(bond: Bond, device: Device, fan: HAP.Service) {
    const that = this;
    const directionChar = fan.getCharacteristic(hap.Characteristic.RotationDirection);

    // Capture current state of device and apply characteristics
    this.getDirectionValue(bond, device).then(direction => {
      directionChar.updateValue(direction);
    });

    directionChar
      .on('set', (value: any, callback: { (): void; (): void }) => {
        // Avoid toggling when the switch is already in the requested state. (Workaround for Siri)
        if (value === directionChar.value) {
          callback();
          return;
        }
        bond.api
          .toggleDirection(device.id)
          .then(() => {
            const val = value === 1 ? 'Clockwise' : 'Counter-Clockwise';
            that.log(`direction changed: ${val}`);
            directionChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.log(`Error setting ${device.name} fan direction: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: number) => void) => {
        that
          .getDirectionValue(bond, device)
          .then(direction => {
            callback(null, direction);
          })
          .catch(error => {
            that.log(`Error getting ${device.name} fan direction: ${error}`);
            callback(null, 0);
          });
      });
  }

  private getDirectionValue(bond: Bond, device: Device): Promise<number> {
    return bond.api.getState(device.id).then(state => {
      if (state.direction !== undefined) {
        return state.direction!;
      } else {
        return 0;
      }
    });
  }

  // Helper Methods

  private deviceAdded(id: string) {
    return this.accessoryForIdentifier(id) != null;
  }

  private accessoryForIdentifier(id: string): HAP.Accessory {
    const accessories = this.accessories.filter(acc => {
      const device: Device = acc.context.device;
      return device.id === id;
    });
    return accessories.length > 0 ? accessories[0] : null;
  }

  private debug(device: Device, message: string) {
    if (this.config.debug) {
      this.log.debug(`DEBUG: [${device.name}] ${message}`);
    }
  }

  private verbose(device: Device, message: string) {
    this.log(`[${device.name}] ${message}`);
  }

  private error(device: Device, message: string) {
    this.log.error(`ERR: [${device.name}] ${message}`);
  }
}
