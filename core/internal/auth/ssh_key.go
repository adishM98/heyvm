package auth

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/adishm/heyvm/internal/vm"
	"golang.org/x/crypto/ssh"
)

// SSHKeyAuth implements Provider using SSH key authentication
type SSHKeyAuth struct {
	keyPath string
	client  *ssh.Client
}

// NewSSHKeyAuth creates a new SSH key authentication provider
func NewSSHKeyAuth(keyPath string) (*SSHKeyAuth, error) {
	if keyPath == "" {
		return nil, fmt.Errorf("key path cannot be empty")
	}

	// Expand home directory
	expandedPath, err := expandPath(keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to expand path: %w", err)
	}

	// Check if key file exists
	info, err := os.Stat(expandedPath)
	if os.IsNotExist(err) {
		return nil, fmt.Errorf("%w: %s (expanded from: %s)", ErrKeyFileNotFound, expandedPath, keyPath)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to access key file: %w", err)
	}

	// Check key file permissions (should be 0600 or 0400)
	mode := info.Mode().Perm()
	if mode&0077 != 0 {
		// Key is readable/writable by group or others
		return nil, fmt.Errorf("%w: has permissions %o (run: chmod 400 %s)", ErrKeyPermissions, mode, expandedPath)
	}

	return &SSHKeyAuth{
		keyPath: expandedPath,
	}, nil
}

// expandPath expands ~ to home directory and handles path resolution
func expandPath(path string) (string, error) {
	if path == "" {
		return path, nil
	}

	// Handle ~ at the beginning
	if path[0] == '~' {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}

		// Handle ~/path
		if len(path) == 1 {
			return home, nil
		}
		if path[1] == '/' || path[1] == filepath.Separator {
			return filepath.Join(home, path[2:]), nil
		}
		// Handle ~path (shouldn't happen but be safe)
		return filepath.Join(home, path[1:]), nil
	}

	// Return absolute path
	return filepath.Abs(path)
}

// Connect establishes an SSH connection using key authentication
func (a *SSHKeyAuth) Connect(v *vm.VM) (*ssh.Client, error) {
	// Read private key
	key, err := os.ReadFile(a.keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read private key from %s: %w", a.keyPath, err)
	}

	// Parse private key (supports PEM, OpenSSH, RSA, Ed25519, ECDSA)
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		// Check if it's an encrypted key
		if _, ok := err.(*ssh.PassphraseMissingError); ok {
			return nil, fmt.Errorf("SSH key is encrypted (passphrase-protected keys not yet supported in Phase 1)")
		}
		return nil, fmt.Errorf("%w: %v (supported formats: PEM, OpenSSH, RSA, Ed25519, ECDSA)", ErrInvalidKeyFile, err)
	}

	// Configure SSH client
	config := &ssh.ClientConfig{
		User: v.Username,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: Implement proper host key verification
		Timeout:         10 * time.Second,
	}

	// Connect to SSH server
	address := fmt.Sprintf("%s:%d", v.Host, v.Port)
	client, err := ssh.Dial("tcp", address, config)
	if err != nil {
		return nil, fmt.Errorf("%w: %v (check host/port/username)", ErrConnectionFailed, err)
	}

	a.client = client
	return client, nil
}

// Disconnect closes the SSH connection
func (a *SSHKeyAuth) Disconnect() error {
	if a.client != nil {
		err := a.client.Close()
		a.client = nil // Clear the reference
		return err
	}
	return nil
}

// SupportsSFTP returns true (SSH key auth supports SFTP)
func (a *SSHKeyAuth) SupportsSFTP() bool {
	return true
}

// Name returns the provider name
func (a *SSHKeyAuth) Name() string {
	return "SSH Key Authentication"
}
