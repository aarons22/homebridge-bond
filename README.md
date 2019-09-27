[![npm version](https://badge.fury.io/js/homebridge-bond.svg)](https://badge.fury.io/js/homebridge-bond)
# homebridge-bond

Bond plug-in for [Homebridge](https://github.com/nfarina/homebridge) using the [Bond V2 API](http://docs-local.appbond.com). In oder to use this plugin, you'll need to make sure your Bond has been updated to firmware v2. If you are still on v1 (using the Bond Bridge app), you'll need to down the new [Bond Home](https://apps.apple.com/us/app/bond-home/id1447691811) app and update your firmware.

Note: Some Bond's may not be able to update to v2 firmware. If so, you can use the [v1 homebrige plugin](https://www.npmjs.com/package/homebridge-bond-v1).

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
        "bond_ip_address": "<BOND_IP_ADDRESS>",
        "bond_token": "<BOND_TOKEN>"
    }
],
```

To get your Bond IP Address, follow the instructions [here](https://github.com/aarons22/homebridge-bonds/wiki/Get-Bond-IP-Address).

`BOND_ID` and `BOND_TOKEN` (Local token) can be found in the app. Go to your Bond settings:

![alt text](./docs/bond-settings.jpeg 'Bond Settings')

You can tap on each row to copy the contents to the clipboard.

## Contact

You can find me on Twitter [@aaronsapp](https://twitter.com/aaronsapp)
