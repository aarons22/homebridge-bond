import { API, DynamicPlatformPlugin, PlatformConfig, PlatformAccessory, Service, Characteristic, Logging } from 'homebridge';
import { Bond, BPUPPacket } from './interface/Bond';
import { BondAccessory } from './platformAccessory';
import { BondPlatformConfig } from './interface/config';
import { Device } from './interface/Device';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';
import dgram from 'dgram';

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

    if(!BondPlatformConfig.isValid(this)) {
      this.log.error(`Config: ${JSON.stringify(config, null, 2)}`);
      return;
    }
    
    this.log.debug(`Config: ${JSON.stringify(config, null, 2)}`);

    api.on('didFinishLaunching', () => {
      // Delaying the initialization of bonds property because we need to
      // get the device ids before doing anything
      this.validateBonds();
    });
  }

  // Validate that all of the bonds provided in the config are online and authenticaiton is working
  validateBonds() {
    const bonds = Bond.objects(this);
    const validated: Bond[] = [];

    Bond.validate(bonds).then(res => {
      res.forEach(res => {
        if (res !== undefined) {
          validated.push(res);
        }
      });

      this.setupBonds(validated);
    });
  }

  setupBonds(bonds: Bond[]) {
    if (bonds.length === 0) {
      this.log.warn('No valid Bonds available.');
      return;
    }
    // const bonds = Bond.objects(this);
    Bond.updateDeviceIds(bonds).then(() => {
      this.bonds = bonds;
      this.log(`${this.accessories.length} cached accessories were loaded`);
      this.bonds.forEach(bond => {
        this.getDevices(bond);
        this.setupBPUP(bond);
      });
    });
  }

  public getDevices(bond: Bond) {
    this.cleanupBondData(bond);
    
    this.log(`Getting devices for this Bond (${bond.version.bondid})...`);
    this.log(`${bond.deviceIds.length} devices were found on this Bond (${bond.version.bondid}).`);
    const filtered = bond.deviceIds.filter(deviceId => {
      const accessories = this.accessories.filter(acc => {
        return acc.context.device.uniqueId === bond.uniqueDeviceId(deviceId);
      });
      return accessories.length === 0;
    });

    if (filtered.length === 0) {
      this.log(`No new devices to add for this Bond (${bond.version.bondid}).`);
      return;
    }

    this.log(`Attempting to add ${filtered.length} devices that were not previously added.`);
    bond.api
      .getDevices(filtered)
      .then(devices => {
        devices.forEach(device => {
          // Set the unique id
          device.uniqueId = bond.uniqueDeviceId(device.id);
          // Set the bond id
          device.bondId = bond.version.bondid;
        });
        this.addAccessories(devices);
      })
      .catch(error => {
        this.log(`Error getting devices: ${error}`);
      });
  }

  private cleanupBondData(bond: Bond) {
    // Data cleanup - Make sure all cached devices have uniqueId and bondId on them
    bond.deviceIds.forEach(deviceId => {
      this.accessories.forEach(accessory => {
        // Only run if device does not have uniqueId
        if (accessory.context.device.uniqueId === undefined 
          && accessory.context.device.id === deviceId) {
          const uniqueId = bond.uniqueDeviceId(deviceId);
          this.log.debug(`Updating device data with uniqueId ${uniqueId}`);
          accessory.context.device.uniqueId = bond.uniqueDeviceId(deviceId);
          accessory.context.device.bondId = bond.version.bondid;
        }
      });
    });
  }
  
  addAccessories(devices: Device[]) {
    devices.forEach(device => {
      this.addAccessory(device);
    });
  }

  // Accessory

  /**
   * Add a new accessory that hasn't been added before.
   */
  public addAccessory(device: Device) {
    const bond = this.bondForDevice(device);

    // Make sure Bond exists
    if (bond === undefined) {
      this.log(`[${device.name}] Bond does not exist for device id: ${device.id}.`);
      return;
    }

    // Make sure device shouldn't be excluded
    if ((bond.config.hide_device_ids !== undefined 
      && bond.config.hide_device_ids.includes(device.id))) {
      this.log(`[${device.name}] Excluding ${device.id}.`);
      return;
    }
    
    // Make sure device has supported actions
    if (!Device.isSupported(device)) {
      this.log(`[${device.name}] Device has no supported actions.`);
      return;
    }

    const uuid = this.UUIDGen.generate(device.uniqueId);
    if (this.accessoryAdded(uuid)) {
      this.log(`[${device.name}] Accessory already added.`);
      return;
    }

    const displayName = Device.displayName(device);
    const accessory = new this.api.platformAccessory(`${displayName}`, uuid);
    accessory.context.device = device;
    this.create(accessory);

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.push(accessory);
    this.log(`Adding Accessory ${accessory.displayName}`);
    this.log.debug(`Device unique id: ${device.uniqueId}`);
  }

  removeAccessory(accessory: PlatformAccessory) {
    this.log(`Removing Accessory: ${accessory.displayName}`);

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
      this.create(accessory);
    } else {
      const that = this;
      const timer = setInterval(() => {
        if (this.bonds) {
          that.log(`Configuring Accessory: ${accessory.displayName}`);
          that.create(accessory);
          clearInterval(timer);
        }
      }, 500);
    }
  }

  private create(accessory: PlatformAccessory) {
    const device: Device = accessory.context.device;
    const bond = this.bondForDevice(device);

    if (!bond) {
      return;
    }

    if ((bond.config.hide_device_ids
      && bond.config.hide_device_ids.includes(device.id))) {
      this.removeAccessory(accessory);
      return;
    }
    this.logAccessory(accessory, `actions: ${device.actions}`);
    
    const bondAccessory = BondAccessory.create(this, accessory, bond);
    bond.accessories.push(bondAccessory);
  }

  private setupBPUP(bond: Bond) {
    const PORT = 30007;
    const HOST = bond.config.ip_address;

    const message = Buffer.from('');

    const client = dgram.createSocket('udp4');
    
    const log = this.log;

    function send() {
      client.send(message, 0, message.length, PORT, HOST, (err: any) => {
        if (err) {
          log.error(`Erorr sending UDP message: ${err}`);
          throw err;
        }
        log.debug(`UDP message sent to ${HOST}:${PORT}`);
      });
    }
    send(); 
    // From Bond API Docs: The client should continue to send the Keep-Alive datagram on 
    // the same socket every 60 seconds to keep the connection active.
    setInterval(send, 1000 * 60);

    client.on('message', (message: Buffer, remote: { address: string; port: string }) => {
      const msg = message.toString().trim();
      const packet = JSON.parse(msg) as BPUPPacket;
      log.debug(`UDP Message received from ${remote.address}:${remote.port} - ${msg}`);
      bond.receivedBPUPPacket(packet);
    });

    client.on('close', () => {
      this.log('Connection closed');
    });
  }

  private bondForDevice(device: Device): Bond | undefined {
    if (this.bonds) {
      const bond = this.bonds.find(x => x.version.bondid === device.bondId && x.deviceIds.includes(device.id));
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

  // Helper Methods

  private accessoryAdded(uuid: string) {
    const accessories = this.accessories.filter(acc => {
      return acc.UUID === uuid;
    });
    return accessories.length > 0;
  }

  debug(accessory: PlatformAccessory, message: string) {
    const device: Device = accessory.context.device;
    this.log.debug(`[${device.name}] ${message}`);
  }

  logAccessory(accessory: PlatformAccessory, message: string) {
    const device: Device = accessory.context.device;
    this.log(`[${device.name}] ${message}`);
  }

  error(accessory: PlatformAccessory, message: string) {
    const device: Device = accessory.context.device;
    this.log.error(`[${device.name}] ${message}`);
  }
}