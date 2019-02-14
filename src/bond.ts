import * as request from 'request-promise';
import * as Promise from 'bluebird';

export interface Session {
  key: string;
  token: string;
}

export interface Command {
  id: number;
  name: string;
  propertyId: string;
}

export interface Device {
  id: number;
  type: string;
  room: string;
  propertyId: string;
  commands: Command[];
  bondId: string;
}

export class Bond {
  public id: string;
  public devices: Device[];
  private sequence: number = 0;

  constructor(response: any) {
    this.id = response.id;
    let commandMap = new Map<number, any>();
    for (let obj of response.commands) {
      if (commandMap.has(obj.device)) {
        var cmds = commandMap.get(obj.device);
        cmds.push(obj);
        commandMap.set(obj.device, cmds);
      } else {
        commandMap.set(obj.device, [obj]);
      }
    }
    var devices: Device[] = [];
    for (let [deviceId, objs] of commandMap.entries()) {
      var commands: Command[] = [];
      for (let obj of objs) {
        commands.push(<Command>{
          id: obj.id,
          name: obj.command_type,
          propertyId: obj.device_property_command_id
        });
      }
      devices.push(<Device>{
        id: objs[0].id,
        type: objs[0].device_type,
        room: objs[0].location_type,
        propertyId: objs[0].device_property_id,
        commands: commands,
        bondId: this.id
      });
    }
    this.devices = devices;
  }

  public powerOffCommand(device: Device): Command {
    return device.commands
      .filter(command => {
        return command.name == "Power Toggle";
      })[0];
  }

  public powerOnCommand(device: Device): Command {
    return this.sortedSpeedCommands(device)[0];
  }

  public commandForName(device: Device, name: string): Command {
    return (device.commands
      .filter(command => {
        return command.name == name;
      }) || [null])[0];
  }

  public sortedSpeedCommands(device: Device): Command[] {
    return device.commands
      .filter(command => {
        return command.name.startsWith("Speed ");
      })
      .sort((a, b) => {
        return parseInt(a.name.replace(/[^\d.]/g, '')) > parseInt(b.name.replace(/[^\d.]/g, '')) ? 1 : -1;
      });
  }

  public sendCommand(session: Session, command: Command, device: Device): Promise<void> {
    this.sequence++;
    let url = "https://" + this.id + ":4433/api/v1/device/" + (parseInt(device.propertyId) - 1) + "/device_property/" + device.propertyId + "/device_property_command/" + command.propertyId + "/run";

    return request({
        method: 'GET',
        uri: url,
        rejectUnauthorized: false,
        headers: {
          'X-Token': session.token,
          'X-Sequence': this.sequence,
          'X-BondDate': (new Date()).toISOString().split(".")[0] + "Z"
         }
      })
      .then(response => {
        return;
      });
  }
}
