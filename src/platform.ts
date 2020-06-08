import { DeviceType } from './enum/DeviceType';
import { Bond } from './interface/Bond';
import { Device } from './interface/Device';
import { Observer } from './Observer';
import { API, CharacteristicValue, DynamicPlatformPlugin, 
  PlatformConfig, PlatformAccessory, Service, Characteristic, Logging } from 'homebridge';
import { BondAccessory } from './platformAccessory';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';

export class BondPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly UUIDGen = this.api.hap.uuid;

  private accessories: PlatformAccessory[] = [];
  private bonds: Bond[] | undefined;

  constructor(
    public log: Logging,
    public config: PlatformConfig,
    public api: API) {

    if (config === null) {
      this.log.error('No config defined.');
      return;
    }

    if (config.bonds === undefined) {
      this.log.error('bonds array is required but missing from config.json');
      return;
    }

    const bonds = Bond.objects(this);

    api.on('didFinishLaunching', () => {
      // Delaying the initialization of bonds property because we need to
      // get the device ids before doing anything
      Bond.updateDeviceIds(bonds).then(() => {
        this.bonds = bonds;
        this.log(`${this.accessories.length} cached accessories were loaded`);
        this.bonds.forEach(bond => {
          this.getDevices(bond);
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

  /**
   * Add a new accessory that hasn't been added before.
   */
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

    const bond = this.bondForDevice(device);
    if (bond === undefined) {
      return;
    }
    // ID should be unique across multiple bonds in case device's have the same
    // id across bonds.
    const id = `${bond.version.bondid}${device.id}`;
    const accessory = new this.api.platformAccessory(`${displayName}`, this.UUIDGen.generate(id));
    accessory.context.device = device;
    new BondAccessory(this, accessory, device);
    this.setupObservers(accessory);

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.push(accessory);
    this.log(`Adding accessory ${accessory.displayName}`);
    this.log.debug(`Accessory id: ${id}`);
  }

  removeAccessory(accessory: PlatformAccessory) {
    this.log(`Removing accessory ${accessory.displayName}`);

    const index = this.accessories.indexOf(accessory);
    if (index > -1) {
      this.accessories.splice(index, 1);
    }

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  configureAccessory(accessory: PlatformAccessory) {
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

  private setupObservers(accessory: PlatformAccessory) {
    const device: Device = accessory.context.device;
    const bond = this.bondForAccessory(accessory);

    if (bond === undefined) {
      return;
    }

    switch (device.type) {
      case DeviceType.CeilingFan:
        {
          if (Device.CFhasFan(device)) {
            const fan = accessory.getService(this.Service.Fan);
            this.setupFanObservers(bond, device, fan);
            this.setupFanPowerObservers(bond, device, fan);

            // RotationDirection button will appear based on characteristic observations
            if (Device.CFhasReverseSwitch(device)) {
              this.setupFanDirectionObservers(bond, device, fan);
            }
          }

          if (Device.CFhasUpDownLight(device)) {
            const upBulb = accessory.getServiceByUUIDAndSubType(this.Service.Lightbulb, 'UpLight');
            const downBulb = accessory.getServiceByUUIDAndSubType(this.Service.Lightbulb, 'DownLight');
            this.setupLightbulbObservers(bond, device, upBulb);
            this.setupLightbulbObservers(bond, device, downBulb);
            // TODO: Add dimmer support for both
          } else if (Device.CFhasLightbulb(device)) {
            const bulb = accessory.getService(this.Service.Lightbulb);
            this.setupLightbulbObservers(bond, device, bulb);

            let dimmer = accessory.getService(`${accessory.displayName} Dimmer`);
            let dimmerUp = accessory.getService(`${accessory.displayName} DimmerUp`);
            let dimmerDown = accessory.getService(`${accessory.displayName} DimmerDown`);
            if (this.config.include_dimmer) {
              // Add service if previously undefined
              if (Device.HasDimmer(device)) {
                if (dimmer === undefined) {
                  this.log(`${accessory.displayName} didn't have dimmer defined. define it now`);
                  dimmer = accessory.addService(this.Service.Switch, `${accessory.displayName} Dimmer`);
                }
                this.setupLightbulbDimmerObserver(bond, device, dimmer, d => bond.api.startDimmer(d));
              }
              if (Device.HasSeparateDimmers(device)) {
                if (dimmerUp === undefined) {
                  dimmerUp = accessory.addService(new this.Service.Switch(`${accessory.displayName} DimmerUp`, 'up'));
                }
                if (dimmerDown === undefined) {
                  dimmerDown = accessory.addService(
                    new this.Service.Switch(`${accessory.displayName} DimmerDown`, 'down'),
                  );
                }
                this.setupLightbulbDimmerObserver(
                  bond,
                  device,
                  dimmerUp,
                  d => bond.api.startIncreasingBrightness(d),
                  dimmerDown,
                );
                this.setupLightbulbDimmerObserver(
                  bond,
                  device,
                  dimmerDown,
                  d => bond.api.startDecreasingBrightness(d),
                  dimmerUp,
                );
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
            const generic = accessory.getService(this.Service.Switch);
            this.setupGenericObserver(bond, device, generic);
          }
        }
        break;
      case DeviceType.Fireplace:
        {
          if (Device.FPhasToggle(device)) {
            const fireplace = accessory.getService(this.Service.Switch);
            this.setupFireplaceObserver(bond, device, fireplace);
          }
        }
        break;
      default: {
        break;
      }
    }
  }

  public bondForAccessory(accessory: PlatformAccessory): Bond | undefined {
    const device: Device = accessory.context.device;
    return this.bondForDevice(device);
  }

  private bondForDevice(device: Device): Bond | undefined {
    if (this.bonds) {
      const bond = this.bonds.find(x => x.deviceIds.includes(device.id));
      if (bond === undefined) {
        this.log.error(
          `No Bond found for Device: ${device.name}.
          This Device may have been removed from your Bond but still exists in cachedAccessories.`,
        );
      }
      return bond;
    } else {
      this.log.error('config.bonds is not defined');
    }
  }

  // Lightbulb

  private setupLightbulbObservers(bond: Bond, device: Device, bulb?: Service) {
    if (bulb === undefined) {
      return;
    }
    const subtype = bulb!.subtype;

    function get(): Promise<CharacteristicValue> {
      return bond.api.getState(device.id).then(state => {
        if(subtype === 'UpLight') {
          return state.up_light === 1;
        } else if(subtype === 'DownLight') {
          return state.down_light === 1;
        } else {
          return state.light === 1;
        }
      });
    }

    function set(): Promise<void> {      
      if(subtype === 'UpLight') {
        return bond.api.toggleUpLight(device.id);
      } else if(subtype === 'DownLight') {
        return bond.api.toggleDownLight(device.id);
      } else {
        return bond.api.toggleLight(device.id);
      }
    }

    Observer.add(this, bulb.getCharacteristic(this.Characteristic.On), get, set);
  }

  private setupLightbulbDimmerObserver(
    bond: Bond,
    device: Device,
    dimmer: Service,
    startCallback: (device: Device) => Promise<void>,
    otherDimmer?: Service,
  ) {
    const that = this;
    function get(): Promise<CharacteristicValue> {
      return Promise.resolve(false);
    }

    function set(value: CharacteristicValue): Promise<void> {
      if (value === true) {
        if (otherDimmer) {
          bond.api.stop(device);
          otherDimmer.setCharacteristic(that.Characteristic.On, false);
        }
        return startCallback(device);
      } else {
        return bond.api.stop(device);
      }
    }

    Observer.add(this, dimmer.getCharacteristic(this.Characteristic.On), get, set);
  }

  // Fan - Speed

  private setupFanObservers(bond: Bond, device: Device, fan?: Service) {
    if (fan === undefined) {
      return;
    }
    const that = this;
    const values = Device.fanSpeeds(device);

    let minStep = Math.floor(100 / values.length);
    let maxValue = minStep * values.length;

    if (this.config.fan_speed_values) {
      minStep = 1;
      maxValue = values.length;
    }

    this.debug(device, `min step: ${minStep}, max value: ${maxValue}`);

    function get(): Promise<CharacteristicValue> {
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

    function set(step: CharacteristicValue): Promise<void> | undefined {
      if (step === 0) {
        return undefined;
      }
      const index = step as number / minStep - 1;
      that.debug(device, `new index value: ${index}`);
      const speed = values[index];
      that.debug(device, `new speed value: ${speed}`);

      return bond.api.setFanSpeed(device.id, speed);
    }

    const props = {
      maxValue,
      minStep,
    };
    Observer.add(this, fan.getCharacteristic(this.Characteristic.RotationSpeed), get, set, props);
  }

  // Fan - Power

  private setupFanPowerObservers(bond: Bond, device: Device, fan?: Service) {
    if (fan === undefined) {
      return;
    }
    function get(): Promise<CharacteristicValue> {
      return bond.api.getState(device.id).then(state => {
        return state.power === 1;
      });
    }

    function set(value: CharacteristicValue): Promise<void> {
      return bond.api.toggleFan(device, value);
    }

    Observer.add(this, fan.getCharacteristic(this.Characteristic.On), get, set);
  }

  // Fan -  Rotation Direction

  private setupFanDirectionObservers(bond: Bond, device: Device, fan?: Service) {
    if (fan === undefined) {
      return;
    }
    function get(): Promise<CharacteristicValue> {
      return bond.api.getState(device.id).then(state => {
        if (state.direction !== undefined) {
          return state.direction!;
        } else {
          return 0;
        }
      });
    }

    function set(): Promise<void> {
      return bond.api.toggleDirection(device.id);
    }

    Observer.add(this, fan.getCharacteristic(this.Characteristic.RotationDirection), get, set);
  }

  // Generic

  private setupGenericObserver(bond: Bond, device: Device, generic?: Service) {
    if (generic === undefined) {
      return;
    }
    function get(): Promise<CharacteristicValue> {
      return bond.api.getState(device.id).then(state => {
        return state.power === 1;
      });
    }

    function set(): Promise<void> {
      return bond.api.togglePower(device);
    }

    Observer.add(this, generic.getCharacteristic(this.Characteristic.On), get, set);
  }

  // Fireplace

  private setupFireplaceObserver(bond: Bond, device: Device, fireplace?: Service) {
    if (fireplace === undefined) {
      return;
    }
    function get(): Promise<CharacteristicValue> {
      return bond.api.getState(device.id).then(state => {
        return state.power === 1;
      });
    }

    function set(): Promise<void> {
      return bond.api.togglePower(device);
    }

    Observer.add(this, fireplace.getCharacteristic(this.Characteristic.On), get, set);
  }

  // Helper Methods

  private deviceAdded(id: string) {
    const accessories = this.accessories.filter(acc => {
      const device: Device = acc.context.device;
      return device.id === id;
    });
    return accessories.length > 0;
  }

  private debug(device: Device, message: string) {
    this.log.debug(`[${device.name}] ${message}`);
  }
}
