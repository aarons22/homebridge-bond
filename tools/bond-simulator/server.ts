import { IncomingMessage, ServerResponse, createServer } from 'http';
import { AddressInfo } from 'net';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

export const DEFAULT_HTTP_PORT = 18080;
export const DEFAULT_BPUP_PORT = 30007;
export const DEFAULT_TOKEN = 'sim-token';
export const DEFAULT_BOND_ID = 'SIMBOND000001';
export const SIM_LIGHT_ID = '00000001';
export const SIM_DIMMABLE_LIGHT_ID = '00000002';

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

export interface BondSimulatorOptions {
  bondId?: string;
  token?: string;
  staticDir?: string;
  broadcaster?: BpupBroadcaster;
}

interface SimulatorDevice {
  id: string;
  name: string;
  location: string;
  type: string;
  actions: string[];
  properties: {
    trust_state: boolean;
    max_speed: null;
  };
  state: {
    light: number;
    brightness?: number;
  };
}

const NOOP_BROADCASTER: BpupBroadcaster = {
  broadcast: () => undefined,
};

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
  private readonly devices: SimulatorDevice[];
  private httpHost = '127.0.0.1';
  private httpPort = DEFAULT_HTTP_PORT;

  constructor(options: BondSimulatorOptions = {}) {
    this.bondId = options.bondId ?? DEFAULT_BOND_ID;
    this.token = options.token ?? DEFAULT_TOKEN;
    this.staticDir = options.staticDir ?? join(__dirname, 'static');
    this.broadcaster = options.broadcaster ?? NOOP_BROADCASTER;
    this.devices = [
      {
        id: SIM_LIGHT_ID,
        name: 'Sim Light',
        location: 'Simulator',
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
        name: 'Dimmer Light',
        location: 'Simulator',
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
      this.toggleLight(id);
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
      if (changed) {
        this.broadcastState(device.id);
      }
      this.sendJson(response, 200, {});
      return;
    }

    if (request.method === 'PUT' && child === 'actions' && actionName) {
      const body = await this.readJsonBody(request);
      const handled = this.handleAction(device.id, actionName, body);
      this.sendJson(response, handled ? 200 : 404, handled ? {} : { error: 'not_found' });
      return;
    }

    this.sendJson(response, 404, { error: 'not_found' });
  }

  private handleAction(deviceId: string, actionName: string, body: JsonObject) {
    if (actionName === 'ToggleLight') {
      return this.toggleLight(deviceId);
    }

    if (actionName === 'SetBrightness' && typeof body.argument === 'number') {
      return this.setBrightness(deviceId, body.argument);
    }

    if (actionName === 'TurnLightOff') {
      return this.setLight(deviceId, 0);
    }

    return false;
  }

  private patchState(deviceId: string, body: JsonObject) {
    const device = this.getSimulatorDevice(deviceId);
    if (!device) {
      return false;
    }

    let changed = false;
    if ((body.light === 0 || body.light === 1) && device.state.light !== body.light) {
      device.state.light = body.light;
      changed = true;
    }

    if (typeof body.brightness === 'number' && device.state.brightness !== undefined) {
      const brightness = this.normalizeBrightness(body.brightness);
      if (device.state.brightness !== brightness) {
        device.state.brightness = brightness;
        changed = true;
      }
    }

    return changed;
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
    if (!device) {
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
    device.state.light = 1;
    this.broadcastState(device.id);
    return true;
  }

  private broadcastState(deviceId: string) {
    this.broadcaster.broadcast({
      B: this.bondId,
      t: `devices/${deviceId}/state`,
      m: 4,
      b: this.getState(deviceId),
    });
  }

  private getSimulatorDevice(id: string) {
    return this.devices.find(device => device.id === id);
  }

  private normalizeBrightness(value: number) {
    return Math.min(100, Math.max(1, Math.round(value)));
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
      })),
      homebridgeConfig: {
        platform: 'Bond',
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
