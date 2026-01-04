# GitHub Copilot Instructions

This repository contains a Homebridge plugin for Bond devices. For comprehensive coding instructions, architecture details, and development workflows, please refer to:

📖 **[AI Coding Instructions](../AI_CODING_INSTRUCTIONS.md)**

## Quick Reference

### Key Resources
- **Homebridge Developer Docs**: https://developers.homebridge.io
- **Bond V2 API Documentation**: https://docs-local.appbond.com

### Build & Test Commands
```bash
npm run build      # Compile TypeScript
npm run watch      # Auto-rebuild + restart
npm test           # Run tests
npm run lint       # Lint code
npm run coverage   # Coverage report
```

### Critical Patterns
- **Always** use `device.uniqueId` (bondid + device.id) for device identification, never `device.id` alone
- Use Observer pattern for characteristic updates
- Follow dynamic service management based on device capabilities
- Check BPUP socket (UDP port 30007) for real-time state updates

For complete details on architecture, patterns, and best practices, see [AI_CODING_INSTRUCTIONS.md](../AI_CODING_INSTRUCTIONS.md).
