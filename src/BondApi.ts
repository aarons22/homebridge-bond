import { Action } from './enum/Action';
import { BondPlatform } from './platform';
import { BondState } from './interface/Bond';
import { BondUri } from './BondUri';
import { CharacteristicValue } from 'homebridge';
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
  private ms_between_actions?: number;
  private queueNextRequest = false;
  private requestQueue: {device: Device, action: Action, body: unknown}[] = [];

  constructor(
    private readonly platform: BondPlatform,
    bondToken: string,
    ipAddress: string,
    ms_between_actions?: number) {
    this.bondToken = bondToken;
    this.uri = new BondUri(ipAddress);
    this.ms_between_actions = ms_between_actions;

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
          responseStatus: error.response?.status,
        });

        return shouldRetry;
      },
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

  private action(device: Device, action: Action, body: unknown = {}): Promise<void> {
    return this.ms_between_actions ? 
      this.queueRequest(device, action, body) :
      this.request(HTTPMethod.PUT, this.uri.action(device.id, action), body);
  }

  private queueRequest(device: Device, action: Action, body: unknown): Promise<void> {
    if (this.queueNextRequest) {
      this.requestQueue.push({device, action, body});
    } else {
      this.queueNextRequest = true;
      this.request(HTTPMethod.PUT, this.uri.action(device.id, action), body);
      setTimeout(() => this.unQueueRequest(), this.ms_between_actions);
    }
    return Promise.resolve();
  }

  private unQueueRequest() {
    const next = this.requestQueue.shift();
    if (next) {
      this.request(HTTPMethod.PUT, this.uri.action(next.device.id, next.action), next.body);
      setTimeout(() => this.unQueueRequest(), this.ms_between_actions);
    } else {
      this.queueNextRequest = false;
    }
  }

  public toggleLight(device: Device): Promise<void> {
    return this.action(device, Action.ToggleLight);
  }

  public toggleUpLight(device: Device): Promise<void> {
    return this.action(device, Action.ToggleUpLight);
  }

  public toggleDownLight(device: Device): Promise<void> {
    return this.action(device, Action.ToggleDownLight);
  }

  public startDimmer(device: Device): Promise<void> {
    return this.action(device, Action.StartDimmer);
  }

  public startUpLightDimmer(device: Device): Promise<void> {
    return this.action(device, Action.StartUpLightDimmer);
  }

  public startDownLightDimmer(device: Device): Promise<void> {
    return this.action(device, Action.StartDownLightDimmer);
  }

  public startIncreasingBrightness(device: Device): Promise<void> {
    return this.action(device, Action.StartIncreasingBrightness);
  }

  public startDecreasingBrightness(device: Device): Promise<void> {
    return this.action(device, Action.StartDecreasingBrightness);
  }

  public setBrightness(device: Device, value: CharacteristicValue): Promise<void> {
    return this.action(device, Action.SetBrightness, { argument: value as number });
  }

  public setFlame(device: Device, value: CharacteristicValue): Promise<void> {
    return this.action(device, Action.SetFlame, { argument: value as number });
  }

  public turnLightOff(device: Device): Promise<void> {
    return this.action(device, Action.TurnLightOff);
  }

  public toggleFan(device: Device, on: CharacteristicValue): Promise<void> {
    const action = on as boolean ? Action.TurnOn : Action.TurnOff;
    return this.action(device, action);
  }

  public toggleDirection(device: Device): Promise<void> {
    return this.action(device, Action.ToggleDirection);
  }

  public togglePower(device: Device): Promise<void> {
    return this.action(device, Action.TogglePower);
  }

  public toggleOpen(device: Device): Promise<void> {
    return this.action(device, Action.ToggleOpen);
  }

  public preset(device: Device): Promise<void> {
    return this.action(device, Action.Preset);
  }

  public stop(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.Stop));
  }

  public setPosition(device: Device, position: number): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.SetPosition), { argument: position });
  }

  public setFanSpeed(device: Device, speed: CharacteristicValue): Promise<void> {
    return this.action(device, Action.SetSpeed, { argument: speed as number });
  }

  public increaseSpeed(device: Device): Promise<void> {
    return this.action(device, Action.IncreaseSpeed, { argument: 1 });
  }

  public decreaseSpeed(device: Device): Promise<void> {
    return this.action(device, Action.DecreaseSpeed, { argument: 1 });
  }

  // State

  public updateState(device: Device, state: BondState): Promise<void> {
    return this.request(HTTPMethod.PATCH, this.uri.state(device.id), state);
  }

  // PATCH: Toggle state property for a device
  public toggleState(device: Device, property: string): Promise<void> {
    return this.getState(device.id)
      .then(state => {
        if(property !== 'open' && property !== 'power' && property !== 'light' ) {
          throw Error(`This device does not have ${property} in it's Bond state`);
        }
        if (state[property] !== undefined) {
          const newState: BondState = {};
          newState[property] = state[property] === 1 ? 0 : 1;
          return this.updateState(device, newState);
        } else {
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
