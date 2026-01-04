import { expect } from 'chai';
import 'mocha';
import { Action } from '../src/enum/Action';
import { DeviceType } from '../src/enum/DeviceType';
import { Device } from '../src/interface/Device';
import { DeviceFactory } from './factories/device';

describe('displayName', () => {
  it('is correct', () => {
    const device = DeviceFactory.createDevice();
    expect(Device.displayName(device)).equal('location name');
  }); 
});

describe('isSupported', () => {
  it('ceiling fan', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.CeilingFan });
    expect(Device.isSupported(device)).equal(true);
  });
  
  it('shades', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Shades });
    expect(Device.isSupported(device)).equal(true);
  });

  it('generic', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Generic });
    expect(Device.isSupported(device)).equal(true);
  });

  it('fireplace', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Fireplace });
    expect(Device.isSupported(device)).equal(true);
  });

  it('light', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Light });
    expect(Device.isSupported(device)).equal(true);
  }); 
});

describe('HasDimmer', () => {
  it('has dimmer', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.StartDimmer] });
    expect(Device.HasDimmer(device)).equal(true);
  });
  
  it('does not have dimmer', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.HasDimmer(device)).equal(false);
  });
});

describe('HasSeparateDimmers', () => {
  it('has dimmer', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.StartIncreasingBrightness, Action.StartDecreasingBrightness] });
    expect(Device.HasSeparateDimmers(device)).equal(true);
  });
  
  it('does not have separate dimmers', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.HasSeparateDimmers(device)).equal(false);
  });
});

describe('CFhasLightbulb', () => {
  it('has lightbulb', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.ToggleLight] });
    expect(Device.CFhasLightbulb(device)).equal(true);
  });
  
  it('does not have lightbulb', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.CFhasLightbulb(device)).equal(false);
  });
});

describe('CFhasUpDownLight', () => {
  it('has up down light', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.ToggleUpLight, Action.ToggleDownLight] });
    expect(Device.CFhasUpDownLight(device)).equal(true);
  });
  
  it('does not have up down light', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.CFhasUpDownLight(device)).equal(false);
  });
});

describe('canSetSpeed', () => {
  it('can set speed', () => {
    const device = DeviceFactory.createDevice({ 
      actions: [Action.Stop, Action.SetSpeed],
      maxSpeed: 1,
    });
    expect(Device.canSetSpeed(device)).equal(true);
  });
  
  it('does not have set speed', () => {
    const device = DeviceFactory.createDevice({ 
      actions: [Action.Stop],
      maxSpeed: 1,
    });
    expect(Device.canSetSpeed(device)).equal(false);
  });

  it('does not have max speed', () => {
    const device = DeviceFactory.createDevice({ 
      actions: [Action.Stop, Action.SetSpeed],
    });
    expect(Device.canSetSpeed(device)).equal(false);
  });
});

describe('canIncreaseDecreaseSpeed', () => {
  it('can increase and decrease speed', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.IncreaseSpeed, Action.DecreaseSpeed] });
    expect(Device.canIncreaseDecreaseSpeed(device)).equal(true);
  });
  
  it('cannnot increase and decrease speed', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.canIncreaseDecreaseSpeed(device)).equal(false);
  });
});

describe('hasOffOn', () => {
  it('has off on', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.TurnOff, Action.TurnOn] });
    expect(Device.hasOffOn(device)).equal(true);
  });
  
  it('does not have off on', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.hasOffOn(device)).equal(false);
  });
});

describe('hasReverseSwitch', () => {
  it('has reverse switch', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.ToggleDirection] });
    expect(Device.hasReverseSwitch(device)).equal(true);
  });
  
  it('does not have reverse switch', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.hasReverseSwitch(device)).equal(false);
  });
});

describe('GXhasToggle', () => {
  it('has toggle', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.TogglePower] });
    expect(Device.GXhasToggle(device)).equal(true);
  });
  
  it('does not have toggle', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.GXhasToggle(device)).equal(false);
  });
});

describe('FPhasToggle', () => {
  it('has toggle', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.TogglePower] });
    expect(Device.FPhasToggle(device)).equal(true);
  });
  
  it('does not have toggle', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.FPhasToggle(device)).equal(false);
  });
});

describe('FPhasFlame', () => {
  it('has flame and toggle power', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.SetFlame, Action.TogglePower] });
    expect(Device.FPhasFlame(device)).equal(true);
  });
  
  it('does not have flame and toggle power', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.TogglePower] });
    expect(Device.FPhasFlame(device)).equal(false);
  });
});

describe('MShasToggle', () => {
  it('has toggle', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.ToggleOpen] });
    expect(Device.MShasToggle(device)).equal(true);
  });
  
  it('does not have toggle', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.MShasToggle(device)).equal(false);
  });
});

describe('MShasPreset', () => {
  it('has preset', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.Preset] });
    expect(Device.MShasPreset(device)).equal(true);
  });
  
  it('does not have preset', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.MShasPreset(device)).equal(false);
  });
});

describe('LThasLightbulb', () => {
  it('has lightbulb', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.ToggleLight] });
    expect(Device.LThasLightbulb(device)).equal(true);
  });
  
  it('does not have lightbulb', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.LThasLightbulb(device)).equal(false);
  });
});

describe('LThasBrightness', () => {
  it('has brightness', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.SetBrightness, Action.TurnLightOff] });
    expect(Device.LThasBrightness(device)).equal(true);
  });
  
  it('does not have brightness', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.LThasBrightness(device)).equal(false);
  });
});

describe('fanSpeeds', () => {
  context('has commands', () => {
    it('returns correct values', () => {
      const device = DeviceFactory.createFanWithSpeeds([1,2,3]);
      expect(Device.fanSpeeds(device)).to.deep.equal([1,2,3]);
    });

    it('returns correct values', () => {
      const device = DeviceFactory.createFanWithSpeeds([1,2,4]);
      expect(Device.fanSpeeds(device)).to.deep.equal([1,2,4]);
    });
  });

  context('does not have commands', () => {
    context('has max speed', () => {
      it('returns correct values', () => {
        const device = DeviceFactory.createDevice({maxSpeed: 6});
        expect(Device.fanSpeeds(device)).to.deep.equal([1,2,3,4,5,6]);
      });
    });

    context('does not have max speed', () => {
      it('returns empty array', () => {
        const device = DeviceFactory.createDevice();
        expect(Device.fanSpeeds(device)).to.deep.equal([]);
      });
    });
  });
});

describe('MShasPosition', () => {
  it('has position', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop, Action.SetPosition] });
    expect(Device.MShasPosition(device)).equal(true);
  });
  
  it('does not have position', () => {
    const device = DeviceFactory.createDevice({ actions: [Action.Stop] });
    expect(Device.MShasPosition(device)).equal(false);
  });
});

describe('MSisAwning', () => {
  it('is awning when subtype is AWNING', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Shades, subtype: 'AWNING' });
    expect(Device.MSisAwning(device)).equal(true);
  });
  
  it('is not awning when subtype is different', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Shades, subtype: 'ROLLER' });
    expect(Device.MSisAwning(device)).equal(false);
  });
  
  it('is not awning when subtype is undefined', () => {
    const device = DeviceFactory.createDevice({ type: DeviceType.Shades });
    expect(Device.MSisAwning(device)).equal(false);
  });
});