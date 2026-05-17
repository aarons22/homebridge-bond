import nock from 'nock';
import { Action } from '../../src/enum/Action';
import { BondState } from '../../src/interface/Bond';
import { Version } from '../../src/interface/Version';
import { VersionFactory } from '../factories/version';

export const TEST_IP = '192.168.1.100';
export const TEST_TOKEN = 'test-bond-token';

// BondServer wraps nock interceptors into a chainable builder that mirrors
// the Bond V2 HTTP API. Use in BondApi integration tests.
export class BondServer {
  private scope: nock.Scope;
  readonly ip: string;
  readonly token: string;

  constructor(ip = TEST_IP, token = TEST_TOKEN) {
    this.ip = ip;
    this.token = token;
    this.scope = nock(`http://${ip}`).matchHeader('BOND-Token', token).persist();
  }

  withVersion(overrides?: Partial<Version>): this {
    const version = VersionFactory.create(overrides);
    this.scope.get('/v2/sys/version').reply(200, version);
    return this;
  }

  // Registers device, properties, and (optionally) state interceptors.
  // The Bond API does not include `id` in the device response body.
  withDevice(
    id: string,
    deviceFields: Record<string, unknown>,
    state: Partial<BondState> = {},
    properties: Record<string, unknown> = { trust_state: null, max_speed: 6 },
  ): this {
    // Strip `id` from device fields since Bond API omits it from the response
    const { id: _id, ...deviceBody } = deviceFields as any;
    this.scope.get(`/v2/devices/${id}`).reply(200, deviceBody);
    this.scope.get(`/v2/devices/${id}/state`).reply(200, { power: 0, ...state });
    this.scope.get(`/v2/devices/${id}/properties`).reply(200, properties);
    return this;
  }

  withDeviceList(ids: string[]): this {
    const body: Record<string, Record<string, never>> = {};
    ids.forEach(id => { body[id] = {}; });
    // Add a couple of filtered-out keys to verify filtering logic
    body['_'] = {};
    body['__meta'] = {};
    this.scope.get('/v2/devices').reply(200, body);
    return this;
  }

  withDeviceListBody(body: Record<string, unknown>): this {
    this.scope.get('/v2/devices').reply(200, body);
    return this;
  }

  withCommands(
    deviceId: string,
    commands: Array<{ id: string; name: string; action: Action; argument?: number }>,
  ): this {
    // Command list endpoint returns a dict (with underscore key to test filtering)
    const listBody: Record<string, Record<string, never>> = { '_': {} };
    commands.forEach(c => { listBody[c.id] = {}; });
    this.scope.get(`/v2/devices/${deviceId}/commands`).reply(200, listBody);

    commands.forEach(c => {
      this.scope.get(`/v2/devices/${deviceId}/commands/${c.id}`).reply(200, {
        name: c.name,
        action: c.action,
        argument: c.argument ?? null,
      });
    });
    return this;
  }

  withActionSuccess(deviceId: string, action: string): this {
    this.scope.put(`/v2/devices/${deviceId}/actions/${action}`).reply(200, {});
    return this;
  }

  withAllActions(deviceId: string): this {
    this.scope.put(new RegExp(`/v2/devices/${deviceId}/actions/.*`)).reply(200, {});
    return this;
  }

  withStateUpdate(deviceId: string, responseState?: Partial<BondState>): this {
    this.scope.patch(`/v2/devices/${deviceId}/state`).reply(200, responseState ?? {});
    return this;
  }

  withError(path: string, statusCode: number): this {
    this.scope.get(path).reply(statusCode, {});
    return this;
  }

  withPutError(path: string, statusCode: number): this {
    this.scope.put(path).reply(statusCode, {});
    return this;
  }

  // Returns a scope that does NOT match the token header — for testing 401s
  // by reconfiguring the scope without header matching.
  withUnauthorized(path: string): this {
    nock(`http://${this.ip}`).get(path).reply(401, {});
    return this;
  }

  cleanup(): void {
    nock.cleanAll();
  }

  isDone(): boolean {
    return this.scope.isDone();
  }
}
