import Promise from 'bluebird';
import rp from 'request-promise';
import { BondUri } from './BondUri';
import { Action } from './enum/Action';
import { FanSpeed } from './enum/FanSpeed';
import { BondState } from './interface/BondState';
import { Command, Device } from './interface/Device';

export class BondApi {
  private bondToken: string;
  private uri: BondUri;

  constructor(private log: (arg0: string) => void, config: { [key: string]: string }) {
    this.bondToken = config.bond_token;
    this.uri = new BondUri(config.bond_ip_address);
  }

  // tslint:disable: object-literal-sort-keys

  public getState(id: string): Promise<BondState> {
    return rp({
      method: 'GET',
      uri: this.uri.state(id),
      headers: {
        'BOND-Token': this.bondToken,
      },
      json: true,
    }).then(json => {
      return json;
    });
  }

  public getDeviceIds(): Promise<string[]> {
    return rp({
      method: 'GET',
      uri: this.uri.deviceIds(),
      headers: {
        'BOND-Token': this.bondToken,
      },
      json: true,
    }).then((json: {}) =>
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
    return rp({
      method: 'PUT',
      uri: this.uri.action(id, Action.ToggleLight),
      headers: {
        'BOND-Token': this.bondToken,
      },
      body: {},
      json: true,
    }).then(() => {
      return;
    });
  }

  public setFanSpeed(id: string, speed: FanSpeed): Promise<void> {
    const action = speed === FanSpeed.off ? Action.TurnOff : Action.SetSpeed;
    let body = {};
    if (action === Action.SetSpeed) {
      body = {
        argument: speed,
      };
    }
    return rp({
      method: 'PUT',
      uri: this.uri.action(id, action),

      headers: {
        'BOND-Token': this.bondToken,
      },
      body,
      json: true,
    }).then(() => {
      return;
    });
  }

  public toggleDirection(id: string): Promise<void> {
    return rp({
      method: 'PUT',
      uri: this.uri.action(id, Action.ToggleDirection),
      headers: {
        'BOND-Token': this.bondToken,
      },
      body: {},
      json: true,
    }).then(() => {
      return;
    });
  }

  private getDevice(id: string): Promise<Device> {
    return this.getCommands(id).then(commands => {
      return rp({
        method: 'GET',
        uri: this.uri.device(id),
        headers: {
          'BOND-Token': this.bondToken,
        },
        json: true,
      }).then(json => {
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
    return rp({
      method: 'GET',
      uri: this.uri.commands(id),
      headers: {
        'BOND-Token': this.bondToken,
      },
      json: true,
    }).then((json: {}) =>
      Object.keys(json).filter(x => {
        return x.length > 1;
      }),
    );
  }

  private getCommand(deviceId: string, commandId: string): Promise<Command> {
    return rp({
      method: 'GET',
      uri: this.uri.command(deviceId, commandId),
      headers: {
        'BOND-Token': this.bondToken,
      },
      json: true,
    }).then(json => {
      return json;
    });
  }
}
