import { expect } from 'chai';
import 'mocha';
import http from 'http';
import {
  BondSimulatorServer,
  BpupPacket,
  DEFAULT_BOND_ID,
  DEFAULT_TOKEN,
  SIM_LIGHT_ID,
  getServerPort,
} from '../tools/bond-simulator/server';

interface TestResponse {
  statusCode: number;
  body: any;
}

function request(port: number, method: string, path: string, body?: unknown, token?: string): Promise<TestResponse> {
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(token ? { 'BOND-Token': token } : {}),
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        } : {}),
      },
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({
          statusCode: response.statusCode ?? 0,
          body: raw ? JSON.parse(raw) : undefined,
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe('Bond simulator', () => {
  let simulator: BondSimulatorServer;
  let server: http.Server;
  let port: number;
  let bpupPackets: BpupPacket[];

  beforeEach(async () => {
    bpupPackets = [];
    simulator = new BondSimulatorServer({
      broadcaster: {
        broadcast: packet => bpupPackets.push(packet),
      },
    });
    server = await simulator.listen(0);
    port = getServerPort(server);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it('returns version information with the simulator Bond ID', async () => {
    const response = await request(port, 'GET', '/v2/sys/version');

    expect(response.statusCode).to.equal(200);
    expect(response.body.bondid).to.equal(DEFAULT_BOND_ID);
    expect(response.body.api).to.equal(2);
  });

  it('returns a Bond-style device list and light detail', async () => {
    const list = await request(port, 'GET', '/v2/devices', undefined, DEFAULT_TOKEN);
    const detail = await request(port, 'GET', `/v2/devices/${SIM_LIGHT_ID}`, undefined, DEFAULT_TOKEN);

    expect(list.statusCode).to.equal(200);
    expect(list.body).to.have.property(SIM_LIGHT_ID);
    expect(detail.statusCode).to.equal(200);
    expect(detail.body).to.deep.include({
      name: 'Sim Light',
      location: 'Simulator',
      type: 'LT',
    });
    expect(detail.body.actions).to.deep.equal(['ToggleLight']);
  });

  it('rejects protected endpoints without the simulator token', async () => {
    const missing = await request(port, 'GET', '/v2/devices');
    const invalid = await request(port, 'GET', '/v2/devices', undefined, 'wrong-token');

    expect(missing.statusCode).to.equal(401);
    expect(invalid.statusCode).to.equal(401);
  });

  it('toggles the light through the ToggleLight action', async () => {
    const action = await request(port, 'PUT', `/v2/devices/${SIM_LIGHT_ID}/actions/ToggleLight`, {}, DEFAULT_TOKEN);
    const state = await request(port, 'GET', `/v2/devices/${SIM_LIGHT_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(action.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ light: 1 });
    expect(bpupPackets).to.deep.equal([
      {
        B: DEFAULT_BOND_ID,
        t: `devices/${SIM_LIGHT_ID}/state`,
        m: 4,
        b: { light: 1 },
      },
    ]);
  });

  it('updates light state through PATCH and broadcasts BPUP when changed', async () => {
    const response = await request(port, 'PATCH', `/v2/devices/${SIM_LIGHT_ID}/state`, { light: 1 }, DEFAULT_TOKEN);
    const state = await request(port, 'GET', `/v2/devices/${SIM_LIGHT_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ light: 1 });
    expect(bpupPackets).to.have.length(1);
    expect(bpupPackets[0]).to.deep.include({
      B: DEFAULT_BOND_ID,
      t: `devices/${SIM_LIGHT_ID}/state`,
      m: 4,
    });
    expect(bpupPackets[0].b).to.deep.equal({ light: 1 });
  });

  it('does not broadcast BPUP when PATCH does not change the light state', async () => {
    const response = await request(port, 'PATCH', `/v2/devices/${SIM_LIGHT_ID}/state`, { light: 0 }, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(bpupPackets).to.deep.equal([]);
  });
});
