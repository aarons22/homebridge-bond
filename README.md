# Homebridge-Bond

This plugin will make your Bond work with HomeKit
Current Features:
- Fan Speed
- Fan Light
- Reverse Fan

# About Bond

Bond is a product that will remember the IR/RF signals of your fan's remote to control them. 

# Installation

1) Install Homebridge via npm 
```
sudo npm i -g homebridge
```
2) Run Homebridge by typing 
```
Homebridge
````

Exit homebridge by typing (Ctrl + C)

Install this plugin via npm: 
~~~
Sudo npm i -g homebridge-bond
~~~
Or install this Fork using
```
sudo npm i -g iRayanKhan/homebridge-bond
```

After this fill in your Bond Email adress and password into the config

To access config on a raspberry pi type 
``` 
cd .homebridge/
```
After running homebridge and changing directory type:
```
Nano config.json
```
## Config
~~~
{
  "bridge": {
    "name": "Homebridge",
    "username": "CC:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-154"
  },
  "platforms": [
    {
      "platform": "Bond",
      "email": "<email>",
      "password": "<password>"
    }
  ]
}
  
~~~

# Bug Reporting:
If you encounter any bugs or have a suggestion use this format please!
```
Node Version:

OS:

Issue:

Expcted behaviour:

Config: (Please redact all personal info
```
## Meta

Follow the creator on Twitter: https://twitter.com/edc1591
Forked by: https://twitter.com/iRayanKhan

Distributed under the MIT license. See ``LICENSE`` for more information.

[license-image]: https://img.shields.io/badge/License-MIT-blue.svg
[license-url]: LICENSE
