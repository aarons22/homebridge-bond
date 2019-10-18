import Promise from 'bluebird';
import { HAP, hap } from './homebridge/hap';
import { Bond } from './interface/Bond';

export class Observer {
  public static add(
    log: HAP.Log,
    bulb: HAP.Service,
    characteristic: HAP.Characteristic,
    get: () => Promise<any>,
    set: (value: any) => Promise<void> | undefined,
    props: {} = {},
  ) {
    const char = bulb.getCharacteristic(characteristic);

    get().then(val => {
      char.updateValue(val);
    });

    char
      .on('set', (value: any, callback: { (): void; (): void }) => {
        // Avoid doing anything when the device is in the requested state
        if (value === char.value) {
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
            log(`value changed: ${value}`);
            char.updateValue(value);
            callback();
          })
          .catch((error: string) => {
            log(`error changing value: ${error}`);
            callback();
          });
      })
      .on('get', (callback: (arg0: null, arg1: boolean) => void) => {
        get()
          .then(value => {
            log(`got value: ${value}`);
            callback(null, value);
          })
          .catch(error => {
            log.error(`error getting value: ${error}`);
            callback(null, false);
          });
      });
  }
}
