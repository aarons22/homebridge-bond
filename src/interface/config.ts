import { PlatformConfig } from 'homebridge';

export interface BondConfig {
  ip_address: string;
  token: string;
}

export interface BondPlatformConfig extends PlatformConfig {
  bonds: BondConfig[];
  debug: boolean;
  include_dimmer: boolean;
  fan_speed_values: boolean;
}
