import Promise from 'bluebird';
import { DeviceType } from './enum/DeviceType';
import { HAP, hap } from './homebridge/hap';
import { Bond } from './interface/Bond';
import { BondPlatformConfig } from './interface/config';
import { Device } from './interface/Device';
import { Observer } from './Observer';

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
        accessory.addService(hap.Service.Fan, `${device.location} ${device.name} Fan`);
      }

      if (Device.CFhasLightbulb(device)) {
        accessory.addService(hap.Service.Lightbulb, `${device.location} ${device.name} Light`);
      }

      if (this.config.include_dimmer && Device.HasDimmer(device)) {
        accessory.addService(hap.Service.Switch, `${device.location} ${device.name} Dimmer`);
      }
    }

    if (device.type === DeviceType.Generic) {
      if (Device.GXhasToggle(device)) {
        accessory.addService(hap.Service.Switch, `${device.location} ${device.name}`);
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

    switch (device.type) {
      case DeviceType.CeilingFan:
        {
          if (Device.CFhasFan(device)) {
            const fan = accessory.getService(hap.Service.Fan);
            this.setupFanObservers(bond, device, fan);
            this.setupFanPowerObservers(bond, device, fan);

            // RotationDirection button will appear based on characteristic observations
            if (Device.CFhasReverseSwitch(device)) {
              this.setupFanDirectionObservers(bond, device, fan);
            }
          }

          if (Device.CFhasLightbulb(device)) {
            const bulb = accessory.getService(hap.Service.Lightbulb);
            this.setupLightbulbObservers(bond, device, bulb);

            let dimmer = accessory.getService(`${device.location} ${device.name} Dimmer`);
            if (this.config.include_dimmer) {
              // Add service if previously undefined
              if (dimmer === undefined) {
                dimmer = accessory.addService(hap.Service.Switch, `${device.location} ${device.name} Dimmer`);
              }
              this.setupLightbulbDimmerObserver(bond, device, dimmer);
            } else {
              // Remove service if previously added
              if (dimmer !== undefined) {
                accessory.removeService(dimmer);
              }
            }
          }
        }
        break;
      case DeviceType.Generic:
        {
          if (Device.GXhasToggle(device)) {
            const generic = accessory.getService(hap.Service.Switch);
            this.setupGenericObserver(bond, device, generic);
          }
        }
        break;
      default: {
        break;
      }
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
    function get(): Promise<any> {
      return bond.api.getState(device.id).then(state => {
        if (state.light !== undefined) {
          return state.light === 1 ? true : false;
        } else {
          return false;
        }
      });
    }

    function set(): Promise<void> {
      return bond.api.toggleLight(device.id);
    }

    Observer.add(this.log, bulb, hap.Characteristic.On, get, set);
  }

  private setupLightbulbDimmerObserver(bond: Bond, device: Device, dimmer: HAP.Service) {
    function get(): Promise<any> {
      return Promise.resolve(false);
    }

    function set(value: any): Promise<void> {
      if (value === true) {
        return bond.api.startDimmer(device);
      } else {
        return bond.api.stop(device);
      }
    }

    Observer.add(this.log, dimmer, hap.Characteristic.On, get, set);
  }

  // Fan - Speed

  private setupFanObservers(bond: Bond, device: Device, fan: HAP.Service) {
    const that = this;
    const values = Device.fanSpeeds(device);

    const minStep = Math.floor(100 / values.length);
    const maxValue = minStep * values.length;
    this.debug(device, `min step: ${minStep}, max value: ${maxValue}`);

    function get(): Promise<any> {
      return bond.api.getState(device.id).then(state => {
        if (state.speed !== undefined && state.power === 1) {
          that.debug(device, `speed value: ${state.speed}`);
          const index = values.indexOf(state.speed!) + 1;
          that.debug(device, `index value: ${index}`);
          const step = index * minStep;
          that.debug(device, `step value: ${step}`);
          return step;
        } else {
          return 0;
        }
      });
    }

    function set(step: any): Promise<void> | undefined {
      if (step === 0) {
        return undefined;
      }
      const index = step / minStep - 1;
      that.debug(device, `new index value: ${index}`);
      const speed = values[index];
      that.debug(device, `new speed value: ${speed}`);

      return bond.api.setFanSpeed(device.id, speed);
    }

    const props = {
      maxValue,
      minStep,
    };
    Observer.add(this.log, fan, hap.Characteristic.RotationSpeed, get, set, props);
  }

  // Fan - Power

  private setupFanPowerObservers(bond: Bond, device: Device, fan: HAP.Service) {
    function get(): Promise<any> {
      return bond.api.getState(device.id).then(state => {
        return state.power === 1;
      });
    }

    function set(value: any): Promise<void> {
      return bond.api.toggleFan(device, value);
    }

    Observer.add(this.log, fan, hap.Characteristic.On, get, set);
  }

  // Fan -  Rotation Direction

  private setupFanDirectionObservers(bond: Bond, device: Device, fan: HAP.Service) {
    function get(): Promise<any> {
      return bond.api.getState(device.id).then(state => {
        if (state.direction !== undefined) {
          return state.direction!;
        } else {
          return 0;
        }
      });
    }

    function set(value: any): Promise<void> {
      return bond.api.toggleDirection(device.id);
    }

    Observer.add(this.log, fan, hap.Characteristic.RotationDirection, get, set);
  }

  // Generic

  private setupGenericObserver(bond: Bond, device: Device, generic: HAP.Service) {
    function get(): Promise<any> {
      return bond.api.getState(device.id).then(state => {
        return state.power === 1;
      });
    }

    function set(value: any): Promise<void> {
      return bond.api.togglePower(device);
    }

    Observer.add(this.log, generic, hap.Characteristic.On, get, set);
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
      this.log(`DEBUG: [${device.name}] ${message}`);
    }
  }

  private verbose(device: Device, message: string) {
    this.log(`[${device.name}] ${message}`);
  }

  private error(device: Device, message: string) {
    this.log(`ERR: [${device.name}] ${message}`);
  }
}
