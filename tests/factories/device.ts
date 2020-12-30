import { Device } from '../../src/interface/Device';
import { Action } from '../../src/enum/Action';
import { DeviceType } from '../../src/enum/DeviceType';

export class DeviceFactory {
  static createDevice(params?: NameParams): Device {
    return {
      'id': params?.id ?? '1234',
      'name': params?.name ?? 'name',
      'type': params?.type ?? DeviceType.CeilingFan,
      'location': params?.location ?? 'location',
      'actions': params?.actions ?? [Action.StartDimmer, Action.Stop, Action.IncreaseSpeed],
      'properties': {
        'max_speed': params?.maxSpeed,
      },
      'uniqueId': params?.uniqueId ?? 'uniqueId',
      'bondId': params?.bondId ?? 'bondId',
    } as Device;
  }
}

interface NameParams {
  id?: string
  location?: string
  name?: string
  type?: DeviceType
  actions?: Action[]
  maxSpeed?: number
  uniqueId?: string
  bondId?: string
}