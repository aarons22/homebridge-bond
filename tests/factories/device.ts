import { Command, Device } from '../../src/interface/Device';
import { Action } from '../../src/enum/Action';
import { DeviceType } from '../../src/enum/DeviceType';

export class DeviceFactory {
  static createDevice(params?: DeviceParams): Device {
    return {
      'id': params?.id ?? '1234',
      'name': params?.name ?? 'name',
      'type': params?.type ?? DeviceType.CeilingFan,
      'subtype': params?.subtype,
      'location': params?.location ?? 'location',
      'actions': params?.actions ?? [Action.StartDimmer, Action.Stop, Action.IncreaseSpeed],
      'properties': {
        'max_speed': params?.maxSpeed,
      },
      'commands': params?.commands,
      'uniqueId': params?.uniqueId ?? 'uniqueId',
      'bondId': params?.bondId ?? 'bondId',
    } as Device;
  }

  static createFanWithSpeeds(speeds: number[]): Device {
    const commands = speeds.map(speed => {
      return DeviceFactory.createCommand({ action: Action.SetSpeed, argument: speed });
    });
    return DeviceFactory.createDevice({ commands: commands});
  }

  static createCommand(params?: CommandParams): Command {
    return {
      'name': params?.name ?? 'Light',
      'action': params?.action ?? Action.SetSpeed,
      'argument': params?.argument,
    } as Command;
  }
}

interface DeviceParams {
  id?: string
  location?: string
  name?: string
  type?: DeviceType
  subtype?: string
  actions?: Action[]
  maxSpeed?: number
  commands?: Command[]
  uniqueId?: string
  bondId?: string
}

interface CommandParams {
  name?: string
  action?: Action
  argument?: number
}