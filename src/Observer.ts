import { Characteristic } from 'homebridge';
import { BondPlatform } from './platform';

export class Observer {
  public static add(
    platform: BondPlatform,
    characteristic: Characteristic,
    get: () => Promise<any>,
    set: (value: any) => Promise<void> | undefined,
    props: {} = {},
  ) {

    get().then(val => {
      characteristic.updateValue(val);
    });

    characteristic
      .setProps(props)
      .on('set', (value: any, callback: { (): void; (): void }) => {
        // Avoid doing anything when the device is in the requested state
        if (value === characteristic.value) {
          callback();
          return;
        }

        const res = set(value);
        if (res === undefined) {
          callback();
          return;
        }

        res
          .then(() => {
            platform.log(`value changed: ${value}`);
            characteristic.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            platform.log(`error changing value: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        get()
          .then(value => {
            platform.log(`got value: ${value}`);
            callback(null, value);
          })
          .catch(error => {
            platform.log(`error getting value: ${error}`);
            callback(null, false);
          });
      });
  }
}
