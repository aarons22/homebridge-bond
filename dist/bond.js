"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request-promise");
class Bond {
    constructor(response) {
        this.sequence = 0;
        this.id = response.id;
        let commandMap = new Map();
        for (let obj of response.commands) {
            if (commandMap.has(obj.device)) {
                var cmds = commandMap.get(obj.device);
                cmds.push(obj);
                commandMap.set(obj.device, cmds);
            }
            else {
                commandMap.set(obj.device, [obj]);
            }
        }
        var devices = [];
        for (let [deviceId, objs] of commandMap.entries()) {
            var commands = [];
            for (let obj of objs) {
                commands.push({
                    id: obj.id,
                    name: obj.command_type,
                    propertyId: obj.device_property_command_id
                });
            }
            devices.push({
                id: objs[0].id,
                type: objs[0].device_type,
                room: objs[0].location_type,
                propertyId: objs[0].device_property_id,
                commands: commands,
                bondId: this.id
            });
        }
        this.devices = devices;
    }
    powerOffCommand(device) {
        return device.commands
            .filter(command => {
            return command.name == "Power Toggle";
        })[0];
    }
    powerOnCommand(device) {
        return this.sortedSpeedCommands(device)[0];
    }
    commandForName(device, name) {
        return (device.commands
            .filter(command => {
            return command.name == name;
        }) || [null])[0];
    }
    sortedSpeedCommands(device) {
        return device.commands
            .filter(command => {
            return command.name.startsWith("Speed ");
        })
            .sort((a, b) => {
            return parseInt(a.name.replace(/[^\d.]/g, '')) > parseInt(b.name.replace(/[^\d.]/g, '')) ? 1 : -1;
        });
    }
    sendCommand(session, command, device) {
        this.sequence++;
        let url = "https://" + this.id + ":4433/api/v1/device/" + (parseInt(device.propertyId) - 1) + "/device_property/" + device.propertyId + "/device_property_command/" + command.propertyId + "/run";
        return request({
            method: 'GET',
            uri: url,
            rejectUnauthorized: false,
            headers: {
                'X-Token': session.token,
                'X-Sequence': this.sequence,
                'X-BondDate': (new Date()).toISOString().split(".")[0] + "Z"
            }
        })
            .then(response => {
            return;
        });
    }
}
exports.Bond = Bond;
