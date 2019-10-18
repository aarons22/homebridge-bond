import Promise from 'bluebird';
import rp from 'request-promise';
import { BondUri } from './BondUri';
import { Action } from './enum/Action';
import { HAP, hap } from './homebridge/hap';
import { BondState } from './interface/BondState';
import { Command, Device } from './interface/Device';
import { Properties } from './interface/Properties';

enum HTTPMethod {
  GET = 'GET',
  PUT = 'PUT',
}

export class BondApi {
  private bondToken: string;
  private uri: BondUri;
  private isDebug: boolean;

  constructor(private log: HAP.Log, bondToken: string, ipAddress: string, debug: boolean) {
    this.bondToken = bondToken;
    this.uri = new BondUri(ipAddress);
    this.isDebug = debug;
  }

  // tslint:disable: object-literal-sort-keys

  public getState(id: string): Promise<BondState> {
    return this.request(HTTPMethod.GET, this.uri.state(id));
  }

  public getDeviceIds(): Promise<string[]> {
    const req = this.request(HTTPMethod.GET, this.uri.deviceIds());
    return req.then((json: {}) =>
      Object.keys(json).filter(x => {
        // Ignore anything that is an empty string or '_'
        return x.length > 0 && x !== '_';
      }),
    );
  }

  public getDevices(ids: string[]): Promise<Device[]> {
    const ps: Array<Promise<Device>> = [];
    ids.forEach(id => {
      ps.push(this.getDevice(id));
    });
    return Promise.all(ps);
  }

  // tslint:disable: object-literal-sort-keys
  public toggleLight(id: string): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.ToggleLight));
  }

  public startDimmer(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.StartDimmer));
  }

  public stop(device: Device): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, Action.Stop));
  }

  public toggleFan(device: Device, on: boolean): Promise<void> {
    const action = on ? Action.TurnOn : Action.TurnOff;
    return this.request(HTTPMethod.PUT, this.uri.action(device.id, action));
  }

  public setFanSpeed(id: string, speed: number): Promise<void> {
    const body = {
      argument: speed,
    };
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.SetSpeed), body);
  }

  public toggleDirection(id: string): Promise<void> {
    return this.request(HTTPMethod.PUT, this.uri.action(id, Action.ToggleDirection));
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
      const ps: Array<Promise<Command>> = [];
      ids.forEach(id => {
        ps.push(this.getCommand(deviceId, id));
      });
      return Promise.all(ps);
    });
  }

  private getCommandIds(id: string): Promise<string[]> {
    const req = this.request(HTTPMethod.GET, this.uri.commands(id));
    return req.then((json: {}) =>
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

  private request(method: HTTPMethod, uri: string, body: {} = {}): Promise<any> {
    if (body !== {}) {
      this.debug(`Request [${method} ${uri}] - body: ${JSON.stringify(body)}`);
    } else {
      this.debug(`Request [${method} ${uri}]`);
    }
    return rp({
      method,
      uri,
      headers: {
        'BOND-Token': this.bondToken,
      },
      body,
      json: true,
      simple: false,
      timeout: 10000,
    })
      .then(json => {
        if (json !== undefined) {
          this.debug(`Response [${method} ${uri}] - ${JSON.stringify(json)}`);
        } else {
          this.debug(`Response [${method} ${uri}]`);
        }
        return json;
      })
      .catch((error: any) => {
        this.debug(`Error [${method} ${uri}] - ${JSON.stringify(error)}`);
        if (error.name !== undefined && error.name === 'StatusCodeError') {
          switch (error.statusCode) {
            case 401:
              this.log('ERR: Unauthorized. Please check your `bond_token` to see if it is correct.');
              return;
            default:
              this.log(`ERR: statusCode ${error.statusCode}`);
          }
        } else {
          this.log(`ERR: A request error occurred: ${error.error}`);
        }
      });
  }

  private debug(message: string) {
    if (this.isDebug) {
      this.log(`DEBUG: ${message}`);
    }
  }
}

interface HTTPError {
  name: string;
  statusCode: number | null;
  error: string | undefined;
}
