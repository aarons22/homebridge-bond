var Service, Characteristic;
var request = require("request");

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-harmony-api", "HarmonyAccessory", HarmonyAccessory);
};


function HarmonyAccessory(log, config) {
  this.log = log;

  // url info
  this.name = config["name"];
  this.serviceType = config["service"] || "Switch";
  this.host = config["host"];
  this.port = config["port"];
  this.hubSlug = config["hub_slug"];
  this.deviceSlug = config["device_slug"];

  this.onSlug = config["on_slug"];
  this.offSlug = config["off_slug"];
  this.muteSlug = config["mute_slug"];
}

HarmonyAccessory.prototype = {
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
    console.log("Power On", powerState);

    var url = "http://" + this.host + ":" + this.port + "/hubs/" + this.hubSlug + "/devices/" + this.deviceSlug + "/commands/" + this.onSlug;

    this.httpRequest("POST", url, function (error, response, responseBody) {
      if (error) {
        console.log("HTTP set power function failed: %s", error.message);
        callback(error);
      } else {
        console.log("HTTP set power function succeeded!");
        callback();
      }
    }.bind(this));
  },

  getPowerState: function (callback) {
    callback(null, false);
  },

  setMuteState: function (muteState, callback) {
    console.log("Mute", muteState);

    var url = "http://" + this.host + ":" + this.port + "/hubs/" + this.hubSlug + "/devices/" + this.deviceSlug + "/commands/" + this.muteSlug;

    this.httpRequest("POST", url, function (error, response, responseBody) {
      if (error) {
        console.log("HTTP set power function failed: %s", error.message);
        callback(error);
      } else {
        console.log("HTTP set power function succeeded!");
        callback();
      }
    }.bind(this));
  },

  getMuteState: function (callback) {
    callback(null, false);
  },

  identify: function (callback) {
    this.log("Identify requested!");
    callback(); // success
  },

  getServices: function () {
    var that = this;

    // you can OPTIONALLY create an information service if you wish to override
    // the default values for things like serial number, model, etc.
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
      .setCharacteristic(Characteristic.Model, "HTTP Model")
      .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

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