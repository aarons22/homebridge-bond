# homebridge-bond

A plugin that makes Bond Fan Hub's compatible with HomeKit!
Adds the Fan and Light accessory into HomeKit.

# About Bond

Bond uses a technology to mimic the IR/RF signals of your existing remote control fans and can be integrated with Google or Alexa. With this plugin you can use it with HomeKit.

# Installation

Install this plugin via npm: (May need sudo) 
~~~
npm i homebridge-bond
~~~

After this fill in your Bond Email adress and password into the config

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
#Node Version
#Software
#Plugin Version
#Issue behaviour
#Expected Behaviour

## Meta

Follow the creator on Twitter: https://twitter.com/edc1591
Forked by: https://twitter.com/iRayanKhan

Distributed under the MIT license. See ``LICENSE`` for more information.

[license-image]: https://img.shields.io/badge/License-MIT-blue.svg
[license-url]: LICENSE
