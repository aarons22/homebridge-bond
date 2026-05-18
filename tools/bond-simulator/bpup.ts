import dgram from 'dgram';
import { BpupBroadcaster, BpupPacket, DEFAULT_BPUP_PORT, SimulatorLogger } from './server';

interface BpupClient {
  address: string;
  port: number;
  lastSeen: number;
}

export class UdpBpupBroadcaster implements BpupBroadcaster {
  private readonly socket = dgram.createSocket('udp4');
  private readonly clients = new Map<string, BpupClient>();

  constructor(private readonly logger: SimulatorLogger = () => undefined) {}

  public async listen(port = DEFAULT_BPUP_PORT) {
    this.socket.on('message', (_message, remote) => {
      const key = `${remote.address}:${remote.port}`;
      const hadClient = this.clients.has(key);
      this.clients.set(key, {
        address: remote.address,
        port: remote.port,
        lastSeen: Date.now(),
      });
      if (!hadClient) {
        this.logger(`BPUP keepalive registered ${key}`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.socket.once('error', reject);
      this.socket.bind(port, () => {
        this.socket.off('error', reject);
        resolve();
      });
    });
  }

  public broadcast(packet: BpupPacket) {
    const message = Buffer.from(JSON.stringify(packet));
    const staleBefore = Date.now() - 1000 * 60 * 5;
    let sendCount = 0;

    this.clients.forEach((client, key) => {
      if (client.lastSeen < staleBefore) {
        this.clients.delete(key);
        this.logger(`BPUP client expired ${key}`);
        return;
      }

      this.socket.send(message, client.port, client.address);
      sendCount += 1;
      this.logger(`BPUP sent ${packet.t} to ${key}`);
    });

    if (sendCount === 0) {
      this.logger(`BPUP no clients for ${packet.t}`);
    }
  }

  public close() {
    this.socket.close();
  }
}
