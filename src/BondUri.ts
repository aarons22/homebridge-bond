import { Action } from './enum/Action';
export class BondUri {
  private bondIP: string;
  constructor(bondIP: string) {
    this.bondIP = bondIP;
  }
  public deviceIds(): string {
    return `http://${this.bondIP}/v2/devices`;
  }
  public device(id: string): string {
    return `http://${this.bondIP}/v2/devices/${id}`;
  }
  public state(id: string): string {
    return `http://${this.bondIP}/v2/devices/${id}/state`;
  }
  public action(id: string, action: Action): string {
    return `http://${this.bondIP}/v2/devices/${id}/actions/${action}`;
  }

  public commands(id: string): string {
    return `http://${this.bondIP}/v2/devices/${id}/commands`;
  }

  public command(deviceId: string, commandId: string): string {
    return `http://${this.bondIP}/v2/devices/${deviceId}/commands/${commandId}`;
  }

  public properties(id: string): string {
    return `http://${this.bondIP}/v2/devices/${id}/properties`;
  }
}
