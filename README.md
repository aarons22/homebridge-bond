[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/v/homebridge-bond)](https://www.npmjs.com/package/homebridge-bond)
[![npm](https://badgen.net/npm/dt/homebridge-bond)](https://www.npmjs.com/package/homebridge-bond)

# homebridge-bond

Bond plug-in for [Homebridge](https://github.com/nfarina/homebridge) using the [Bond V2 API](http://docs-local.appbond.com). In oder to use this plugin, you'll need to make sure your Bond has been updated to firmware v2.

**NOTE: If you are still on v1 (using the Bond Bridge app)**:

- You need to download the new [Bond Home](https://apps.apple.com/us/app/bond-home/id1447691811) app and update your firmware.
- After that, follow the [migration guide](https://github.com/aarons22/homebridge-bond/wiki/Migrating-from-v1-to-v2).

Some Bond's may not be able to update to v2 firmware. If so, you can use the [v1 homebrige plugin](https://www.npmjs.com/package/homebridge-bond-v1).

## Features

This plugin currently supports the following devices and features:

- Multiple Bonds
- Ceiling Fan
  - Light on/off
  - Up/Down light (no dimming yet)
  - Fan Speeds 1-8 (dynamic based on bond configuration)
  - Light Dimming (`off` by default; see config below)
    - When using this feature, turn the switch on to start dimming. When you reach the brightness level you would like, turn the switch off.
- Generic Device
  - On / Off (appears as switch in HomeKit)
- Fireplace
  - Flame On / Off (appears as switch in HomeKit)

You can view the backlog of features [here](https://github.com/aarons22/homebridge-bond/). Feel free to add a feature request in the Issues tab!

## Installation

Assuming a global installation of `homebridge`:

`npm i -g homebridge-bond`

## Homebridge Configuration

Add the `Bond` platform in your homebridge `config.json` file.

### Easiest Configuration

For the best experience setting up this plugin, please use [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x).

### Basic Configuration

To get your Bond IP Address, follow the instructions [here](https://github.com/aarons22/homebridge-bond/wiki/Get-Bond-IP-Address).

`BOND_TOKEN` (Local token) can be found in the app. Go to your Bond settings:

![alt text](./docs/bond-settings.jpeg 'Bond Settings')

You can tap on each row to copy the contents to the clipboard.

```json
"platforms": [
    {
        "platform": "Bond",
        "bonds": [
            {
                "ip_address": "<BOND_IP_ADDRESS>",
                "token": "<BOND_TOKEN>"
            }
        ],
    }
],
```

## Optional Parameters

| Option             | Default | Explanation                                                                                                                                                         |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include_dimmer`   | false   | If dimming is a valid action on a device, it will be included as additional switch on the accessory. Since this is an odd solution to dimming, it's off by default. |
| `fan_speed_values` | false   | Use fan speed values instead of percentages (i.e. Hey Siri set the Office Fan to 2).                                                                                |

## Development

I'm more than happy to take PRs if you want to fix a bug you are having or take a shot at adding a new feature you're interested in. To compile the code in realtime, run:

```
npm run dev
```

To use the local version of the plugin in homebridge, I run `npm link` in the directory of the cloned repo.

## Contact

You can find me on Twitter [@aaronsapp](https://twitter.com/aaronsapp)
