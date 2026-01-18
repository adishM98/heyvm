package ssh

import "errors"

var (
	// ErrNotConnected is returned when attempting operations on a disconnected client
	ErrNotConnected = errors.New("SSH client not connected")

	// ErrAlreadyConnected is returned when attempting to connect an already connected client
	ErrAlreadyConnected = errors.New("SSH client already connected")

	// ErrSessionFailed is returned when SSH session creation fails
	ErrSessionFailed = errors.New("failed to create SSH session")

	// ErrCommandFailed is returned when command execution fails
	ErrCommandFailed = errors.New("command execution failed")

	// ErrPTYFailed is returned when PTY allocation fails
	ErrPTYFailed = errors.New("failed to allocate PTY")

	// ErrSessionClosed is returned when operating on a closed session
	ErrSessionClosed = errors.New("session is closed")
)
