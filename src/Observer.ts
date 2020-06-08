import { Characteristic, CharacteristicValue, CharacteristicGetCallback, CharacteristicSetCallback } from 'homebridge';
import { BondPlatform } from './platform';

export class Observer {
  public static add(
    platform: BondPlatform,
    characteristic: Characteristic,
    get: () => Promise<CharacteristicValue>,
    set: (value: CharacteristicValue) => Promise<void> | undefined,
    props: Record<string, unknown> = {},
  ) {

    get().then(val => {
      characteristic.updateValue(val);
    });

    characteristic
      .setProps(props)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        // Avoid doing anything when the device is in the requested state
        if (value === characteristic.value) {
          callback(null);
          return;
        }

        const res = set(value);
        if (res === undefined) {
          callback(Error('set not defined'));
          return;
        }

        res
          .then(() => {
            platform.log(`value changed: ${value}`);
            characteristic.updateValue(value);
            callback(null);
          })
          .catch((error: string) => {
            platform.log(`error changing value: ${error}`);
            callback(Error(error));
          });
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        get()
          .then((value: CharacteristicValue) => {
            platform.log(`got value: ${value}`);
            callback(null, value);
          })
          .catch((error: string) => {
            platform.log(`error getting value: ${error}`);
            callback(Error(error), null);
          });
      });
  }
}
