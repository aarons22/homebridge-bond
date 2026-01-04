# Claude AI Coding Instructions

This repository contains a Homebridge plugin for integrating Bond devices (ceiling fans, fireplaces, lights, shades) with HomeKit via the Bond V2 API.

## 📖 Full Documentation

For comprehensive coding instructions, architecture details, development workflows, and best practices, please refer to:

**[AI_CODING_INSTRUCTIONS.md](./AI_CODING_INSTRUCTIONS.md)**

## Quick Start Guide

### What This Plugin Does
- Integrates Bond smart home devices with Apple HomeKit via Homebridge
- Supports multiple device types: ceiling fans, lights, blinds, fireplaces, generic switches
- Uses Bond V2 API for device control
- Implements real-time state updates via BPUP (Bond Push UDP Protocol)

### Key External Resources
- **Homebridge Developer Documentation**: https://developers.homebridge.io
- **Bond V2 API Documentation**: https://docs-local.appbond.com
- **Repository**: https://github.com/aarons22/homebridge-bond

### Common Development Commands
```bash
# Development
npm run watch      # Auto-rebuild and restart on file changes
npm run dev        # Alternative watch command

# Building
npm run build      # Compile TypeScript to dist/

# Testing
npm test           # Run all tests with Mocha
npm run coverage   # Generate test coverage report

# Code Quality
npm run lint       # Run ESLint on TypeScript files
```

### Project Structure
```
src/
├── platform.ts              # Main platform implementation
├── BondApi.ts              # HTTP client for Bond API
├── platformAccessory.ts    # Base accessory wrapper
├── Observer.ts             # Characteristic observer pattern
├── interface/
│   ├── Bond.ts             # Bond hub representation
│   ├── Device.ts           # Device types and helpers
│   └── config.ts           # Configuration interfaces
└── accessories/            # Device-specific implementations
    ├── CeilingFan.ts
    ├── Fireplace.ts
    ├── Blinds.ts
    └── ...

tests/                      # Mocha test suite
config.schema.json         # Homebridge config UI schema
```

### Critical Patterns to Follow

1. **Device Identity**: Always use `device.uniqueId` (combination of bondid + device.id), never use `device.id` alone
2. **Observer Pattern**: Use `Observer.ts` for characteristic updates to prevent duplicate API calls
3. **Service Management**: Dynamically add/remove services based on device capabilities and config flags
4. **Error Handling**: Network errors handled by axios-retry; log with context

### Before Making Changes
1. Run `npm run lint` to check code style
2. Run `npm test` to ensure tests pass
3. Run `npm run build` to verify TypeScript compilation
4. Consider testing with actual Bond hardware if modifying device behavior

## Need More Details?

See **[AI_CODING_INSTRUCTIONS.md](./AI_CODING_INSTRUCTIONS.md)** for:
- Complete architecture overview
- Detailed component descriptions
- Data flow explanations
- Testing strategies
- Debugging tips
- Version compatibility information
- And much more!
