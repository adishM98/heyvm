package auth

import (
	"fmt"
	"time"

	"github.com/99designs/keyring"
	"github.com/adishm/heyvm/internal/vm"
	"golang.org/x/crypto/ssh"
)

const (
	keyringService = "heyvm"
)

// PasswordAuth implements Provider using password authentication
// Passwords are stored securely in the OS keychain
type PasswordAuth struct {
	ring         keyring.Keyring
	client       *ssh.Client
	tempPassword string // Temporary password for testing (not stored)
}

// NewPasswordAuth creates a new password authentication provider
func NewPasswordAuth() (*PasswordAuth, error) {
	// Initialize OS keyring
	ring, err := keyring.Open(keyring.Config{
		ServiceName:              keyringService,
		KeychainTrustApplication: true,
		// Use file backend as fallback if OS keychain is unavailable
		AllowedBackends: []keyring.BackendType{
			keyring.KeychainBackend,      // macOS
			keyring.SecretServiceBackend, // Linux
			keyring.WinCredBackend,       // Windows
			keyring.FileBackend,          // Fallback
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open keyring: %w", err)
	}

	return &PasswordAuth{
		ring: ring,
	}, nil
}

// NewPasswordAuthWithTemp creates a provider with a temporary password (for testing)
func NewPasswordAuthWithTemp(tempPassword string) (*PasswordAuth, error) {
	// Initialize OS keyring (may not be used if temp password is provided)
	ring, err := keyring.Open(keyring.Config{
		ServiceName:              keyringService,
		KeychainTrustApplication: true,
		AllowedBackends: []keyring.BackendType{
			keyring.KeychainBackend,
			keyring.SecretServiceBackend,
			keyring.WinCredBackend,
			keyring.FileBackend,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open keyring: %w", err)
	}

	return &PasswordAuth{
		ring:         ring,
		tempPassword: tempPassword,
	}, nil
}

// Connect establishes an SSH connection using password authentication
func (a *PasswordAuth) Connect(v *vm.VM) (*ssh.Client, error) {
	var password string
	var err error

	// Use temporary password if provided, otherwise get from keyring
	if a.tempPassword != "" {
		password = a.tempPassword
	} else {
		password, err = a.GetPassword(v.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get password: %w", err)
		}
	}

	// Configure SSH client
	config := &ssh.ClientConfig{
		User: v.Username,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: Implement proper host key verification
		Timeout:         30 * time.Second,            // Increased timeout for large transfers
	}

	// Set keep-alive settings to prevent connection drops during large transfers
	config.SetDefaults()

	// Connect to SSH server
	address := fmt.Sprintf("%s:%d", v.Host, v.Port)
	client, err := ssh.Dial("tcp", address, config)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrConnectionFailed, err)
	}

	a.client = client
	return client, nil
}

// Disconnect closes the SSH connection
func (a *PasswordAuth) Disconnect() error {
	if a.client != nil {
		return a.client.Close()
	}
	return nil
}

// SupportsSFTP returns true (password auth supports SFTP)
func (a *PasswordAuth) SupportsSFTP() bool {
	return true
}

// Name returns the provider name
func (a *PasswordAuth) Name() string {
	return "Password Authentication"
}

// StorePassword stores a password in the OS keychain
func (a *PasswordAuth) StorePassword(vmID, password string) error {
	if vmID == "" {
		return fmt.Errorf("VM ID cannot be empty")
	}
	if password == "" {
		return fmt.Errorf("password cannot be empty")
	}

	item := keyring.Item{
		Key:         vmID,
		Data:        []byte(password),
		Label:       fmt.Sprintf("heyvm password for VM %s", vmID),
		Description: "SSH password for heyvm VM",
	}

	if err := a.ring.Set(item); err != nil {
		return fmt.Errorf("failed to store password in keychain: %w", err)
	}

	return nil
}

// GetPassword retrieves a password from the OS keychain
func (a *PasswordAuth) GetPassword(vmID string) (string, error) {
	if vmID == "" {
		return "", fmt.Errorf("VM ID cannot be empty")
	}

	item, err := a.ring.Get(vmID)
	if err != nil {
		if err == keyring.ErrKeyNotFound {
			return "", ErrPasswordNotFound
		}
		return "", fmt.Errorf("failed to retrieve password from keychain: %w", err)
	}

	return string(item.Data), nil
}

// RemovePassword removes a password from the OS keychain
func (a *PasswordAuth) RemovePassword(vmID string) error {
	if vmID == "" {
		return fmt.Errorf("VM ID cannot be empty")
	}

	if err := a.ring.Remove(vmID); err != nil {
		if err == keyring.ErrKeyNotFound {
			return ErrPasswordNotFound
		}
		return fmt.Errorf("failed to remove password from keychain: %w", err)
	}

	return nil
}

// HasPassword checks if a password exists in the keychain for the given VM ID
func (a *PasswordAuth) HasPassword(vmID string) bool {
	_, err := a.GetPassword(vmID)
	return err == nil
}
