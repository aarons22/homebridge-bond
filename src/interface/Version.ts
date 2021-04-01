export interface Version {
  api: number;
  bondid: string; 
  fw_ver: string;
  target?: string;
  make?: string;
  model?: string;
  mcu_ver?: string;
}