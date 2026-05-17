import { expect } from 'chai';
import 'mocha';
import nock from 'nock';
import sinon from 'sinon';
import { Action } from '../src/enum/Action';
import { BondApi } from '../src/BondApi';
import { BondPlatform } from '../src/platform';
import { DeviceType } from '../src/enum/DeviceType';
import { TEST_IP, TEST_TOKEN, BondServer } from './helpers/bondServer';
import { createMockPlatform } from './helpers/platformStubs';
import { DeviceFactory } from './factories/device';
import { VersionFactory } from './factories/version';

function makePlatform() {
  return createMockPlatform() as unknown as BondPlatform;
}

function makeApi(platform: BondPlatform, ms?: number) {
  return new BondApi(platform, TEST_TOKEN, TEST_IP, ms);
}

describe('BondApi', () => {
  let server: BondServer;
  let platform: BondPlatform;
  let api: BondApi;

  beforeEach(() => {
    server = new BondServer();
    platform = makePlatform();
    api = makeApi(platform);
  });

  afterEach(() => {
    server.cleanup();
    sinon.restore();
    nock.cleanAll();
  });

  // -------------------------------------------------------------------------
  // getVersion
  // -------------------------------------------------------------------------

  describe('getVersion()', () => {
    it('returns a parsed Version object', async () => {
      const version = VersionFactory.create();
      server.withVersion(version);

      const result = await api.getVersion();

      expect(result).to.deep.equal(version);
    });

    it('returns all optional fields when present', async () => {
      server.withVersion({ make: 'Oliphant', model: 'Bridge Pro', mcu_ver: '2.0.0' });
      const result = await api.getVersion();
      expect(result.make).to.equal('Oliphant');
      expect(result.model).to.equal('Bridge Pro');
      expect(result.mcu_ver).to.equal('2.0.0');
    });

    it('returns undefined and logs on 401', async () => {
      nock(`http://${TEST_IP}`).get('/v2/sys/version').reply(401, {});
      const result = await api.getVersion();
      expect(result).to.be.undefined;
      const errorCalls = (platform as any).log.error.args as string[][];
      const hasUnauthorized = errorCalls.some(args => args[0]?.includes('Unauthorized'));
      expect(hasUnauthorized).to.be.true;
    });

    it('returns undefined and logs on non-401 error (e.g. 404)', async () => {
      // Use 404 (not 5xx) to avoid axios-retry exhausting the test timeout
      nock(`http://${TEST_IP}`).get('/v2/sys/version').reply(404, {});
      const result = await api.getVersion();
      expect(result).to.be.undefined;
      const errorCalls = (platform as any).log.error.args as string[][];
      expect(errorCalls.length).to.be.greaterThan(0);
    });

    it('logs safe non-sensitive fields on axios errors', async () => {
      nock(`http://${TEST_IP}`).get('/v2/sys/version').reply(404, {});

      const result = await api.getVersion();
      expect(result).to.be.undefined;

      const errorCalls = (platform as any).log.error.args as string[][];
      const requestError = errorCalls.find(args => args[0]?.includes('A request error occurred'));
      expect(requestError).to.not.be.undefined;
      expect(requestError![0]).to.include('[status] 404');
      expect(requestError![0]).to.not.include('BOND-Token');
      expect(requestError![0]).to.not.include('headers');
      expect(requestError![0]).to.not.include('config');
    });
  });

  // -------------------------------------------------------------------------
  // getDeviceIds
  // -------------------------------------------------------------------------

  describe('getDeviceIds()', () => {
    it('returns valid device IDs', async () => {
      server.withDeviceListBody({ 'abc123': {}, 'def456': {} });
      const ids = await api.getDeviceIds();
      expect(ids).to.deep.equal(['abc123', 'def456']);
    });

    it('filters out keys starting with underscore', async () => {
      server.withDeviceListBody({ 'abc123': {}, '_': {}, '__meta': {}, '_hidden': {} });
      const ids = await api.getDeviceIds();
      expect(ids).to.deep.equal(['abc123']);
    });

    it('filters out empty string keys', async () => {
      server.withDeviceListBody({ 'abc123': {}, '': {} });
      const ids = await api.getDeviceIds();
      expect(ids).to.deep.equal(['abc123']);
    });

    it('returns empty array when no valid devices', async () => {
      server.withDeviceListBody({ '_': {}, '__meta': {} });
      const ids = await api.getDeviceIds();
      expect(ids).to.deep.equal([]);
    });

    it('rejects when 401 (upstream request() returns undefined, Object.keys throws)', async () => {
      // BondApi.getDeviceIds() calls Object.keys(json) on the result of request().
      // When request() returns undefined due to a 401, Object.keys(undefined) throws.
      // Bond.updateDeviceIds() catches this rejection via its own .catch() handler.
      nock(`http://${TEST_IP}`).get('/v2/devices').reply(401, {});
      let threw = false;
      try {
        await api.getDeviceIds();
      } catch (_) {
        threw = true;
      }
      expect(threw).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // getDevices
  // -------------------------------------------------------------------------

  describe('getDevices(ids)', () => {
    it('sets the id field on each device (Bond API omits it)', async () => {
      server.withDevice('fan1', {
        name: 'Living Room Fan',
        type: DeviceType.CeilingFan,
        location: 'Living Room',
        actions: [Action.TurnOn],
      });

      const [device] = await api.getDevices(['fan1']);
      expect(device.id).to.equal('fan1');
    });

    it('merges properties onto device', async () => {
      server.withDevice('fan1', {
        name: 'Fan',
        type: DeviceType.CeilingFan,
        location: 'Room',
        actions: [],
      }, {}, { trust_state: true, max_speed: 6 });

      const [device] = await api.getDevices(['fan1']);
      expect(device.properties.max_speed).to.equal(6);
      expect(device.properties.trust_state).to.equal(true);
    });

    it('fetches multiple devices in parallel', async () => {
      server
        .withDevice('fan1', { name: 'Fan 1', type: DeviceType.CeilingFan, location: 'Room', actions: [] })
        .withDevice('light1', { name: 'Light 1', type: DeviceType.Light, location: 'Room', actions: [] });

      const devices = await api.getDevices(['fan1', 'light1']);
      expect(devices).to.have.length(2);
      expect(devices.map(d => d.id)).to.include.members(['fan1', 'light1']);
    });

    it('does NOT fetch commands when device has no commands field', async () => {
      server.withDevice('fan1', {
        name: 'Fan',
        type: DeviceType.CeilingFan,
        location: 'Room',
        actions: [],
      });
      // If commands were fetched, nock would fail because no commands interceptor is set
      const [device] = await api.getDevices(['fan1']);
      expect(device.commands).to.be.undefined;
    });

    it('fetches commands when device has commands field', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1').reply(200, {
          name: 'Fan',
          type: DeviceType.CeilingFan,
          location: 'Room',
          actions: [],
          commands: {}, // presence of commands field triggers fetch
        })
        .get('/v2/devices/fan1/properties').reply(200, { trust_state: null, max_speed: 6 })
        .get('/v2/devices/fan1/commands').reply(200, { 'cmd1': {}, '_': {} })
        .get('/v2/devices/fan1/commands/cmd1').reply(200, {
          name: 'SetSpeed',
          action: Action.SetSpeed,
          argument: 1,
        });

      const [device] = await api.getDevices(['fan1']);
      expect(device.commands).to.have.length(1);
      expect(device.commands![0].action).to.equal(Action.SetSpeed);
    });
  });

  // -------------------------------------------------------------------------
  // getState
  // -------------------------------------------------------------------------

  describe('getState(id)', () => {
    it('returns the device state', async () => {
      server.withDevice('fan1', { name: 'Fan', type: DeviceType.CeilingFan, location: 'Room', actions: [] },
        { power: 1, speed: 3, light: 0 });

      const state = await api.getState('fan1');
      expect(state.power).to.equal(1);
      expect(state.speed).to.equal(3);
    });
  });

  // -------------------------------------------------------------------------
  // Action methods
  // Each test registers its own specific interceptor. nock throws for any
  // unmatched request, so if the wrong endpoint is called the test fails.
  // -------------------------------------------------------------------------

  describe('action methods', () => {
    const device = DeviceFactory.createDevice({ id: 'fan1' });

    function stubAction(action: string, body: nock.RequestBodyMatcher = {}) {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .put(`/v2/devices/fan1/actions/${action}`, body)
        .reply(200, {});
    }

    beforeEach(() => {
      nock.cleanAll(); // start fresh so only the per-test interceptor is active
    });

    it('toggleFan sends TurnOn when value is true', async () => {
      stubAction('TurnOn');
      await api.toggleFan(device, true);
    });

    it('toggleFan sends TurnOff when value is false', async () => {
      stubAction('TurnOff');
      await api.toggleFan(device, false);
    });

    it('setFanSpeed sends SetSpeed with argument', async () => {
      stubAction('SetSpeed', { argument: 3 });
      await api.setFanSpeed(device, 3);
    });

    it('setBrightness sends SetBrightness with argument', async () => {
      stubAction('SetBrightness', { argument: 75 });
      await api.setBrightness(device, 75);
    });

    it('setFlame sends SetFlame with argument', async () => {
      stubAction('SetFlame', { argument: 60 });
      await api.setFlame(device, 60);
    });

    it('setPosition sends SetPosition with argument', async () => {
      stubAction('SetPosition', { argument: 50 });
      await api.setPosition(device, 50);
    });

    it('toggleLight sends ToggleLight with empty body', async () => {
      stubAction('ToggleLight');
      await api.toggleLight(device);
    });

    it('toggleDirection sends ToggleDirection with empty body', async () => {
      stubAction('ToggleDirection');
      await api.toggleDirection(device);
    });

    it('preset sends Preset with empty body', async () => {
      stubAction('Preset');
      await api.preset(device);
    });

    it('increaseSpeed sends IncreaseSpeed with argument 1', async () => {
      stubAction('IncreaseSpeed', { argument: 1 });
      await api.increaseSpeed(device);
    });

    it('decreaseSpeed sends DecreaseSpeed with argument 1', async () => {
      stubAction('DecreaseSpeed', { argument: 1 });
      await api.decreaseSpeed(device);
    });
  });

  // -------------------------------------------------------------------------
  // toggleState
  // -------------------------------------------------------------------------

  describe('toggleState(device, property)', () => {
    const device = DeviceFactory.createDevice({ id: 'fan1' });

    it('GETs current state then PATCHes inverted power (1→0)', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1/state').reply(200, { power: 1 })
        .patch('/v2/devices/fan1/state', { power: 0 }).reply(200, {});

      await api.toggleState(device, 'power');
    });

    it('GETs current state then PATCHes inverted power (0→1)', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1/state').reply(200, { power: 0 })
        .patch('/v2/devices/fan1/state', { power: 1 }).reply(200, {});

      await api.toggleState(device, 'power');
    });

    it('toggles open state', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1/state').reply(200, { open: 1 })
        .patch('/v2/devices/fan1/state', { open: 0 }).reply(200, {});

      await api.toggleState(device, 'open');
    });

    it('toggles light state', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1/state').reply(200, { light: 0 })
        .patch('/v2/devices/fan1/state', { light: 1 }).reply(200, {});

      await api.toggleState(device, 'light');
    });

    it('toggles up_light state (1→0)', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1/state').reply(200, { up_light: 1 })
        .patch('/v2/devices/fan1/state', { up_light: 0 }).reply(200, {});

      await api.toggleState(device, 'up_light');
    });

    it('toggles down_light state (0→1)', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .get('/v2/devices/fan1/state').reply(200, { down_light: 0 })
        .patch('/v2/devices/fan1/state', { down_light: 1 }).reply(200, {});

      await api.toggleState(device, 'down_light');
    });

    it('throws when property is not supported', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .get('/v2/devices/fan1/state').reply(200, { power: 1 });

      try {
        await api.toggleState(device, 'speed');
        expect.fail('Expected error');
      } catch (e: any) {
        expect(e.message).to.include('speed');
      }
    });

    it('throws when property is absent from state', async () => {
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .get('/v2/devices/fan1/state').reply(200, {}); // power not in state

      try {
        await api.toggleState(device, 'power');
        expect.fail('Expected error');
      } catch (e: any) {
        expect(e.message).to.include('power');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Request headers
  // -------------------------------------------------------------------------

  describe('request headers', () => {
    it('sends BOND-Token header on every request', async () => {
      // nock BondServer already validates BOND-Token header; if wrong, nock won't match
      server.withVersion();
      const result = await api.getVersion();
      // If we get here without error, the header matched
      expect(result).to.not.be.undefined;
    });

    it('sends Bond-UUID header matching expected format on every request', async () => {
      let capturedUUID: string | string[] | undefined;
      nock(`http://${TEST_IP}`)
        .get('/v2/sys/version')
        .reply(function(this: any) {
          capturedUUID = this.req.headers['bond-uuid'];
          return [200, VersionFactory.create()];
        });

      await api.getVersion();
      // nock may expose the header as a string or array; normalise to string.
      // The generated UUID is a 14-16 char hex string derived from flake-idgen.
      const uuid = Array.isArray(capturedUUID) ? capturedUUID[0] : capturedUUID;
      expect(uuid).to.be.a('string').and.to.match(/^[0-9a-f]{14,16}$/i);
    });

    it('generates a different Bond-UUID for each request', async () => {
      const uuids: string[] = [];
      nock(`http://${TEST_IP}`)
        .get('/v2/sys/version')
        .times(2)
        .reply(function(this: any) {
          const raw = this.req.headers['bond-uuid'];
          const uuid = Array.isArray(raw) ? raw[0] : raw;
          if (uuid) uuids.push(uuid as string);
          return [200, VersionFactory.create()];
        });

      await api.getVersion();
      await api.getVersion();
      expect(uuids).to.have.length(2);
      expect(uuids[0]).to.not.equal(uuids[1]);
    });
  });

  // -------------------------------------------------------------------------
  // Request queuing (ms_between_actions)
  // -------------------------------------------------------------------------

  describe('ms_between_actions queuing', () => {
    it('fires the first action immediately and queues the second', async () => {
      const queuedApi = makeApi(platform, 50); // 50ms between actions
      const device = DeviceFactory.createDevice({ id: 'fan1' });

      const calls: string[] = [];
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .put('/v2/devices/fan1/actions/TurnOn').reply(function() {
          calls.push('TurnOn');
          return [200, {}];
        })
        .put('/v2/devices/fan1/actions/TurnOff').reply(function() {
          calls.push('TurnOff');
          return [200, {}];
        });

      // Fire two actions rapidly
      queuedApi.toggleFan(device, true);
      queuedApi.toggleFan(device, false);

      // Wait long enough for both to fire
      await new Promise(r => setTimeout(r, 200));
      expect(calls).to.include('TurnOn');
    });

    it('setPosition is queued like other actions (not bypassing ms_between_actions)', async () => {
      const queuedApi = makeApi(platform, 100);
      const device = DeviceFactory.createDevice({ id: 'shade1' });

      const calls: string[] = [];
      nock(`http://${TEST_IP}`)
        .matchHeader('BOND-Token', TEST_TOKEN)
        .persist()
        .put('/v2/devices/shade1/actions/TurnOn').reply(function() {
          calls.push('TurnOn');
          return [200, {}];
        })
        .put('/v2/devices/shade1/actions/SetPosition').reply(function() {
          calls.push('SetPosition');
          return [200, {}];
        });

      queuedApi.toggleFan(device, true);
      queuedApi.setPosition(device, 75);

      // Wait one tick for the first action's HTTP call to land, but not long
      // enough for the 100ms delay to expire — SetPosition must still be pending
      await new Promise(r => setTimeout(r, 20));
      expect(calls).to.deep.equal(['TurnOn']);

      // After the full delay both actions should have fired
      await new Promise(r => setTimeout(r, 300));
      expect(calls).to.deep.equal(['TurnOn', 'SetPosition']);
    });
  });
});
