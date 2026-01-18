# heyvm UI

Interactive terminal UI for heyvm, built with Ink (React for CLIs).

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run with core backend
npm run dev:with-core

# Build for production
npm run build

# Run production build
npm start
```

## Architecture

- **Framework**: Ink (React for CLIs)
- **Language**: TypeScript
- **Communication**: JSON-RPC over stdio with heyvm-core
- **State Management**: React hooks + context

## Directory Structure

```
ui/
├── src/
│   ├── components/    # Reusable UI components
│   ├── screens/       # Main screen components
│   ├── hooks/         # Custom React hooks
│   ├── core/          # IPC client and types
│   └── index.tsx      # Entry point
├── scripts/           # Build and utility scripts
└── package.json       # Dependencies and scripts
```
