import Promise from 'bluebird';
import { BondApi } from './BondApi';
import { DeviceType } from './enum/DeviceType';
import { Device } from './interface/Device';

let Accessory: any;
let Service: any;
let Characteristic: any;
let UUIDGen: any;

export default function(homebridge: any) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.platformAccessory;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-bond', 'Bond', BondPlatform, true);
}

export class BondPlatform {
  private accessories: any[] = [];
  private config: { [key: string]: string };
  private bondApi: BondApi | undefined;

  constructor(private log: (arg0: string) => void, config: { [key: string]: string }, private api: any) {
    this.config = config;

    if (!this.validateConfig()) {
      return;
    }

    this.bondApi = new BondApi(log, config);

    const that = this;
    api.on('didFinishLaunching', () => {
      that.log(`${that.accessories.length} cached accessories were loaded`);
      that.getDevices();
    });
  }

  public getDevices() {
    this.log('Getting devices...');
    this.bondApi!.getDeviceIds()
      .then(ids => {
        this.log(`${ids.length} devices were found on this Bond.`);
        const filtered = ids.filter(id => {
          return !this.deviceAdded(id);
        });

        this.log(`Attempting to add ${filtered.length} devices that were not previously added.`);
        this.bondApi!.getDevices(filtered)
          .then(devices => {
            devices.forEach(device => {
              this.addAccessory(device);
            });
          })
          .catch(error => {
            this.log(`Error getting devices: ${error}`);
          });
      })
      .catch(error => {
        this.log(`Error getting device ids: ${error}`);
      });
  }

  public addAccessory(device: Device) {
    if (this.deviceAdded(device.id)) {
      this.log(`${device.id} has already been added.`);
      return;
    }

    if (!Device.isSupported(device)) {
      this.log(`${device.name} has no supported actions.`);
      return;
    }

    const accessory = new Accessory(device.location + ' ' + device.type, UUIDGen.generate(device.id.toString()));
    accessory.context.device = device;
    accessory.reachable = true;
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, device.id);

    if (device.type === DeviceType.CeilingFan) {
      if (Device.CFhasFan(device)) {
        accessory.addService(Service.Fan, `${device.location} Fan`);
      }

      if (Device.CFhasLightbulb(device)) {
        accessory.addService(Service.Lightbulb, `${device.location} Light`);
      }
    }

    this.setupObservers(accessory);

    this.api.registerPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
    this.accessories.push(accessory);
    this.log(`Adding accessory ${accessory.displayName}`);
  }

  public removeAccessory(accessory: any) {
    this.log(`Removing accessory ${accessory.displayName}`);

    const index = this.accessories.indexOf(accessory);
    if (index > -1) {
      this.accessories.splice(index, 1);
    }

    this.api.unregisterPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
  }

  public configureAccessory(accessory: any) {
    if (!this.validateConfig()) {
      return;
    }
    this.log(`Configuring Accessory: ${accessory.displayName}`);
    this.accessories.push(accessory);
    this.setupObservers(accessory);
  }

  private setupObservers(accessory: any) {
    const device: Device = accessory.context.device;

    if (Device.CFhasFan(device)) {
      const fan = accessory.getService(Service.Fan);
      this.setupFanObservers(device, fan);

      // RotationDirection button will appear based on characteristic observations
      if (Device.CFhasReverseSwitch(device)) {
        this.setupFanDirectionObservers(device, fan);
      }
    }

    if (Device.CFhasLightbulb(device)) {
      const bulb = accessory.getService(Service.Lightbulb);
      this.setupLightbulbObservers(device, bulb);
    }
  }

  private validateConfig(): boolean {
    if (this.config === null) {
      this.log('ERR: Bond platform not defined in config.json');
      return false;
    }
    if (this.config.bond_ip_address === undefined) {
      this.log('ERR: bond_ip_address is required but missing from config.json');
      return false;
    }
    if (this.config.bond_token === undefined) {
      this.log('ERR: bond_token is required but missing from config.json');
      return false;
    }
    return true;
  }

  // Lightbulb

  private setupLightbulbObservers(device: Device, bulb: any) {
    const that = this;
    const onChar = bulb.getCharacteristic(Characteristic.On);

    // Capture current state of device and apply characteristics
    this.getLightValue(device).then(isOn => {
      onChar.updateValue(isOn);
    });

    onChar
      .on('set', (value: any, callback: { (): void; (): void }) => {
        // Avoid toggling when the light is already in the requested state. (Workaround for Siri)
        if (value === onChar.value) {
          callback();
          return;
        }
        that
          .bondApi!.toggleLight(device.id)
          .then(() => {
            const val = value ? 'ON' : 'OFF';
            that.log(`light toggled: ${val}`);
            onChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.log(`Error toggling ${device.name} fan light: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        that
          .getLightValue(device)
          .then(isOn => {
            callback(null, isOn);
          })
          .catch(error => {
            that.log(`Error getting ${device.name} fan light value: ${error}`);
            callback(null, false);
          });
      });
  }

  private getLightValue(device: Device): Promise<boolean> {
    return this.bondApi!.getState(device.id).then(state => {
      if (state.light !== undefined) {
        return state.light === 1 ? true : false;
      } else {
        return false;
      }
    });
  }

  // Fan

  private setupFanObservers(device: Device, fan: any) {
    const that = this;
    const speedChar = fan.getCharacteristic(Characteristic.RotationSpeed);

    // Capture current state of device and apply characteristics
    this.getFanSpeedValue(device).then(speed => {
      this.log(`got speed value: ${speed}`);
      speedChar.updateValue(speed);
    });

    const values = Device.fanSpeeds(device);

    const minStep = Math.floor(100 / values.length);
    const maxValue = minStep * values.length;
    this.debug(`[${device.name}] min step: ${minStep}, max value: ${maxValue}`);

    speedChar
      .setProps({
        maxValue,
        minStep,
      })
      .on('set', (step: number, callback: { (): void; (): void }) => {
        that.debug(`[${device.name}] new step value: ${step}`);
        if (step === 0) {
          callback();
          return;
        }
        const index = step / minStep - 1;
        that.debug(`[${device.name}] new index value: ${index}`);
        const speed = values[index];
        that.debug(`[${device.name}] new speed value: ${speed}`);

        that
          .bondApi!.setFanSpeed(device.id, speed)
          .then(() => {
            that.log(`set speed value: ${speed}`);
            speedChar.updateValue(step);
            callback();
          })
          .catch((error: string) => {
            that.log(`Error setting ${device.name} fan speed: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: number) => void) => {
        that
          .getFanSpeedValue(device)
          .then(speed => {
            this.log(`got speed value: ${speed}`);
            speedChar.updateValue(speed);
            callback(null, speed);
          })
          .catch((error: string) => {
            that.log(`Error getting ${device.name} fan speed: ${error}`);
            callback(null, 0);
          });
      });

    const onChar = fan.getCharacteristic(Characteristic.On);

    // Capture current state of device and apply characteristics
    this.getFanPower(device).then(isOn => {
      onChar.updateValue(isOn);
    });

    onChar
      .on('set', (value: boolean, callback: { (): void; (): void }) => {
        // Avoid toggling when the fan is already in the requested state. (Workaround for Siri)
        if (value === onChar.value) {
          callback();
          return;
        }
        that
          .bondApi!.toggleFan(device, value)
          .then(() => {
            const val = value ? 'ON' : 'OFF';
            that.log(`fan toggled: ${val}`);
            onChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.log(`Error setting ${device.name} fan power: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        that
          .getFanPower(device)
          .then(isOn => {
            callback(null, isOn);
          })
          .catch(error => {
            that.log(`Error getting ${device.name} fan power: ${error}`);
            callback(null, false);
          });
      });
  }

  private getFanPower(device: Device): Promise<boolean> {
    return this.bondApi!.getState(device.id).then(state => {
      return state.power === 1;
    });
  }

  private getFanSpeedValue(device: Device): Promise<number> {
    const values = Device.fanSpeeds(device);
    const minStep = Math.floor(100 / values.length);

    return this.bondApi!.getState(device.id).then(state => {
      if (state.speed !== undefined && state.power === 1) {
        this.debug(`[${device.name}] speed value: ${state.speed}`);
        const index = values.indexOf(state.speed!);
        this.debug(`[${device.name}] index value: ${index}`);
        const step = index * minStep;
        this.debug(`[${device.name}] step value: ${step}`);
        return step;
      } else {
        return 0;
      }
    });
  }

  // Fan Rotation Direction

  private setupFanDirectionObservers(device: Device, fan: any) {
    const that = this;
    const directionChar = fan.getCharacteristic(Characteristic.RotationDirection);

    // Capture current state of device and apply characteristics
    this.getDirectionValue(device).then(direction => {
      directionChar.updateValue(direction);
    });

    directionChar
      .on('set', (value: any, callback: { (): void; (): void }) => {
        // Avoid toggling when the switch is already in the requested state. (Workaround for Siri)
        if (value === directionChar.value) {
          callback();
          return;
        }
        that
          .bondApi!.toggleDirection(device.id)
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
          .getDirectionValue(device)
          .then(direction => {
            callback(null, direction);
          })
          .catch(error => {
            that.log(`Error getting ${device.name} fan direction: ${error}`);
            callback(null, 0);
          });
      });
  }

  private getDirectionValue(device: Device): Promise<number> {
    return this.bondApi!.getState(device.id).then(state => {
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

  private accessoryForIdentifier(id: string): any {
    const accessories = this.accessories.filter(acc => {
      const device: Device = acc.context.device;
      return device.id === id;
    });
    return accessories.length > 0 ? accessories[0] : null;
  }

  private debug(message: string) {
    if (this.config.debug) {
      this.log(`DEBUG: ${message}`);
    }
  }
}
