import { Action } from '../enum/Action';
import { DeviceType } from '../enum/DeviceType';
import { Properties } from './Properties';

export interface Device {
  // Bond API properties
  id: string;
  name: string;
  type: DeviceType;
  location: string;
  actions: Action[];
  properties: Properties;
  commands: Command[] | undefined;

  // homebridge-bond properties
  uniqueId: string;
  bondId: string;
}

export interface Command {
  name: string;
  action: Action;
  argument: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Device {
  export function displayName(device: Device): string {
    return `${device.location} ${device.name}`;
  }

  export function isSupported(device: Device): boolean {
    const supported = [DeviceType.CeilingFan, DeviceType.Generic, DeviceType.Fireplace, DeviceType.Shades, DeviceType.Light];
    return supported.includes(device.type);
  }

  export function HasDimmer(device: Device): boolean {
    const dimmer = [Action.StartDimmer];
    return device.actions.some(r => dimmer.includes(r));
  }

  export function HasSeparateDimmers(device: Device): boolean {
    const required = [Action.StartIncreasingBrightness, Action.StartDecreasingBrightness];
    return required.every(r => device.actions.includes(r));
  }

  export function CFhasLightbulb(device: Device): boolean {
    const lightbulb = [Action.ToggleLight];
    return device.actions.some(r => lightbulb.includes(r));
  }

  export function CFhasUpDownLight(device: Device): boolean {
    const required = [Action.ToggleUpLight, Action.ToggleDownLight];
    return required.every(r => device.actions.includes(r));
  }

  export function canSetSpeed(device: Device): boolean {
    const required = [Action.SetSpeed];
    const hasSetSpeed = required.every(r => device.actions.includes(r));
    const hasMaxSpeed = device.properties.max_speed !== undefined;
    return hasSetSpeed && hasMaxSpeed;
  }

  export function canIncreaseDecreaseSpeed(device: Device): boolean {
    const required = [Action.IncreaseSpeed, Action.DecreaseSpeed];
    return required.every(r => device.actions.includes(r));
  }

  export function hasOffOn(device: Device): boolean {
    const required = [Action.TurnOff, Action.TurnOn];
    return required.every(r => device.actions.includes(r));
  }

  export function hasReverseSwitch(device: Device): boolean {
    const required = [Action.ToggleDirection];
    return required.every(r => device.actions.includes(r));
  }

  export function fanSpeeds(device: Device): number[] {
    if (device.commands) {
      const values = device.commands
        .filter(cmd => {
        // Find all of the commands associated with speed
          return cmd.action === Action.SetSpeed;
        })
        .sort((a, b) => {
        // sort them
          return a.argument! < b.argument! ? 0 : 1;
        })
        .map(cmd => {
        // map down to the raw argument values from that command
          return cmd.argument || 0;
        });

      return values.sort();
    } else if (device.properties.max_speed === undefined || device.properties.max_speed === null) {
      return [];
    } else {
      // Assume speeds 1 - max_speed
      const max_speed = device.properties.max_speed;
      const vals = Array(max_speed)
        .fill(1)
        .map((x, y) => x + y);
      return vals.sort();
    }
  }

  export function GXhasToggle(device: Device): boolean {
    const fan = [Action.TogglePower];
    return device.actions.some(r => fan.includes(r));
  }

  export function FPhasToggle(device: Device): boolean {
    const fan = [Action.TogglePower];
    return device.actions.some(r => fan.includes(r));
  }

  export function MShasToggle(device: Device): boolean {
    const fan = [Action.ToggleOpen];
    return device.actions.some(r => fan.includes(r));
  }

  export function MShasPreset(device: Device): boolean {
    const required = [Action.Preset];
    return required.every(r => device.actions.includes(r));
  }

  export function LThasLightbulb(device: Device): boolean {
    const lightbulb = [Action.ToggleLight];
    return device.actions.some(r => lightbulb.includes(r));
  }

  export function LThasBrightness(device: Device): boolean {
    const required = [Action.SetBrightness, Action.TurnLightOff];
    return required.every(r => device.actions.includes(r));
  }
}
