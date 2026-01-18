package auth

import (
	"github.com/adishm/heyvm/internal/vm"
	"golang.org/x/crypto/ssh"
)

// Provider defines the interface for authentication providers
type Provider interface {
	// Connect establishes an SSH connection to the VM
	Connect(v *vm.VM) (*ssh.Client, error)

	// Disconnect closes the connection
	Disconnect() error

	// SupportsSFTP returns true if this provider supports SFTP
	SupportsSFTP() bool

	// Name returns the name of the provider
	Name() string
}

// NewProvider creates an appropriate authentication provider based on VM config
func NewProvider(v *vm.VM) (Provider, error) {
	switch v.Auth.Type {
	case vm.AuthTypeKey:
		return NewSSHKeyAuth(v.Auth.KeyPath)
	case vm.AuthTypePassword:
		return NewPasswordAuth()
	default:
		return nil, ErrUnsupportedAuthType
	}
}
