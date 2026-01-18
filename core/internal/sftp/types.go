package sftp

import (
	"os"
	"time"
)

// FileInfo represents information about a file or directory
type FileInfo struct {
	Name    string      `json:"name"`
	Size    int64       `json:"size"`
	Mode    os.FileMode `json:"mode"`
	ModTime time.Time   `json:"modTime"`
	IsDir   bool        `json:"isDir"`
}

// ProgressCallback is called during file transfers to report progress
type ProgressCallback func(bytesTransferred, totalBytes int64)

// TransferOptions contains options for file transfers
type TransferOptions struct {
	// Progress callback (optional)
	OnProgress ProgressCallback

	// Overwrite existing files
	Overwrite bool

	// Preserve file permissions
	PreservePermissions bool
}
