export interface Version {
  api: number;
  bondid: string; 
  fw_ver: string;
  target: string | null;
  make: string | null;
  model: string | null;
  mcu_ver: string | null;
}