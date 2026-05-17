import { BondSimulatorServer, DEFAULT_BPUP_PORT, DEFAULT_HTTP_PORT, DEFAULT_BOND_ID, DEFAULT_TOKEN } from './server';
import { UdpBpupBroadcaster } from './bpup';

async function main() {
  const port = Number(process.env.BOND_SIMULATOR_PORT ?? DEFAULT_HTTP_PORT);
  const token = process.env.BOND_SIMULATOR_TOKEN ?? DEFAULT_TOKEN;
  const bondId = process.env.BOND_SIMULATOR_BOND_ID ?? DEFAULT_BOND_ID;
  const broadcaster = new UdpBpupBroadcaster();

  await broadcaster.listen(DEFAULT_BPUP_PORT);

  const simulator = new BondSimulatorServer({
    token,
    bondId,
    broadcaster,
  });

  await simulator.listen(port);

  console.log(`Bond simulator UI: http://127.0.0.1:${port}/`);
  console.log(`Homebridge Bond config: { "ip_address": "127.0.0.1:${port}", "token": "${token}" }`);
  console.log(`BPUP UDP listening on port ${DEFAULT_BPUP_PORT}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
