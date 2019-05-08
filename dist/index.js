"use strict";
var Accessory, Service, Characteristic, UUIDGen;
const request = require("request-promise");
const bond_1 = require("./bond");
class BondPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.accessories = [];
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
                }
                else {
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
    addAccessory(device) {
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
            .addService(Service.Lightbulb, device.room + " " + device.type + " Light");
        accessory
            .addService(Service.Switch, "Reset " + device.room + " " + device.type, "reset");
        this.setupObservers(accessory);
        accessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.SerialNumber, device.id);
        this.api.registerPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
        this.accessories.push(accessory);
    }
    removeAccessory(accessory) {
        this.log("Removing accessory " + accessory.displayName);
        let index = this.accessories.indexOf(accessory);
        if (index > -1) {
            this.accessories.splice(index, 1);
        }
        this.api.unregisterPlatformAccessories('homebridge-bond', 'Bond', [accessory]);
    }
    upgrade(accessory) {
        let device = accessory.context.device;
        if (accessory.getService("Reset " + device.room + " " + device.type) == undefined) {
            this.log("Upgrading Accessory: " + accessory.displayName);
            accessory.addService(Service.Switch, "Reset " + device.room + " " + device.type, "reset");
        }
        let reverse = accessory.getService("Reverse " + device.room + " " + device.type);
        if (reverse !== undefined) {
            this.log("removing reverse switch");
            accessory.removeService(reverse);
        }
    }
    configureAccessory(accessory) {
        this.accessories.push(accessory);
        if (this.bonds) {
            this.log("Configure Accessory: " + accessory.displayName);
            this.upgrade(accessory);
            this.setupObservers(accessory);
        }
        else {
            let that = this;
            let timer = setInterval(() => {
                if (this.bonds) {
                    that.log("Configure Accessory: " + accessory.displayName);
                    this.upgrade(accessory);
                    that.setupObservers(accessory);
                    clearInterval(timer);
                }
            }, 500);
        }
    }
    setupObservers(accessory) {
        let that = this;
        let device = accessory.context.device;
        let bond = this.bondForIdentifier(device.bondId);
        let bulb = accessory.getService(Service.Lightbulb);
        let theFan = accessory.getService(Service.Fan);
        let reset = accessory.getService("Reset " + device.room + " " + device.type);
        if (device.type == "Fan" && accessory.getService(Service.Fan)) {
            theFan.getCharacteristic(Characteristic.RotationDirection)
                .on('set', function (value, callback) {
                let command = bond.commandForName(device, "Reverse");
                bond.sendCommand(that.session, command, device)
                    .then(() => {
                    theFan.getCharacteristic(Characteristic.RotationDirection).updateValue(value);
                    callback();
                })
                    .catch(error => {
                    that.log(error);
                    callback();
                });
            });
            bulb.getCharacteristic(Characteristic.On)
                .on('set', function (value, callback) {
                let command = bond.commandForName(device, "Light Toggle");
                // Called to avoid toggling when the light is already in the requested state. (Workaround for Siri)
                if (value == bulb.getCharacteristic(Characteristic.On).value) {
                    callback();
                    return;
                }
                bond.sendCommand(that.session, command, device)
                    .then(() => {
                    bulb.getCharacteristic(Characteristic.On).updateValue(value);
                    callback();
                })
                    .catch(error => {
                    that.log(error);
                    callback();
                });
            });
            theFan.getCharacteristic(Characteristic.On)
                .on('set', function (value, callback) {
                //this gets called right after a rotation set so ignore if state isnt changing
                if (value == theFan.getCharacteristic(Characteristic.On).value) {
                    callback();
                    return;
                }
                let speed = value ? theFan.getCharacteristic(Characteristic.RotationSpeed).value : 0;
                let command = that.getSpeedCommand(bond, device, speed);
                bond.sendCommand(that.session, command, device)
                    .then(() => {
                    callback();
                })
                    .catch(error => {
                    that.log(error);
                    callback();
                });
            });
            theFan.getCharacteristic(Characteristic.RotationSpeed)
                .setProps({
                minStep: 33,
                maxValue: 99
            })
                .on('set', function (value, callback) {
                let stop = false;
                var command = that.getSpeedCommand(bond, device, value);
                let old = theFan.getCharacteristic(Characteristic.RotationSpeed).value;
                theFan.getCharacteristic(Characteristic.RotationSpeed).updateValue(value);
                bond.sendCommand(that.session, command, device)
                    .then(() => {
                    callback();
                })
                    .catch(error => {
                    //because the on command comes in so quickly, we optimistically set our new value.
                    //if we fail roll it back
                    setTimeout(() => theFan.getCharacteristic(Characteristic.RotationSpeed).updateValue(old), 250);
                    that.log(error);
                    callback();
                });
            });
            reset.getCharacteristic(Characteristic.On)
                .on('set', function (value, callback) {
                theFan.getCharacteristic(Characteristic.On).updateValue(false);
                theFan.getCharacteristic(Characteristic.RotationDirection).updateValue(false);
                bulb.getCharacteristic(Characteristic.On).updateValue(false);
                setTimeout(() => reset.getCharacteristic(Characteristic.On).updateValue(false), 250);
                callback();
            })
                .on('get', function (callback) {
                callback(null, false);
            });
        }
    }
    getSpeedCommand(bond, device, speed) {
        let commands = bond.sortedSpeedCommands(device);
        switch (speed) {
            case 33:
                return commands[0];
            case 66:
                return commands[1];
            case 99:
                return commands[2];
            default:
                return bond.powerOffCommand(device);
        }
    }
    deviceAdded(id) {
        return this.accessoryForIdentifier(id) != null;
    }
    bondForIdentifier(id) {
        let bonds = this.bonds
            .filter(bond => {
            return bond.id == id;
        });
        return bonds.length > 0 ? bonds[0] : null;
    }
    accessoryForIdentifier(id) {
        let accessories = this.accessories
            .filter(acc => {
            let device = acc.context.device;
            return device.id == id;
        });
        return accessories.length > 0 ? accessories[0] : null;
    }
    login(email, password) {
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
            return {
                key: body.key,
                token: body.user.bond_token
            };
        });
    }
    readBonds() {
        return request({
            method: 'GET',
            uri: 'https://appbond.com/api/v1/bonds/',
            headers: {
                Authorization: "Token " + this.session.key
            }
        })
            .then(body => {
            return JSON.parse(body)['results'].map(a => { return new bond_1.Bond(a); });
        });
    }
}
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.platformAccessory;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform('homebridge-bond', 'Bond', BondPlatform, true);
};
