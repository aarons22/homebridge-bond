var Accessory, Service, Characteristic, UUIDGen;
import * as request from 'request-promise';
import * as Promise from 'bluebird';
import { Bond, Device, Session, Fan, Command } from './bond';

export = function(homebridge: any) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.platformAccessory;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform('homebridge-bond', 'Bond', BondPlatform, true);
}

class BondPlatform {
  private accessories: any[] = [];
  private session: Session;
  private bonds: Bond[];

  constructor(private log: (string) => void, config: {}, private api: any) {
    let email = config['email'];
    let password = config['password'];

    let that = this;
    api.on('didFinishLaunching', () => {
      that.log(that.accessories.length + " cached accessories were loaded");

      that
        .login(email, password)
        .then(session => {
          that.session = session;

          return that.readBonds();
        })
        .then(bonds => {
          that.bonds = bonds;
          if (bonds.length == 0) {
            that.log("No new bonds found.");
          } else {
            bonds.forEach(bond => {
              bond.devices
                .filter(device => { return !that.deviceAdded(device.id); })
                .forEach(device => {
                  that.addAccessory(device);
                });
            });
          }


        })
        .catch(error => {
          that.log(error);
        });
    });
  }

  addAccessory(device: Device) {
    if (this.deviceAdded(device.id)) {
      this.log(device.id + " has already been added.");
      return;
    }

    if (device.type != "Fan") {
      this.log(device.id + " has an unsupported device type.");
      return;
    }

    var accessory = new Accessory(device.room + " " + device.type, UUIDGen.generate(device.id.toString()));
    accessory.context.device = device;
    accessory.reachable = true;

    accessory
      .addService(Service.Fan, device.room + " " + device.type);
    accessory
      .addService(Service.Switch, "Reverse " + device.room + " " + device.type);
    accessory
      .addService(Service.Lightbulb, device.room + " " + device.type + " Light");
    this.setupObservers(accessory);

    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.SerialNumber, device.id);

    this.api.registerPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
    this.accessories.push(accessory);
  }

  removeAccessory(accessory: any) {
    this.log("Removing accessory " + accessory.displayName);

    let index = this.accessories.indexOf(accessory);
    if (index > -1) {
      this.accessories.splice(index, 1);
    }

    this.api.unregisterPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
  }

  configureAccessory(accessory: any) {
    this.accessories.push(accessory);

    if (this.bonds) {
      this.log("Configure Accessory: " + accessory.displayName);
      this.setupObservers(accessory);
    } else {
      let that = this;
      let timer = setInterval(() => {
        if (this.bonds) {
          that.log("Configure Accessory: " + accessory.displayName);
          that.setupObservers(accessory);
          clearInterval(timer);
        }
      }, 500);
    }
  }

  private setupObservers(accessory: any) {
    let that = this;
    let device: Device = accessory.context.device;
    let bond = this.bondForIdentifier(device.bondId);
    if (device.type == "Fan" && accessory.getService(Service.Fan)) {
      let fan = <Fan>device;
      accessory.getService(Service.Switch)
        .getCharacteristic(Characteristic.On)
        .on('set', function(value, callback) {
          let command = bond.commandForName(fan, "Reverse");
          bond.sendCommand(that.session, command, fan)
            .then(() => {
              fan.reverse = !fan.reverse
              callback();
            })
            .catch(error => {
              that.log(error);
              callback();
            });
        })
        .on('get', function(callback) {
          callback(null, fan.reverse);
        });
      accessory.getService(Service.Lightbulb)
          .getCharacteristic(Characteristic.On)
          .on('set', function (value, callback) {
            let command = bond.commandForName(fan, "Light Toggle");
            bond.sendCommand(that.session, command, fan)
              .then(() => {
              fan.light = !fan.light
              callback();
            })
            .catch(error => {
              that.log(error);
              callback();
            });
          })
          .on('get', function (callback) {
            callback(null, fan.light);
          });
      accessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.On)
        .on('set', function(value, callback) {
          let command = value ? bond.powerOnCommand(fan) : bond.powerOffCommand(fan);

          bond.sendCommand(that.session, command, fan)
            .then(() => {
              callback();
            })
            .catch(error => {
              that.log(error);
              callback();
            });
        })
        .on('get', function(callback) {
          callback(null, fan.speed > 0);
        });
      accessory.getService(Service.Fan)
        .getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
          minStep: 33,
          maxValue: 99
        })
        .on('set', function(value, callback) {
          let commands = bond.sortedSpeedCommands(fan);
          var command: Command = null;
          if (value == 0) {
            command = bond.powerOffCommand(fan);
            (<Fan>accessory.context.device).speed = 0;
          } else if (value == 33) {
            command = commands[0];
            (<Fan>accessory.context.device).speed = 1;
          } else if (value == 66) {
            command = commands[1];
            (<Fan>accessory.context.device).speed = 2;
          } else if (value == 99) {
            command = commands[2];
            (<Fan>accessory.context.device).speed = 3;
          }

          bond.sendCommand(that.session, command, fan)
            .then(() => {
              callback();
            })
            .catch(error => {
              that.log(error);
              callback();
            });
        })
        .on('get', function(callback) {
          callback(null, fan.speed * 33);
        });
    }
  }

  private deviceAdded(id: number) {
    return this.accessoryForIdentifier(id) != null;
  }

  private bondForIdentifier(id: string): Bond {
    let bonds = this.bonds
      .filter(bond => {
        return bond.id == id;
      });
    return bonds.length > 0 ? bonds[0] : null;
  }

  private accessoryForIdentifier(id: number): any {
    let accessories = this.accessories
      .filter(acc => {
        let device: Device = acc.context.device;
        return device.id == id;
      });
    return accessories.length > 0 ? accessories[0] : null;
  }

  private login(email: string, password: string): Promise<Session> {
    let that = this;
    return request({
        method: 'POST',
        uri: 'https://appbond.com/api/v1/auth/login/',
        body: {
          email: email,
          password: password
        },
        json: true
      })
      .then(body => {
        return <Session>{
          key: body.key,
          token: body.user.bond_token
        }
      });
  }

  private readBonds(): Promise<Bond[]> {
    return request({
        method: 'GET',
        uri: 'https://appbond.com/api/v1/bonds/',
        headers: {
          Authorization: "Token " + this.session.key
        }
      })
      .then(body => {
        return JSON.parse(body)['results'].map(a => { return new Bond(a); });
      });
  }
}
