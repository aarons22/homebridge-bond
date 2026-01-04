import { Characteristic, CharacteristicValue } from 'homebridge';

export class Observer {
  public static set(
    characteristic: Characteristic,
    set: (value: CharacteristicValue) => Promise<void>) {
    characteristic 
      .onSet(async (value: CharacteristicValue) => {
        // Avoid doing anything when the device is in the requested state
        if (value === characteristic.value) {
          return;
        }

        await set(value);
      });
  }
}
