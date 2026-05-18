import { expect } from 'chai';
import 'mocha';
import http from 'http';
import {
  BondSimulatorServer,
  BpupPacket,
  DEFAULT_BOND_ID,
  DEFAULT_TOKEN,
  SIM_BASIC_FAN_ID,
  SIM_BRIGHTNESS_BUTTON_FAN_ID,
  SIM_DIMMER_FAN_ID,
  SIM_DIMMABLE_LIGHT_ID,
  SIM_DIRECTION_FAN_ID,
  SIM_LIGHT_ID,
  SIM_LIGHT_FAN_ID,
  SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID,
  SIM_SPEED_BUTTON_FAN_ID,
  SIM_TURN_LIGHT_OFF_ONLY_LIGHT_ID,
  SIM_UP_DOWN_DIMMER_FAN_ID,
  SIM_UP_DOWN_LIGHT_FAN_ID,
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

  it('returns a Bond-style device list and light details', async () => {
    const list = await request(port, 'GET', '/v2/devices', undefined, DEFAULT_TOKEN);
    const simpleLight = await request(port, 'GET', `/v2/devices/${SIM_LIGHT_ID}`, undefined, DEFAULT_TOKEN);
    const dimmableLight = await request(port, 'GET', `/v2/devices/${SIM_DIMMABLE_LIGHT_ID}`, undefined, DEFAULT_TOKEN);
    const setBrightnessOnly = await request(port, 'GET', `/v2/devices/${SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID}`, undefined, DEFAULT_TOKEN);
    const turnLightOffOnly = await request(port, 'GET', `/v2/devices/${SIM_TURN_LIGHT_OFF_ONLY_LIGHT_ID}`, undefined, DEFAULT_TOKEN);

    expect(list.statusCode).to.equal(200);
    expect(list.body).to.have.property(SIM_LIGHT_ID);
    expect(list.body).to.have.property(SIM_DIMMABLE_LIGHT_ID);
    expect(list.body).to.have.property(SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID);
    expect(list.body).to.have.property(SIM_TURN_LIGHT_OFF_ONLY_LIGHT_ID);
    expect(simpleLight.statusCode).to.equal(200);
    expect(simpleLight.body).to.deep.include({
      name: 'Toggle Light',
      location: 'Simulator',
      type: 'LT',
    });
    expect(simpleLight.body.actions).to.deep.equal(['ToggleLight']);
    expect(dimmableLight.statusCode).to.equal(200);
    expect(dimmableLight.body).to.deep.include({
      name: 'Dimmable Light',
      location: 'Simulator',
      type: 'LT',
    });
    expect(dimmableLight.body.actions).to.deep.equal(['ToggleLight', 'SetBrightness', 'TurnLightOff']);
    expect(setBrightnessOnly.body.actions).to.deep.equal(['ToggleLight', 'SetBrightness']);
    expect(turnLightOffOnly.body.actions).to.deep.equal(['ToggleLight', 'TurnLightOff']);
  });

  it('returns the fan permutation catalog with expected capability shapes', async () => {
    const list = await request(port, 'GET', '/v2/devices', undefined, DEFAULT_TOKEN);
    const basicFan = await request(port, 'GET', `/v2/devices/${SIM_BASIC_FAN_ID}`, undefined, DEFAULT_TOKEN);
    const speedButtonFan = await request(port, 'GET', `/v2/devices/${SIM_SPEED_BUTTON_FAN_ID}`, undefined, DEFAULT_TOKEN);
    const upDownDimmerFan = await request(port, 'GET', `/v2/devices/${SIM_UP_DOWN_DIMMER_FAN_ID}`, undefined, DEFAULT_TOKEN);
    const brightnessButtonFan = await request(port, 'GET', `/v2/devices/${SIM_BRIGHTNESS_BUTTON_FAN_ID}`, undefined, DEFAULT_TOKEN);

    expect(list.body).to.include.keys(
      SIM_BASIC_FAN_ID,
      SIM_DIRECTION_FAN_ID,
      SIM_SPEED_BUTTON_FAN_ID,
      SIM_LIGHT_FAN_ID,
      SIM_UP_DOWN_LIGHT_FAN_ID,
      SIM_DIMMER_FAN_ID,
      SIM_UP_DOWN_DIMMER_FAN_ID,
      SIM_BRIGHTNESS_BUTTON_FAN_ID,
    );
    expect(basicFan.body).to.deep.include({
      name: 'Basic Fan',
      location: 'Simulator',
      type: 'CF',
    });
    expect(basicFan.body.actions).to.deep.equal(['TurnOn', 'TurnOff', 'SetSpeed']);
    expect(speedButtonFan.body.actions).to.deep.equal(['TurnOn', 'TurnOff', 'IncreaseSpeed', 'DecreaseSpeed']);
    expect(upDownDimmerFan.body.actions).to.include.members(['ToggleUpLight', 'ToggleDownLight', 'StartDimmer']);
    expect(brightnessButtonFan.body.actions).to.include.members(['StartIncreasingBrightness', 'StartDecreasingBrightness']);
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

  it('sets brightness and turns on the dimmable light through SetBrightness', async () => {
    const response = await request(
      port,
      'PUT',
      `/v2/devices/${SIM_DIMMABLE_LIGHT_ID}/actions/SetBrightness`,
      { argument: 72 },
      DEFAULT_TOKEN,
    );
    const state = await request(port, 'GET', `/v2/devices/${SIM_DIMMABLE_LIGHT_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ light: 1, brightness: 72 });
    expect(bpupPackets).to.deep.equal([
      {
        B: DEFAULT_BOND_ID,
        t: `devices/${SIM_DIMMABLE_LIGHT_ID}/state`,
        m: 4,
        b: { light: 1, brightness: 72 },
      },
    ]);
  });

  it('patches dimmable light brightness and broadcasts BPUP when changed', async () => {
    const response = await request(
      port,
      'PATCH',
      `/v2/devices/${SIM_DIMMABLE_LIGHT_ID}/state`,
      { brightness: 35 },
      DEFAULT_TOKEN,
    );
    const state = await request(port, 'GET', `/v2/devices/${SIM_DIMMABLE_LIGHT_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ light: 0, brightness: 35 });
    expect(bpupPackets).to.deep.equal([
      {
        B: DEFAULT_BOND_ID,
        t: `devices/${SIM_DIMMABLE_LIGHT_ID}/state`,
        m: 4,
        b: { light: 0, brightness: 35 },
      },
    ]);
  });

  it('supports SetBrightness on the partial brightness light for negative HomeKit capability testing', async () => {
    const response = await request(
      port,
      'PUT',
      `/v2/devices/${SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID}/actions/SetBrightness`,
      { argument: 62 },
      DEFAULT_TOKEN,
    );
    const state = await request(port, 'GET', `/v2/devices/${SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ light: 1, brightness: 62 });
  });

  it('rejects SetBrightness on a light that does not advertise it', async () => {
    const response = await request(
      port,
      'PUT',
      `/v2/devices/${SIM_TURN_LIGHT_OFF_ONLY_LIGHT_ID}/actions/SetBrightness`,
      { argument: 62 },
      DEFAULT_TOKEN,
    );

    expect(response.statusCode).to.equal(404);
  });

  it('turns a fan on and off through Bond actions', async () => {
    const turnOn = await request(port, 'PUT', `/v2/devices/${SIM_BASIC_FAN_ID}/actions/TurnOn`, {}, DEFAULT_TOKEN);
    const onState = await request(port, 'GET', `/v2/devices/${SIM_BASIC_FAN_ID}/state`, undefined, DEFAULT_TOKEN);
    const turnOff = await request(port, 'PUT', `/v2/devices/${SIM_BASIC_FAN_ID}/actions/TurnOff`, {}, DEFAULT_TOKEN);
    const offState = await request(port, 'GET', `/v2/devices/${SIM_BASIC_FAN_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(turnOn.statusCode).to.equal(200);
    expect(onState.body).to.deep.equal({ power: 1, speed: 1 });
    expect(turnOff.statusCode).to.equal(200);
    expect(offState.body).to.deep.equal({ power: 0, speed: 1 });
    expect(bpupPackets.map(packet => packet.b)).to.deep.equal([
      { power: 1, speed: 1 },
      { power: 0, speed: 1 },
    ]);
  });

  it('sets fan speed and broadcasts the updated fan state', async () => {
    const response = await request(
      port,
      'PUT',
      `/v2/devices/${SIM_BASIC_FAN_ID}/actions/SetSpeed`,
      { argument: 3 },
      DEFAULT_TOKEN,
    );
    const state = await request(port, 'GET', `/v2/devices/${SIM_BASIC_FAN_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ power: 1, speed: 3 });
    expect(bpupPackets).to.deep.equal([
      {
        B: DEFAULT_BOND_ID,
        t: `devices/${SIM_BASIC_FAN_ID}/state`,
        m: 4,
        b: { power: 1, speed: 3 },
      },
    ]);
  });

  it('supports fan speed increase and decrease actions', async () => {
    const increase = await request(port, 'PUT', `/v2/devices/${SIM_SPEED_BUTTON_FAN_ID}/actions/IncreaseSpeed`, {}, DEFAULT_TOKEN);
    const decrease = await request(port, 'PUT', `/v2/devices/${SIM_SPEED_BUTTON_FAN_ID}/actions/DecreaseSpeed`, {}, DEFAULT_TOKEN);
    const state = await request(port, 'GET', `/v2/devices/${SIM_SPEED_BUTTON_FAN_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(increase.statusCode).to.equal(200);
    expect(decrease.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ power: 1, speed: 1 });
  });

  it('toggles fan direction when advertised', async () => {
    const response = await request(port, 'PUT', `/v2/devices/${SIM_DIRECTION_FAN_ID}/actions/ToggleDirection`, {}, DEFAULT_TOKEN);
    const state = await request(port, 'GET', `/v2/devices/${SIM_DIRECTION_FAN_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ power: 0, speed: 1, direction: -1 });
  });

  it('toggles up and down fan lights independently', async () => {
    const up = await request(port, 'PUT', `/v2/devices/${SIM_UP_DOWN_LIGHT_FAN_ID}/actions/ToggleUpLight`, {}, DEFAULT_TOKEN);
    const down = await request(port, 'PUT', `/v2/devices/${SIM_UP_DOWN_LIGHT_FAN_ID}/actions/ToggleDownLight`, {}, DEFAULT_TOKEN);
    const state = await request(port, 'GET', `/v2/devices/${SIM_UP_DOWN_LIGHT_FAN_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(up.statusCode).to.equal(200);
    expect(down.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({
      power: 0,
      speed: 1,
      light: 1,
      up_light: 1,
      down_light: 1,
    });
  });

  it('patches fan state and broadcasts the changed fields', async () => {
    const response = await request(
      port,
      'PATCH',
      `/v2/devices/${SIM_LIGHT_FAN_ID}/state`,
      { power: 1, speed: 2, light: 1 },
      DEFAULT_TOKEN,
    );
    const state = await request(port, 'GET', `/v2/devices/${SIM_LIGHT_FAN_ID}/state`, undefined, DEFAULT_TOKEN);

    expect(response.statusCode).to.equal(200);
    expect(state.body).to.deep.equal({ power: 1, speed: 2, light: 1 });
    expect(bpupPackets).to.deep.equal([
      {
        B: DEFAULT_BOND_ID,
        t: `devices/${SIM_LIGHT_FAN_ID}/state`,
        m: 4,
        b: { power: 1, speed: 2, light: 1 },
      },
    ]);
  });
});
