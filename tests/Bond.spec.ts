import { expect } from 'chai';
import 'mocha';
import nock from 'nock';
import sinon from 'sinon';
import { Bond, BPUPPacket } from '../src/interface/Bond';
import { BondPlatform } from '../src/platform';
import { TEST_IP, TEST_TOKEN, BondServer } from './helpers/bondServer';
import { createMockPlatform } from './helpers/platformStubs';
import { DeviceFactory } from './factories/device';
import { VersionFactory } from './factories/version';
import { Action } from '../src/enum/Action';

function makePlatform() {
  return createMockPlatform() as unknown as BondPlatform;
}

describe('Bond', () => {
  let server: BondServer;
  let platform: BondPlatform;
  let bond: Bond;

  beforeEach(() => {
    server = new BondServer();
    platform = makePlatform();
    bond = new Bond(platform, {
      ip_address: TEST_IP,
      token: TEST_TOKEN,
    });
    // Provide a version so uniqueDeviceId works
    bond.version = VersionFactory.create({ bondid: 'TESTBOND00001' });
  });

  afterEach(() => {
    server.cleanup();
    sinon.restore();
    nock.cleanAll();
  });

  // -------------------------------------------------------------------------
  // uniqueDeviceId
  // -------------------------------------------------------------------------

  describe('uniqueDeviceId()', () => {
    it('concatenates bondid and deviceId with no separator', () => {
      const result = bond.uniqueDeviceId('abc123');
      expect(result).to.equal('TESTBOND00001abc123');
    });

    it('produces different IDs for different device IDs', () => {
      expect(bond.uniqueDeviceId('aaa')).to.not.equal(bond.uniqueDeviceId('bbb'));
    });

    it('produces different IDs for bonds with different bondids', () => {
      bond.version = VersionFactory.create({ bondid: 'BOND_A' });
      const bond2 = new Bond(platform, { ip_address: TEST_IP, token: TEST_TOKEN });
      bond2.version = VersionFactory.create({ bondid: 'BOND_B' });

      expect(bond.uniqueDeviceId('dev1')).to.not.equal(bond2.uniqueDeviceId('dev1'));
    });
  });

  // -------------------------------------------------------------------------
  // updateDeviceIds
  // -------------------------------------------------------------------------

  describe('updateDeviceIds()', () => {
    it('stores the filtered device IDs from the API', async () => {
      server.withDeviceListBody({ 'dev1': {}, 'dev2': {}, '_': {} });
      await bond.updateDeviceIds();
      expect(bond.deviceIds).to.deep.equal(['dev1', 'dev2']);
    });

    it('logs an error but does not throw on API failure', async () => {
      // Use 401 (not 5xx) to avoid axios-retry exhausting the test timeout.
      // Bond.updateDeviceIds() has a .catch() that swallows the rejection.
      nock(`http://${TEST_IP}`).get('/v2/devices').reply(401, {});
      await bond.updateDeviceIds(); // should not throw
      // deviceIds unchanged from initial empty state
      expect(bond.deviceIds).to.deep.equal([]);
    });
  });

  // -------------------------------------------------------------------------
  // updateBondId
  // -------------------------------------------------------------------------

  describe('updateBondId()', () => {
    it('stores version from the API', async () => {
      const version = VersionFactory.create({ bondid: 'FRESHBOND123' });
      server.withVersion(version);
      await bond.updateBondId();
      expect(bond.version.bondid).to.equal('FRESHBOND123');
      expect(bond.version.fw_ver).to.equal(version.fw_ver);
    });

    it('logs an error but does not throw on API failure', async () => {
      // Use 404 (not 5xx) to avoid axios-retry exhausting the test timeout
      nock(`http://${TEST_IP}`).get('/v2/sys/version').reply(404, {});
      await bond.updateBondId(); // should not throw
    });
  });

  // -------------------------------------------------------------------------
  // receivedBPUPPacket
  // -------------------------------------------------------------------------

  describe('receivedBPUPPacket()', () => {
    it('routes state to the matching accessory', () => {
      const device = DeviceFactory.createDevice({ id: 'dev1' });
      const updateState = sinon.stub();
      bond.accessories = [{
        accessory: { context: { device } },
        updateState,
        platform,
      }] as any;

      const packet: BPUPPacket = {
        B: 'TESTBOND00001',
        t: 'devices/dev1/state',
        b: { power: 1, speed: 3 },
      };

      bond.receivedBPUPPacket(packet);

      expect(updateState.calledOnce).to.be.true;
      expect(updateState.calledWith({ power: 1, speed: 3 })).to.be.true;
    });

    it('does not route when topic does not include the device ID', () => {
      const device = DeviceFactory.createDevice({ id: 'dev1' });
      const updateState = sinon.stub();
      bond.accessories = [{
        accessory: { context: { device } },
        updateState,
        platform,
      }] as any;

      const packet: BPUPPacket = {
        B: 'TESTBOND00001',
        t: 'devices/dev999/state', // different device
        b: { power: 1 },
      };

      bond.receivedBPUPPacket(packet);
      expect(updateState.called).to.be.false;
    });

    it('does not route when topic does not include "state"', () => {
      const device = DeviceFactory.createDevice({ id: 'dev1' });
      const updateState = sinon.stub();
      bond.accessories = [{
        accessory: { context: { device } },
        updateState,
        platform,
      }] as any;

      const packet: BPUPPacket = {
        B: 'TESTBOND00001',
        t: 'devices/dev1/properties', // not state
        b: { max_speed: 6 },
      };

      bond.receivedBPUPPacket(packet);
      expect(updateState.called).to.be.false;
    });

    it('only updates the matching accessory when multiple are registered', () => {
      const device1 = DeviceFactory.createDevice({ id: 'dev1' });
      const device2 = DeviceFactory.createDevice({ id: 'dev2' });
      const updateState1 = sinon.stub();
      const updateState2 = sinon.stub();

      bond.accessories = [
        { accessory: { context: { device: device1 } }, updateState: updateState1, platform },
        { accessory: { context: { device: device2 } }, updateState: updateState2, platform },
      ] as any;

      const packet: BPUPPacket = {
        B: 'TESTBOND00001',
        t: 'devices/dev1/state',
        b: { power: 1 },
      };

      bond.receivedBPUPPacket(packet);

      expect(updateState1.calledOnce).to.be.true;
      expect(updateState2.called).to.be.false;
    });

    it('does not route when packet has no topic', () => {
      const device = DeviceFactory.createDevice({ id: 'dev1' });
      const updateState = sinon.stub();
      bond.accessories = [{
        accessory: { context: { device } },
        updateState,
        platform,
      }] as any;

      const packet: BPUPPacket = { B: 'TESTBOND00001' }; // no t field

      bond.receivedBPUPPacket(packet);
      expect(updateState.called).to.be.false;
    });

    it('does not route when packet has no body', () => {
      const device = DeviceFactory.createDevice({ id: 'dev1' });
      const updateState = sinon.stub();
      bond.accessories = [{
        accessory: { context: { device } },
        updateState,
        platform,
      }] as any;

      const packet: BPUPPacket = {
        B: 'TESTBOND00001',
        t: 'devices/dev1/state',
        // no b field
      };

      bond.receivedBPUPPacket(packet);
      expect(updateState.called).to.be.false;
    });
  });
});
