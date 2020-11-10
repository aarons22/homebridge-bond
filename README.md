[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/v/homebridge-bond)](https://www.npmjs.com/package/homebridge-bond)
[![npm](https://badgen.net/npm/dt/homebridge-bond)](https://www.npmjs.com/package/homebridge-bond)

# homebridge-bond

Bond plug-in for [Homebridge](https://github.com/nfarina/homebridge) using the [Bond V2 API](http://docs-local.appbond.com).

## Features

This plugin currently supports the following devices and features:

- Multiple Bonds
- Supported Devices
  - Ceiling Fan
    - Light on/off
    - Up/Down light
    - Fan Speeds 1-8 (dynamic based on bond configuration)
    - Light Dimming
  - Blinds
    - Open / Close
  - Generic Device
    - On / Off (appears as switch in HomeKit)
  - Fireplace
    - Flame On / Off (appears as switch in HomeKit)


You can view the backlog of features [here](https://github.com/aarons22/homebridge-bond/). Feel free to add a feature request in the Issues tab!

## Installation

### Bond Parameters

| Option             | Required | Explanation |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ip_address`   | true   | To get your Bond IP Address, follow the instructions [here](https://github.com/aarons22/homebridge-bond/wiki/Get-Bond-IP-Address). |
| `token` | true   | This can be found in the Bond app in your Bond Settings. Scroll down until you see `Local Token`. You can tap on the row to copy to your clipboard. |
| `hide_device_ids` | false  | Array of device ids to ignore (i.e. `["1111", "2222"]`) |

### Easiest Configuration

For the best experience setting up this plugin, please use [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x).

### HOOBS Configuration

In HOOBS, you need to provide the bonds (optionally, turn on opt-in features):
```json
[
    {
        "ip_address": "<IP_ADDRESS>",
        "token": "<TOKEN>",
        "hide_device_ids": ["123456"]
    }
]
```

<ins>Example Config in HOOBS:</ins>

![Config](./images/hoobs_configuration.png)

### Basic Configuration

Assuming a global installation of `homebridge`, install the plugin:

`npm i -g homebridge-bond`

Add the `Bond` platform in your homebridge `config.json` file:

```json
"platforms": [
    {
        "platform": "Bond",
        "bonds": [
            {
                "ip_address": "<IP_ADDRESS>",
                "token": "<TOKEN>"
            }
        ],
    }
],
```

NOTE: If you have a "Smart by BOND" fan/device, you will need to add a Bond in the config for _each_ fan/device.

### Optional Platform Parameters

| Option             | Default | Explanation                                                                                                                                                         |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include_dimmer`   | false   | If dimming is a valid action on a device, it will be included as additional switch on the accessory. When using this feature, turn the switch on to start dimming. When you reach the brightness level you would like, turn the switch off. |
| `fan_speed_values` | false   | Use fan speed values instead of percentages (i.e. Hey Siri set the Office Fan to 2) |
| `include_toggle_state` | false  | This will add a switch to single-action accessories to toggle the state (i.e. Shades, Fireplace, Generic, Lights). Fan speeds are not eligible for this option. |

## Development

I'm more than happy to take PRs if you want to fix a bug you are having or take a shot at adding a new feature you're interested in. To compile the code in realtime, run:

```
npm run dev
```

To use the local version of the plugin in homebridge, I run `npm link` in the directory of the cloned repo.

## Contact

You can find me on Twitter [@aaronsapp](https://twitter.com/aaronsapp)
