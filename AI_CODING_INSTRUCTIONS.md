# Homebridge Bond Plugin - AI Coding Instructions

## Project Overview
A Homebridge plugin that integrates Bond devices (ceiling fans, fireplaces, lights, shades) via the Bond V2 API. This is a **dynamic platform plugin** that discovers and creates HomeKit accessories at runtime.

## External Documentation
- **Homebridge Developer Docs**: https://developers.homebridge.io
- **Bond V2 API Documentation**: https://docs-local.appbond.com
- **Homebridge Verified Plugin**: https://github.com/homebridge/homebridge/wiki/Verified-Plugins

## Architecture

### Core Components
- **Platform** (`src/platform.ts`): `BondPlatform` implements `DynamicPlatformPlugin`. Handles:
  - Bond discovery and validation on `didFinishLaunching`
  - Accessory registration/configuration via Homebridge API
  - BPUP (Bond Push UDP Protocol) real-time state updates via UDP socket on port 30007
  
- **Bond** (`src/interface/Bond.ts`): Represents a Bond hub device. Each Bond:
  - Has its own `BondApi` instance for HTTP communication
  - Maintains `deviceIds[]` and `accessories[]` arrays
  - Receives BPUP packets and routes state updates to accessories
  - Generates `uniqueDeviceId` by combining `bondid + device.id`

- **BondApi** (`src/BondApi.ts`): HTTP client with:
  - Action queueing when `ms_between_actions` config is set (prevents command flooding)
  - Axios-retry configured for network resilience (10 retries, exponential backoff)
  - Uses flake-idgen for unique request IDs

- **Accessories** (`src/accessories/`): Device-specific implementations
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
- Example: `src/platform.ts#L95-L99`

### Service Management
Services are dynamically added/removed based on:
- Device capabilities (`device.actions` array and `properties`)
- Config flags (`include_dimmer`, `fan_speed_values`, `include_toggle_state`)
- Services created in accessory constructors check if they exist before adding
- Old services explicitly removed to prevent orphans (see `CeilingFanAccessory.ts#L88-L90`)

### Observer Pattern
`src/Observer.ts` wraps HomeKit's `characteristic.on('set')`:
- **Always** checks if `value === characteristic.value` before acting (prevents duplicate API calls)
- Used consistently across all service implementations

### Device Capability Helpers
Use static methods on `Device` namespace (`src/interface/Device.ts`):
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
npm run lint       # ESLint TypeScript files
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
Defined in `config.schema.json`. Key points:
- `bonds[]` array supports multiple Bond hubs (required for Smart by BOND devices)
- `ip_address` + `token` required per bond
- Platform-level flags affect all devices (`include_dimmer`, `fan_speed_values`)

## Testing
- Tests use factory pattern (`tests/factories/device.ts`)
- Focus on Device namespace helpers and capability detection
- No mocks for Homebridge - tests are pure logic
- Run `npm test` to execute all tests
- Run `npm run coverage` for coverage report

## Version Compatibility
- Node.js: ^18.20.4 || ^20.15.1 || ^22
- Homebridge: ^1.6.0 || ^2.0.0-beta.0
- TypeScript: ES2019 target, strict mode enabled
- Uses axios 1.6.0+ (check for breaking changes if upgrading)

## Code Style & Best Practices

### TypeScript
- Strict mode enabled - all types must be explicit
- Use interfaces for data structures
- Follow existing patterns for type guards (e.g., `BondPlatformConfig.isValid()`)

### Homebridge Patterns
- Use platform's logger (`this.log.info()`, `this.log.error()`, etc.)
- Never modify Homebridge's cached accessories directly - always use API methods
- Use `UUIDGen.generate()` for creating stable accessory UUIDs

### Error Handling
- Network errors are handled by axios-retry
- Log errors with context: `this.log.error('Failed to execute action:', error)`
- Gracefully handle missing devices/accessories

### Code Organization
- Keep device-specific logic in respective accessory classes
- Use the Observer pattern for characteristic updates
- Maintain separation between Bond API layer and Homebridge accessory layer

## Debugging Tips
- Enable debug logging in Homebridge config
- Check `~/.homebridge/` for logs
- Use `npm run watch` for live development
- Verify Bond API responses with curl: `curl -H "BOND-Token: <token>" http://<ip>/v2/devices`

## Making Changes
1. Always run `npm run lint` before committing
2. Ensure `npm run build` completes without errors
3. Run `npm test` to verify tests pass
4. Update this documentation if adding new patterns or critical information
5. Test with actual Bond hardware when possible
