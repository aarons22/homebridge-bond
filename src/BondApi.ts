import { Action } from './enum/Action';
import { BondPlatform } from './platform';
import { BondState } from './interface/Bond';
import { BondUri } from './BondUri';
import { CharacteristicValue, CharacteristicSetCallback } from 'homebridge';
import { Command, Device } from './interface/Device';
import { Properties } from './interface/Properties';
import { Version } from './interface/Version';
import axios, { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import FlakeId from 'flake-idgen';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const intformat = require('biguint-format');

enum HTTPMethod {
  GET = 'get',
  PUT = 'put',
  PATCH = 'patch'
}

const flakeIdGen = new FlakeId();

export class BondApi {
  private bondToken: string;
  private uri: BondUri;

  constructor(
    private readonly platform: BondPlatform,
    bondToken: string,
    ipAddress: string) {
    this.bondToken = bondToken;
    this.uri = new BondUri(ipAddress);

    axiosRetry(axios, {
      retries: 10,
      retryDelay: axiosRetry.exponentialDelay,
      shouldResetTimeout: true,
      retryCondition: (error) => {
        const shouldRetry = axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';

        this.platform.log.debug(`Retrying: ${shouldRetry ? 'YES' : 'NO'}`, {
          url: error.config?.url,
          method: error.config?.method,
          errorCode: error.code,
          responseStatus: error.response?.status
        });

        return shouldRetry;
      }
    });
  }

  // Bond / Device Info

  public getVersion(): Promise<Version> {
    return this.request(HTTPMethod.GET, this.uri.version());
  }

  public getState(id: string): Promise<BondState> {
    return this.request(HTTPMethod.GET, this.uri.state(id));
  }

  public getDeviceIds(): Promise<string[]> {
    const req = this.request(HTTPMethod.GET, this.uri.deviceIds());
    return req.then(json =>
      Object.keys(json).filter(x => {
        // Ignore anything that is an empty string or starts with underscores
        return x.length > 0 && !/^_+/.test(x);
      }),
    );
  }

  public getDevices(ids: string[]): Promise<Device[]> {
    const ps: Promise<Device>[] = [];
    ids.forEach(id => {
      ps.push(this.getDevice(id));
    });
    return Promise.all(ps);
  }

  private getDevice(id: string): Promise<Device> {
    const req = this.request(HTTPMethod.GET, this.uri.device(id));
    return req.then(json => {
      // Set the id since it's not included in the response
      json.id = id;
      // get the properties of the device
      return this.getProperties(id).then(properties => {
        json.properties = properties;
        if (json.commands) {
          // commands are only present on Bridge devices.
          return this.getCommands(id).then(commands => {
            json.commands = commands;
            return json;
          });
        } else {
          return json;
        }
      });
    });
  }

  // Actions

  private action(device: Device, action: Action, callback: CharacteristicSetCallback): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, action))
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  public toggleLight(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.ToggleLight, callback);
  }

  public toggleUpLight(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.ToggleUpLight, callback);
  }

  public toggleDownLight(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.ToggleDownLight, callback);
  }

  public startDimmer(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.StartDimmer, callback);
  }

  public startUpLightDimmer(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.StartUpLightDimmer, callback);
  }

  public startDownLightDimmer(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.StartDownLightDimmer, callback);
  }

  public startIncreasingBrightness(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.StartIncreasingBrightness, callback);
  }

  public startDecreasingBrightness(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.StartDecreasingBrightness, callback);
  }

  public setBrightness(device: Device, value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
    const body = {
      argument: value as number,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.SetBrightness), body)
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  public setFlame(device: Device, value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
    const body = {
      argument: value as number,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.SetFlame), body)
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  public turnLightOff(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.TurnLightOff, callback);
  }

  public toggleFan(device: Device, on: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
    const action = on as boolean ? Action.TurnOn : Action.TurnOff;
    return this.action(device, action, callback);
  }

  public toggleDirection(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.ToggleDirection, callback);
  }

  public togglePower(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.TogglePower, callback);
  }

  public toggleOpen(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.ToggleOpen, callback);
  }

  public preset(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    return this.action(device, Action.Preset, callback);
  }

  public stop(device: Device, callback?: CharacteristicSetCallback): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.Stop))
      .then(() => {
        if (callback) {
          callback(null);
        }
      })
      .catch((error: string) => {
        if (callback) {
          callback(Error(error));
        }
      });
  }

  public setFanSpeed(device: Device, speed: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
    const body = {
      argument: speed as number,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.SetSpeed), body)
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  public increaseSpeed(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    const body = {
      argument: 1,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.IncreaseSpeed), body)
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  public decreaseSpeed(device: Device, callback: CharacteristicSetCallback): Promise<void> {
    const body = {
      argument: 1,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.DecreaseSpeed), body)
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  // State

  public updateState(device: Device, state: BondState, callback: CharacteristicSetCallback): Promise<void> {
    return this.request(HTTPMethod.PATCH, this.uri.state(device.id), state)
      .then(() => {
        callback(null);
      })
      .catch((error: string) => {
        callback(Error(error));
      });
  }

  // PATCH: Toggle state property for a device
  public toggleState(device: Device, property: string, callback: CharacteristicSetCallback): Promise<void> {
    return this.getState(device.id)
      .then(state => {
        if(property !== 'open' && property !== 'power' && property !== 'light' ) {
          callback(null);
          throw Error(`This device does not have ${property} in it's Bond state`);
        }
        if (state[property] !== undefined) {
          const newState: BondState = {};
          newState[property] = state[property] === 1 ? 0 : 1;
          return this.updateState(device, newState, callback);
        } else {
          callback(null);
          throw Error(`This device does not have ${property} in it's Bond state`);
        }
      });
  }

  // Commands

  private getCommands(deviceId: string): Promise<Command[]> {
    return this.getCommandIds(deviceId).then(ids => {
      const ps: Promise<Command>[] = [];
      ids.forEach(id => {
        ps.push(this.getCommand(deviceId, id));
      });
      return Promise.all(ps);
    });
  }

  private getCommandIds(id: string): Promise<string[]> {
    const req = this.request(HTTPMethod.GET, this.uri.commands(id));
    return req.then(json =>
      Object.keys(json).filter(x => {
        // Ignore anything that is an empty string or starts with underscores
        return x.length > 0 && !/^_+/.test(x);
      }),
    );
  }

  private getCommand(deviceId: string, commandId: string): Promise<Command> {
    return this.request(HTTPMethod.GET, this.uri.command(deviceId, commandId));
  }

  // Properties

  private getProperties(id: string): Promise<Properties> {
    return this.request(HTTPMethod.GET, this.uri.properties(id));
  }

  // Helpers

  ping(): Promise<any> {
    const uuid = intformat(flakeIdGen.next(), 'hex', { prefix: '18', padstr: '0', size: 16 }); // avoid duplicate action
    const bondUuid = uuid.substring(0, 13) + uuid.substring(15); // remove '00' used for datacenter/worker in flakeIdGen
    return axios({
      method: HTTPMethod.GET,
      url: this.uri.deviceIds(),
      headers: {
        'BOND-Token': this.bondToken,
        'Bond-UUID': bondUuid,
      },
      timeout: 2000,
    });
  }

  private request(method: HTTPMethod, uri: string, body: unknown = {}): Promise<any> {
    const bodyStr = JSON.stringify(body);
    const uuid = intformat(flakeIdGen.next(), 'hex', { prefix: '18', padstr: '0', size: 16 }); // avoid duplicate action
    const bondUuid = uuid.substring(0, 13) + uuid.substring(15); // remove '00' used for datacenter/worker in flakeIdGen

    if (bodyStr !== '{}') {
      this.platform.log.debug(`Request (${bondUuid}) [${method} ${uri}] - body: ${bodyStr}`);
    } else {
      this.platform.log.debug(`Request (${bondUuid}) [${method} ${uri}]`);
    }

    return axios({
      method,
      url: uri,
      headers: {
        'BOND-Token': this.bondToken,
        'Bond-UUID': bondUuid,
      },
      data: body,
      timeout: 10000,
    })
      .then(response => {
        this.platform.log.debug(`Response (${bondUuid}) [${method} ${uri}] - ${JSON.stringify(response.data)}`);
        return response.data;
      })
      .catch((error: Error | AxiosError) =>  {
        if (axios.isAxiosError(error) && error.response) {
          const response = error.response;
          switch (response.status) {
            case 401:
              this.platform.log.error('Unauthorized. Please check the `token` in your config to see if it is correct.');
              return;
            default:
              this.platform.log.error(`A request error occurred: [status] ${response.status} [statusText] ${response.statusText}`);
          }
        } else {
          this.platform.log.error(`A request error occurred: ${JSON.stringify(error)}`);
        }
      });
  }
}
