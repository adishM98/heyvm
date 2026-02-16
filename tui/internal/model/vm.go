package model

// AuthType represents the SSH authentication method.
type AuthType string

const (
	AuthTypeKey      AuthType = "key"
	AuthTypePassword AuthType = "password"
)

// AuthConfig holds SSH authentication configuration.
type AuthConfig struct {
	Type             AuthType `json:"type"`
	KeyPath          string   `json:"keyPath,omitempty"`
	RememberPassword bool     `json:"rememberPassword,omitempty"`
}

// VMStatus represents the connection state of a VM.
type VMStatus string

const (
	VMStatusConnected    VMStatus = "connected"
	VMStatusConnecting   VMStatus = "connecting"
	VMStatusDisconnected VMStatus = "disconnected"
	VMStatusError        VMStatus = "error"
)

// VM represents a managed virtual machine or remote host.
type VM struct {
	ID       string     `json:"id"`
	Name     string     `json:"name"`
	Host     string     `json:"host"`
	Port     int        `json:"port"`
	Username string     `json:"username"`
	Auth     AuthConfig `json:"auth"`
	Status   VMStatus   `json:"status"`
	LastSeen string     `json:"lastSeen,omitempty"`
}

// StatusIcon returns a single-character icon for the VM status.
func (v *VM) StatusIcon() string {
	switch v.Status {
	case VMStatusConnected:
		return "●"
	case VMStatusConnecting:
		return "◐"
	case VMStatusError:
		return "✕"
	default:
		return "○"
	}
}
