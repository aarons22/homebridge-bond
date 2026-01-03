import { PlatformConfig } from 'homebridge';
import { BondPlatform } from '../platform';

export interface BondConfig {
  ip_address: string;
  token: string;
  hide_device_ids?: string[];
  ms_between_actions?: number;
}

export interface BondPlatformConfig extends PlatformConfig {
  bonds: BondConfig[];
  include_dimmer?: boolean;
  fan_speed_values?: boolean;
  include_toggle_state?: boolean;
  invert_shade_position?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BondPlatformConfig {
  export function isValid(platform: BondPlatform): boolean {
    const cast = platform.config as BondPlatformConfig;

    function evaluate(type: string, key: string): boolean {
      const value = cast[key];
      if (value !== undefined && typeof(value) !== type) {
        platform.log.error(`${key} has invalid value: ${value}. Expected ${type}, got ${typeof(value)}.`);
        return false;
      }
      return true;
    }

    const validDimmer = evaluate('boolean', 'include_dimmer');
    const validFanSpeed = evaluate('boolean', 'fan_speed_values');
    const validToggleState = evaluate('boolean', 'include_toggle_state');
    const validInvertShadePosition = evaluate('boolean', 'invert_shade_position');

    if (cast.bonds === undefined || cast.bonds.length === 0) {
      platform.log.error('Missing bonds in config');
      return false;
    }

    const bondsValid = cast.bonds.map(bond => {
      return BondConfig.isValid(platform, bond);
    }).every(v => v === true);
    return validDimmer && validFanSpeed && validToggleState && validInvertShadePosition && bondsValid;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BondConfig {
  export function isValid(platform: BondPlatform, config: BondConfig): boolean {
    function evaluate(type: string, key: string, value?: any): boolean {
      if (value === undefined) {
        platform.log.error(`Missing ${key} in BondConfig.`);
        return false;
      }
      if (typeof(value) !== type) {
        platform.log.error(`BondConfig ${key} has invalid value: ${value}. Expected ${type}, got ${typeof(value)}.`);
        return false;
      }
      return true;
    }

    const validIP = evaluate('string', 'ip_address', config.ip_address);
    const validToken = evaluate('string', 'token', config.token);
    let validHideDeviceIds = true;

    if (config.hide_device_ids !== undefined) {
      validHideDeviceIds = config.hide_device_ids.map(id => {
        if (typeof(id) !== 'string') {
          platform.log.error(`hide_device_ids contains invalid value: ${id}. Expected string, got ${typeof(id)}.`);
          return false;
        }
        return true;
      }).every(v => v === true);
    }

    const validSpaceOutActions = config.ms_between_actions === undefined ||
      (typeof(config.ms_between_actions) === 'number' && Number.isInteger(config.ms_between_actions) && config.ms_between_actions > 0);

    return validIP && validToken && validHideDeviceIds && validSpaceOutActions;
  }
}