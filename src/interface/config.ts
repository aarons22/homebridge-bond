export interface BondConfig {
  ip_address: string;
  token: string;
}

export interface BondPlatformConfig {
  bonds: BondConfig[];
  debug: boolean;
}
