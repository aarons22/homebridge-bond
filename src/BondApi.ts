import Promise from 'bluebird';
import rp from 'request-promise';
import { BondUri } from './BondUri';
import { Action } from './enum/Action';
import { BondState } from './interface/BondState';
import { Command, Device } from './interface/Device';

enum HTTPMethod {
  GET = 'GET',
  PUT = 'PUT',
}

export class BondApi {
  private bondToken: string;
  private uri: BondUri;

  constructor(private log: (arg0: string) => void, config: { [key: string]: string }) {
    this.bondToken = config.bond_token;
    this.uri = new BondUri(config.bond_ip_address);
  }

  // tslint:disable: object-literal-sort-keys

  public getState(id: string): Promise<BondState> {
    return this.request(HTTPMethod.GET, this.uri.state(id));
  }

  public getDeviceIds(): Promise<string[]> {
    const req = this.request(HTTPMethod.GET, this.uri.deviceIds());
    return req.then((json: {}) =>
      Object.keys(json).filter(x => {
        return x.length > 1;
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
    return this.getCommands(id).then(commands => {
      const req = this.request(HTTPMethod.GET, this.uri.device(id));
      return req.then(json => {
        json.id = id;
        json.commands = commands;
        return json;
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
        return x.length > 1;
      }),
    );
  }

  private getCommand(deviceId: string, commandId: string): Promise<Command> {
    return this.request(HTTPMethod.GET, this.uri.command(deviceId, commandId));
  }

  // Helpers

  private request(method: HTTPMethod, uri: string, body: {} = {}): Promise<any> {
    return rp({
      method,
      uri,
      headers: {
        'BOND-Token': this.bondToken,
      },
      body,
      json: true,
      timeout: 10000,
    })
      .then(json => {
        return json;
      })
      .catch((error: HTTPError) => {
        if (error.name === 'StatusCodeError') {
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
}

interface HTTPError {
  name: string;
  statusCode: number | null;
  error: string | undefined;
}
