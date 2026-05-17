import dgram from 'dgram';
import { BpupBroadcaster, BpupPacket, DEFAULT_BPUP_PORT } from './server';

interface BpupClient {
  address: string;
  port: number;
  lastSeen: number;
}

export class UdpBpupBroadcaster implements BpupBroadcaster {
  private readonly socket = dgram.createSocket('udp4');
  private readonly clients = new Map<string, BpupClient>();

  public async listen(port = DEFAULT_BPUP_PORT) {
    this.socket.on('message', (_message, remote) => {
      const key = `${remote.address}:${remote.port}`;
      this.clients.set(key, {
        address: remote.address,
        port: remote.port,
        lastSeen: Date.now(),
      });
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

    this.clients.forEach((client, key) => {
      if (client.lastSeen < staleBefore) {
        this.clients.delete(key);
        return;
      }

      this.socket.send(message, client.port, client.address);
    });
  }

  public close() {
    this.socket.close();
  }
}
