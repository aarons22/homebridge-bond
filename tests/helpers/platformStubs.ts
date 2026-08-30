import sinon from 'sinon';
import { BondState } from '../../src/interface/Bond';
import { BondConfig } from '../../src/interface/config';
import { VersionFactory } from '../factories/version';
import { CharacteristicTokens, ServiceTokens } from './hapStubs';

export function createMockLog() {
  return {
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
  };
}

// MockBondPlatform satisfies the interface that BondApi and accessories need.
// Cast with `platform as unknown as BondPlatform` at the call site.
export function createMockPlatform(configOverrides?: Record<string, unknown>) {
  const log = Object.assign(sinon.stub(), createMockLog());

  return {
    Service: ServiceTokens,
    Characteristic: CharacteristicTokens,
    config: {
      include_dimmer: false,
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '192.168.1.100', token: 'test-token' }] as BondConfig[],
      ...configOverrides,
    },
    log,
    debug: sinon.stub(),
    error: sinon.stub(),
    logAccessory: sinon.stub(),
  };
}

// Creates a Bond-shaped stub with all api methods pre-stubbed.
// Provide `stateOverride` to control what getState returns.
export function createMockBond(stateOverride?: Partial<BondState>) {
  const defaultState: BondState = { power: 0, ...stateOverride };
  return {
    api: {
      getState: sinon.stub().resolves(defaultState),
      toggleFan: sinon.stub().resolves(),
      setFanSpeed: sinon.stub().resolves(),
      toggleDirection: sinon.stub().resolves(),
      increaseSpeed: sinon.stub().resolves(),
      decreaseSpeed: sinon.stub().resolves(),
      toggleLight: sinon.stub().resolves(),
      toggleUpLight: sinon.stub().resolves(),
      toggleDownLight: sinon.stub().resolves(),
      startDimmer: sinon.stub().resolves(),
      startUpLightDimmer: sinon.stub().resolves(),
      startDownLightDimmer: sinon.stub().resolves(),
      startIncreasingBrightness: sinon.stub().resolves(),
      startDecreasingBrightness: sinon.stub().resolves(),
      setBrightness: sinon.stub().resolves(),
      setFlame: sinon.stub().resolves(),
      turnLightOff: sinon.stub().resolves(),
      togglePower: sinon.stub().resolves(),
      toggleOpen: sinon.stub().resolves(),
      open: sinon.stub().resolves(),
      close: sinon.stub().resolves(),
      hold: sinon.stub().resolves(),
      preset: sinon.stub().resolves(),
      stop: sinon.stub().resolves(),
      setPosition: sinon.stub().resolves(),
      toggleState: sinon.stub().resolves(),
      updateState: sinon.stub().resolves(),
    },
    config: { ip_address: '192.168.1.100', token: 'test-token' } as BondConfig,
    version: VersionFactory.create(),
    deviceIds: [] as string[],
    accessories: [] as any[],
  };
}

export type MockBond = ReturnType<typeof createMockBond>;
export type MockPlatform = ReturnType<typeof createMockPlatform>;
