import { BondUri } from './BondUri';
import { Action } from './enum/Action';
import { BondPlatform } from './platform';
import { BondState } from './interface/BondState';
import { Command, Device } from './interface/Device';
import { Properties } from './interface/Properties';
import { Version } from './interface/Version';
import { CharacteristicValue } from 'homebridge';
import axios from 'axios';
import FlakeId from 'flake-idgen';
import intformat from 'biguint-format';

enum HTTPMethod {
  GET = 'get',
  PUT = 'put',
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
  }

  // tslint:disable: object-literal-sort-keys

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
        // Ignore anything that is an empty string or '_'
        return x.length > 0 && x !== '_';
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

  // tslint:disable: object-literal-sort-keys
  public toggleLight(id: string): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.ToggleLight));
  }

  public toggleUpLight(id: string): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.ToggleUpLight));
  }

  public toggleDownLight(id: string): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.ToggleDownLight));
  }

  public startDimmer(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.StartDimmer));
  }

  public startIncreasingBrightness(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.StartIncreasingBrightness));
  }

  public startDecreasingBrightness(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.StartDecreasingBrightness));
  }

  public stop(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.Stop));
  }

  public toggleFan(device: Device, on: CharacteristicValue): Promise<void> {
    const action = on as boolean ? Action.TurnOn : Action.TurnOff;
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, action));
  }

  public setFanSpeed(id: string, speed: CharacteristicValue): Promise<void> {
    const body = {
      argument: speed as number,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.SetSpeed), body);
  }

  public toggleDirection(id: string): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.ToggleDirection));
  }

  public togglePower(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.TogglePower));
  }

  private getDevice(id: string): Promise<Device> {
    const req = this.request(HTTPMethod.GET, this.uri.device(id));
    return req.then(json => {
      // Set the id since it's not included in the response
      json.id = id;
      // get the properties of the device
      return this.getProperties(id).then(properties => {
        json.properties = properties;
        if (json.commands === undefined) {
          return json;
        } else {
          // commands are only present on Bridge devices.
          return this.getCommands(id).then(commands => {
            json.commands = commands;
            return json;
          });
        }
      });
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
        // Ignore anything that is an empty string or '_'
        return x.length > 0 && x !== '_';
      }),
    );
  }

  private getCommand(deviceId: string, commandId: string): Promise<Command> {
    return this.request(HTTPMethod.GET, this.uri.command(deviceId, commandId));
  }

  // Properties

  private getProperties(id: string): Promise<Properties> {
    const req = this.request(HTTPMethod.GET, this.uri.properties(id));
    return req.then(json => {
      return json;
    });
  }

  // Helpers

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
      .catch(error => {
        this.platform.log.debug(`Error (${bondUuid}) [${method} ${uri}] - ${JSON.stringify(error)}`);
        if (error.name !== undefined && error.name === 'StatusCodeError') {
          switch (error.statusCode) {
            case 401:
              this.platform.log.error('Unauthorized. Please check your `bond_token` to see if it is correct.');
              return;
            default:
              this.platform.log.error(`statusCode ${error.statusCode}`);
          }
        } else {
          this.platform.log.error(`A request error occurred: ${error.error}`);
        }
      });
  }
}

interface HTTPError {
  name: string;
  statusCode: number | null;
  error: string | undefined;
}
