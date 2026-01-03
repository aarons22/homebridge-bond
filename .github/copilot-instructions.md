# Homebridge Bond Plugin - AI Coding Instructions

## Project Overview
A Homebridge plugin that integrates Bond devices (ceiling fans, fireplaces, lights, shades) via the Bond V2 API. This is a **dynamic platform plugin** that discovers and creates HomeKit accessories at runtime.

## Architecture

### Core Components
- **Platform** ([src/platform.ts](../src/platform.ts)): `BondPlatform` implements `DynamicPlatformPlugin`. Handles:
  - Bond discovery and validation on `didFinishLaunching`
  - Accessory registration/configuration via Homebridge API
  - BPUP (Bond Push UDP Protocol) real-time state updates via UDP socket on port 30007
  
- **Bond** ([src/interface/Bond.ts](../src/interface/Bond.ts)): Represents a Bond hub device. Each Bond:
  - Has its own `BondApi` instance for HTTP communication
  - Maintains `deviceIds[]` and `accessories[]` arrays
  - Receives BPUP packets and routes state updates to accessories
  - Generates `uniqueDeviceId` by combining `bondid + device.id`

- **BondApi** ([src/BondApi.ts](../src/BondApi.ts)): HTTP client with:
  - Action queueing when `ms_between_actions` config is set (prevents command flooding)
  - Axios-retry configured for network resilience (10 retries, exponential backoff)
  - Uses flake-idgen for unique request IDs

- **Accessories** ([src/accessories/](../src/accessories/)): Device-specific implementations
  - Factory pattern in `BondAccessory.create()` based on `DeviceType`
  - Each accessory manages multiple HomeKit services (e.g., CeilingFan has FanService + optional LightbulbService)

### Data Flow
1. Platform validates Bonds → gets device IDs → fetches Device objects with properties
2. Creates PlatformAccessory with `device` in `context`
3. BondAccessory wrapper observes HomeKit characteristics and calls BondApi
4. BPUP updates arrive via UDP → Bond routes to accessories → `updateState()` called

## Critical Patterns

### Device Identity
- **Never use `device.id` alone** - it's only unique per Bond
- Always use `device.uniqueId = bondid + device.id` for UUIDs and comparisons
- Example: [src/platform.ts#L95-L99](../src/platform.ts#L95-L99)

### Service Management
Services are dynamically added/removed based on:
- Device capabilities (`device.actions` array and `properties`)
- Config flags (`include_dimmer`, `fan_speed_values`, `include_toggle_state`)
- Services created in accessory constructors check if they exist before adding
- Old services explicitly removed to prevent orphans (see [CeilingFanAccessory.ts#L88-L90](../src/accessories/CeilingFanAccessory.ts#L88-L90))

### Observer Pattern
[src/Observer.ts](../src/Observer.ts) wraps HomeKit's `characteristic.on('set')`:
- **Always** checks if `value === characteristic.value` before acting (prevents duplicate API calls)
- Used consistently across all service implementations

### Device Capability Helpers
Use static methods on `Device` namespace ([src/interface/Device.ts](../src/interface/Device.ts)):
```typescript
Device.CFhasLightbulb(device)  // Ceiling fan has light
Device.HasDimmer(device)       // Supports StartDimmer action
Device.canSetSpeed(device)     // Has max_speed property
```

## Development Workflow

### Build & Test
```bash
npm run build      # Compile TypeScript (tsconfig-build.json)
npm run watch      # Auto-rebuild + restart via nodemon
npm run dev        # Legacy alias for watch
npm test           # Mocha tests with ts-node
npm run coverage   # nyc coverage report
```

### Local Testing
1. `npm link` in plugin directory to symlink globally
2. Homebridge will use local build from `dist/`
3. Check logs at `~/.homebridge/` (platform logs via Homebridge API)

### Common Issues
- **Accessories not updating**: Check BPUP socket setup - UDP port 30007 must be open
- **Duplicate devices**: Likely `uniqueId` mismatch during data migration
- **Services not appearing**: Verify `device.actions` contains required Action enums

## Config Schema
Defined in [config.schema.json](../config.schema.json). Key points:
- `bonds[]` array supports multiple Bond hubs (required for Smart by BOND devices)
- `ip_address` + `token` required per bond
- Platform-level flags affect all devices (`include_dimmer`, `fan_speed_values`)

## Testing
- Tests use factory pattern ([tests/factories/device.ts](../tests/factories/device.ts))
- Focus on Device namespace helpers and capability detection
- No mocks for Homebridge - tests are pure logic

## Version Compatibility
- Node.js: >=10.17.0
- Homebridge: >=1.3.0
- TypeScript: ES2019 target, strict mode enabled
- Uses axios 0.28.0 (check for breaking changes if upgrading)
