import { Version } from '../../src/interface/Version';

export class VersionFactory {
  static create(overrides?: Partial<Version>): Version {
    return {
      api: 2,
      bondid: 'ZZBB12345678',
      fw_ver: 'v3.10.0',
      target: 'zz_z5',
      make: 'Bond',
      model: 'BD-1000',
      mcu_ver: '1.2.3',
      ...overrides,
    };
  }
}
