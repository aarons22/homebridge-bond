import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { Action } from '../../src/enum/Action';
import { Bond } from '../../src/interface/Bond';
import { BondPlatform } from '../../src/platform';
import { CeilingFanAccessory } from '../../src/accessories/CeilingFanAccessory';
import { DeviceType } from '../../src/enum/DeviceType';
import { PlatformAccessory } from 'homebridge';
import { MockPlatformAccessory, MockCharacteristic, CharacteristicTokens, ServiceTokens } from '../helpers/hapStubs';
import { createMockPlatform, createMockBond } from '../helpers/platformStubs';
import { DeviceFactory } from '../factories/device';

const FAN_ACTIONS_BASIC = [Action.TurnOn, Action.TurnOff, Action.SetSpeed];
const FAN_ACTIONS_WITH_LIGHT = [...FAN_ACTIONS_BASIC, Action.ToggleLight];
const FAN_ACTIONS_WITH_UPDOWN = [...FAN_ACTIONS_BASIC, Action.ToggleUpLight, Action.ToggleDownLight];
const FAN_ACTIONS_INC_DEC = [Action.TurnOn, Action.TurnOff, Action.IncreaseSpeed, Action.DecreaseSpeed];

function buildFan(
  actions: Action[],
  maxSpeed?: number,
  configOverrides?: Record<string, unknown>,
  subtype?: string,
) {
  const device = DeviceFactory.createDevice({
    type: DeviceType.CeilingFan,
    actions,
    maxSpeed,
    subtype,
  });
  const platform = createMockPlatform(configOverrides);
  const accessory = new MockPlatformAccessory(device, 'Living Room Fan');
  const bond = createMockBond();
  const acc = new CeilingFanAccessory(
    platform as unknown as BondPlatform,
    accessory as unknown as PlatformAccessory,
    bond as unknown as Bond,
  );
  return { acc, bond, platform, accessory, device };
}

function fanSvc(accessory: MockPlatformAccessory) {
  return accessory.getService(ServiceTokens.Fan)!;
}

function fanOn(accessory: MockPlatformAccessory) {
  return fanSvc(accessory).getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
}

function rotationSpeed(accessory: MockPlatformAccessory) {
  return fanSvc(accessory).getCharacteristic(CharacteristicTokens.RotationSpeed) as MockCharacteristic;
}

function rotationDirection(accessory: MockPlatformAccessory) {
  return fanSvc(accessory).getCharacteristic(CharacteristicTokens.RotationDirection) as MockCharacteristic;
}

describe('CeilingFanAccessory', () => {
  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  // Service creation
  // -------------------------------------------------------------------------

  describe('service creation', () => {
    it('always creates a fan service', () => {
      const { accessory } = buildFan(FAN_ACTIONS_BASIC, 3);
      expect(fanSvc(accessory)).to.not.be.undefined;
    });

    it('adds rotationSpeed when canSetSpeed (SetSpeed + max_speed)', () => {
      const { acc } = buildFan(FAN_ACTIONS_BASIC, 3);
      expect(acc.fanService.rotationSpeed).to.not.be.undefined;
    });

    it('does NOT add rotationSpeed when SetSpeed is missing', () => {
      const { acc } = buildFan([Action.TurnOn, Action.TurnOff], 3);
      expect(acc.fanService.rotationSpeed).to.be.undefined;
    });

    it('does NOT add rotationSpeed when max_speed is missing', () => {
      const { acc } = buildFan(FAN_ACTIONS_BASIC);
      expect(acc.fanService.rotationSpeed).to.be.undefined;
    });

    it('adds rotationDirection when hasReverseSwitch', () => {
      const { acc } = buildFan([...FAN_ACTIONS_BASIC, Action.ToggleDirection], 3);
      expect(acc.fanService.rotationDirection).to.not.be.undefined;
    });

    it('does NOT add rotationDirection without ToggleDirection action', () => {
      const { acc } = buildFan(FAN_ACTIONS_BASIC, 3);
      expect(acc.fanService.rotationDirection).to.be.undefined;
    });

    it('creates lightService when CFhasLightbulb (ToggleLight)', () => {
      const { acc } = buildFan(FAN_ACTIONS_WITH_LIGHT, 3);
      expect(acc.lightService).to.not.be.undefined;
      expect(acc.upLightService).to.be.undefined;
    });

    it('creates upLightService and downLightService when CFhasUpDownLight', () => {
      const { acc } = buildFan(FAN_ACTIONS_WITH_UPDOWN, 3);
      expect(acc.upLightService).to.not.be.undefined;
      expect(acc.downLightService).to.not.be.undefined;
      expect(acc.lightService).to.be.undefined;
    });

    it('creates increaseSpeed and decreaseSpeed buttons when no max_speed + canIncreaseDecreaseSpeed', () => {
      const { acc } = buildFan(FAN_ACTIONS_INC_DEC);
      expect(acc.increaseSpeedService).to.not.be.undefined;
      expect(acc.decreaseSpeedService).to.not.be.undefined;
    });

    it('does NOT create speed buttons when max_speed is defined', () => {
      const { acc } = buildFan([...FAN_ACTIONS_INC_DEC, Action.SetSpeed], 3);
      expect(acc.increaseSpeedService).to.be.undefined;
      expect(acc.decreaseSpeedService).to.be.undefined;
    });

    it('creates dimmerService when include_dimmer=true and HasDimmer', () => {
      const { acc } = buildFan(
        [...FAN_ACTIONS_WITH_LIGHT, Action.StartDimmer],
        3,
        { include_dimmer: true },
      );
      expect(acc.dimmerService).to.not.be.undefined;
    });

    it('does NOT create dimmerService when include_dimmer=false', () => {
      const { acc } = buildFan([...FAN_ACTIONS_WITH_LIGHT, Action.StartDimmer], 3);
      expect(acc.dimmerService).to.be.undefined;
    });

    it('creates increaseBrightnessService and decreaseBrightnessService when include_dimmer + HasSeparateDimmers', () => {
      const { acc } = buildFan(
        [...FAN_ACTIONS_WITH_LIGHT, Action.StartIncreasingBrightness, Action.StartDecreasingBrightness],
        3,
        { include_dimmer: true },
      );
      expect(acc.increaseBrightnessService).to.not.be.undefined;
      expect(acc.decreaseBrightnessService).to.not.be.undefined;
    });

    it('creates toggleLightService button when include_toggle_state=true and has light', () => {
      const { acc } = buildFan(FAN_ACTIONS_WITH_LIGHT, 3, { include_toggle_state: true });
      expect(acc.toggleLightService).to.not.be.undefined;
    });

    it('does NOT create toggleLightService when include_toggle_state=false', () => {
      const { acc } = buildFan(FAN_ACTIONS_WITH_LIGHT, 3);
      expect(acc.toggleLightService).to.be.undefined;
    });
  });

  // -------------------------------------------------------------------------
  // Fan speed calculation
  // -------------------------------------------------------------------------

  describe('fan speed calculation', () => {
    it('calculates minStep as floor(100/numSpeeds) for 3 speeds', () => {
      const { acc } = buildFan(FAN_ACTIONS_BASIC, 3);
      expect(acc.minStep).to.equal(33); // floor(100/3)
    });

    it('calculates maxValue as minStep * numSpeeds', () => {
      const { acc } = buildFan(FAN_ACTIONS_BASIC, 3);
      expect(acc.maxValue).to.equal(99); // 33 * 3
    });

    it('sets minStep=1 and maxValue=numSpeeds when fan_speed_values=true', () => {
      const { acc } = buildFan(FAN_ACTIONS_BASIC, 3, { fan_speed_values: true });
      expect(acc.minStep).to.equal(1);
      expect(acc.maxValue).to.equal(3);
    });
  });

  // -------------------------------------------------------------------------
  // updateState
  // -------------------------------------------------------------------------

  describe('updateState()', () => {
    it('sets fan on when power is 1', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_BASIC, 3);
      acc.updateState({ power: 1 });
      expect(fanOn(accessory).value).to.equal(true);
    });

    it('sets fan off when power is 0', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_BASIC, 3);
      acc.updateState({ power: 0 });
      expect(fanOn(accessory).value).to.equal(false);
    });

    it('calculates correct rotationSpeed step for speed 2 of 3 (minStep=33)', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_BASIC, 3);
      // speed=2 is at index 1 (0-based) in [1,2,3], step = (1+1)*33 = 66
      acc.updateState({ power: 1, speed: 2 });
      expect(rotationSpeed(accessory).value).to.equal(66);
    });

    it('calculates correct rotationSpeed step for speed 3 of 3', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_BASIC, 3);
      // speed=3 is at index 2, step = (2+1)*33 = 99
      acc.updateState({ power: 1, speed: 3 });
      expect(rotationSpeed(accessory).value).to.equal(99);
    });

    it('sets rotationSpeed to 0 when fan is off (power=0)', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_BASIC, 3);
      acc.updateState({ power: 0, speed: 3 });
      expect(rotationSpeed(accessory).value).to.equal(0);
    });

    it('maps direction 1 → rotationDirection 1', () => {
      const { acc, accessory } = buildFan(
        [...FAN_ACTIONS_BASIC, Action.ToggleDirection], 3,
      );
      acc.updateState({ power: 1, direction: 1 });
      expect(rotationDirection(accessory).value).to.equal(1);
    });

    it('maps direction -1 → rotationDirection 0', () => {
      const { acc, accessory } = buildFan(
        [...FAN_ACTIONS_BASIC, Action.ToggleDirection], 3,
      );
      acc.updateState({ power: 1, direction: -1 });
      expect(rotationDirection(accessory).value).to.equal(0);
    });

    it('propagates light state to lightService', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_WITH_LIGHT, 3);
      acc.updateState({ power: 1, light: 1 });
      const lightSvc = accessory.getService(ServiceTokens.Lightbulb);
      const on = lightSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(true);
    });

    it('turns off light when light=0', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_WITH_LIGHT, 3);
      acc.updateState({ power: 1, light: 0 });
      const lightSvc = accessory.getService(ServiceTokens.Lightbulb);
      const on = lightSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(false);
    });

    it('propagates up_light state to upLightService', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_WITH_UPDOWN, 3);
      acc.updateState({ power: 1, light: 1, up_light: 1, down_light: 0 });
      const upLightSvc = accessory.getServiceById(ServiceTokens.Lightbulb, 'UpLight');
      const on = upLightSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(true);
    });

    it('masks up_light when parent light=0', () => {
      const { acc, accessory } = buildFan(FAN_ACTIONS_WITH_UPDOWN, 3);
      acc.updateState({ power: 1, light: 0, up_light: 1 });
      const upLightSvc = accessory.getServiceById(ServiceTokens.Lightbulb, 'UpLight');
      const on = upLightSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  describe('observer callbacks', () => {
    it('calls toggleFan(true) when fan turned on', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_BASIC, 3);
      const on = fanOn(accessory);
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.toggleFan as sinon.SinonStub, device, true);
    });

    it('calls toggleFan(false) when fan turned off', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_BASIC, 3);
      const on = fanOn(accessory);
      on.value = true;
      await on.simulateSet(false);
      sinon.assert.calledWith(bond.api.toggleFan as sinon.SinonStub, device, false);
    });

    it('does NOT call toggleFan when same value set (de-dup)', async () => {
      const { accessory, bond } = buildFan(FAN_ACTIONS_BASIC, 3);
      const on = fanOn(accessory);
      on.value = true;
      await on.simulateSet(true);
      sinon.assert.notCalled(bond.api.toggleFan as sinon.SinonStub);
    });

    it('calls setFanSpeed with correct speed for step', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_BASIC, 3);
      // minStep=33, step=33 → index=0 → speed=1
      const rs = rotationSpeed(accessory);
      rs.value = 0;
      await rs.simulateSet(33);
      sinon.assert.calledWith(bond.api.setFanSpeed as sinon.SinonStub, device, 1);
    });

    it('calls setFanSpeed with speed 2 for second step', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_BASIC, 3);
      // minStep=33, step=66 → index=1 → speed=2
      const rs = rotationSpeed(accessory);
      rs.value = 33;
      await rs.simulateSet(66);
      sinon.assert.calledWith(bond.api.setFanSpeed as sinon.SinonStub, device, 2);
    });

    it('does NOT call setFanSpeed when step is 0 (fan off handled by power)', async () => {
      const { accessory, bond } = buildFan(FAN_ACTIONS_BASIC, 3);
      const rs = rotationSpeed(accessory);
      rs.value = 33;
      await rs.simulateSet(0);
      sinon.assert.notCalled(bond.api.setFanSpeed as sinon.SinonStub);
    });

    it('calls toggleDirection when direction changes', async () => {
      const { accessory, bond, device } = buildFan(
        [...FAN_ACTIONS_BASIC, Action.ToggleDirection], 3,
      );
      const rd = rotationDirection(accessory);
      rd.value = 0;
      await rd.simulateSet(1);
      sinon.assert.calledWith(bond.api.toggleDirection as sinon.SinonStub, device);
    });

    it('calls toggleLight when light characteristic changes', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_WITH_LIGHT, 3);
      const lightSvc = accessory.getService(ServiceTokens.Lightbulb);
      const on = lightSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.toggleLight as sinon.SinonStub, device);
    });

    it('calls toggleState for light when toggle light button pressed', async () => {
      const { accessory, bond, device } = buildFan(
        FAN_ACTIONS_WITH_LIGHT, 3, { include_toggle_state: true },
      );
      const toggleSvc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      const on = toggleSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.toggleState as sinon.SinonStub, device, 'light');
    });

    it('calls startDimmer when dimmer turned on', async () => {
      const { accessory, bond, device } = buildFan(
        [...FAN_ACTIONS_WITH_LIGHT, Action.StartDimmer], 3, { include_dimmer: true },
      );
      const dimmerSvc = accessory.getServiceById(ServiceTokens.Switch, 'Dimmer');
      const on = dimmerSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.startDimmer as sinon.SinonStub, device);
    });

    it('calls stop when dimmer turned off', async () => {
      const { accessory, bond, device } = buildFan(
        [...FAN_ACTIONS_WITH_LIGHT, Action.StartDimmer], 3, { include_dimmer: true },
      );
      const dimmerSvc = accessory.getServiceById(ServiceTokens.Switch, 'Dimmer');
      const on = dimmerSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = true;
      await on.simulateSet(false);
      sinon.assert.calledWith(bond.api.stop as sinon.SinonStub, device);
    });

    it('calls increaseSpeed when increase button pressed', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_INC_DEC);
      // increaseSpeedService is a ButtonService (Switch subtype 'IncreaseSpeed')
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'IncreaseSpeed');
      const on = svc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.increaseSpeed as sinon.SinonStub, device);
    });

    it('calls decreaseSpeed when decrease button pressed', async () => {
      const { accessory, bond, device } = buildFan(FAN_ACTIONS_INC_DEC);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'DecreaseSpeed');
      const on = svc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.decreaseSpeed as sinon.SinonStub, device);
    });

    it('fetches initial state on construction', () => {
      const { bond, device } = buildFan(FAN_ACTIONS_BASIC, 3);
      sinon.assert.calledWith(bond.api.getState as sinon.SinonStub, device.id);
    });
  });
});
