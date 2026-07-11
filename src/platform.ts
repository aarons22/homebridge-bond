import { API, DynamicPlatformPlugin, PlatformConfig, PlatformAccessory, Service, Characteristic, Logging } from 'homebridge';
import { Bond, BPUPPacket } from './interface/Bond';
import { BondAccessory } from './platformAccessory';
import { BondPlatformConfig } from './interface/config';
import { Device } from './interface/Device';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';
import dgram from 'dgram';

// BPUP (Bond Push UDP Protocol) tuning. The Bond acks every keep-alive datagram, so we expect
// inbound traffic at least once per keep-alive interval. If the socket errors or the connection
// goes silent past the stale threshold, the subscription has lapsed (e.g. a Wi-Fi/router change)
// and we transparently re-establish it so state updates resume without a manual restart.
const BPUP_PORT = 30007;
const BPUP_KEEPALIVE_MS = 60 * 1000;
const BPUP_WATCHDOG_INTERVAL_MS = 30 * 1000;
const BPUP_STALE_THRESHOLD_MS = 150 * 1000;
const BPUP_RECONNECT_BASE_MS = 2 * 1000;
const BPUP_RECONNECT_MAX_MS = 60 * 1000;

interface BPUPConnection {
  socket: dgram.Socket;
  keepAlive?: ReturnType<typeof setInterval>;
  watchdog?: ReturnType<typeof setInterval>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

export class BondPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly UUIDGen = this.api.hap.uuid;

  private accessories: PlatformAccessory[] = [];
  private bonds: Bond[] | undefined;
  private bpupConnections: Map<string, BPUPConnection> = new Map();

  private redactConfig(config: PlatformConfig): PlatformConfig {
    const cast = config as BondPlatformConfig;
    if (!cast.bonds || !Array.isArray(cast.bonds)) {
      return config;
    }

    const redactedBonds = cast.bonds.map(bond => {
      return {
        ...bond,
        token: '[REDACTED]',
      };
    });

    return {
      ...config,
      bonds: redactedBonds,
    };
  }

  constructor(
    public log: Logging,
    public config: PlatformConfig,
    public api: API) {

    if (config === null) {
      this.log.error('No config defined.');
      return;
    }

    if(!BondPlatformConfig.isValid(this)) {
      this.log.error(`Config: ${JSON.stringify(this.redactConfig(config), null, 2)}`);
      return;
    }
    
    this.log.debug(`Config: ${JSON.stringify(this.redactConfig(config), null, 2)}`);

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
    this.connectBPUP(bond, BPUP_RECONNECT_BASE_MS);
  }

  // Establishes (or re-establishes) the BPUP subscription for a Bond. The socket auto-recovers
  // on error or on a stale/silent connection so real-time state updates survive network changes.
  private connectBPUP(bond: Bond, backoffMs: number) {
    const HOST = this.bpupHost(bond.config.ip_address);
    const bondId = bond.version?.bondid ?? HOST;
    const log = this.log;

    const message = Buffer.from('');

    // Replace any existing connection for this Bond before creating a new one.
    this.teardownBPUP(bondId);

    const client = dgram.createSocket('udp4');
    const connection: BPUPConnection = { socket: client };
    this.bpupConnections.set(bondId, connection);

    let lastActivity = Date.now();
    let healthy = false;
    let reconnectScheduled = false;

    const scheduleReconnect = (reason: string) => {
      if (reconnectScheduled) {
        return;
      }
      reconnectScheduled = true;
      // Once a connection has proven healthy, recover quickly; otherwise back off exponentially.
      const delay = healthy ? BPUP_RECONNECT_BASE_MS : Math.min(backoffMs * 2, BPUP_RECONNECT_MAX_MS);
      log.warn(`BPUP connection to Bond (${bondId}) lost (${reason}); reconnecting in ${Math.round(delay / 1000)}s.`);
      this.teardownBPUP(bondId);
      const reconnectTimer = setTimeout(() => this.connectBPUP(bond, delay), delay);
      // Track the pending reconnect so a later teardown can cancel it.
      this.bpupConnections.set(bondId, { socket: client, reconnectTimer });
    };

    function send() {
      client.send(message, 0, message.length, BPUP_PORT, HOST, (err: any) => {
        if (err) {
          log.error(`Error sending UDP message: ${err}`);
          return;
        }
        log.debug(`UDP message sent to ${HOST}:${BPUP_PORT}`);
      });
    }
    send();
    // From Bond API Docs: The client should continue to send the Keep-Alive datagram on
    // the same socket every 60 seconds to keep the connection active.
    connection.keepAlive = setInterval(send, BPUP_KEEPALIVE_MS);
    // Watchdog: the Bond acks every keep-alive, so a healthy socket receives traffic well within
    // the stale threshold. If it goes silent the subscription has lapsed — reconnect to recover.
    connection.watchdog = setInterval(() => {
      if (Date.now() - lastActivity > BPUP_STALE_THRESHOLD_MS) {
        scheduleReconnect('no packets received');
      }
    }, BPUP_WATCHDOG_INTERVAL_MS);

    client.on('message', (message: Buffer, remote: { address: string; port: string }) => {
      lastActivity = Date.now();
      healthy = true;
      const msg = message.toString().trim();
      const packet = this.parseBPUPPacket(msg);
      if (packet) {
        log.debug(`UDP Message received from ${remote.address}:${remote.port} - ${msg}`);
        bond.receivedBPUPPacket(packet);
      } else {
        log.debug(`Malformed UDP payload from ${remote.address}:${remote.port}. Ignoring packet.`);
      }
    });

    client.on('error', (err: Error) => {
      log.error(`BPUP socket error for Bond (${bondId}): ${err}`);
      scheduleReconnect('socket error');
    });

    client.on('close', () => {
      log.debug(`BPUP socket closed for Bond (${bondId}).`);
    });
  }

  private teardownBPUP(bondId: string) {
    const existing = this.bpupConnections.get(bondId);
    if (!existing) {
      return;
    }
    if (existing.keepAlive) {
      clearInterval(existing.keepAlive);
    }
    if (existing.watchdog) {
      clearInterval(existing.watchdog);
    }
    if (existing.reconnectTimer) {
      clearTimeout(existing.reconnectTimer);
    }
    try {
      existing.socket.removeAllListeners();
      existing.socket.close();
    } catch (_error) {
      // Socket may already be closed; ignore.
    }
    this.bpupConnections.delete(bondId);
  }

  private bpupHost(ipAddress: string): string {
    return new URL(`http://${ipAddress}`).hostname;
  }

  private parseBPUPPacket(message: string): BPUPPacket | undefined {
    const jsonStart = message.indexOf('{');
    if (jsonStart === -1) {
      return undefined;
    }

    try {
      return JSON.parse(message.slice(jsonStart)) as BPUPPacket;
    } catch (_error) {
      return undefined;
    }
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
