import { BondApi } from '../BondApi';
import { BondPlatform } from '../platform';
import { BondPlatformConfig } from '../interface/config';

export class Bond {
  // Helper to sanitze the config object into bond objects
  public static objects(platform: BondPlatform): Bond[] {
    const config = platform.config as BondPlatformConfig;
    const bondData: Array<{ [key: string]: any }> = config.bonds;
    const bondObjs = bondData.map(val => {
      return new Bond(platform, val.ip_address, val.token, config.debug);
    });

    return bondObjs;
  }

  // Helper to update the device ids of a group of bonds
  public static updateDeviceIds(bonds: Bond[]): Promise<void[]> {
    const ps: Array<Promise<void>> = [];
    bonds.forEach(bond => {
      ps.push(bond.updateDeviceIds());
    });

    return Promise.all(ps);
  }

  public api: BondApi;
  public deviceIds: string[];

  constructor(
    private readonly platform: BondPlatform,
    ipAddress: string,
    token: string,
    debug: boolean) {
    this.api = new BondApi(platform, token, ipAddress, debug);
    this.deviceIds = [];
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
}
