import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { Action } from '../../src/enum/Action';
import { Bond } from '../../src/interface/Bond';
import { BondPlatform } from '../../src/platform';
import { DeviceType } from '../../src/enum/DeviceType';
import { FireplaceAccessory } from '../../src/accessories/FireplaceAccessory';
import { PlatformAccessory } from 'homebridge';
import { MockPlatformAccessory, MockCharacteristic, CharacteristicTokens, ServiceTokens } from '../helpers/hapStubs';
import { createMockPlatform, createMockBond } from '../helpers/platformStubs';
import { DeviceFactory } from '../factories/device';

function buildFireplace(actions: Action[], configOverrides?: Record<string, unknown>) {
  const device = DeviceFactory.createDevice({ type: DeviceType.Fireplace, actions });
  const platform = createMockPlatform(configOverrides);
  const accessory = new MockPlatformAccessory(device);
  const bond = createMockBond();
  const acc = new FireplaceAccessory(
    platform as unknown as BondPlatform,
    accessory as unknown as PlatformAccessory,
    bond as unknown as Bond,
  );
  return { acc, bond, platform, accessory, device };
}

describe('FireplaceAccessory', () => {
  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  // Service creation
  // -------------------------------------------------------------------------

  describe('service creation', () => {
    it('creates a Lightbulb service (with flame) when FPhasFlame', () => {
      const { accessory } = buildFireplace([Action.TogglePower, Action.SetFlame]);
      // FlameService uses Lightbulb when FPhasFlame is true
      const svc = accessory.getServiceById(ServiceTokens.Lightbulb, 'Flame');
      expect(svc).to.not.be.undefined;
    });

    it('creates a Switch service (no flame) when not FPhasFlame', () => {
      const { accessory } = buildFireplace([Action.TogglePower]);
      // FlameService uses Switch when device has no SetFlame action
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'Flame');
      expect(svc).to.not.be.undefined;
    });

    it('does NOT create toggleStateService by default', () => {
      const { accessory } = buildFireplace([Action.TogglePower]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.be.undefined;
    });

    it('creates toggleStateService when include_toggle_state is true', () => {
      const { accessory } = buildFireplace([Action.TogglePower], { include_toggle_state: true });
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.not.be.undefined;
    });

    it('logs error when TogglePower action is missing', () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Fireplace, actions: [Action.Stop] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new FireplaceAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );
      sinon.assert.called(platform.error as sinon.SinonStub);
    });
  });

  // -------------------------------------------------------------------------
  // updateState
  // FlameService.updateState only updates the flame brightness characteristic;
  // the power (on) characteristic is driven by observer callbacks, not state updates.
  // -------------------------------------------------------------------------

  describe('updateState()', () => {
    it('updates flame brightness when flame value present', () => {
      const { acc, accessory } = buildFireplace([Action.TogglePower, Action.SetFlame]);
      acc.updateState({ power: 1, flame: 60 });
      const svc = accessory.getServiceById(ServiceTokens.Lightbulb, 'Flame');
      const brightness = svc!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      expect(brightness.value).to.equal(60);
    });

    it('updates flame brightness to a different value', () => {
      const { acc, accessory } = buildFireplace([Action.TogglePower, Action.SetFlame]);
      acc.updateState({ flame: 30 });
      const svc = accessory.getServiceById(ServiceTokens.Lightbulb, 'Flame');
      const brightness = svc!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      expect(brightness.value).to.equal(30);
    });

    it('does not crash when flame absent from state', () => {
      const { acc } = buildFireplace([Action.TogglePower, Action.SetFlame]);
      expect(() => acc.updateState({ power: 1 })).to.not.throw();
    });

    it('does not crash for switch-type fireplace with no flame', () => {
      const { acc } = buildFireplace([Action.TogglePower]);
      expect(() => acc.updateState({ power: 1 })).to.not.throw();
    });
  });

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  describe('observer callbacks', () => {
    it('calls togglePower when fireplace power is toggled', async () => {
      const { accessory, bond, device } = buildFireplace([Action.TogglePower]);
      const switchSvc = accessory.getServiceById(ServiceTokens.Switch, 'Flame');
      const on = switchSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.togglePower as sinon.SinonStub, device);
    });

    it('calls setFlame with value when flame level changes', async () => {
      const { accessory, bond, device } = buildFireplace([Action.TogglePower, Action.SetFlame]);
      const lightSvc = accessory.getServiceById(ServiceTokens.Lightbulb, 'Flame');
      const brightness = lightSvc!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      brightness.value = 0;
      await brightness.simulateSet(50);
      sinon.assert.calledWith(bond.api.setFlame as sinon.SinonStub, device, 50);
    });

    it('does NOT call setFlame when flame value is 0', async () => {
      const { accessory, bond } = buildFireplace([Action.TogglePower, Action.SetFlame]);
      const lightSvc = accessory.getServiceById(ServiceTokens.Lightbulb, 'Flame');
      const brightness = lightSvc!.getCharacteristic(CharacteristicTokens.Brightness) as MockCharacteristic;
      brightness.value = 50;
      await brightness.simulateSet(0);
      sinon.assert.notCalled(bond.api.setFlame as sinon.SinonStub);
    });

    it('calls toggleState for power when toggle button pressed', async () => {
      const { accessory, bond, device } = buildFireplace([Action.TogglePower], { include_toggle_state: true });
      const toggleSvc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      const on = toggleSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);
      sinon.assert.calledWith(bond.api.toggleState as sinon.SinonStub, device, 'power');
    });

    it('fetches initial state on construction', () => {
      const { bond, device } = buildFireplace([Action.TogglePower]);
      sinon.assert.calledWith(bond.api.getState as sinon.SinonStub, device.id);
    });
  });
});
