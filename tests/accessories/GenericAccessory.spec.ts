import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { Action } from '../../src/enum/Action';
import { Bond } from '../../src/interface/Bond';
import { BondPlatform } from '../../src/platform';
import { DeviceType } from '../../src/enum/DeviceType';
import { GenericAccessory } from '../../src/accessories/GenericAccessory';
import { PlatformAccessory } from 'homebridge';
import { MockPlatformAccessory, MockCharacteristic, CharacteristicTokens, ServiceTokens } from '../helpers/hapStubs';
import { createMockPlatform, createMockBond } from '../helpers/platformStubs';
import { DeviceFactory } from '../factories/device';

function makeAccessory(actions: Action[], configOverrides?: Record<string, unknown>) {
  const device = DeviceFactory.createDevice({ type: DeviceType.Generic, actions });
  const platform = createMockPlatform(configOverrides) as unknown as BondPlatform;
  const accessory = new MockPlatformAccessory(device) as unknown as PlatformAccessory;
  const bond = createMockBond();
  const acc = new GenericAccessory(platform, accessory, bond as unknown as Bond);
  return { acc, bond, platform: createMockPlatform(configOverrides), accessory: accessory as unknown as MockPlatformAccessory };
}

describe('GenericAccessory', () => {
  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  // Service creation
  // -------------------------------------------------------------------------

  describe('service creation', () => {
    it('creates a switch service', () => {
      const { accessory } = makeAccessory([Action.TogglePower]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'Power');
      expect(svc).to.not.be.undefined;
    });

    it('does NOT create toggleStateService by default', () => {
      const { accessory } = makeAccessory([Action.TogglePower]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.be.undefined;
    });

    it('creates toggleStateService when include_toggle_state is true', () => {
      const { accessory } = makeAccessory([Action.TogglePower], { include_toggle_state: true });
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.not.be.undefined;
    });

    it('logs error when TogglePower action is missing', () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Generic, actions: [Action.Stop] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device) as unknown as PlatformAccessory;
      const bond = createMockBond();
      new GenericAccessory(platform as unknown as BondPlatform, accessory, bond as unknown as Bond);
      sinon.assert.called(platform.error as sinon.SinonStub);
    });
  });

  // -------------------------------------------------------------------------
  // updateState
  // -------------------------------------------------------------------------

  describe('updateState()', () => {
    it('sets switch on when power is 1', () => {
      const { acc, accessory } = makeAccessory([Action.TogglePower]);
      acc.updateState({ power: 1 });
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'Power');
      const on = svc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(true);
    });

    it('sets switch off when power is 0', () => {
      const { acc, accessory } = makeAccessory([Action.TogglePower]);
      acc.updateState({ power: 0 });
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'Power');
      const on = svc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      expect(on.value).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  describe('observer callbacks', () => {
    it('calls togglePower when switch is toggled', async () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Generic, actions: [Action.TogglePower] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device) as unknown as PlatformAccessory;
      const bond = createMockBond();
      new GenericAccessory(platform as unknown as BondPlatform, accessory, bond as unknown as Bond);

      const switchSvc = (accessory as unknown as MockPlatformAccessory).getServiceById(ServiceTokens.Switch, 'Power');
      const on = switchSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);

      sinon.assert.calledOnce(bond.api.togglePower as sinon.SinonStub);
    });

    it('does not call togglePower when same value is set (de-dup)', async () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Generic, actions: [Action.TogglePower] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device) as unknown as PlatformAccessory;
      const bond = createMockBond();
      new GenericAccessory(platform as unknown as BondPlatform, accessory, bond as unknown as Bond);

      const switchSvc = (accessory as unknown as MockPlatformAccessory).getServiceById(ServiceTokens.Switch, 'Power');
      const on = switchSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(false); // same value

      sinon.assert.notCalled(bond.api.togglePower as sinon.SinonStub);
    });

    it('calls toggleState for power when toggle button pressed', async () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Generic, actions: [Action.TogglePower] });
      const platform = createMockPlatform({ include_toggle_state: true });
      const accessory = new MockPlatformAccessory(device) as unknown as PlatformAccessory;
      const bond = createMockBond();
      new GenericAccessory(platform as unknown as BondPlatform, accessory, bond as unknown as Bond);

      const toggleSvc = (accessory as unknown as MockPlatformAccessory).getServiceById(ServiceTokens.Switch, 'ToggleState');
      const on = toggleSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);

      sinon.assert.calledWith(bond.api.toggleState as sinon.SinonStub, device, 'power');
    });

    it('fetches initial state on construction', () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Generic, actions: [Action.TogglePower] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device) as unknown as PlatformAccessory;
      const bond = createMockBond();
      new GenericAccessory(platform as unknown as BondPlatform, accessory, bond as unknown as Bond);

      sinon.assert.calledWith(bond.api.getState as sinon.SinonStub, device.id);
    });
  });
});
