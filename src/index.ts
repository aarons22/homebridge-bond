import { BondApi } from './BondApi';
import { DeviceType } from './enum/DeviceType';
import { FanSpeed } from './enum/FanSpeed';
import { Device } from './interface/Device';
import { Action } from './enum/Action';

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
      that.log(that.accessories.length + ' cached accessories were loaded');
      that.getDevices();
    });
  }

  public getDevices() {
    this.log('Getting devices...');
    this.bondApi!.getDeviceIds().then(ids => {
      this.log(ids.length + ' devices were found on this Bond.');
      const filtered = ids.filter(id => {
        return !this.deviceAdded(id);
      });

      this.log('Attempting to add ' + filtered.length + ' devices that were not previously added.');
      this.bondApi!.getDevices(filtered).then(devices => {
        devices.forEach(device => {
          this.addAccessory(device);
        });
      });
    });
  }

  public addAccessory(device: Device) {
    if (this.deviceAdded(device.id)) {
      this.log(device.id + ' has already been added.');
      return;
    }

    if (!Device.isSupported(device)) {
      this.log(device.name + ' has no supported actions.');
      return;
    }

    const accessory = new Accessory(device.location + ' ' + device.type, UUIDGen.generate(device.id.toString()));
    accessory.context.device = device;
    accessory.reachable = true;
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, device.id);

    if (device.type === DeviceType.CeilingFan) {
      if (Device.CFhasFan(device)) {
        accessory.addService(Service.Fan, device.location + ' Fan');
      }

      if (Device.CFhasLightbulb(device)) {
        accessory.addService(Service.Lightbulb, device.location + ' Light');
      }
    }

    this.setupObservers(accessory);

    this.api.registerPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
    this.accessories.push(accessory);
    this.log('Adding accessory ' + accessory.displayName);
  }

  public removeAccessory(accessory: any) {
    this.log('Removing accessory ' + accessory.displayName);

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
    this.log('Configuring Accessory: ' + accessory.displayName);
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
    this.getLightValue(device, isOn => {
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
            that.log('light toggled: ' + val);
            onChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.log(error);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        that.getLightValue(device, isOn => {
          callback(null, isOn);
        });
      });
  }

  private getLightValue(device: Device, callback: (isOn: boolean) => void) {
    this.bondApi!.getState(device.id)
      .then(state => {
        if (state.light !== undefined) {
          callback(state.light === 1 ? true : false);
        } else {
          callback(false);
        }
      })
      .catch((error: string) => {
        this.log(error);
      });
  }

  // Fan

  private setupFanObservers(device: Device, fan: any) {
    const that = this;
    const speedChar = fan.getCharacteristic(Characteristic.RotationSpeed);

    // Capture current state of device and apply characteristics
    this.getFanSpeedValue(device, index => {
      speedChar.updateValue(index);
    });

    const values = Device.fanSpeeds(device);

    speedChar
      .setProps({
        maxValue: values.length - 1,
        minStep: 1,
        minValue: 0,
      })
      .on('set', (index: number, callback: { (): void; (): void }) => {
        const speed = values[index];
        that
          .bondApi!.setFanSpeed(device.id, speed)
          .then(() => {
            that.log('set speed value: ' + speed);
            speedChar.updateValue(index);
            callback();
          })
          .catch((error: string) => {
            that.log(error);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: number) => void) => {
        that.getFanSpeedValue(device, speed => {
          callback(null, speed);
        });
      });

    const onChar = fan.getCharacteristic(Characteristic.On);

    // Capture current state of device and apply characteristics
    this.getFanPower(device, isOn => {
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
            that.log('fan toggled: ' + val);
            onChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.log(error);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        that.getFanPower(device, isOn => {
          callback(null, isOn);
        });
      });
  }

  private getFanPower(device: Device, callback: (isOn: boolean) => void) {
    this.bondApi!.getState(device.id)
      .then(state => {
        callback(state.power === 1);
      })
      .catch((error: string) => {
        this.log(error);
      });
  }

  private getFanSpeedValue(device: Device, callback: (speed: number) => void) {
    const values = Device.fanSpeeds(device);

    this.bondApi!.getState(device.id)
      .then(state => {
        if (state.speed !== undefined) {
          const index = values.indexOf(state.speed!);
          callback(index);
        } else {
          callback(0);
        }
      })
      .catch((error: string) => {
        this.log(error);
      });
  }

  // Fan Rotation Direction

  private setupFanDirectionObservers(device: Device, fan: any) {
    const that = this;
    const directionChar = fan.getCharacteristic(Characteristic.RotationDirection);

    // Capture current state of device and apply characteristics
    this.getDirectionValue(device, direction => {
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
            that.log('direction changed: ' + val);
            directionChar.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            that.log(error);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: number) => void) => {
        that.getDirectionValue(device, direction => {
          callback(null, direction);
        });
      });
  }

  private getDirectionValue(device: Device, callback: (direction: number) => void) {
    this.bondApi!.getState(device.id)
      .then(state => {
        if (state.direction !== undefined) {
          callback(state.direction!);
        } else {
          callback(0);
        }
      })
      .catch((error: string) => {
        this.log(error);
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
}
