import Promise from 'bluebird';
import { BondApi } from '../BondApi';
import { HAP } from '../homebridge/hap';
import { BondPlatformConfig } from '../interface/config';

export class Bond {
  // Helper to sanitze the config object into bond objects
  public static objects(log: HAP.Log, config: BondPlatformConfig): Bond[] {
    const bondData: Array<{ [key: string]: any }> = config.bonds;
    const bondObjs = bondData.map(val => {
      return new Bond(log, val.ip_address, val.token, config.debug);
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

  // public ipAddress: string;
  // public token: string;
  public api: BondApi;
  public deviceIds: string[];

  constructor(private log: HAP.Log, ipAddress: string, token: string, debug: boolean) {
    // this.ipAddress = ipAddress;
    // this.token = token;
    this.api = new BondApi(log, token, ipAddress, debug);
    this.deviceIds = [];
  }

  public updateDeviceIds(): Promise<void> {
    return this.api
      .getDeviceIds()
      .then(ids => {
        this.deviceIds = ids;
      })
      .catch(error => {
        this.log.error(`Error getting device ids: ${error}`);
      });
  }
}
