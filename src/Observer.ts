import { Characteristic, CharacteristicProps, CharacteristicValue, CharacteristicGetCallback, CharacteristicSetCallback } from 'homebridge';
import { BondPlatform } from './platform';

export class Observer {
  public static add(
    platform: BondPlatform,
    characteristic: Characteristic,
    get: () => Promise<CharacteristicValue>,
    set: ((value: CharacteristicValue) => Promise<void> | undefined) | undefined = undefined,
    props: Partial<CharacteristicProps> = {},
  ) {

    get().then(val => {
      characteristic.updateValue(val);
    });

    const chain = characteristic
      .setProps(props)
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

    if (set === undefined) {
      return;
    }

    chain 
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        // Avoid doing anything when the device is in the requested state
        if (value === characteristic.value) {
          callback(null);
          return;
        }
        
        const res = set(value);
        if (res === undefined) {
          return;
        }
        res
          .then(() => {
            platform.log.debug(`value changed: ${value}`);
            characteristic.updateValue(value);
            callback(null);
          })
          .catch((error: string) => {
            platform.log.error(`error changing value: ${error}`);
            callback(Error(error));
          });
      });
  }
}
