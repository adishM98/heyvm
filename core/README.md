# heyvm Core

Go backend for heyvm - handles SSH connections, SFTP file transfers, and VM management.

## Development

```bash
# Build
go build -o ../bin/heyvm-core ./cmd/heyvm-core

# Run
../bin/heyvm-core

# Install dependencies
go mod tidy

# Run tests
go test ./...
```

## Architecture

- **Language**: Go
- **SSH Library**: golang.org/x/crypto/ssh
- **SFTP Library**: github.com/pkg/sftp
- **Config Storage**: YAML files in ~/.heyvm/
- **Credential Storage**: OS keychain (99designs/keyring)
- **Communication**: JSON-RPC over stdin/stdout

## Directory Structure

```
core/
├── cmd/
│   └── heyvm-core/    # Main entry point
├── internal/
│   ├── auth/          # Authentication providers (SSH key, password)
│   ├── config/        # Configuration management
│   ├── ipc/           # JSON-RPC protocol handler
│   ├── sftp/          # SFTP file operations
│   ├── ssh/           # SSH session management
│   └── vm/            # VM models and registry
└── go.mod             # Go module definition
```

## Configuration

heyvm stores configuration in `~/.heyvm/`:
- `config.yaml` - VM definitions
- `state.json` - Runtime state
- `logs/` - Application logs
