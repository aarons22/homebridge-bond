import { BondAccessory } from '../platformAccessory';
import { BondApi } from '../BondApi';
import { BondConfig } from './config';
import { BondPlatform } from '../platform';
import { BondPlatformConfig } from '../interface/config';
import { Device } from '../interface/Device';
import { Version } from './Version';

export class Bond {
  public api: BondApi;
  public config: BondConfig;
  public deviceIds: string[] = [];
  public accessories: BondAccessory[] = [];
  public version!: Version;

  constructor(
    private readonly platform: BondPlatform,
    config: BondConfig) {
    this.config = config;
    this.api = new BondApi(platform, config.token, config.ip_address);
  }

  // Helper to sanitze the config object into bond objects
  public static objects(platform: BondPlatform): Bond[] {
    const config = platform.config as BondPlatformConfig;
    const bondData: BondConfig[] = config.bonds;
    const bondObjs = bondData.map(config => {
      return new Bond(platform, config);
    });

    return bondObjs;
  }

  // Helper to update the device ids of a group of bonds
  public static updateDeviceIds(bonds: Bond[]): Promise<void[]> {
    const ps: Array<Promise<void>> = [];
    bonds.forEach(bond => {
      ps.push(bond.updateDeviceIds());
      ps.push(bond.updateBondId());
    });

    return Promise.all(ps);
  }

  public updateDeviceIds(): Promise<void> {
    return this.api
      .getDeviceIds()
      .then(ids => {
        this.deviceIds = ids;
      })
      .catch(error => {
        this.platform.log.error(`Error getting device ids: ${error}`);
      });
  }

  public updateBondId(): Promise<void> {
    return this.api.getVersion()
      .then(version => {
        this.version = version;
        this.platform.log.debug(`
****** Bond Info *******
 bondId: ${version.bondid}
 FW: ${version.fw_ver}
 API: v${version.api}
 Make: ${version.make}
 Model: ${version.model}\n************************`);
      })
      .catch(error => {
        this.platform.log.error(`Error getting version: ${error}`);
      });
  }

  // ID should be unique across multiple bonds in case device's have the same id across bonds.
  public uniqueDeviceId(deviceId: string): string {
    return `${this.version.bondid}${deviceId}`;
  }
  
  public receivedBPUPPacket(packet: BPUPPacket) {
    this.accessories.forEach(accessory => {
      const device: Device = accessory.accessory.context.device;
      // Topic structure is 'devices/[device_id]/state'
      if(packet.t 
        && packet.t.includes(device.id)
        && packet.t.includes('state')
        && packet.b) {
        const state = packet.b as BondState;
        this.platform.debug(accessory.accessory, 'Received new state: ' + JSON.stringify(state));
        accessory.updateState(state);
      }
    });
  }
}

export interface BondState {
  power?: number;
  speed?: number;
  light?: number;
  up_light?: number;
  down_light?: number;
  direction?: number;
  open?: number;
  brightness?: number;
  flame?: number;
}

export interface BPUPPacket {
  B: string;
  t?: string;
  i?: string;
  f?: number;
  s?: number;
  m?: BPUPMethod;
  x?: string;
  b?: any;
}

export enum BPUPMethod {
  GET = 0,
  POST = 1,
  PUT = 2,
  DELETE = 3,
  PATCH = 4
}