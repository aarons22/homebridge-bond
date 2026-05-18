import { IncomingMessage, ServerResponse, createServer } from 'http';
import { AddressInfo } from 'net';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

export const DEFAULT_HTTP_PORT = 18080;
export const DEFAULT_BPUP_PORT = 30007;
export const DEFAULT_TOKEN = 'sim-token';
export const DEFAULT_BOND_ID = 'SIMBOND000001';
export const DEFAULT_DEVICE_LOCATION = '';
export const SIM_LIGHT_ID = '00000001';
export const SIM_DIMMABLE_LIGHT_ID = '00000002';
export const SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID = '00000003';
export const SIM_TURN_LIGHT_OFF_ONLY_LIGHT_ID = '00000004';
export const SIM_BASIC_FAN_ID = '00000101';
export const SIM_DIRECTION_FAN_ID = '00000102';
export const SIM_SPEED_BUTTON_FAN_ID = '00000103';
export const SIM_LIGHT_FAN_ID = '00000104';
export const SIM_UP_DOWN_LIGHT_FAN_ID = '00000105';
export const SIM_DIMMER_FAN_ID = '00000106';
export const SIM_UP_DOWN_DIMMER_FAN_ID = '00000107';
export const SIM_BRIGHTNESS_BUTTON_FAN_ID = '00000108';
export const SIM_TOGGLE_SHADE_ID = '00000201';
export const SIM_POSITION_SHADE_ID = '00000202';
export const SIM_AWNING_SHADE_ID = '00000203';
export const SIM_BASIC_FIREPLACE_ID = '00000301';
export const SIM_FLAME_FIREPLACE_ID = '00000302';

type JsonObject = Record<string, unknown>;

export interface BpupPacket {
  B: string;
  t: string;
  m: number;
  b: JsonObject;
}

export interface BpupBroadcaster {
  broadcast(packet: BpupPacket): void;
}

export type SimulatorLogger = (message: string) => void;

export interface BondSimulatorOptions {
  bondId?: string;
  token?: string;
  staticDir?: string;
  broadcaster?: BpupBroadcaster;
  logger?: SimulatorLogger;
}

interface SimulatorDevice {
  id: string;
  name: string;
  location: string;
  type: string;
  subtype?: string;
  actions: string[];
  properties: {
    trust_state: boolean;
    max_speed?: number | null;
  };
  state: {
    light?: number;
    brightness?: number;
    power?: number;
    speed?: number;
    direction?: number;
    up_light?: number;
    down_light?: number;
    open?: number;
    position?: number;
    flame?: number;
  };
  lastUpdatedAt?: number;
  lastUpdatedBy?: 'external' | 'ui';
}

const NOOP_BROADCASTER: BpupBroadcaster = {
  broadcast: () => undefined,
};
const NOOP_LOGGER: SimulatorLogger = () => undefined;

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export class BondSimulatorServer {
  public readonly bondId: string;
  public readonly token: string;
  public readonly staticDir: string;
  private readonly broadcaster: BpupBroadcaster;
  private readonly logger: SimulatorLogger;
  private readonly devices: SimulatorDevice[];
  private httpHost = '127.0.0.1';
  private httpPort = DEFAULT_HTTP_PORT;

  constructor(options: BondSimulatorOptions = {}) {
    this.bondId = options.bondId ?? DEFAULT_BOND_ID;
    this.token = options.token ?? DEFAULT_TOKEN;
    this.staticDir = options.staticDir ?? join(__dirname, 'static');
    this.broadcaster = options.broadcaster ?? NOOP_BROADCASTER;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.devices = [
      {
        id: SIM_LIGHT_ID,
        name: 'Toggle Light',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'LT',
        actions: ['ToggleLight'],
        properties: {
          trust_state: true,
          max_speed: null,
        },
        state: {
          light: 0,
        },
      },
      {
        id: SIM_DIMMABLE_LIGHT_ID,
        name: 'Dimmable Light',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'LT',
        actions: ['ToggleLight', 'SetBrightness', 'TurnLightOff'],
        properties: {
          trust_state: true,
          max_speed: null,
        },
        state: {
          light: 0,
          brightness: 50,
        },
      },
      {
        id: SIM_SET_BRIGHTNESS_ONLY_LIGHT_ID,
        name: 'Set Brightness Only Light',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'LT',
        actions: ['ToggleLight', 'SetBrightness'],
        properties: {
          trust_state: true,
          max_speed: null,
        },
        state: {
          light: 0,
          brightness: 50,
        },
      },
      {
        id: SIM_TURN_LIGHT_OFF_ONLY_LIGHT_ID,
        name: 'Turn Light Off Only Light',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'LT',
        actions: ['ToggleLight', 'TurnLightOff'],
        properties: {
          trust_state: true,
          max_speed: null,
        },
        state: {
          light: 0,
        },
      },
      {
        id: SIM_BASIC_FAN_ID,
        name: 'Basic Fan',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: ['TurnOn', 'TurnOff', 'SetSpeed'],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
        },
      },
      {
        id: SIM_DIRECTION_FAN_ID,
        name: 'Direction Fan',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: ['TurnOn', 'TurnOff', 'SetSpeed', 'ToggleDirection'],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
          direction: 1,
        },
      },
      {
        id: SIM_SPEED_BUTTON_FAN_ID,
        name: 'Speed Button Fan',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: ['TurnOn', 'TurnOff', 'IncreaseSpeed', 'DecreaseSpeed'],
        properties: {
          trust_state: true,
        },
        state: {
          power: 0,
          speed: 1,
        },
      },
      {
        id: SIM_LIGHT_FAN_ID,
        name: 'Fan With Light',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: ['TurnOn', 'TurnOff', 'SetSpeed', 'ToggleLight'],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
          light: 0,
        },
      },
      {
        id: SIM_UP_DOWN_LIGHT_FAN_ID,
        name: 'Fan With Up Down Lights',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: ['TurnOn', 'TurnOff', 'SetSpeed', 'ToggleUpLight', 'ToggleDownLight'],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
          light: 1,
          up_light: 0,
          down_light: 0,
        },
      },
      {
        id: SIM_DIMMER_FAN_ID,
        name: 'Fan Light Dimmer',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: ['TurnOn', 'TurnOff', 'SetSpeed', 'ToggleLight', 'StartDimmer', 'Stop'],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
          light: 0,
        },
      },
      {
        id: SIM_UP_DOWN_DIMMER_FAN_ID,
        name: 'Fan Up Down Dimmer',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: [
          'TurnOn',
          'TurnOff',
          'SetSpeed',
          'ToggleUpLight',
          'ToggleDownLight',
          'StartDimmer',
          'StartUpLightDimmer',
          'StartDownLightDimmer',
          'Stop',
        ],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
          light: 1,
          up_light: 0,
          down_light: 0,
        },
      },
      {
        id: SIM_BRIGHTNESS_BUTTON_FAN_ID,
        name: 'Fan Brightness Buttons',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'CF',
        actions: [
          'TurnOn',
          'TurnOff',
          'SetSpeed',
          'ToggleLight',
          'StartIncreasingBrightness',
          'StartDecreasingBrightness',
          'Stop',
        ],
        properties: {
          trust_state: true,
          max_speed: 3,
        },
        state: {
          power: 0,
          speed: 1,
          light: 0,
          brightness: 50,
        },
      },
      {
        id: SIM_TOGGLE_SHADE_ID,
        name: 'Toggle Shade',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'MS',
        actions: ['ToggleOpen'],
        properties: {
          trust_state: true,
        },
        state: {
          open: 0,
        },
      },
      {
        id: SIM_POSITION_SHADE_ID,
        name: 'Position Shade',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'MS',
        actions: ['ToggleOpen', 'SetPosition'],
        properties: {
          trust_state: true,
        },
        state: {
          open: 0,
          position: 100,
        },
      },
      {
        id: SIM_AWNING_SHADE_ID,
        name: 'Awning Shade With Preset',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'MS',
        subtype: 'AWNING',
        actions: ['ToggleOpen', 'SetPosition', 'Preset'],
        properties: {
          trust_state: true,
        },
        state: {
          open: 0,
          position: 0,
        },
      },
      {
        id: SIM_BASIC_FIREPLACE_ID,
        name: 'Basic Fireplace',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'FP',
        actions: ['TogglePower'],
        properties: {
          trust_state: true,
        },
        state: {
          power: 0,
        },
      },
      {
        id: SIM_FLAME_FIREPLACE_ID,
        name: 'Flame Fireplace',
        location: DEFAULT_DEVICE_LOCATION,
        type: 'FP',
        actions: ['TogglePower', 'SetFlame'],
        properties: {
          trust_state: true,
        },
        state: {
          power: 0,
          flame: 50,
        },
      },
    ];
  }

  public createHttpServer() {
    return createServer((request, response) => {
      this.handleRequest(request, response).catch(error => {
        this.sendJson(response, 500, {
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    });
  }

  public async listen(port = DEFAULT_HTTP_PORT, host = '127.0.0.1') {
    const server = this.createHttpServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        this.httpHost = host;
        this.httpPort = getServerPort(server);
        resolve();
      });
    });

    return server;
  }

  public getState(id = SIM_LIGHT_ID) {
    return { ...this.getSimulatorDevice(id)?.state };
  }

  public getDevice(id = SIM_LIGHT_ID) {
    const device = this.getSimulatorDevice(id);
    if (!device) {
      return undefined;
    }

    return {
      name: device.name,
      location: device.location,
      type: device.type,
      ...(device.subtype ? { subtype: device.subtype } : {}),
      actions: [...device.actions],
      properties: {},
      state: {},
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const pathname = requestUrl.pathname;

    if (request.method === 'GET' && pathname === '/') {
      await this.serveStaticFile(response, 'index.html');
      return;
    }

    if (request.method === 'GET' && pathname.startsWith('/static/')) {
      await this.serveStaticFile(response, pathname.replace('/static/', ''));
      return;
    }

    if (pathname.startsWith('/v2/') && !this.isPublicBondEndpoint(request.method, pathname) && !this.isAuthorized(request)) {
      this.sendJson(response, 401, { error: 'unauthorized' });
      return;
    }

    if (request.method === 'GET' && pathname === '/v2/sys/version') {
      this.sendJson(response, 200, this.versionBody());
      return;
    }

    if (request.method === 'GET' && pathname === '/v2/devices') {
      const body: JsonObject = { _: this.hash() };
      this.devices.forEach(device => {
        body[device.id] = { _: this.hash() };
      });
      this.sendJson(response, 200, body);
      return;
    }

    const devicePath = pathname.match(/^\/v2\/devices\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
    if (devicePath) {
      await this.handleDeviceRequest(request, response, devicePath[1], devicePath[2], devicePath[3]);
      return;
    }

    if (pathname === '/v2/api/bpup') {
      this.handleBpupConfig(request, response);
      return;
    }

    if (request.method === 'GET' && pathname === '/simulator/status') {
      this.sendJson(response, 200, this.simulatorStatus());
      return;
    }

    if (request.method === 'PUT' && pathname === '/simulator/toggle') {
      const id = requestUrl.searchParams.get('id') ?? SIM_LIGHT_ID;
      if (this.toggleLight(id)) {
        this.markDeviceUpdated(id, 'ui');
      }
      this.sendJson(response, 200, this.simulatorStatus());
      return;
    }

    if (request.method === 'PUT' && pathname === '/simulator/brightness') {
      const body = await this.readJsonBody(request);
      const id = typeof body.id === 'string' ? body.id : SIM_DIMMABLE_LIGHT_ID;
      const brightness = typeof body.brightness === 'number' ? body.brightness : undefined;
      if (brightness === undefined) {
        this.sendJson(response, 400, { error: 'missing_brightness' });
        return;
      }
      const handled = this.setBrightness(id, brightness);
      if (handled) {
        this.markDeviceUpdated(id, 'ui');
      }
      this.sendJson(response, handled ? 200 : 404, handled ? this.simulatorStatus() : { error: 'not_found' });
      return;
    }

    if (request.method === 'PUT' && pathname === '/simulator/action') {
      const body = await this.readJsonBody(request);
      const id = typeof body.id === 'string' ? body.id : undefined;
      const action = typeof body.action === 'string' ? body.action : undefined;
      if (!id || !action) {
        this.sendJson(response, 400, { error: 'missing_action' });
        return;
      }

      const handled = this.handleAction(id, action, body);
      if (handled) {
        this.markDeviceUpdated(id, 'ui');
      }
      this.sendJson(response, handled ? 200 : 404, handled ? this.simulatorStatus() : { error: 'not_found' });
      return;
    }

    this.sendJson(response, 404, { error: 'not_found' });
  }

  private isPublicBondEndpoint(method: string | undefined, pathname: string) {
    return method === 'GET' && pathname === '/v2/sys/version';
  }

  private isAuthorized(request: IncomingMessage) {
    return request.headers['bond-token'] === this.token;
  }

  private handleBpupConfig(request: IncomingMessage, response: ServerResponse) {
    if (request.method === 'GET') {
      this.sendJson(response, 200, { broadcast: true });
      return;
    }

    if (request.method === 'PATCH') {
      this.sendJson(response, 200, {});
      return;
    }

    if (request.method === 'DELETE') {
      response.writeHead(204);
      response.end();
      return;
    }

    this.sendJson(response, 405, { error: 'method_not_allowed' });
  }

  private async handleDeviceRequest(
    request: IncomingMessage,
    response: ServerResponse,
    deviceId: string,
    child?: string,
    actionName?: string,
  ) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device) {
      this.sendJson(response, 404, { error: 'not_found' });
      return;
    }

    if (request.method === 'GET' && child === undefined) {
      this.sendJson(response, 200, this.getDevice(device.id));
      return;
    }

    if (request.method === 'GET' && child === 'properties') {
      this.sendJson(response, 200, device.properties);
      return;
    }

    if (request.method === 'GET' && child === 'state') {
      this.sendJson(response, 200, device.state);
      return;
    }

    if (request.method === 'PATCH' && child === 'state') {
      const body = await this.readJsonBody(request);
      const changed = this.patchState(device.id, body);
      this.logDeviceEvent(device, `PATCH state ${JSON.stringify(body)}${changed ? '' : ' (no change)'}`);
      if (changed) {
        this.markDeviceUpdated(device.id, 'external');
        this.broadcastState(device.id);
      }
      this.sendJson(response, 200, {});
      return;
    }

    if (request.method === 'PUT' && child === 'actions' && actionName) {
      const body = await this.readJsonBody(request);
      this.logDeviceEvent(device, `received PUT action ${actionName}${this.formatBody(body)}`);
      const handled = this.handleAction(device.id, actionName, body);
      if (handled) {
        this.markDeviceUpdated(device.id, 'external');
      }
      if (!handled) {
        this.logDeviceEvent(device, `unsupported PUT action ${actionName}${this.formatBody(body)}`);
      }
      this.sendJson(response, handled ? 200 : 404, handled ? {} : { error: 'not_found' });
      return;
    }

    this.sendJson(response, 404, { error: 'not_found' });
  }

  private handleAction(deviceId: string, actionName: string, body: JsonObject) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || !device.actions.includes(actionName)) {
      return false;
    }

    if (actionName === 'ToggleLight') {
      return this.toggleLight(deviceId);
    }

    if (actionName === 'SetBrightness' && typeof body.argument === 'number') {
      return this.setBrightness(deviceId, body.argument);
    }

    if (actionName === 'TurnLightOff') {
      return this.setLight(deviceId, 0);
    }

    if (actionName === 'TurnOn') {
      return this.setFanPower(deviceId, 1);
    }

    if (actionName === 'TurnOff') {
      return this.setFanPower(deviceId, 0);
    }

    if (actionName === 'SetSpeed' && typeof body.argument === 'number') {
      return this.setFanSpeed(deviceId, body.argument);
    }

    if (actionName === 'IncreaseSpeed') {
      return this.stepFanSpeed(deviceId, 1);
    }

    if (actionName === 'DecreaseSpeed') {
      return this.stepFanSpeed(deviceId, -1);
    }

    if (actionName === 'ToggleDirection') {
      return this.toggleDirection(deviceId);
    }

    if (actionName === 'ToggleUpLight') {
      return this.toggleLightField(deviceId, 'up_light');
    }

    if (actionName === 'ToggleDownLight') {
      return this.toggleLightField(deviceId, 'down_light');
    }

    if (actionName === 'ToggleOpen') {
      return this.toggleOpen(deviceId);
    }

    if (actionName === 'SetPosition' && typeof body.argument === 'number') {
      return this.setPosition(deviceId, body.argument);
    }

    if (actionName === 'Preset') {
      return this.setPosition(deviceId, 50);
    }

    if (actionName === 'TogglePower') {
      return this.togglePower(deviceId);
    }

    if (actionName === 'SetFlame' && typeof body.argument === 'number') {
      return this.setFlame(deviceId, body.argument);
    }

    if (this.isHoldAction(actionName)) {
      return true;
    }

    return false;
  }

  private patchState(deviceId: string, body: JsonObject) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device) {
      return false;
    }

    return Object.entries(body).reduce((changed, [key, value]) => (
      this.patchStateField(device, key, value) || changed
    ), false);
  }

  private toggleLight(deviceId: string) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device) {
      return false;
    }

    return this.setLight(device.id, device.state.light === 1 ? 0 : 1);
  }

  private setLight(deviceId: string, value: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.light === undefined) {
      return false;
    }

    device.state.light = value;
    this.broadcastState(device.id);
    return true;
  }

  private setBrightness(deviceId: string, value: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.brightness === undefined) {
      return false;
    }

    device.state.brightness = this.normalizeBrightness(value);
    device.state.light = device.state.brightness > 0 ? 1 : 0;
    this.broadcastState(device.id);
    return true;
  }

  private setFanPower(deviceId: string, value: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.power === undefined) {
      return false;
    }

    device.state.power = value;
    this.broadcastState(device.id);
    return true;
  }

  private setFanSpeed(deviceId: string, value: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.speed === undefined) {
      return false;
    }

    device.state.speed = this.normalizeSpeed(device, value);
    if (device.state.power !== undefined) {
      device.state.power = device.state.speed > 0 ? 1 : 0;
    }
    this.broadcastState(device.id);
    return true;
  }

  private stepFanSpeed(deviceId: string, direction: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.speed === undefined) {
      return false;
    }

    return this.setFanSpeed(deviceId, device.state.speed + direction);
  }

  private toggleDirection(deviceId: string) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.direction === undefined) {
      return false;
    }

    device.state.direction = device.state.direction === 1 ? -1 : 1;
    this.broadcastState(device.id);
    return true;
  }

  private toggleLightField(deviceId: string, field: 'up_light' | 'down_light') {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state[field] === undefined) {
      return false;
    }

    device.state.light = 1;
    device.state[field] = device.state[field] === 1 ? 0 : 1;
    this.broadcastState(device.id);
    return true;
  }

  private toggleOpen(deviceId: string) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.open === undefined) {
      return false;
    }

    device.state.open = device.state.open === 1 ? 0 : 1;
    if (device.state.position !== undefined) {
      device.state.position = this.shadePositionForOpen(device, device.state.open);
    }
    this.broadcastState(device.id);
    return true;
  }

  private setPosition(deviceId: string, value: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.position === undefined) {
      return false;
    }

    const position = this.normalizePosition(value);
    device.state.position = position;
    device.state.open = this.shadeOpenForPosition(device, position);
    this.broadcastState(device.id);
    return true;
  }

  private togglePower(deviceId: string) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.power === undefined) {
      return false;
    }

    device.state.power = device.state.power === 1 ? 0 : 1;
    this.broadcastState(device.id);
    return true;
  }

  private setFlame(deviceId: string, value: number) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device || device.state.flame === undefined) {
      return false;
    }

    device.state.flame = this.normalizePercent(value);
    device.state.power = device.state.flame > 0 ? 1 : 0;
    this.broadcastState(device.id);
    return true;
  }

  private patchStateField(device: SimulatorDevice, key: string, value: unknown) {
    if (key === 'brightness' && typeof value === 'number' && device.state.brightness !== undefined) {
      return this.setStateNumber(device, key, this.normalizeBrightness(value));
    }

    if (key === 'flame' && typeof value === 'number' && device.state.flame !== undefined) {
      return this.setStateNumber(device, key, this.normalizePercent(value));
    }

    if (key === 'speed' && typeof value === 'number' && device.state.speed !== undefined) {
      return this.setStateNumber(device, key, this.normalizeSpeed(device, value));
    }

    if (key === 'position' && typeof value === 'number' && device.state.position !== undefined) {
      return this.setStateNumber(device, key, this.normalizePosition(value));
    }

    if (
      (key === 'light' || key === 'power' || key === 'up_light' || key === 'down_light' || key === 'open')
      && (value === 0 || value === 1)
      && device.state[key] !== undefined
    ) {
      return this.setStateNumber(device, key, value);
    }

    if (key === 'direction' && (value === 1 || value === -1) && device.state.direction !== undefined) {
      return this.setStateNumber(device, key, value);
    }

    return false;
  }

  private setStateNumber(device: SimulatorDevice, key: keyof SimulatorDevice['state'], value: number) {
    if (device.state[key] === value) {
      return false;
    }

    device.state[key] = value;
    return true;
  }

  private broadcastState(deviceId: string) {
    const packet = {
      B: this.bondId,
      t: `devices/${deviceId}/state`,
      m: 4,
      b: this.getState(deviceId),
    };
    this.logger(`BPUP broadcast ${packet.t} ${JSON.stringify(packet.b)}`);
    this.broadcaster.broadcast(packet);
  }

  private logDeviceEvent(device: SimulatorDevice, message: string) {
    this.logger(`${device.name} (${device.id}) ${message}; state=${JSON.stringify(device.state)}`);
  }

  private formatBody(body: JsonObject) {
    return Object.keys(body).length === 0 ? '' : ` ${JSON.stringify(body)}`;
  }

  private getSimulatorDevice(id: string) {
    return this.devices.find(device => device.id === id);
  }

  private normalizeBrightness(value: number) {
    return this.normalizePercent(value);
  }

  private normalizePosition(value: number) {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  private normalizeSpeed(device: SimulatorDevice, value: number) {
    const maxSpeed = typeof device.properties.max_speed === 'number' ? device.properties.max_speed : 6;
    return Math.min(maxSpeed, Math.max(0, Math.round(value)));
  }

  private normalizePercent(value: number) {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  private shadePositionForOpen(device: SimulatorDevice, open: number) {
    if (device.subtype === 'AWNING') {
      return open === 1 ? 100 : 0;
    }

    return open === 1 ? 0 : 100;
  }

  private shadeOpenForPosition(device: SimulatorDevice, position: number) {
    if (device.subtype === 'AWNING') {
      return position > 0 ? 1 : 0;
    }

    return position < 100 ? 1 : 0;
  }

  private isHoldAction(actionName: string) {
    return [
      'StartDimmer',
      'StartUpLightDimmer',
      'StartDownLightDimmer',
      'StartIncreasingBrightness',
      'StartDecreasingBrightness',
      'Stop',
    ].includes(actionName);
  }

  private versionBody() {
    return {
      api: 2,
      bondid: this.bondId,
      fw_ver: 'v2.999.0-simulator',
      target: 'simulator',
      make: 'homebridge-bond',
      model: 'Bond Simulator',
    };
  }

  private simulatorStatus() {
    return {
      version: this.versionBody(),
      token: this.token,
      devices: this.devices.map(device => ({
        id: device.id,
        ...this.getDevice(device.id),
        properties: device.properties,
        state: this.getState(device.id),
        lastUpdatedAt: device.lastUpdatedAt ?? 0,
        lastUpdatedBy: device.lastUpdatedBy ?? null,
      })),
      homebridgeConfig: {
        platform: 'Bond',
        include_dimmer: true,
        include_toggle_state: true,
        bonds: [
          {
            ip_address: this.displayAddress(),
            token: this.token,
          },
        ],
      },
    };
  }

  private displayAddress() {
    const host = this.httpHost === '0.0.0.0' ? '127.0.0.1' : this.httpHost;
    return `${host}:${this.httpPort}`;
  }

  private markDeviceUpdated(deviceId: string, updatedBy: 'external' | 'ui') {
    const device = this.getSimulatorDevice(deviceId);
    if (!device) {
      return;
    }

    device.lastUpdatedAt = Date.now();
    device.lastUpdatedBy = updatedBy;
  }

  private hash() {
    return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  }

  private async readJsonBody(request: IncomingMessage): Promise<JsonObject> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString().trim();
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('JSON body must be an object');
    }
    return parsed as JsonObject;
  }

  private sendJson(response: ServerResponse, statusCode: number, body: unknown) {
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(body));
  }

  private async serveStaticFile(response: ServerResponse, filePath: string) {
    const safePath = normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = join(this.staticDir, safePath);
    const body = await readFile(absolutePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(absolutePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  }
}

export function getServerPort(server: ReturnType<BondSimulatorServer['createHttpServer']>) {
  const address = server.address() as AddressInfo;
  return address.port;
}
