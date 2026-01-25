# heyvm

[![npm version](https://img.shields.io/npm/v/heyvm.svg)](https://www.npmjs.com/package/heyvm)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

A zero-config, interactive terminal UI to connect, manage, and transfer files to VMs over SSH

## Overview

**heyvm** is a lazygit-style TUI (Terminal User Interface) for managing VMs via SSH. It eliminates the need to remember SSH/SCP syntax, manually track IPs and credentials, or juggle multiple tools for terminal access and file transfer.

### Key Features

- **Split-Pane Interface**: View your VM list and details side-by-side
- **Interactive TUI**: Fully keyboard-driven navigation with intuitive controls
- **Full Terminal Emulator**: Complete SSH terminal with xterm.js - vim, nano, htop all work
- **Terminal Scrollback**: 1000 lines of history with smooth scrolling
- **File Browser**: Dual-pane file manager for easy local ↔ remote file transfers
- **Secure Credentials**: Password and SSH key storage via OS keychain
- **Multiple Auth Methods**: Support for SSH keys and password authentication
- **Zero Config**: No configuration files to write - just add a VM and go

## Architecture

heyvm uses a modern two-tier architecture with clean separation of concerns:

1. **UI Layer** (TypeScript + Ink) - Interactive terminal interface
2. **Core Backend** (Go) - SSH/SFTP operations, VM management, and credential storage

These components communicate via **JSON-RPC over stdio**, providing process isolation, clear API boundaries, and easy debugging.

```
┌──────────────────────────────┐
│     Ink TUI (TypeScript)     │
│  - Split-pane interface      │
│  - VM list & detail screens  │
│  - File browser              │
│  - Terminal view             │
│  - Forms & dialogs           │
└──────────────┬───────────────┘
               │ JSON-RPC (stdio)
┌──────────────▼───────────────┐
│   heyvm-core (Go Backend)    │
│  - SSH session manager       │
│  - SFTP file operations      │
│  - VM registry & config      │
│  - Secure auth handling      │
│  - OS keychain integration   │
└──────────────┬───────────────┘
               │ SSH/SFTP
         ┌─────▼──────┐
         │ Remote VMs │
         └────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **Go** >= 1.21
- SSH access to at least one VM (for testing)

### Installation (Global - Recommended)

Install heyvm globally via npm:

```bash
npm install -g heyvm@latest
```

Then run from anywhere:

```bash
heyvm
```

### Installation (From Source)

For development or contributing:

```bash
# Clone the repository
git clone https://github.com/adishm/heyvm.git
cd heyvm

# Install dependencies for both UI and Core backend
make install

# Build the complete application
make build-all
```

### Running heyvm

```bash
# If installed globally
heyvm

# From source - development mode (with hot reload)
make dev

# From source - production build
make run
```

The UI will start in your terminal, and the Go backend will run as a background process communicating via stdio.

### Uninstalling heyvm

To completely remove heyvm from your system:

**1. Uninstall the package**

If installed globally via npm:
```bash
npm uninstall -g heyvm
```

If installed from source:
```bash
# Simply delete the cloned repository
rm -rf /path/to/heyvm
```

**2. Remove configuration and data**

```bash
# Remove all heyvm configuration, state, and logs
rm -rf ~/.heyvm
```

This removes:
- VM definitions (`config.yaml`)
- Runtime state (`state.json`)
- SSH known hosts (`known_hosts`)
- Application logs (`logs/`)

**3. Remove stored passwords (optional)**

Passwords stored in the OS keychain need to be removed manually:

- **macOS**: Open "Keychain Access" app → Search for "heyvm" → Delete entries
- **Linux**: Use your keyring manager (GNOME Keyring, KWallet, etc.)
- **Windows**: Open "Credential Manager" → Search for "heyvm" → Remove entries

**Note**: SSH keys are never copied or stored by heyvm, so no additional cleanup is needed for key-based authentication.

## Usage

### Interface Layout

heyvm uses a **split-pane interface** with three main screens:

#### 1. VM List & Overview Screen

```
┌─────────────────────────────┐┌────────────────────────────────────────────────────────┐
│                             ││                                                        │
│ VMs (3)                     ││ ▶ Overview    Terminal    Files                        │
│                             ││                                                        │
│ ▶ ● production-web          ││   VM: production-web                                   │
│   ubuntu@192.168.1.100      ││   Status: ● Connected                                  │
│                             ││   Host: 192.168.1.100:22                               │
│ ○ staging-api               ││   User: ubuntu                                         │
│   admin@10.0.0.50           ││   Auth: SSH Key (~/.ssh/id_rsa)                        │
│                             ││                                                        │
│ ○ dev-database              ││   Last Connected: 2 minutes ago                        │
│   root@172.16.0.10          ││                                                        │
│                             ││   Actions:                                             │
│ ● connected   ○             ││   [c] Connect    [x] Disconnect    [t] Test            │
│ disconnected   ◐ connecting ││                                                        │
│                             ││   System Info:                                         │
│ ┌─────────────────────────┐ ││   Loading...                                           │
│ │ j/k navigate •  Enter   │ ││                                                        │
│ │ select •  a add •  d    │ ││                                                        │
│ │ delete •  r refresh     │ ││                                                        │
│ └─────────────────────────┘ ││                                                        │
│                             ││                                                        │
└─────────────────────────────┘└────────────────────────────────────────────────────────┘
    [Esc] VM List • [1] Overview • [2] Terminal • [3] Files • [q] Quit
```

#### 2. Terminal Tab (Full SSH Terminal)

```
┌─────────────────────────────┐┌────────────────────────────────────────────────────────┐
│                             ││                                                        │
│ VMs (3)                     ││   Overview  ▶ Terminal    Files                        │
│                             ││                                                        │
│ ▶ ● production-web          ││ ubuntu@production-web:~$ htop                          │
│   ubuntu@192.168.1.100      ││                                                        │
│                             ││   1  [||||||||||||||||100.0%]   Tasks: 89, 147 thr     │
│ ○ staging-api               ││   2  [||||||||||      45.3%]    Load average: 0.52     │
│   admin@10.0.0.50           ││   Mem[|||||||||||||2.1G/4.0G]   Uptime: 14 days        │
│                             ││   Swp[               0K/2.0G]                          │
│ ○ dev-database              ││                                                        │
│   root@172.16.0.10          ││   PID USER   PRI  NI  VIRT   RES   SHR S CPU% MEM%     │
│                             ││  1234 ubuntu  20   0  123M  45M  12M S  5.2  1.1       │
│ ● connected   ○             ││  5678 ubuntu  20   0  456M  89M  23M R 15.7  2.2       │
│ disconnected   ◐ connecting ││  9012 root    20   0 1024M 234M  34M S  0.0  5.8       │
│                             ││                                                        │
│                             ││ ubuntu@production-web:~$ vim /etc/nginx/nginx.conf     │
│                             ││                                                        │
│                             ││ Full terminal emulator - vim, nano, htop all work!     │
│                             ││ Scroll history: PgUp/PgDn or Shift+↑/↓ (1000 lines)    │
└─────────────────────────────┘└────────────────────────────────────────────────────────┘
    [Ctrl+O] Overview • [Esc] VM List • Interactive terminal (all keys work)
```

#### 3. Files Tab (Dual-Pane File Browser with Progress)

```
┌──────────────────────────────┐ ┌──────────────────────────────────────────────────────────┐
│                              │ │                                                          │
│  VMs (3)                     │ │   Overview   Terminal ▶ Files                            │
│                              │ │                                                          │
│  ▶ ● production-web          │ │   ┌─ ↑ Uploading: application.tar.gz ──────────────────┐ │
│    ubuntu@192.168.1.100      │ │   │ ████████████████████████████░░░░░░░░░  68.4%       │ │
│                              │ │   │ 137.2M / 200.5M                                    │ │
│  ○ staging-api               │ │   └────────────────────────────────────────────────────┘ │
│    admin@10.0.0.50           │ │                                                          │
│                              │ │   ┌──────────────────────────┬────────────────────────┐  │
│  ○ dev-database              │ │   │ ▶ Local:  ~/projects/app │ Remote: /var/www/app   │  │
│    root@172.16.0.10          │ │   ├──────────────────────────┼────────────────────────┤  │
│                              │ │   │ 📁 ..                     │ 📁 ..                  │ │
│  ● connected                 │ │   │ 📁 src            45K     │ 📁 public        12K   │ │
│  ○ disconnected              │ │   │ 📁 dist           3.2M    │ 📁 logs         456K   │ │
│  ◐ connecting                │ │   │ ▶ 📄 package.json 2.3K    │ 📄 app.js         89K  │ │
│                              │ │   │   📄 tsconfig.json 1.1K   │ 📄 config.yml     1.2K │ │
│                              │ │   │   📄 README.md      8.9K  │ 📁 node_modules        │ │
│                              │ │   │   📄 .gitignore     456B  │ 📄 .env           512B │ │
│                              │ │   │                          │                        │ │
│                              │ │   └──────────────────────────┴────────────────────────┘ │
└──────────────────────────────┘ └─────────────────────────────────────────────────────────┘

[Tab] Switch pane • [j/k] Navigate • [Enter] Open • [p] Push • [g] Get • [/] Search

```

Navigate between panes using keyboard shortcuts to efficiently manage your VMs.

### Keyboard Shortcuts

#### VM List (Left Pane)
- **`j`/`k`** or **`↑`/`↓`** - Navigate through VMs
- **`Enter`** - Select VM (switches focus to right pane)
- **`a`** - Add new VM
- **`d`** - Delete selected VM
- **`r`** - Refresh VM list
- **`q`** - Quit application

#### VM Detail (Right Pane)
- **`1`** - Switch to Overview tab
- **`2`** - Switch to Terminal tab  
- **`3`** - Switch to Files tab
- **`c`** - Connect to VM (establish SSH session)
- **`x`** - Disconnect from VM
- **`Esc`** - Return focus to VM list (left pane)

#### Terminal Tab
- **All keys** - Sent directly to remote shell (complete terminal liberty)
- **`PgUp`/`PgDn`** or **`Shift+↑`/`↓`** - Scroll through terminal history (1000 lines)
- **`Ctrl+O`** - Switch to Overview tab (keeps session alive)
- **`Esc`** - Return to VM list
- **Interactive programs**: vim, nano, htop, sudo all work perfectly

#### File Browser
- **`Tab`** - Switch between local (left) and remote (right) file panes
- **`j`/`k`** or **`↑`/`↓`** - Navigate through files/directories
- **`Enter`** - Enter selected directory
- **`Backspace`** or **`h`** - Go to parent directory
- **`p`** - Push file (copy from local → remote)
- **`g`** - Get file (copy from remote → local)
- **`d`** - Delete selected file
- **`r`** - Refresh current directory
- **`Esc`** - Return to VM detail view

### Adding a VM

1. Press **`a`** in the VM list screen
2. Select authentication method:
   - **SSH Key** - Use existing SSH key file
   - **Password** - Store password securely in OS keychain
3. Enter connection details:
   - **Name** - Friendly identifier for the VM
   - **Host** - IP address or hostname
   - **Port** - SSH port (default: 22)
   - **Username** - SSH user account
   - **SSH Key Path** (if using key auth) - Path to private key file (e.g., `~/.ssh/id_rsa`)
4. Press **`Enter`** to save

heyvm will automatically validate the connection and persist the VM configuration to `~/.heyvm/config.yaml`.

### Connecting to a VM

1. Select a VM from the list with **`Enter`**
2. Press **`c`** to establish SSH connection
3. Switch to Terminal tab (**`2`**) for full interactive shell:
   - Complete terminal emulator with ANSI support
   - Works with vim, nano, htop, sudo, and all interactive programs
   - Scroll through history with **`PgUp`/`PgDn`** or **`Shift+↑`/`↓`**
   - Press **`Ctrl+O`** to switch to Overview without closing terminal
4. Or switch to Files tab (**`3`**) to browse and transfer files

## Development

### Project Structure

```
heyvm/
├── ui/                       # Frontend - TypeScript/Ink TUI
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Header.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── ErrorMessage.tsx
│   │   │   └── ConfirmDialog.tsx
│   │   ├── screens/          # Main screen components
│   │   │   ├── VMListScreen.tsx
│   │   │   ├── AddVMScreen.tsx
│   │   │   ├── VMDetailScreen.tsx
│   │   │   └── tabs/
│   │   │       ├── OverviewTab.tsx
│   │   │       ├── TerminalTab.tsx
│   │   │       └── FilesTab.tsx
│   │   ├── hooks/            # Custom React hooks
│   │   │   ├── useVM.ts
│   │   │   ├── useVMList.ts
│   │   │   └── useFiles.ts
│   │   ├── utils/            # Utility functions
│   │   │   └── terminalEmulator.ts  # xterm.js wrapper
│   │   ├── core/             # IPC client and type definitions
│   │   │   ├── ipc.ts
│   │   │   └── types.ts
│   │   ├── keybindings.ts    # Keyboard shortcut definitions
│   │   ├── App.tsx           # Main application component
│   │   └── index.tsx         # Entry point
│   ├── scripts/
│   │   └── start-with-core.js  # Development launcher
│   ├── package.json
│   └── tsconfig.json
├── core/                     # Backend - Go
│   ├── cmd/
│   │   ├── heyvm-core/       # Main backend entry point
│   │   ├── heyvm/            # CLI wrapper
│   │   └── file-browser/     # Standalone file browser
│   ├── internal/
│   │   ├── auth/             # Authentication providers
│   │   │   ├── provider.go
│   │   │   ├── ssh_key.go
│   │   │   └── password.go
│   │   ├── config/           # Configuration management
│   │   ├── ipc/              # JSON-RPC protocol handler
│   │   │   ├── handler.go
│   │   │   ├── protocol.go
│   │   │   └── actions.go
│   │   ├── sftp/             # File transfer operations
│   │   │   ├── manager.go
│   │   │   ├── types.go
│   │   │   └── errors.go
│   │   ├── ssh/              # SSH session management
│   │   │   ├── manager.go
│   │   │   ├── session.go
│   │   │   └── errors.go
│   │   ├── vm/               # VM models and registry
│   │   │   ├── registry.go
│   │   │   ├── models.go
│   │   │   └── errors.go
│   │   └── tui/              # Terminal UI utilities
│   └── go.mod
├── docs/                     # Documentation
│   ├── PRD.md                # Product requirements
│   ├── architecture.md       # System architecture
│   ├── development.md        # Development guide
│   └── exploration/          # Development notes
├── bin/                      # Compiled binaries (generated)
│   ├── heyvm-core
│   ├── heyvm
│   └── file-browser
├── build/                    # Build artifacts (generated)
├── Makefile                  # Build automation
├── README.md                 # This file
└── LICENSE
```

### Technology Stack

#### UI Layer
- **Framework**: [Ink](https://github.com/vadimdemedes/ink) - React for interactive CLIs
- **Language**: TypeScript
- **Build Tool**: esbuild
- **Terminal Emulator**: [@xterm/headless](https://www.npmjs.com/package/@xterm/headless) - Full ANSI/VT100 support
- **Key Libraries**:
  - `ink-select-input` - Interactive selection lists
  - `ink-text-input` - Text input components

#### Core Backend
- **Language**: Go 1.24+
- **SSH/SFTP**: `golang.org/x/crypto/ssh` + `pkg/sftp`
- **Credential Storage**: `99designs/keyring` (OS keychain integration)
- **Configuration**: YAML (`gopkg.in/yaml.v3`)
- **IPC Protocol**: JSON-RPC over stdin/stdout

### Build Commands

```bash
# Install all dependencies (UI + Core)
make install

# Build individual components
make build-ui        # Build TypeScript UI only
make build-core      # Build Go backend only
make build-all       # Build everything

# Development
make dev            # Run with hot reload
make run            # Run production build

# Testing
make test           # Run all tests

# Cleanup
make clean          # Remove build artifacts

# Help
make help           # Show all available commands
```

### Development Workflow

1. **Start development mode**:
   ```bash
   make dev
   ```
   This builds the Go backend and runs the UI with TypeScript compilation.

2. **Make changes** to either UI (TypeScript) or Core (Go) code

3. **Test changes**:
   - For UI changes: The dev mode supports hot reload
   - For Core changes: Rebuild with `make build-core` and restart

4. **Run tests**:
   ```bash
   make test
   ```

### Adding New Features

#### UI Components
Add new components in `ui/src/components/` and import them in your screens.

#### Backend Functionality
1. Add new methods in `core/internal/ipc/actions.go`
2. Register them in the IPC handler
3. Add corresponding TypeScript types in `ui/src/core/types.ts`
4. Call from UI using `ipcClient` in `ui/src/core/ipc.ts`

## Security

heyvm takes security seriously and implements multiple layers of protection:

### Credential Storage
- **Passwords**: Securely stored in OS-native keychain:
  - macOS: Keychain
  - Linux: Secret Service (GNOME Keyring, KWallet)
  - Windows: Credential Manager
- **SSH Keys**: Never copied or stored - referenced by file path only
- **Access**: Credentials are only accessed when establishing connections

### Data Protection
- **Passwords**: Never logged or written to disk in plaintext
- **Config Files**: Stored with `0600` permissions (owner read/write only) in `~/.heyvm/`
- **Logs**: Sanitized to prevent credential leakage
- **Memory**: Sensitive data cleared from memory after use

### SSH Security
- **Host Key Verification**: Verified on first connection
- **Known Hosts**: Tracked to prevent man-in-the-middle attacks
- **Connection Isolation**: Each VM connection is independent

### Process Isolation
- UI and Core backend run as separate processes
- Communication only via controlled JSON-RPC interface
- No shared memory or state

## Configuration

heyvm stores all configuration and state in `~/.heyvm/`:

```
~/.heyvm/
├── config.yaml       # VM definitions and settings
├── state.json        # Runtime state (connections, sessions)
├── known_hosts       # SSH host key verification
└── logs/
    └── heyvm-core.log  # Backend logs
```

### Configuration File Format

Example `config.yaml`:

```yaml
vms:
  - id: "vm-001"
    name: "Production API Server"
    host: "api.example.com"
    port: 22
    user: "deploy"
    auth:
      type: "key"
      key_path: "~/.ssh/production.pem"
  
  - id: "vm-002"
    name: "Development Database"
    host: "10.0.1.50"
    port: 22
    user: "ubuntu"
    auth:
      type: "password"
      # Password stored securely in OS keychain
```

### Manual Configuration

While heyvm is designed to work without manual configuration, you can directly edit `~/.heyvm/config.yaml` if needed. The file is automatically created when you add your first VM.

**Note**: When using password authentication, passwords are stored in the OS keychain, not in the YAML file.

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to VM  
**Solutions**:
- Verify SSH access works manually: `ssh user@host`
- Check firewall rules allow SSH (port 22 or custom port)
- Ensure SSH key has correct permissions: `chmod 600 ~/.ssh/your_key`
- Check if the host key has changed (remove from `~/.heyvm/known_hosts`)

**Problem**: "Permission denied" error  
**Solutions**:
- Verify username is correct
- For SSH keys: Ensure the key is authorized on the remote VM (`~/.ssh/authorized_keys`)
- For passwords: Re-enter the password (it may have changed)

### File Transfer Issues

**Problem**: File transfer fails  
**Solutions**:
- Ensure you have write permissions on the target directory
- Check available disk space on remote VM
- Verify SFTP is enabled on the SSH server

### Application Issues

**Problem**: UI not responding  
**Solutions**:
- Check logs: `~/.heyvm/logs/heyvm-core.log`
- Restart the application: `q` to quit, then restart
- Clear build artifacts and rebuild: `make clean && make build-all`

**Problem**: Backend process crashes  
**Solutions**:
- Review logs in `~/.heyvm/logs/heyvm-core.log`
- Ensure Go backend was built correctly: `make build-core`
- Check for port conflicts or permission issues

### Getting Help

If you encounter issues:

1. Check the logs: `cat ~/.heyvm/logs/heyvm-core.log`
2. Review existing [GitHub Issues](https://github.com/adishm/heyvm/issues)
3. Open a new issue with:
   - heyvm version
   - Operating system
   - Error messages
   - Steps to reproduce

## Roadmap

### Planned Features (Future Phases)
- 🔄 Cloud provider integration (AWS, Azure, GCP)
- 🔄 Bastion/jump host support
- 🔄 VM lifecycle management (start/stop/restart)
- 🔄 Port forwarding
- 🔄 Tunnel management
- 🔄 Session recording and playback
- 🔄 Multi-VM command execution
- 🔄 SSH config import

## Project Maturity

heyvm is still in its early stages. While it solves real problems and is actively used, it hasn't been battle-tested across every edge case or environment.

If you encounter issues or have ideas for improvements:
- **Found a bug?** [Open an issue](https://github.com/adishm/heyvm/issues) - detailed bug reports help immensely
- **Want a feature?** [Request it](https://github.com/adishm/heyvm/issues) - I'd love to hear how heyvm can better fit your workflow
- **Want to customize it?** Fork the repository and make it your own! Add features, change behaviors, experiment freely

The beauty of open source is that you don't have to wait. If you need something now, fork it, build it, and if you think others might benefit, send a PR back. The project welcomes contributions of all kinds.

## Contributing

Contributions are welcome! Here's how you can help:

### Reporting Bugs
1. Check if the issue already exists
2. Create a detailed bug report with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, versions)
   - Relevant logs

### Submitting Changes
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Write/update tests if applicable
5. Ensure code builds: `make build-all`
6. Run tests: `make test`
7. Commit with clear messages: `git commit -m 'Add amazing feature'`
8. Push to your fork: `git push origin feature/amazing-feature`
9. Open a Pull Request

### Development Guidelines
- Follow existing code style
- Add comments for complex logic
- Update documentation for user-facing changes
- Keep commits focused and atomic
- Write meaningful commit messages

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Inspiration & Credits

heyvm draws inspiration from excellent tools in the terminal UI ecosystem:

- **[lazygit](https://github.com/jesseduffield/lazygit)** - TUI UX patterns and keyboard navigation
- **[k9s](https://github.com/derailed/k9s)** - Architecture design and command abstraction
- **[Ink](https://github.com/vadimdemedes/ink)** - React-based terminal UI framework

Built with:
- [Ink](https://github.com/vadimdemedes/ink) - Terminal UI framework
- [Go SSH](https://pkg.go.dev/golang.org/x/crypto/ssh) - SSH client implementation
- [99designs/keyring](https://github.com/99designs/keyring) - Secure credential storage

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/adishm/heyvm/issues)
- **Discussions**: [GitHub Discussions](https://github.com/adishm/heyvm/discussions)

---

Made with ❤️ for developers who manage VMs
