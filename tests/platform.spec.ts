import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import dgram from 'dgram';
import { BondPlatform } from '../src/platform';

function createMockLog() {
  return Object.assign(sinon.stub(), {
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
  });
}

function createMockApi() {
  return {
    hap: {
      Service: {},
      Characteristic: {},
      uuid: { generate: sinon.stub().returns('uuid') },
    },
    on: sinon.stub(),
    registerPlatformAccessories: sinon.stub(),
    unregisterPlatformAccessories: sinon.stub(),
    platformAccessory: sinon.stub(),
  };
}

describe('BondPlatform security hardening', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('redacts bond token in config debug logs', () => {
    const log = createMockLog();
    const api = createMockApi() as any;
    const token = 'super-secret-token';
    const config = {
      include_dimmer: false,
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '192.168.1.100', token }],
    } as any;

    new BondPlatform(log as any, config, api);

    const debugCalls = log.debug.args as string[][];
    const configLog = debugCalls.find(args => args[0]?.startsWith('Config: '));
    expect(configLog).to.not.be.undefined;
    expect(configLog![0]).to.include('[REDACTED]');
    expect(configLog![0]).to.not.include(token);
  });

  it('redacts bond token in config error logs when config is invalid', () => {
    const log = createMockLog();
    const api = createMockApi() as any;
    const token = 'super-secret-token';
    const config = {
      include_dimmer: 'bad-value',
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '192.168.1.100', token }],
    } as any;

    new BondPlatform(log as any, config, api);

    const errorCalls = log.error.args as string[][];
    const configLog = errorCalls.find(args => args[0]?.startsWith('Config: '));
    expect(configLog).to.not.be.undefined;
    expect(configLog![0]).to.include('[REDACTED]');
    expect(configLog![0]).to.not.include(token);
  });

  it('ignores malformed UDP payloads instead of throwing', () => {
    const log = createMockLog();
    const api = createMockApi() as any;
    const config = {
      include_dimmer: false,
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '192.168.1.100', token: 'token' }],
    } as any;

    const platform = new BondPlatform(log as any, config, api);
    const handlers: Record<string, (...args: any[]) => void> = {};
    const fakeSocket = {
      send: sinon.stub().callsFake((
        _message: Buffer,
        _offset: number,
        _length: number,
        _port: number,
        _host: string,
        callback: (error?: Error) => void,
      ) => callback()),
      on: sinon.stub().callsFake((event: string, callback: (...args: any[]) => void) => {
        handlers[event] = callback;
      }),
    };

    sinon.stub(dgram, 'createSocket').returns(fakeSocket as any);
    sinon.stub(global, 'setInterval').returns(1 as any);
    const bond = {
      config: { ip_address: '192.168.1.100' },
      receivedBPUPPacket: sinon.stub(),
    };

    (platform as any).setupBPUP(bond);
    handlers.message(Buffer.from('not-json'), { address: '192.168.1.10', port: '30007' });

    expect((bond.receivedBPUPPacket as sinon.SinonStub).called).to.equal(false);
    const debugCalls = log.debug.args as string[][];
    const malformedLog = debugCalls.find(args => args[0]?.includes('Malformed UDP payload'));
    expect(malformedLog).to.not.be.undefined;
  });
});
