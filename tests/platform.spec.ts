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

  it('routes BPUP packets with leading non-JSON bytes', () => {
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
    handlers.message(
      Buffer.from(`\uFFFDjunk${JSON.stringify({ B: 'ZZEC17318', d: 0, v: 'v3.8.4' })}`),
      { address: '192.168.1.10', port: '30007' },
    );

    expect((bond.receivedBPUPPacket as sinon.SinonStub).calledOnce).to.equal(true);
    expect((bond.receivedBPUPPacket as sinon.SinonStub).firstCall.args[0]).to.deep.equal({
      B: 'ZZEC17318',
      d: 0,
      v: 'v3.8.4',
    });
  });

  it('strips HTTP port from BPUP UDP host', () => {
    const log = createMockLog();
    const api = createMockApi() as any;
    const config = {
      include_dimmer: false,
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '127.0.0.1:18080', token: 'token' }],
    } as any;

    const platform = new BondPlatform(log as any, config, api);
    const fakeSocket = {
      send: sinon.stub().callsFake((
        _message: Buffer,
        _offset: number,
        _length: number,
        _port: number,
        _host: string,
        callback: (error?: Error) => void,
      ) => callback()),
      on: sinon.stub(),
    };

    sinon.stub(dgram, 'createSocket').returns(fakeSocket as any);
    sinon.stub(global, 'setInterval').returns(1 as any);
    const bond = {
      config: { ip_address: '127.0.0.1:18080' },
      receivedBPUPPacket: sinon.stub(),
    };

    (platform as any).setupBPUP(bond);

    expect(fakeSocket.send.firstCall.args[3]).to.equal(30007);
    expect(fakeSocket.send.firstCall.args[4]).to.equal('127.0.0.1');
  });

  it('logs BPUP UDP send errors without throwing', () => {
    const log = createMockLog();
    const api = createMockApi() as any;
    const config = {
      include_dimmer: false,
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '127.0.0.1:18080', token: 'token' }],
    } as any;

    const platform = new BondPlatform(log as any, config, api);
    const fakeSocket = {
      send: sinon.stub().callsFake((
        _message: Buffer,
        _offset: number,
        _length: number,
        _port: number,
        _host: string,
        callback: (error?: Error) => void,
      ) => callback(new Error('send failed'))),
      on: sinon.stub(),
    };

    sinon.stub(dgram, 'createSocket').returns(fakeSocket as any);
    sinon.stub(global, 'setInterval').returns(1 as any);
    const bond = {
      config: { ip_address: '127.0.0.1:18080' },
      receivedBPUPPacket: sinon.stub(),
    };

    expect(() => (platform as any).setupBPUP(bond)).to.not.throw();
    const errorCalls = log.error.args as string[][];
    const udpError = errorCalls.find(args => args[0]?.includes('Error sending UDP message'));
    expect(udpError).to.not.be.undefined;
  });

  it('reconnects the BPUP socket after a socket error', () => {
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
      removeAllListeners: sinon.stub(),
      close: sinon.stub(),
    };

    const createSocket = sinon.stub(dgram, 'createSocket').returns(fakeSocket as any);
    sinon.stub(global, 'setInterval').returns(1 as any);
    const setTimeoutStub = sinon.stub(global, 'setTimeout').returns(2 as any);
    const bond = {
      version: { bondid: 'ZZBL12345' },
      config: { ip_address: '192.168.1.100' },
      receivedBPUPPacket: sinon.stub(),
    };

    (platform as any).setupBPUP(bond);
    expect(createSocket.callCount).to.equal(1);

    // Simulate a socket error (e.g. the network dropped out).
    handlers.error(new Error('ENETUNREACH'));

    const warned = (log.warn.args as string[][]).find(args => args[0]?.includes('reconnecting'));
    expect(warned, 'should log a reconnect warning').to.not.be.undefined;
    expect(fakeSocket.close.called, 'should close the failed socket').to.equal(true);
    expect(setTimeoutStub.called, 'should schedule a reconnect').to.equal(true);

    // Running the scheduled reconnect should establish a fresh socket.
    const reconnect = setTimeoutStub.firstCall.args[0] as () => void;
    reconnect();
    expect(createSocket.callCount).to.equal(2);
  });

  it('reconnects when the BPUP connection goes stale', () => {
    const clock = sinon.useFakeTimers();
    const log = createMockLog();
    const api = createMockApi() as any;
    const config = {
      include_dimmer: false,
      fan_speed_values: false,
      include_toggle_state: false,
      bonds: [{ ip_address: '192.168.1.100', token: 'token' }],
    } as any;

    const platform = new BondPlatform(log as any, config, api);
    const fakeSocket = {
      send: sinon.stub().callsFake((
        _message: Buffer,
        _offset: number,
        _length: number,
        _port: number,
        _host: string,
        callback: (error?: Error) => void,
      ) => callback()),
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub(),
    };
    const createSocket = sinon.stub(dgram, 'createSocket').returns(fakeSocket as any);
    const bond = {
      version: { bondid: 'ZZBL12345' },
      config: { ip_address: '192.168.1.100' },
      receivedBPUPPacket: sinon.stub(),
    };

    (platform as any).setupBPUP(bond);
    expect(createSocket.callCount).to.equal(1);

    // No inbound packets — advance past the stale threshold so the watchdog reconnects.
    clock.tick(200 * 1000);

    const warned = (log.warn.args as string[][]).find(args => args[0]?.includes('no packets received'));
    expect(warned, 'should log a staleness reconnect warning').to.not.be.undefined;
    expect(createSocket.callCount, 'should re-create the socket').to.be.greaterThan(1);

    clock.restore();
  });
});
