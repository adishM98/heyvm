package sftp

import "errors"

var (
	// ErrSFTPClientNotInitialized is returned when SFTP client is not initialized
	ErrSFTPClientNotInitialized = errors.New("SFTP client not initialized")

	// ErrFileNotFound is returned when a file doesn't exist
	ErrFileNotFound = errors.New("file not found")

	// ErrPermissionDenied is returned when permission is denied
	ErrPermissionDenied = errors.New("permission denied")

	// ErrFileAlreadyExists is returned when trying to create a file that already exists
	ErrFileAlreadyExists = errors.New("file already exists")

	// ErrInvalidPath is returned when a path is invalid
	ErrInvalidPath = errors.New("invalid path")

	// ErrIsDirectory is returned when expecting a file but got a directory
	ErrIsDirectory = errors.New("path is a directory")

	// ErrNotDirectory is returned when expecting a directory but got a file
	ErrNotDirectory = errors.New("path is not a directory")

	// ErrTransferFailed is returned when file transfer fails
	ErrTransferFailed = errors.New("file transfer failed")
)
