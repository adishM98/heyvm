package auth

import "errors"

var (
	// ErrUnsupportedAuthType is returned when the auth type is not supported
	ErrUnsupportedAuthType = errors.New("unsupported authentication type")

	// ErrKeyFileNotFound is returned when SSH key file doesn't exist
	ErrKeyFileNotFound = errors.New("SSH key file not found")

	// ErrInvalidKeyFile is returned when SSH key file is invalid
	ErrInvalidKeyFile = errors.New("invalid SSH key file")

	// ErrKeyPermissions is returned when SSH key has incorrect permissions
	ErrKeyPermissions = errors.New("SSH key file has incorrect permissions (should be 0600)")

	// ErrConnectionFailed is returned when SSH connection fails
	ErrConnectionFailed = errors.New("SSH connection failed")

	// ErrAuthenticationFailed is returned when authentication fails
	ErrAuthenticationFailed = errors.New("authentication failed")

	// ErrPasswordNotFound is returned when password is not found in keychain
	ErrPasswordNotFound = errors.New("password not found in keychain")

	// ErrKeychainAccessDenied is returned when keychain access is denied
	ErrKeychainAccessDenied = errors.New("keychain access denied")
)
