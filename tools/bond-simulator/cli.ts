import { BondSimulatorServer, DEFAULT_BPUP_PORT, DEFAULT_HTTP_PORT, DEFAULT_BOND_ID, DEFAULT_TOKEN } from './server';
import { UdpBpupBroadcaster } from './bpup';

function log(message: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function main() {
  const port = Number(process.env.BOND_SIMULATOR_PORT ?? DEFAULT_HTTP_PORT);
  const token = process.env.BOND_SIMULATOR_TOKEN ?? DEFAULT_TOKEN;
  const bondId = process.env.BOND_SIMULATOR_BOND_ID ?? DEFAULT_BOND_ID;
  const broadcaster = new UdpBpupBroadcaster(log);

  await broadcaster.listen(DEFAULT_BPUP_PORT);

  const simulator = new BondSimulatorServer({
    token,
    bondId,
    broadcaster,
    logger: log,
  });

  await simulator.listen(port);

  log(`Bond simulator UI: http://127.0.0.1:${port}/`);
  log(`Homebridge Bond config: { "ip_address": "127.0.0.1:${port}", "token": "${token}" }`);
  log(`BPUP UDP listening on port ${DEFAULT_BPUP_PORT}`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
