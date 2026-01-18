package sftp

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// Manager handles SFTP file operations
type Manager struct {
	client *sftp.Client
	ssh    *ssh.Client
}

// NewManager creates a new SFTP manager from an SSH client
func NewManager(sshClient *ssh.Client) (*Manager, error) {
	if sshClient == nil {
		return nil, fmt.Errorf("SSH client cannot be nil")
	}

	// Create SFTP client
	client, err := sftp.NewClient(sshClient)
	if err != nil {
		return nil, fmt.Errorf("failed to create SFTP client: %w", err)
	}

	return &Manager{
		client: client,
		ssh:    sshClient,
	}, nil
}

// List lists files and directories at the specified path
func (m *Manager) List(path string) ([]FileInfo, error) {
	if m.client == nil {
		return nil, ErrSFTPClientNotInitialized
	}

	// Read directory
	entries, err := m.client.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	// Convert to FileInfo
	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		files = append(files, FileInfo{
			Name:    entry.Name(),
			Size:    entry.Size(),
			Mode:    entry.Mode(),
			ModTime: entry.ModTime(),
			IsDir:   entry.IsDir(),
		})
	}

	return files, nil
}

// Upload uploads a local file to a remote path
func (m *Manager) Upload(localPath, remotePath string, opts *TransferOptions) error {
	if m.client == nil {
		return ErrSFTPClientNotInitialized
	}

	if opts == nil {
		opts = &TransferOptions{Overwrite: true}
	}

	// Open local file
	localFile, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file: %w", err)
	}
	defer localFile.Close()

	// Get file info for size and permissions
	localInfo, err := localFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat local file: %w", err)
	}

	// Check if remote file exists
	if !opts.Overwrite {
		if _, err := m.client.Stat(remotePath); err == nil {
			return ErrFileAlreadyExists
		}
	}

	// Create remote file
	remoteFile, err := m.client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("failed to create remote file: %w", err)
	}
	defer remoteFile.Close()

	// Copy file with progress tracking
	totalBytes := localInfo.Size()
	var bytesTransferred int64

	buf := make([]byte, 32*1024) // 32KB buffer
	for {
		n, err := localFile.Read(buf)
		if err != nil && err != io.EOF {
			return fmt.Errorf("%w: %v", ErrTransferFailed, err)
		}

		if n > 0 {
			if _, err := remoteFile.Write(buf[:n]); err != nil {
				return fmt.Errorf("%w: %v", ErrTransferFailed, err)
			}

			bytesTransferred += int64(n)

			// Report progress
			if opts.OnProgress != nil {
				opts.OnProgress(bytesTransferred, totalBytes)
			}
		}

		if err == io.EOF {
			break
		}
	}

	// Preserve permissions if requested
	if opts.PreservePermissions {
		if err := m.client.Chmod(remotePath, localInfo.Mode()); err != nil {
			// Don't fail the transfer if chmod fails, just log
			fmt.Fprintf(os.Stderr, "Warning: failed to set permissions on %s: %v\n", remotePath, err)
		}
	}

	return nil
}

// Download downloads a remote file to a local path
func (m *Manager) Download(remotePath, localPath string, opts *TransferOptions) error {
	if m.client == nil {
		return ErrSFTPClientNotInitialized
	}

	if opts == nil {
		opts = &TransferOptions{Overwrite: true}
	}

	// Open remote file
	remoteFile, err := m.client.Open(remotePath)
	if err != nil {
		return fmt.Errorf("failed to open remote file: %w", err)
	}
	defer remoteFile.Close()

	// Get file info for size
	remoteInfo, err := remoteFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat remote file: %w", err)
	}

	if remoteInfo.IsDir() {
		return ErrIsDirectory
	}

	// Check if local file exists
	if !opts.Overwrite {
		if _, err := os.Stat(localPath); err == nil {
			return ErrFileAlreadyExists
		}
	}

	// Create local file
	localFile, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create local file: %w", err)
	}
	defer localFile.Close()

	// Copy file with progress tracking
	totalBytes := remoteInfo.Size()
	var bytesTransferred int64

	buf := make([]byte, 32*1024) // 32KB buffer
	for {
		n, err := remoteFile.Read(buf)
		if err != nil && err != io.EOF {
			return fmt.Errorf("%w: %v", ErrTransferFailed, err)
		}

		if n > 0 {
			if _, err := localFile.Write(buf[:n]); err != nil {
				return fmt.Errorf("%w: %v", ErrTransferFailed, err)
			}

			bytesTransferred += int64(n)

			// Report progress
			if opts.OnProgress != nil {
				opts.OnProgress(bytesTransferred, totalBytes)
			}
		}

		if err == io.EOF {
			break
		}
	}

	// Preserve permissions if requested
	if opts.PreservePermissions {
		if err := os.Chmod(localPath, remoteInfo.Mode()); err != nil {
			// Don't fail the transfer if chmod fails, just log
			fmt.Fprintf(os.Stderr, "Warning: failed to set permissions on %s: %v\n", localPath, err)
		}
	}

	return nil
}

// Delete deletes a file or directory
func (m *Manager) Delete(path string) error {
	if m.client == nil {
		return ErrSFTPClientNotInitialized
	}

	// Check if path is a directory
	info, err := m.client.Stat(path)
	if err != nil {
		return fmt.Errorf("failed to stat path: %w", err)
	}

	if info.IsDir() {
		// Remove directory (must be empty)
		if err := m.client.RemoveDirectory(path); err != nil {
			return fmt.Errorf("failed to remove directory: %w", err)
		}
	} else {
		// Remove file
		if err := m.client.Remove(path); err != nil {
			return fmt.Errorf("failed to remove file: %w", err)
		}
	}

	return nil
}

// Rename renames or moves a file/directory
func (m *Manager) Rename(oldPath, newPath string) error {
	if m.client == nil {
		return ErrSFTPClientNotInitialized
	}

	if err := m.client.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("failed to rename: %w", err)
	}

	return nil
}

// MkdirAll creates a directory and all necessary parent directories
func (m *Manager) MkdirAll(path string) error {
	if m.client == nil {
		return ErrSFTPClientNotInitialized
	}

	if err := m.client.MkdirAll(path); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	return nil
}

// Stat returns file/directory information
func (m *Manager) Stat(path string) (*FileInfo, error) {
	if m.client == nil {
		return nil, ErrSFTPClientNotInitialized
	}

	info, err := m.client.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to stat path: %w", err)
	}

	return &FileInfo{
		Name:    filepath.Base(path),
		Size:    info.Size(),
		Mode:    info.Mode(),
		ModTime: info.ModTime(),
		IsDir:   info.IsDir(),
	}, nil
}

// Close closes the SFTP client
func (m *Manager) Close() error {
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}
