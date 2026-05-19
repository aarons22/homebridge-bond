import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { BondConfig } from '../src/interface/config';
import { BondPlatform } from '../src/platform';
import { createMockPlatform } from './helpers/platformStubs';

function makePlatform() {
  return createMockPlatform() as unknown as BondPlatform;
}

describe('BondConfig.isValid()', () => {
  let platform: BondPlatform;

  beforeEach(() => {
    platform = makePlatform();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('accepts a valid IPv4 address', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100',
      token: 'abc123',
    });

    expect(valid).to.equal(true);
  });

  it('accepts a valid IPv4 address with port', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100:8080',
      token: 'abc123',
    });

    expect(valid).to.equal(true);
  });

  it('accepts a valid hostname', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: 'bond.local',
      token: 'abc123',
    });

    expect(valid).to.equal(true);
  });

  it('accepts a positive max_concurrent_requests value', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100',
      token: 'abc123',
      max_concurrent_requests: 3,
    });

    expect(valid).to.equal(true);
  });

  it('rejects ip_address values containing a path', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100/v2/devices',
      token: 'abc123',
    });

    expect(valid).to.equal(false);
  });

  it('rejects ip_address values containing query parameters', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100?foo=bar',
      token: 'abc123',
    });

    expect(valid).to.equal(false);
  });

  it('rejects ip_address values containing fragments', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100#section',
      token: 'abc123',
    });

    expect(valid).to.equal(false);
  });

  it('rejects max_concurrent_requests values below 1', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100',
      token: 'abc123',
      max_concurrent_requests: 0,
    });

    expect(valid).to.equal(false);
  });

  it('rejects non-integer max_concurrent_requests values', () => {
    const valid = BondConfig.isValid(platform, {
      ip_address: '192.168.1.100',
      token: 'abc123',
      max_concurrent_requests: 1.5,
    });

    expect(valid).to.equal(false);
  });
});
