import { Characteristic, CharacteristicValue, CharacteristicSetCallback } from 'homebridge';

export class Observer {
  public static set(
    characteristic: Characteristic,
    set: (value: CharacteristicValue, callback: CharacteristicSetCallback) => void) {
    characteristic 
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        // Avoid doing anything when the device is in the requested state
        if (value === characteristic.value) {
          callback(null);
          return;
        }

        set(value, callback);
      });
  }
}
