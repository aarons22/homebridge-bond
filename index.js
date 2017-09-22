var Service, Characteristic;
var request = require("request");

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-harmony-api", "HarmonyDevice", HarmonyDevice);
};


function HarmonyDevice(log, config) {
  this.log = log;

  // url info
  this.name = config["name"];
  this.serviceType = config["service"] || "Switch";
  this.host = config["host"];
  this.port = config["port"];
  this.hubSlug = config["hub_slug"];
  this.deviceSlug = config["device_slug"];
  this.commands = config["commands"];
}

HarmonyDevice.prototype = {
  httpRequest: function (method, url, callback) {
    request({
      url: url,
      method: method
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },

  setPowerState: function (powerState, callback) {
    console.log("[HarmonyDevice] Power On", powerState);

    var commandSlug = this.state ? this.commands["off"] : this.commands["on"];
    var url = "http://" + this.host + ":" + this.port + "/hubs/" + this.hubSlug + "/devices/" + this.deviceSlug + "/commands/" + commandSlug;

    var that = this;
    this.httpRequest("POST", url, function (error, response, responseBody) {
      if (error) {
        console.log("[HarmonyDevice] set power state failed: %s", error.message);
        callback(error);
      } else {
        console.log("[HarmonyDevice] set power state succeeded!");
        that.state = powerState;
        callback();
      }
    }.bind(this));
  },

  getPowerState: function (callback) {
    callback(null, this.state);
  },

  setRotationSpeed: function (rotationSpeed, callback) {
    console.log("[HarmonyDevice] Rotation Speed", rotationSpeed);

    var commands = this.commands["rotation_speed"];
    var levels = Object.keys(commands)
      .map(function(val) { return parseInt(val); })
      .sort(function(a, b) { return a - b });
    var command = null;
    for (var i = 0; i < levels.length; i++) {
      var level = levels[i];
      if (level >= rotationSpeed) {
        command = commands[level.toString()];
        break;
      }
    }
    if (command == null) {
      callback(new Error("Missing command"));
      return;
    }
    var url = "http://" + this.host + ":" + this.port + "/hubs/" + this.hubSlug + "/devices/" + this.deviceSlug + "/commands/" + command;

    this.httpRequest("POST", url, function (error, response, responseBody) {
      if (error) {
        console.log("[HarmonyDevice] set rotation speed failed: %s", error.message);
        callback(error);
      } else {
        console.log("[HarmonyDevice] set rotation speed succeeded!");
        this.rotationSpeed = rotationSpeed;
        callback();
      }
    }.bind(this));
  },

  getRotationSpeed: function (callback) {
    callback(null, this.rotationSpeed);
  },

  setMuteState: function (muteState, callback) {
    console.log("Mute", muteState);

    var url = "http://" + this.host + ":" + this.port + "/hubs/" + this.hubSlug + "/devices/" + this.deviceSlug + "/commands/" + this.muteSlug;

    this.httpRequest("POST", url, function (error, response, responseBody) {
      if (error) {
        console.log("[HarmonyDevice] set mute state failed: %s", error.message);
        callback(error);
      } else {
        console.log("[HarmonyDevice] set mute state succeeded!");
        this.muted = muteState;
        callback();
      }
    }.bind(this));
  },

  getMuteState: function (callback) {
    callback(null, this.muted);
  },

  identify: function (callback) {
    this.log("[HarmonyDevice] Identify requested!");
    callback(); // success
  },

  getServices: function () {
    var that = this;

    // you can OPTIONALLY create an information service if you wish to override
    // the default values for things like serial number, model, etc.
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HarmonyDevice Manufacturer")
      .setCharacteristic(Characteristic.Model, "HarmonyDevice Model")
      .setCharacteristic(Characteristic.SerialNumber, "HarmonyDevice Serial Number");

    switch (this.serviceType) {
    case "Switch":
      this.service = new Service.Switch(this.name);
      this.service
        .getCharacteristic(Characteristic.On)
        .on("get", this.getPowerState.bind(this))
        .on("set", this.setPowerState.bind(this));

      return [this.service];
    case "Fan":
      this.service = new Service.Fan(this.name);
      this.service
        .getCharacteristic(Characteristic.On)
        .on("get", this.getPowerState.bind(this))
        .on("set", this.setPowerState.bind(this));

      if (this.commands["rotation_speed"]) {
        this.service
          .getCharacteristic(Characteristic.RotationSpeed)
          .on("get", this.getRotationSpeed.bind(this))
          .on("set", this.setRotationSpeed.bind(this));
      }

      return [this.service];
    case "Speaker":
      this.service = new Service.Speaker(this.name);
      this.service
        .getCharacteristic(Characteristic.Mute)
        .on("get", this.getMuteState.bind(this))
        .on("set", this.setMuteState.bind(this));

      return [this.service];
    }
  }
};