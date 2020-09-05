---
name: Bug report
about: Create a report to help us improve
title: ''
labels: bug
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**Information (please complete the following information):**
 - Plugin version (run `npm list -g homebridge-bond` in terminal)
 - Bond firmware version
 - How homebridge is run: [command line | Homebridge UI | HOOBS | Other]
 
**Logs**
Logs are the _most_ helpful thing you can provide. Please exclude logs from other plugin. It's even better if you can provide logs while in debug mode (instructions [here](https://github.com/aarons22/homebridge-bond/wiki/Enabling-Debug-Mode)). For example:
```
[9/4/2020, 8:11:11 PM] [Bond] Response (185d16e6920c0000) [get http://192.168.200.14/v2/sys/version] - {"target":"snowbird","fw_ver":"v2.14.5","fw_date":"Mon Aug 24 21:44:47 UTC 2020","uptime_s":37545,"bondid":"BD27788","upgrade_http":true,"api":2,"_":"e5b2a454"}
[9/4/2020, 8:11:11 PM] [Bond] 
****** Bond Info *******
 bondId: BD27788
 FW: v2.14.5
 API: v2
 Make: undefined
 Model: undefined
************************
[9/4/2020, 8:11:11 PM] [Bond] Response (185d16e6920b8000) [get http://192.168.200.14/v2/devices] - {"_":"01764b3d","30ba40e6":{"_":"89703ac5"},"00000003":{"_":"fe5ea57b"},"00000018":{"_":"1f6c6f4f"}}
[9/4/2020, 8:11:11 PM] [Bond] 3 cached accessories were loaded
[9/4/2020, 8:11:11 PM] [Bond] Updating device data with uniqueId BD2778830ba40e6
[9/4/2020, 8:11:11 PM] [Bond] Updating device data with uniqueId BD2778800000003
[9/4/2020, 8:11:11 PM] [Bond] Updating device data with uniqueId BD2778800000018
[9/4/2020, 8:11:11 PM] [Bond] Getting devices for this Bond (BD27788)...
[9/4/2020, 8:11:11 PM] [Bond] 3 devices were found on this Bond (BD27788).
[9/4/2020, 8:11:11 PM] [Bond] No new devices to add for this Bond (BD27788).
[9/4/2020, 8:11:12 PM] [Bond] Request (185d16e69289c000) [get http://192.168.200.14/v2/devices/30ba40e6/state]
[9/4/2020, 8:11:12 PM] [Bond] Configuring Accessory: Living Room LR Fan
[9/4/2020, 8:11:12 PM] [Bond] [LR Fan] min step: 33, max value: 99
[9/4/2020, 8:11:12 PM] [Bond] Request (185d16e6928a0000) [get http://192.168.200.14/v2/devices/00000003/state]
[9/4/2020, 8:11:12 PM] [Bond] Request (185d16e6928a0001) [get http://192.168.200.14/v2/devices/00000003/state]
[9/4/2020, 8:11:12 PM] [Bond] Request (185d16e6928a4000) [get http://192.168.200.14/v2/devices/00000003/state]
[9/4/2020, 8:11:12 PM] [Bond] Response (185d16e692898000) [get http://192.168.200.14/v2/devices/30ba40e6/state] - {"open":0,"_":"f7af4771"}
[9/4/2020, 8:11:12 PM] [Bond] Response (185d16e6928a0000) [get http://192.168.200.14/v2/devices/00000003/state] - {"power":1,"speed":1,"light":1,"_":"8358c6c1"}
[9/4/2020, 8:11:12 PM] [Bond] [LR Fan] speed value: 1
[9/4/2020, 8:11:12 PM] [Bond] [LR Fan] index value: 1
[9/4/2020, 8:11:12 PM] [Bond] [LR Fan] step value: 33
[9/4/2020, 8:11:12 PM] [Bond] Response (185d16e6928a0001) [get http://192.168.200.14/v2/devices/00000003/state] - {"power":1,"speed":1,"light":1,"_":"8358c6c1"}
[9/4/2020, 8:11:12 PM] [Bond] Response (185d16e6928a4000) [get http://192.168.200.14/v2/devices/00000003/state] - {"power":1,"speed":1,"light":1,"_":"8358c6c1"}
```
