package vm

import (
	"time"
)

// VMStatus represents the current state of a VM connection
type VMStatus string

const (
	VMStatusUnknown      VMStatus = "unknown"
	VMStatusConnected    VMStatus = "connected"
	VMStatusDisconnected VMStatus = "disconnected"
	VMStatusConnecting   VMStatus = "connecting"
	VMStatusError        VMStatus = "error"
)

// AuthType represents the authentication method
type AuthType string

const (
	AuthTypeKey      AuthType = "key"
	AuthTypePassword AuthType = "password"
)

// AuthConfig contains authentication configuration for a VM
type AuthConfig struct {
	Type             AuthType `yaml:"type" json:"type"`
	KeyPath          string   `yaml:"key_path,omitempty" json:"keyPath,omitempty"`
	RememberPassword bool     `yaml:"remember_password" json:"rememberPassword"`
}

// VM represents a virtual machine configuration
type VM struct {
	ID       string     `yaml:"id" json:"id"`
	Name     string     `yaml:"name" json:"name"`
	Host     string     `yaml:"host" json:"host"`
	Port     int        `yaml:"port" json:"port"`
	Username string     `yaml:"username" json:"username"`
	Auth     AuthConfig `yaml:"auth" json:"auth"`
	LastSeen time.Time  `yaml:"last_seen" json:"lastSeen"`
	Status   VMStatus   `yaml:"status" json:"status"`
}

// Validate checks if the VM configuration is valid
func (v *VM) Validate() error {
	if v.Name == "" {
		return ErrInvalidVMName
	}
	if v.Host == "" {
		return ErrInvalidVMHost
	}
	if v.Port <= 0 || v.Port > 65535 {
		return ErrInvalidVMPort
	}
	if v.Username == "" {
		return ErrInvalidVMUsername
	}
	if v.Auth.Type != AuthTypeKey && v.Auth.Type != AuthTypePassword {
		return ErrInvalidAuthType
	}
	if v.Auth.Type == AuthTypeKey && v.Auth.KeyPath == "" {
		return ErrMissingKeyPath
	}
	return nil
}

// Clone creates a deep copy of the VM
func (v *VM) Clone() *VM {
	return &VM{
		ID:       v.ID,
		Name:     v.Name,
		Host:     v.Host,
		Port:     v.Port,
		Username: v.Username,
		Auth: AuthConfig{
			Type:             v.Auth.Type,
			KeyPath:          v.Auth.KeyPath,
			RememberPassword: v.Auth.RememberPassword,
		},
		LastSeen: v.LastSeen,
		Status:   v.Status,
	}
}
