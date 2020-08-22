import { Action } from '../enum/Action';
import { DeviceType } from '../enum/DeviceType';
import { Properties } from './Properties';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  location: string;
  actions: Action[];
  properties: Properties;
  commands: Command[] | undefined;
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
    const supported = [DeviceType.CeilingFan, DeviceType.Generic, DeviceType.Fireplace];
    return supported.includes(device.type);
  }

  export function HasDimmer(device: Device): boolean {
    const dimmer = [Action.StartDimmer];
    return device.actions.some(r => dimmer.includes(r));
  }

  export function HasSeparateDimmers(device: Device): boolean {
    const increase = [Action.StartIncreasingBrightness];
    const decrease = [Action.StartDecreasingBrightness];
    const hasIncrease = device.actions.some(r => increase.includes(r));
    const hasDecrease = device.actions.some(r => decrease.includes(r));
    return hasIncrease && hasDecrease;
  }

  export function CFhasLightbulb(device: Device): boolean {
    const lightbulb = [Action.ToggleLight];
    return device.actions.some(r => lightbulb.includes(r));
  }

  export function CFhasUpDownLight(device: Device): boolean {
    const required = [Action.ToggleUpLight, Action.ToggleDownLight];
    return required.every(r => device.actions.includes(r));
  }

  export function CFhasFan(device: Device): boolean {
    const fan = [Action.SetSpeed];
    const hasSetSpeed = device.actions.some(r => fan.includes(r));
    const hasMaxSpeed = device.properties.max_speed !== undefined;
    return hasSetSpeed && hasMaxSpeed;
  }

  export function CFhasReverseSwitch(device: Device): boolean {
    const fan = [Action.ToggleDirection];
    return device.actions.some(r => fan.includes(r));
  }

  export function fanSpeeds(device: Device): number[] {
    if (device.commands === undefined) {
      if (device.properties.max_speed === undefined || device.properties.max_speed === null) {
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
}
