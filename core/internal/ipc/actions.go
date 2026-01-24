package ipc

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"

	"github.com/adishm/heyvm/internal/auth"
	"github.com/adishm/heyvm/internal/sftp"
	"github.com/adishm/heyvm/internal/vm"
)

// handleListVMs returns all VMs in the registry
func (h *Handler) handleListVMs(params map[string]interface{}) Response {
	vms := h.registry.List()
	return NewSuccessResponse(vms)
}

// handleAddVM adds a new VM to the registry
func (h *Handler) handleAddVM(params map[string]interface{}) Response {
	// Parse VM from params
	vmData, ok := params["vm"].(map[string]interface{})
	if !ok {
		return NewErrorResponseWithMessage("invalid VM data")
	}

	// Extract fields
	name, _ := vmData["name"].(string)
	host, _ := vmData["host"].(string)
	port, _ := vmData["port"].(float64) // JSON numbers are float64
	username, _ := vmData["username"].(string)

	if port == 0 {
		port = 22 // Default SSH port
	}

	// Extract auth config
	authData, ok := vmData["auth"].(map[string]interface{})
	if !ok {
		return NewErrorResponseWithMessage("invalid auth configuration")
	}

	authTypeStr, _ := authData["type"].(string)
	keyPath, _ := authData["keyPath"].(string)
	rememberPassword, _ := authData["rememberPassword"].(bool)

	var authType vm.AuthType
	switch authTypeStr {
	case "key":
		authType = vm.AuthTypeKey
	case "password":
		authType = vm.AuthTypePassword
	default:
		return NewErrorResponseWithMessage("invalid auth type")
	}

	// Create VM
	newVM := &vm.VM{
		Name:     name,
		Host:     host,
		Port:     int(port),
		Username: username,
		Auth: vm.AuthConfig{
			Type:             authType,
			KeyPath:          keyPath,
			RememberPassword: rememberPassword,
		},
		Status: vm.VMStatusDisconnected,
	}

	// Add to registry
	if err := h.registry.Add(newVM); err != nil {
		return NewErrorResponse(err)
	}

	// Save registry
	if err := h.registry.Save(); err != nil {
		log.Printf("Warning: failed to save registry: %v", err)
	}

	return NewSuccessResponseWithMessage("VM added successfully", newVM)
}

// handleRemoveVM removes a VM from the registry
func (h *Handler) handleRemoveVM(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	// Disconnect if connected
	h.mu.Lock()
	if sshMgr, exists := h.sshManagers[vmID]; exists {
		sshMgr.Disconnect()
		delete(h.sshManagers, vmID)
	}
	if sftpMgr, exists := h.sftpManagers[vmID]; exists {
		sftpMgr.Close()
		delete(h.sftpManagers, vmID)
	}
	if provider, exists := h.authProviders[vmID]; exists {
		provider.Disconnect()
		delete(h.authProviders, vmID)
	}
	h.mu.Unlock()

	// Remove from registry
	if err := h.registry.Remove(vmID); err != nil {
		return NewErrorResponse(err)
	}

	// Save registry
	if err := h.registry.Save(); err != nil {
		log.Printf("Warning: failed to save registry: %v", err)
	}

	return NewSuccessResponseWithMessage("VM removed successfully", nil)
}

// handleConnectVM establishes SSH connection to a VM
func (h *Handler) handleConnectVM(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	// Get SSH manager
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Check if already connected (idempotent)
	if sshMgr.IsConnected() {
		// Already connected - just ensure status is correct
		if err := h.registry.UpdateStatus(vmID, vm.VMStatusConnected); err != nil {
			log.Printf("Warning: failed to update VM status: %v", err)
		}
		if err := h.registry.Save(); err != nil {
			log.Printf("Warning: failed to save registry: %v", err)
		}
		return NewSuccessResponseWithMessage("Already connected", nil)
	}

	// Set status to connecting
	if err := h.registry.UpdateStatus(vmID, vm.VMStatusConnecting); err != nil {
		log.Printf("Warning: failed to update VM status: %v", err)
	}
	if err := h.registry.Save(); err != nil {
		log.Printf("Warning: failed to save registry: %v", err)
	}

	// Connect (this is now idempotent)
	if err := sshMgr.Connect(); err != nil {
		h.registry.UpdateStatus(vmID, vm.VMStatusError)
		h.registry.Save()
		return NewErrorResponse(err)
	}

	// Update status to connected
	if err := h.registry.UpdateStatus(vmID, vm.VMStatusConnected); err != nil {
		log.Printf("Warning: failed to update VM status: %v", err)
	}

	// Save registry
	if err := h.registry.Save(); err != nil {
		log.Printf("Warning: failed to save registry: %v", err)
	}

	return NewSuccessResponseWithMessage("Connected successfully", nil)
}

// handleDisconnectVM closes SSH connection to a VM
func (h *Handler) handleDisconnectVM(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	h.mu.Lock()

	// Close SFTP if exists
	if sftpMgr, exists := h.sftpManagers[vmID]; exists {
		sftpMgr.Close()
		delete(h.sftpManagers, vmID)
	}

	// Disconnect SSH if exists
	if sshMgr, exists := h.sshManagers[vmID]; exists {
		if err := sshMgr.Disconnect(); err != nil {
			h.mu.Unlock()
			return NewErrorResponse(err)
		}
		delete(h.sshManagers, vmID)
	}

	h.mu.Unlock()

	// Update status
	if err := h.registry.UpdateStatus(vmID, vm.VMStatusDisconnected); err != nil {
		log.Printf("Warning: failed to update VM status: %v", err)
	}

	// Save registry
	if err := h.registry.Save(); err != nil {
		log.Printf("Warning: failed to save registry: %v", err)
	}

	return NewSuccessResponseWithMessage("Disconnected successfully", nil)
}

// handleExecuteCommand executes a command on a VM
func (h *Handler) handleExecuteCommand(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	command, ok := params["command"].(string)
	if !ok {
		return NewErrorResponseWithMessage("command parameter required")
	}

	// Get SSH manager
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Ensure connected
	if !sshMgr.IsConnected() {
		if err := sshMgr.Connect(); err != nil {
			return NewErrorResponse(err)
		}
	}

	// Execute command
	output, err := sshMgr.ExecuteCommand(command)
	if err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponse(map[string]interface{}{
		"output": output,
	})
}

// handleListFiles lists files in a directory on a VM
func (h *Handler) handleListFiles(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	path, ok := params["path"].(string)
	if !ok {
		path = "/" // Default to root
	}

	// Get SFTP manager
	sftpMgr, err := h.getSFTPManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// List files
	files, err := sftpMgr.List(path)
	if err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponse(files)
}

// handleUploadFile uploads a file to a VM
func (h *Handler) handleUploadFile(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	localPath, ok := params["local_path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("local_path parameter required")
	}

	remotePath, ok := params["remote_path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("remote_path parameter required")
	}

	// Get SFTP manager
	sftpMgr, err := h.getSFTPManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Upload file with progress reporting
	opts := &sftp.TransferOptions{
		Overwrite:           true,
		PreservePermissions: true,
		OnProgress: func(bytesTransferred, totalBytes int64) {
			// Emit progress event to UI
			h.Emit(EventTransferProgress, map[string]interface{}{
				"vm_id":             vmID,
				"file":              remotePath,
				"direction":         "upload",
				"bytes_transferred": bytesTransferred,
				"total_bytes":       totalBytes,
				"percent":           float64(bytesTransferred) / float64(totalBytes) * 100,
			})
		},
	}

	if err := sftpMgr.Upload(localPath, remotePath, opts); err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponseWithMessage("File uploaded successfully", nil)
}

// handleDownloadFile downloads a file from a VM
func (h *Handler) handleDownloadFile(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	remotePath, ok := params["remote_path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("remote_path parameter required")
	}

	localPath, ok := params["local_path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("local_path parameter required")
	}

	// Get SFTP manager
	sftpMgr, err := h.getSFTPManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Download file with progress reporting
	opts := &sftp.TransferOptions{
		Overwrite:           true,
		PreservePermissions: true,
		OnProgress: func(bytesTransferred, totalBytes int64) {
			// Emit progress event to UI
			h.Emit(EventTransferProgress, map[string]interface{}{
				"vm_id":             vmID,
				"file":              remotePath,
				"direction":         "download",
				"bytes_transferred": bytesTransferred,
				"total_bytes":       totalBytes,
				"percent":           float64(bytesTransferred) / float64(totalBytes) * 100,
			})
		},
	}

	if err := sftpMgr.Download(remotePath, localPath, opts); err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponseWithMessage("File downloaded successfully", nil)
}

// handleDeleteFile deletes a file on a VM
func (h *Handler) handleDeleteFile(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	path, ok := params["path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("path parameter required")
	}

	// Get SFTP manager
	sftpMgr, err := h.getSFTPManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Delete file
	if err := sftpMgr.Delete(path); err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponseWithMessage("File deleted successfully", nil)
}

// handleRenameFile renames/moves a file on a VM
func (h *Handler) handleRenameFile(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	oldPath, ok := params["old_path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("old_path parameter required")
	}

	newPath, ok := params["new_path"].(string)
	if !ok {
		return NewErrorResponseWithMessage("new_path parameter required")
	}

	// Get SFTP manager
	sftpMgr, err := h.getSFTPManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Rename file
	if err := sftpMgr.Rename(oldPath, newPath); err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponseWithMessage("File renamed successfully", nil)
}

// handleStorePassword stores a password in the keychain
func (h *Handler) handleStorePassword(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	password, ok := params["password"].(string)
	if !ok {
		return NewErrorResponseWithMessage("password parameter required")
	}

	// Create password auth provider
	passwordAuth, err := auth.NewPasswordAuth()
	if err != nil {
		return NewErrorResponse(err)
	}

	// Store password
	if err := passwordAuth.StorePassword(vmID, password); err != nil {
		return NewErrorResponse(err)
	}

	return NewSuccessResponseWithMessage("Password stored successfully", nil)
}

// handleTestConnection tests SSH connection to a VM without saving it
func (h *Handler) handleTestConnection(params map[string]interface{}) Response {
	// Parse VM from params (similar to handleAddVM)
	vmData, ok := params["vm"].(map[string]interface{})
	if !ok {
		return NewErrorResponseWithMessage("invalid VM data")
	}

	name, _ := vmData["name"].(string)
	host, _ := vmData["host"].(string)
	port, _ := vmData["port"].(float64)
	username, _ := vmData["username"].(string)

	if port == 0 {
		port = 22
	}

	authData, ok := vmData["auth"].(map[string]interface{})
	if !ok {
		return NewErrorResponseWithMessage("invalid auth configuration")
	}

	authTypeStr, _ := authData["type"].(string)
	keyPath, _ := authData["keyPath"].(string)

	// Get temporary password from params (for testing only)
	tempPassword, _ := params["password"].(string)

	var authType vm.AuthType
	switch authTypeStr {
	case "key":
		authType = vm.AuthTypeKey
	case "password":
		authType = vm.AuthTypePassword
	default:
		return NewErrorResponseWithMessage("invalid auth type")
	}

	// Create temporary VM
	testVM := &vm.VM{
		ID:       "test",
		Name:     name,
		Host:     host,
		Port:     int(port),
		Username: username,
		Auth: vm.AuthConfig{
			Type:    authType,
			KeyPath: keyPath,
		},
	}

	// Create auth provider with temporary password if provided
	var provider auth.Provider
	var err error
	
	if authType == vm.AuthTypePassword && tempPassword != "" {
		// Use temporary password for testing
		provider, err = auth.NewPasswordAuthWithTemp(tempPassword)
	} else {
		provider, err = auth.NewProvider(testVM)
	}
	
	if err != nil {
		return NewErrorResponse(err)
	}
	defer provider.Disconnect()

	// Test connection
	client, err := provider.Connect(testVM)
	if err != nil {
		return NewErrorResponse(fmt.Errorf("connection test failed: %w", err))
	}
	defer client.Close()

	return NewSuccessResponseWithMessage("Connection test successful", nil)
}

// handleStartPTY starts an interactive PTY session
func (h *Handler) handleStartPTY(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	rows, ok := params["rows"].(float64)
	if !ok {
		rows = 24 // Default rows
	}

	cols, ok := params["cols"].(float64)
	if !ok {
		cols = 80 // Default cols
	}

	// Get SSH manager
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		h.Emit(EventPTYError, map[string]interface{}{
			"vm_id": vmID,
			"error": err.Error(),
		})
		return NewErrorResponse(err)
	}

	// Ensure connected
	if !sshMgr.IsConnected() {
		if err := sshMgr.Connect(); err != nil {
			h.Emit(EventPTYError, map[string]interface{}{
				"vm_id": vmID,
				"error": err.Error(),
			})
			return NewErrorResponse(err)
		}
	}

	// Start PTY session
	session, err := sshMgr.StartPTY(int(rows), int(cols))
	if err != nil {
		h.Emit(EventPTYError, map[string]interface{}{
			"vm_id": vmID,
			"error": err.Error(),
		})
		return NewErrorResponse(err)
	}

	sessionID := session.ID()

	// Emit PTY_READY event
	h.Emit(EventPTYReady, map[string]interface{}{
		"vm_id":      vmID,
		"session_id": sessionID,
	})

	// Start THE ONLY goroutine that reads from combined stdout+stderr
	// This keeps stdin alive and ensures all output is captured
	go func() {
		combined := session.CombinedOutput()
		buf := make([]byte, 4096)
		for {
			// Blocking read from combined output - this is the only reader
			n, err := combined.Read(buf)
			if n > 0 {
				// Base64 encode PTY output to keep JSON safe
				encoded := base64.StdEncoding.EncodeToString(buf[:n])
				// Emit PTY_OUTPUT event with base64-encoded data
				h.Emit(EventPTYOutput, map[string]interface{}{
					"session_id": sessionID,
					"data":       encoded,
				})
			}
			if err != nil {
				if err == io.EOF {
					log.Printf("PTY session %s: combined output EOF (shell exited)", sessionID)
				} else {
					log.Printf("PTY session %s: read error: %v", sessionID, err)
				}
				// Emit PTY_EXIT event
				h.Emit(EventPTYExit, map[string]interface{}{
					"session_id": sessionID,
				})
				break
			}
		}
	}()

	// No response needed - events are emitted instead
	return Response{}
}

// handleWriteToPTY writes data to a PTY session (fire-and-forget)
func (h *Handler) handleWriteToPTY(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	sessionID, ok := params["session_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("session_id parameter required")
	}

	data, ok := params["data"].(string)
	if !ok {
		return NewErrorResponseWithMessage("data parameter required")
	}

	// Get SSH manager
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Get session
	session, err := sshMgr.GetSession(sessionID)
	if err != nil {
		return NewErrorResponse(err)
	}

	// Write data (non-blocking from IPC perspective - fire and forget)
	go func() {
		_, err := session.Write([]byte(data))
		if err != nil {
			log.Printf("PTY session %s: write error: %v", sessionID, err)
		}
	}()

	// No response needed
	return Response{}
}

// handleResizePTY resizes a PTY session
func (h *Handler) handleResizePTY(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		log.Printf("PTY resize: vm_id parameter required")
		return Response{}
	}

	sessionID, ok := params["session_id"].(string)
	if !ok {
		log.Printf("PTY resize: session_id parameter required")
		return Response{}
	}

	rows, ok := params["rows"].(float64)
	if !ok {
		log.Printf("PTY resize: rows parameter required")
		return Response{}
	}

	cols, ok := params["cols"].(float64)
	if !ok {
		log.Printf("PTY resize: cols parameter required")
		return Response{}
	}

	// Get SSH manager
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		log.Printf("PTY resize error for VM %s: %v", vmID, err)
		return Response{}
	}

	// Get session
	session, err := sshMgr.GetSession(sessionID)
	if err != nil {
		log.Printf("PTY resize error getting session %s: %v", sessionID, err)
		return Response{}
	}

	// Resize
	if err := session.Resize(int(rows), int(cols)); err != nil {
		log.Printf("PTY resize error for session %s: %v", sessionID, err)
	}

	// No response needed
	return Response{}
}

// handleClosePTY closes a PTY session
func (h *Handler) handleClosePTY(params map[string]interface{}) Response {
	vmID, ok := params["vm_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("vm_id parameter required")
	}

	sessionID, ok := params["session_id"].(string)
	if !ok {
		return NewErrorResponseWithMessage("session_id parameter required")
	}

	// Get SSH manager
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		log.Printf("PTY close error for VM %s: %v", vmID, err)
		return Response{}
	}

	// Close session
	if err := sshMgr.CloseSession(sessionID); err != nil {
		log.Printf("PTY close error for session %s: %v", sessionID, err)
	}

	// No response needed
	return Response{}
}
