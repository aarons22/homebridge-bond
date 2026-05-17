import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { Action } from '../../src/enum/Action';
import { Bond } from '../../src/interface/Bond';
import { BondPlatform } from '../../src/platform';
import { DeviceType } from '../../src/enum/DeviceType';
import { LightAccessory } from '../../src/accessories/LightAccessory';
import { PlatformAccessory } from 'homebridge';
import { MockPlatformAccessory, MockCharacteristic, CharacteristicTokens, ServiceTokens } from '../helpers/hapStubs';
import { createMockPlatform, createMockBond } from '../helpers/platformStubs';
import { DeviceFactory } from '../factories/device';

function buildLight(actions: Action[], configOverrides?: Record<string, unknown>) {
  const device = DeviceFactory.createDevice({ type: DeviceType.Light, actions });
  const platform = createMockPlatform(configOverrides);
  const accessory = new MockPlatformAccessory(device);
  const bond = createMockBond();
  const acc = new LightAccessory(
    platform as unknown as BondPlatform,
    accessory as unknown as PlatformAccessory,
    bond as unknown as Bond,
  );
  return { acc, bond, platform, accessory };
}

function lightSvc(accessory: MockPlatformAccessory) {
  return accessory.getService(ServiceTokens.Lightbulb);
}

describe('LightAccessory', () => {
  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  // Service creation
  // -------------------------------------------------------------------------

  describe('service creation', () => {
    it('always creates a lightbulb service', () => {
      const { accessory } = buildLight([Action.ToggleLight]);
      expect(lightSvc(accessory)).to.not.be.undefined;
    });

    it('does NOT create toggleLightService by default', () => {
      const { accessory } = buildLight([Action.ToggleLight]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.be.undefined;
    });

    it('creates toggleLightService when include_toggle_state is true', () => {
      const { accessory } = buildLight([Action.ToggleLight], { include_toggle_state: true });
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.not.be.undefined;
    });

    it('logs error when ToggleLight action is missing', () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Light, actions: [Action.Stop] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new LightAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );
      sinon.assert.called(platform.error as sinon.SinonStub);
    });
  });

  // -------------------------------------------------------------------------
  // updateState
  // -------------------------------------------------------------------------

  describe('updateState()', () => {
    it('turns on when light is 1', () => {
      const { acc, accessory } = buildLight([Action.ToggleLight]);
      acc.updateState({ light: 1 });
      const on = lightSvc(accessory)!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(true);
    });

    it('turns off when light is 0', () => {
      const { acc, accessory } = buildLight([Action.ToggleLight]);
      acc.updateState({ light: 0 });
      const on = lightSvc(accessory)!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(false);
    });

    it('updates brightness when LThasBrightness', () => {
      const { acc, accessory } = buildLight([Action.ToggleLight, Action.SetBrightness, Action.TurnLightOff]);
      acc.updateState({ light: 1, brightness: 75 });
      const brightness = lightSvc(accessory)!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      expect(brightness.value).to.equal(75);
    });

    it('does not crash when brightness absent from state', () => {
      const { acc } = buildLight([Action.ToggleLight, Action.SetBrightness, Action.TurnLightOff]);
      expect(() => acc.updateState({ light: 1 })).to.not.throw();
    });
  });

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  describe('observer callbacks', () => {
    it('calls toggleLight when light turned on', async () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Light, actions: [Action.ToggleLight] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new LightAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );

      const on = lightSvc(accessory)!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);

      sinon.assert.calledOnce(bond.api.toggleLight as sinon.SinonStub);
    });

    it('calls setBrightness with value when brightness changes', async () => {
      const device = DeviceFactory.createDevice({
        type: DeviceType.Light,
        actions: [Action.ToggleLight, Action.SetBrightness, Action.TurnLightOff],
      });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new LightAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );

      const brightness = lightSvc(accessory)!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      brightness.value = 0;
      await brightness.simulateSet(75);

      sinon.assert.calledWith(bond.api.setBrightness as sinon.SinonStub, device, 75);
    });

    it('does NOT call setBrightness when brightness is 0', async () => {
      const device = DeviceFactory.createDevice({
        type: DeviceType.Light,
        actions: [Action.ToggleLight, Action.SetBrightness, Action.TurnLightOff],
      });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new LightAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );

      const brightness = lightSvc(accessory)!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      brightness.value = 50;
      await brightness.simulateSet(0);

      sinon.assert.notCalled(bond.api.setBrightness as sinon.SinonStub);
    });

    it('calls toggleState for light when toggle button pressed', async () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Light, actions: [Action.ToggleLight] });
      const platform = createMockPlatform({ include_toggle_state: true });
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new LightAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );

      const toggleSvc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      const on = toggleSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);

      sinon.assert.calledWith(bond.api.toggleState as sinon.SinonStub, device, 'light');
    });
  });
});
