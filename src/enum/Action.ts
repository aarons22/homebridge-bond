export enum Action {
  // Power (all device types)
  TurnOn = 'TurnOn',
  TurnOff = 'TurnOff',
  TogglePower = 'TogglePower',

  // Speed (CF)
  SetSpeed = 'SetSpeed',
  IncreaseSpeed = 'IncreaseSpeed',
  DecreaseSpeed = 'DecreaseSpeed',

  // Breeze (CF)
  BreezeOn = 'BreezeOn',
  BreezeOff = 'BreezeOff',
  SetBreeze = 'SetBreeze',

  // Direction (CF)
  SetDirection = 'SetDirection',
  ToggleDirection = 'ToggleDirection',

  // Light (CF, LT)
  TurnLightOn = 'TurnLightOn',
  TurnLightOff = 'TurnLightOff',
  ToggleLight = 'ToggleLight',

  // UpDownLight (CF)
  TurnUpLightOn = 'TurnUpLightOn',
  TurnUpLightOff = 'TurnUpLightOff',
  TurnDownLightOn = 'TurnDownLightOn',
  TurnDownLightOff = 'TurnDownLightOff',
  ToggleUpLight = 'ToggleUpLight',
  ToggleDownLight = 'ToggleDownLight',

  // Brightness (CF, LT)
  SetBrightness = 'SetBrightness',
  IncreaseBrightness = 'IncreaseBrightness',
  DecreaseBrightness = 'DecreaseBrightness',
  StartDimmer = 'StartDimmer',
  StartUpLightDimmer = 'StartUpLightDimmer',
  StartDownLightDimmer = 'StartDownLightDimmer',
  StartIncreasingBrightness = 'StartIncreasingBrightness',
  StartDecreasingBrightness = 'StartDecreasingBrightness',
  Stop = 'Stop',

  // Flame (FP)
  SetFlame = 'SetFlame',
  IncreaseFlame = 'IncreaseFlame',
  DecreaseFlame = 'DecreaseFlame',

  // FpFan (FP)
  TurnFpFanOn = 'TurnFpFanOn',
  TurnFpFanOff = 'TurnFpFanOff',
  SetFpFan = 'SetFpFan',

  // Timer (CF, FP)
  SetTimer = 'SetTimer',

  // OpenRaiseRetract (MS)
  Open = 'Open',
  Close = 'Close',
  ToggleOpen = 'ToggleOpen',
  Raise = 'Raise',
  Lower = 'Lower',

  // Position (MS)
  SetPosition = 'SetPosition',

  // Hold / Preset (MS)
  Hold = 'Hold',
  Preset = 'Preset',
}
