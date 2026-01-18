package vm

import "errors"

var (
	// ErrVMNotFound is returned when a VM is not found in the registry
	ErrVMNotFound = errors.New("VM not found")

	// ErrVMAlreadyExists is returned when trying to add a VM with duplicate ID
	ErrVMAlreadyExists = errors.New("VM already exists")

	// ErrInvalidVMName is returned when VM name is empty
	ErrInvalidVMName = errors.New("VM name cannot be empty")

	// ErrInvalidVMHost is returned when VM host is empty
	ErrInvalidVMHost = errors.New("VM host cannot be empty")

	// ErrInvalidVMPort is returned when VM port is invalid
	ErrInvalidVMPort = errors.New("VM port must be between 1 and 65535")

	// ErrInvalidVMUsername is returned when VM username is empty
	ErrInvalidVMUsername = errors.New("VM username cannot be empty")

	// ErrInvalidAuthType is returned when auth type is not recognized
	ErrInvalidAuthType = errors.New("invalid authentication type")

	// ErrMissingKeyPath is returned when SSH key auth is selected but no key path provided
	ErrMissingKeyPath = errors.New("SSH key path is required for key authentication")

	// ErrConfigNotFound is returned when config file doesn't exist
	ErrConfigNotFound = errors.New("configuration file not found")

	// ErrConfigCorrupted is returned when config file is malformed
	ErrConfigCorrupted = errors.New("configuration file is corrupted")
)
