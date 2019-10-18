[![npm version](https://badge.fury.io/js/homebridge-bond.svg)](https://badge.fury.io/js/homebridge-bond)

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
  - Fan Speeds 1-8 (dynamic based on bond configuration)
  - Light Dimming (`off` by default; see config below)

You can view the backlog of features [here](https://github.com/aarons22/homebridge-bond/). Feel free to add a feature request in the Issues tab!

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plug-in using: `npm install -g homebridge-bond`
3. Update your configuration file. See example `config.json` snippet below.

## Configuration

Configuration sample (edit `~/.homebridge/config.json`):

```
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

To get your Bond IP Address, follow the instructions [here](https://github.com/aarons22/homebridge-bond/wiki/Get-Bond-IP-Address).

`BOND_ID` and `BOND_TOKEN` (Local token) can be found in the app. Go to your Bond settings:

![alt text](./docs/bond-settings.jpeg 'Bond Settings')

You can tap on each row to copy the contents to the clipboard.

## Optional Parameters

| Option           | Default | Explanation                                                                                                                                                         |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include_dimmer` | false   | If dimming is a valid action on a device, it will be included as additional switch on the accessory. Since this is an odd solution to dimming, it's off by default. |
| `debug`          | false   | Turns on additional logging.                                                                                                                                        |

## Development

I'm more than happy to take PRs if you want to fix a bug you are having or take a shot at adding a new feature you're interested in. To compile the code in realtime, run:

```
npm run dev
```

To use the local version of the plugin in homebridge, I run `npm link` in the directory of the cloned repo.

## Contact

You can find me on Twitter [@aaronsapp](https://twitter.com/aaronsapp)
