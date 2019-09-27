import { Action } from '../enum/Action';
import { DeviceType } from '../enum/DeviceType';
export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  location: string;
  actions: Action[];
  commands: Command[];
}

export interface Command {
  name: string;
  action: Action;
  argument: number | null;
}

// tslint:disable-next-line: no-namespace
export namespace Device {
  export function isSupported(device: Device): boolean {
    const supported = [DeviceType.CeilingFan];
    return supported.includes(device.type);
  }

  export function CFhasLightbulb(device: Device): boolean {
    const lightbulb = [Action.ToggleLight];
    return device.actions.some(r => lightbulb.includes(r));
  }

  export function CFhasFan(device: Device): boolean {
    const fan = [Action.SetSpeed];
    return device.actions.some(r => fan.includes(r));
  }

  export function CFhasReverseSwitch(device: Device): boolean {
    const fan = [Action.ToggleDirection];
    return device.actions.some(r => fan.includes(r));
  }
}
