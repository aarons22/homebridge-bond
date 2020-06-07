import { BondApi } from '../BondApi';
import { BondConfig } from './config';
import { BondPlatform } from '../platform';
import { BondPlatformConfig } from '../interface/config';
import { Version } from './Version';

export class Bond {
  // Helper to sanitze the config object into bond objects
  public static objects(platform: BondPlatform): Bond[] {
    const config = platform.config as BondPlatformConfig;
    const bondData: BondConfig[] = config.bonds;
    const bondObjs = bondData.map(val => {
      return new Bond(platform, val.ip_address, val.token);
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

  public api: BondApi;
  public deviceIds: string[] = [];
  public version!: Version;

  constructor(
    private readonly platform: BondPlatform,
    ipAddress: string,
    token: string) {
    this.api = new BondApi(platform, token, ipAddress);
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
 Make: ${version.model}
 Model: ${version.model}\n************************`);
      })
      .catch(error => {
        this.platform.log.error(`Error getting version: ${error}`);
      });
  }
}
