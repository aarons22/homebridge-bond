import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { Action } from '../../src/enum/Action';
import { Bond } from '../../src/interface/Bond';
import { BondPlatform } from '../../src/platform';
import { DeviceType } from '../../src/enum/DeviceType';
import { ShadesAccessory } from '../../src/accessories/ShadesAccessory';
import { PlatformAccessory } from 'homebridge';
import { MockPlatformAccessory, MockCharacteristic, CharacteristicTokens, ServiceTokens } from '../helpers/hapStubs';
import { createMockPlatform, createMockBond } from '../helpers/platformStubs';
import { DeviceFactory } from '../factories/device';

function buildShades(
  actions: Action[],
  subtype?: string,
  configOverrides?: Record<string, unknown>,
) {
  const device = DeviceFactory.createDevice({ type: DeviceType.Shades, actions, subtype });
  const platform = createMockPlatform(configOverrides);
  const accessory = new MockPlatformAccessory(device);
  const bond = createMockBond();
  const acc = new ShadesAccessory(
    platform as unknown as BondPlatform,
    accessory as unknown as PlatformAccessory,
    bond as unknown as Bond,
  );
  return { acc, bond, platform, accessory, device };
}

function coveringService(accessory: MockPlatformAccessory) {
  return accessory.getService(ServiceTokens.WindowCovering)!;
}

function currentPos(accessory: MockPlatformAccessory) {
  return coveringService(accessory).getCharacteristic(CharacteristicTokens.CurrentPosition) as MockCharacteristic;
}

function targetPos(accessory: MockPlatformAccessory) {
  return coveringService(accessory).getCharacteristic(CharacteristicTokens.TargetPosition) as MockCharacteristic;
}

describe('ShadesAccessory', () => {
  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  // Service creation
  // -------------------------------------------------------------------------

  describe('service creation', () => {
    it('always creates a window covering service', () => {
      const { accessory } = buildShades([Action.ToggleOpen]);
      expect(coveringService(accessory)).to.not.be.undefined;
    });

    it('creates preset button when MShasPreset', () => {
      const { accessory } = buildShades([Action.ToggleOpen, Action.Preset]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'Preset');
      expect(svc).to.not.be.undefined;
    });

    it('does NOT create preset button when no Preset action', () => {
      const { accessory } = buildShades([Action.ToggleOpen]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'Preset');
      expect(svc).to.be.undefined;
    });

    it('creates toggleStateService when include_toggle_state is true', () => {
      const { accessory } = buildShades([Action.ToggleOpen], undefined, { include_toggle_state: true });
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.not.be.undefined;
    });

    it('does NOT create toggleStateService by default', () => {
      const { accessory } = buildShades([Action.ToggleOpen]);
      const svc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      expect(svc).to.be.undefined;
    });

    it('logs error when ToggleOpen action is missing', () => {
      const device = DeviceFactory.createDevice({ type: DeviceType.Shades, actions: [Action.Stop] });
      const platform = createMockPlatform();
      const accessory = new MockPlatformAccessory(device);
      const bond = createMockBond();
      new ShadesAccessory(
        platform as unknown as BondPlatform,
        accessory as unknown as PlatformAccessory,
        bond as unknown as Bond,
      );
      sinon.assert.called(platform.error as sinon.SinonStub);
    });
  });

  // -------------------------------------------------------------------------
  // updateState — position mode (SetPosition action present)
  // -------------------------------------------------------------------------

  describe('updateState() — position mode (regular shades)', () => {
    it('inverts Bond position 75 → HomeKit 25', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition]);
      acc.updateState({ position: 75 });
      expect(currentPos(accessory).value).to.equal(25);
      expect(targetPos(accessory).value).to.equal(25);
    });

    it('inverts Bond position 0 → HomeKit 100 (fully closed = fully open in HomeKit)', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition]);
      acc.updateState({ position: 0 });
      expect(currentPos(accessory).value).to.equal(100);
    });

    it('inverts Bond position 100 → HomeKit 0', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition]);
      acc.updateState({ position: 100 });
      expect(currentPos(accessory).value).to.equal(0);
    });

    it('inverts Bond position 25 → HomeKit 75', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition]);
      acc.updateState({ position: 25 });
      expect(currentPos(accessory).value).to.equal(75);
    });
  });

  describe('updateState() — position mode (awning)', () => {
    it('does NOT invert: Bond position 75 → HomeKit 75', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition], 'AWNING');
      acc.updateState({ position: 75 });
      expect(currentPos(accessory).value).to.equal(75);
    });

    it('does NOT invert: Bond position 0 → HomeKit 0', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition], 'AWNING');
      acc.updateState({ position: 0 });
      expect(currentPos(accessory).value).to.equal(0);
    });

    it('does NOT invert: Bond position 100 → HomeKit 100', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen, Action.SetPosition], 'AWNING');
      acc.updateState({ position: 100 });
      expect(currentPos(accessory).value).to.equal(100);
    });
  });

  // -------------------------------------------------------------------------
  // updateState — open/close fallback (no SetPosition)
  // -------------------------------------------------------------------------

  describe('updateState() — open/close fallback', () => {
    it('open=1 → currentPosition=100, targetPosition=100', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen]);
      acc.updateState({ open: 1 });
      expect(currentPos(accessory).value).to.equal(100);
      expect(targetPos(accessory).value).to.equal(100);
    });

    it('open=0 → currentPosition=0, targetPosition=0', () => {
      const { acc, accessory } = buildShades([Action.ToggleOpen]);
      acc.updateState({ open: 0 });
      expect(currentPos(accessory).value).to.equal(0);
      expect(targetPos(accessory).value).to.equal(0);
    });
  });

  // -------------------------------------------------------------------------
  // targetPosition setProps
  // -------------------------------------------------------------------------

  describe('targetPosition setProps', () => {
    it('sets minStep=1 when MShasPosition', () => {
      const { accessory } = buildShades([Action.ToggleOpen, Action.SetPosition]);
      const props = targetPos(accessory).getProps();
      expect(props['minStep']).to.equal(1);
    });

    it('sets minStep=100 when no SetPosition action', () => {
      const { accessory } = buildShades([Action.ToggleOpen]);
      const props = targetPos(accessory).getProps();
      expect(props['minStep']).to.equal(100);
    });
  });

  // -------------------------------------------------------------------------
  // Observer callbacks
  // -------------------------------------------------------------------------

  describe('observer callbacks', () => {
    it('calls setPosition with inverted value for regular shades', async () => {
      const { accessory, bond, device } = buildShades([Action.ToggleOpen, Action.SetPosition]);
      const tp = targetPos(accessory);
      tp.value = 50; // current
      await tp.simulateSet(25); // HomeKit 25 → Bond 75

      sinon.assert.calledWith(bond.api.setPosition as sinon.SinonStub, device, 75);
    });

    it('calls setPosition without inversion for awning', async () => {
      const { accessory, bond, device } = buildShades([Action.ToggleOpen, Action.SetPosition], 'AWNING');
      const tp = targetPos(accessory);
      tp.value = 50;
      await tp.simulateSet(75); // HomeKit 75 → Bond 75 (no inversion)

      sinon.assert.calledWith(bond.api.setPosition as sinon.SinonStub, device, 75);
    });

    it('calls toggleOpen (not setPosition) when no SetPosition action', async () => {
      const { accessory, bond, device } = buildShades([Action.ToggleOpen]);
      const tp = targetPos(accessory);
      tp.value = 100;
      await tp.simulateSet(0);

      sinon.assert.calledWith(bond.api.toggleOpen as sinon.SinonStub, device);
      sinon.assert.notCalled(bond.api.setPosition as sinon.SinonStub);
    });

    it('calls preset when preset button is activated', async () => {
      const { accessory, bond, device } = buildShades([Action.ToggleOpen, Action.Preset]);
      const presetSvc = accessory.getServiceById(ServiceTokens.Switch, 'Preset');
      const on = presetSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);

      sinon.assert.calledWith(bond.api.preset as sinon.SinonStub, device);
    });

    it('calls toggleState for open when toggle state button pressed', async () => {
      const { accessory, bond, device } = buildShades([Action.ToggleOpen], undefined, { include_toggle_state: true });
      const toggleSvc = accessory.getServiceById(ServiceTokens.Switch, 'ToggleState');
      const on = toggleSvc!.getCharacteristic(CharacteristicTokens.On) as MockCharacteristic;
      on.value = false;
      await on.simulateSet(true);

      sinon.assert.calledWith(bond.api.toggleState as sinon.SinonStub, device, 'open');
    });

    it('fetches initial state on construction', () => {
      const { bond, device } = buildShades([Action.ToggleOpen]);
      sinon.assert.calledWith(bond.api.getState as sinon.SinonStub, device.id);
    });
  });
});
