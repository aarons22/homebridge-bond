import Promise from 'bluebird';
import { DeviceType } from './enum/DeviceType';
import { HAP, hap } from './homebridge/hap';
import { Bond } from './interface/Bond';
import { BondPlatformConfig } from './interface/config';
import { Device } from './interface/Device';
import { Observer } from './Observer';

let Accessory: any;
const PLUGIN_NAME = 'homebridge-bond';
const PLATFORM_NAME = 'Bond';

export default (homebridge: any) => {
  hap.Service = homebridge.hap.Service;
  hap.Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.platformAccessory;
  hap.UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BondPlatform, true);
};

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
      this.log.error('bonds array is required but missing from config.json');
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
    const displayName = Device.displayName(device);
    if (this.deviceAdded(device.id)) {
      this.log(`${device.id} has already been added.`);
      return;
    }

    if (!Device.isSupported(device)) {
      this.log(`${displayName} has no supported actions.`);
      return;
    }

    const accessory = new Accessory(`${displayName}`, hap.UUIDGen.generate(device.id.toString()));
    accessory.context.device = device;
    accessory.reachable = true;
    accessory
      .getService(hap.Service.AccessoryInformation)
      .setCharacteristic(hap.Characteristic.SerialNumber, device.id);

    if (device.type === DeviceType.CeilingFan) {
      if (device.properties.max_speed === undefined) {
        this.log(`${accessory.displayName} Fan is not supported (missing max_speed property).`);
      }
      if (Device.CFhasFan(device)) {
        accessory.addService(hap.Service.Fan, `${accessory.displayName}`);
      }

      if (Device.CFhasLightbulb(device)) {
        accessory.addService(hap.Service.Lightbulb, `${accessory.displayName} Light`);
      }

      if (this.config.include_dimmer && Device.HasDimmer(device)) {
        accessory.addService(hap.Service.Switch, `${accessory.displayName} Dimmer`);
      }
      if (this.config.include_dimmer && Device.HasSeparateDimmers(device)) {
        accessory.addService(new hap.Service.Switch(`${device.location} ${device.name} DimmerUp`, "up"));
        accessory.addService(new hap.Service.Switch(`${device.location} ${device.name} DimmerDown`, "down"));
      }
    }

    if (device.type === DeviceType.Generic) {
      if (Device.GXhasToggle(device)) {
        accessory.addService(hap.Service.Switch, `${accessory.displayName}`);
      }
    }

    if (device.type === DeviceType.Fireplace) {
      if (Device.FPhasToggle(device)) {
        accessory.addService(hap.Service.Switch, `${accessory.displayName}`);
      }
    }

    this.setupObservers(accessory);

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.push(accessory);
    this.log(`Adding accessory ${accessory.displayName}`);
  }

  public removeAccessory(accessory: HAP.Accessory) {
    this.log(`Removing accessory ${accessory.displayName}`);

    const index = this.accessories.indexOf(accessory);
    if (index > -1) {
      this.accessories.splice(index, 1);
    }

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  public configureAccessory(accessory: HAP.Accessory) {
    if (this.config === null || this.config.bonds === undefined) {
      return;
    }
    this.accessories.push(accessory);

    // If bonds hasn't been initilized, attempt to configure the accessory
    // after a delay
    if (this.bonds) {
      this.log(`Configuring Accessory: ${accessory.displayName}`);
      this.setupObservers(accessory);
    } else {
      const that = this;
      const timer = setInterval(() => {
        if (this.bonds) {
          that.log(`Configuring Accessory: ${accessory.displayName}`);
          that.setupObservers(accessory);
          clearInterval(timer);
        }
      }, 500);
    }
  }

  private setupObservers(accessory: HAP.Accessory) {
    const device: Device = accessory.context.device;
    const bond = this.bondForAccessory(accessory);

    if (bond === undefined) {
      return;
    }

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

            let dimmer = accessory.getService(`${accessory.displayName} Dimmer`);
            let dimmerUp = accessory.getService(`${accessory.displayName} DimmerUp`);
            let dimmerDown = accessory.getService(`${accessory.displayName} DimmerDown`);
            if (this.config.include_dimmer) {
              // Add service if previously undefined
              if (Device.HasDimmer(device)) {
                if (dimmer === undefined) {
                  this.log(`${accessory.displayName} didn't have dimmer defined. define it now`);
                  dimmer = accessory.addService(hap.Service.Switch, `${accessory.displayName} Dimmer`);
                  dimmer = accessory.addService(hap.Service.Switch, `${accessory.displayName} Dimmer`);
                }
                this.setupLightbulbDimmerObserver(bond, device, dimmer, d => bond.api.startDimmer(d));
              }
              if (Device.HasSeparateDimmers(device)) {
                if (dimmerUp === undefined) {
                  dimmerUp = accessory.addService(new hap.Service.Switch(`${accessory.displayName} DimmerUp`, "up"));
                }
                if (dimmerDown === undefined) {
                  dimmerDown = accessory.addService(new hap.Service.Switch(`${accessory.displayName} DimmerDown`, "down"));
                }
                this.setupLightbulbDimmerObserver(bond, device, dimmerUp, d => bond.api.startIncreasingBrightness(d), dimmerDown);
                this.setupLightbulbDimmerObserver(bond, device, dimmerDown, d => bond.api.startDecreasingBrightness(d), dimmerUp);
              }
            } else {
              // Remove service if previously added
              if (dimmer !== undefined) {
                accessory.removeService(dimmer);
              }
              if (dimmerUp !== undefined) {
                accessory.removeService(dimmerUp);
              }
              if (dimmerDown !== undefined) {
                accessory.removeService(dimmerDown);
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
      case DeviceType.Fireplace:
        {
          if (Device.FPhasToggle(device)) {
            const fireplace = accessory.getService(hap.Service.Switch);
            this.setupFireplaceObserver(bond, device, fireplace);
          }
        }
        break;
      default: {
        break;
      }
    }
  }

  private bondForAccessory(accessory: HAP.Accessory): Bond | undefined {
    const device: Device = accessory.context.device;
    if (this.bonds) {
      const bond = this.bonds.find(x => x.deviceIds.includes(device.id));
      if (bond === undefined) {
        this.log.error(
          `No Bond found for Accessory: ${accessory.displayName}. This Accessory may have been removed from your Bond but still exists in cachedAccessories.`,
        );
      }
      return bond;
    } else {
      this.log.error(`config.bonds is not defined`);
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

  private setupLightbulbDimmerObserver(bond: Bond, device: Device, dimmer: HAP.Service, startCallback: (device: Device) => Promise<void>, otherDimmer?: HAP.Service) {
    function get(): Promise<any> {
      return Promise.resolve(false);
    }

    function set(value: any): Promise<void> {
      if (value === true) {
        if (otherDimmer) {
          bond.api.stop(device);
          otherDimmer.setCharacteristic(hap.Characteristic.On, false);
        }
        return startCallback(device);
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

  // Fireplace

  private setupFireplaceObserver(bond: Bond, device: Device, fireplace: HAP.Service) {
    function get(): Promise<any> {
      return bond.api.getState(device.id).then(state => {
        return state.power === 1;
      });
    }

    function set(value: any): Promise<void> {
      return bond.api.togglePower(device);
    }

    Observer.add(this.log, fireplace, hap.Characteristic.On, get, set);
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
    this.log.error(`[${device.name}] ${message}`);
  }
}
