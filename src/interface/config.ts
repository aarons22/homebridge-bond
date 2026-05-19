import { PlatformConfig } from 'homebridge';
import { BondPlatform } from '../platform';

export interface BondConfig {
  ip_address: string;
  token: string;
  hide_device_ids?: string[];
  ms_between_actions?: number;
  max_concurrent_requests?: number;
}

export interface BondPlatformConfig extends PlatformConfig {
  bonds: BondConfig[];
  include_dimmer?: boolean;
  fan_speed_values?: boolean;
  include_toggle_state?: boolean;
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

    if (cast.bonds === undefined || cast.bonds.length === 0) {
      platform.log.error('Missing bonds in config');
      return false;
    }

    const bondsValid = cast.bonds.map(bond => {
      return BondConfig.isValid(platform, bond);
    }).every(v => v === true);
    return validDimmer && validFanSpeed && validToggleState && bondsValid;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BondConfig {
  function isValidBondHost(ipAddress: string): boolean {
    if (ipAddress.trim() !== ipAddress || ipAddress.length === 0) {
      return false;
    }

    if (/[/?#\\]/.test(ipAddress)) {
      return false;
    }

    try {
      const parsed = new URL(`http://${ipAddress}`);
      if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
        return false;
      }

      if (parsed.username.length > 0 || parsed.password.length > 0) {
        return false;
      }

      return parsed.hostname.length > 0;
    } catch (_error) {
      return false;
    }
  }

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

    const validIPType = evaluate('string', 'ip_address', config.ip_address);
    const validIP = validIPType && isValidBondHost(config.ip_address);
    if (validIPType && !validIP) {
      platform.log.error(`BondConfig ip_address has invalid value: ${config.ip_address}. Expected host or IP with optional port only.`);
    }
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
    const validMaxConcurrentRequests = config.max_concurrent_requests === undefined ||
      (typeof(config.max_concurrent_requests) === 'number'
        && Number.isInteger(config.max_concurrent_requests)
        && config.max_concurrent_requests > 0);

    return validIP && validToken && validHideDeviceIds && validSpaceOutActions && validMaxConcurrentRequests;
  }
}
