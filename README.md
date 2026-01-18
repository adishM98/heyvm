# heyvm

> A zero-config, interactive terminal UI to connect, manage, and transfer files to VMs over SSH

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

**heyvm** is a lazygit-style TUI (Terminal User Interface) for managing VMs via SSH. It eliminates the need to remember SSH/SCP syntax, manually track IPs and credentials, or juggle multiple tools for terminal access and file transfer.

### Key Features

- Interactive TUI with keyboard-driven navigation
- SSH terminal embedded directly in the interface
- Dual-pane file manager for easy file transfers
- Secure credential storage via OS keychain
- No configuration required - just add a VM and go
- Support for SSH key and password authentication

## Architecture

heyvm consists of two main components:

1. **UI Layer** (TypeScript/Ink) - Interactive terminal interface
2. **Core Backend** (Go) - SSH/SFTP handling, VM management, credential storage

These communicate via JSON-RPC over stdio, providing a clean separation of concerns and robust security.

```
┌─────────────────┐
│   Ink TUI (UI)  │
│  - VM list      │
│  - Forms        │
│  - File browser │
│  - Terminal     │
└────────┬────────┘
         │ JSON-RPC
┌────────▼────────┐
│ heyvm-core (Go) │
│  - SSH manager  │
│  - SFTP engine  │
│  - VM registry  │
│  - Auth         │
└────────┬────────┘
         │
   ┌─────▼─────┐
   │ Remote VM │
   │ (SSH/SFTP)│
   └───────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Go >= 1.21
- SSH access to at least one VM (for testing)

### Installation

```bash
# Clone the repository
git clone https://github.com/adishm/heyvm.git
cd heyvm

# Install dependencies
make install

# Build everything
make build-all
```

### Running heyvm

```bash
# Development mode (UI + Core backend)
make dev

# Or build and run production version
make build-all
cd ui && npm start
```

## Usage

### Keyboard Navigation

**VM List Screen:**
- `j/k` or `↑/↓` - Navigate
- `Enter` - Select VM
- `a` - Add new VM
- `d` - Delete VM
- `r` - Refresh list
- `q` - Quit

**VM Detail Screen:**
- `1` - Overview tab
- `2` - Terminal tab
- `3` - Files tab
- `Esc` - Back to VM list

**File Browser:**
- `Tab` - Switch between local/remote pane
- `j/k` or `↑/↓` - Navigate files
- `Enter` - Enter directory
- `p` - Push file (local → remote)
- `g` - Get file (remote → local)
- `d` - Delete file
- `Esc` - Back

### Adding a VM

1. Press `a` in the VM list
2. Choose authentication method (SSH key or password)
3. Enter connection details:
   - Name (friendly identifier)
   - Host (IP address or hostname)
   - Port (default: 22)
   - Username
   - SSH key path (if using key auth)
4. Press `Enter` to save

heyvm will validate the connection and save the VM to `~/.heyvm/config.yaml`.

## Development

### Project Structure

```
heyvm/
├── ui/                  # Ink (TypeScript) - Frontend TUI
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── screens/     # Main screen components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── core/        # IPC client and types
│   │   └── index.tsx    # Entry point
│   └── package.json
├── core/                # Go - Backend
│   ├── cmd/
│   │   └── heyvm-core/  # Main entry point
│   ├── internal/
│   │   ├── auth/        # Authentication providers
│   │   ├── config/      # Configuration management
│   │   ├── ipc/         # JSON-RPC protocol
│   │   ├── sftp/        # File transfer
│   │   ├── ssh/         # SSH session management
│   │   └── vm/          # VM models and registry
│   └── go.mod
├── docs/                # Documentation
├── bin/                 # Compiled binaries
└── Makefile             # Build automation
```

### Build Commands

```bash
# Install dependencies
make install

# Build UI only
make build-ui

# Build Core backend only
make build-core

# Build everything
make build-all

# Run in dev mode
make dev

# Run tests
make test

# Clean build artifacts
make clean
```

### Documentation

- [PRD (Product Requirements Document)](docs/PRD.md)
- [Architecture Documentation](docs/architecture.md)
- [Development Guide](docs/development.md)

## Roadmap

### Phase 1 (Current) - Foundation
- [x] Project structure
- [x] Build system
- [ ] SSH/SFTP backend
- [ ] Interactive TUI
- [ ] File transfers

### Phase 2 - Cloud Providers
- [ ] AWS EC2 integration
- [ ] libvirt support
- [ ] Auto-discovery of VMs

### Phase 3 - Lifecycle Management
- [ ] Start/stop/suspend VMs
- [ ] Snapshot support
- [ ] Resource monitoring

### Phase 4 - Advanced Features
- [ ] Bastion/jump host support
- [ ] Team configurations
- [ ] Optional GUI wrapper

## Security

- **Credentials**: Stored securely in OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- **SSH Keys**: Never copied or moved, referenced by path
- **Passwords**: Never logged, cleared from memory after use
- **Config**: Stored with 0600 permissions in ~/.heyvm/
- **Host Keys**: Verified on first connect

## Configuration

heyvm stores all configuration in `~/.heyvm/`:

```
~/.heyvm/
├── config.yaml    # VM definitions
├── state.json     # Runtime state
└── logs/          # Application logs
```

Example `config.yaml`:

```yaml
vms:
  - name: dev-api-01
    host: 10.0.1.24
    port: 22
    user: ubuntu
    auth:
      type: key
      key_path: ~/.ssh/dev.pem
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Inspiration

- [lazygit](https://github.com/jesseduffield/lazygit) - TUI UX patterns
- [k9s](https://github.com/derailed/k9s) - Architecture and command abstraction
- [Ink](https://github.com/vadimdemedes/ink) - React for CLIs

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
