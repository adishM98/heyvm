package ipc

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"sync"

	"github.com/adishm/heyvm/internal/auth"
	"github.com/adishm/heyvm/internal/sftp"
	"github.com/adishm/heyvm/internal/ssh"
	"github.com/adishm/heyvm/internal/vm"
)

// Handler manages IPC communication and VM operations
type Handler struct {
	registry     *vm.Registry
	sshManagers  map[string]*ssh.Manager  // vmID -> SSH manager
	sftpManagers map[string]*sftp.Manager // vmID -> SFTP manager
	authProviders map[string]auth.Provider // vmID -> auth provider
	mu           sync.RWMutex
	input        io.Reader
	output       io.Writer
}

// NewHandler creates a new IPC handler
func NewHandler(registry *vm.Registry) *Handler {
	return &Handler{
		registry:      registry,
		sshManagers:   make(map[string]*ssh.Manager),
		sftpManagers:  make(map[string]*sftp.Manager),
		authProviders: make(map[string]auth.Provider),
		input:         os.Stdin,
		output:        os.Stdout,
	}
}

// Start begins the IPC request/response loop
func (h *Handler) Start() error {
	decoder := json.NewDecoder(h.input)
	encoder := json.NewEncoder(h.output)

	log.Println("IPC handler started, listening for requests...")

	for {
		var req Request
		if err := decoder.Decode(&req); err != nil {
			if err == io.EOF {
				log.Println("IPC handler: received EOF, shutting down")
				break
			}
			log.Printf("IPC handler: error decoding request: %v", err)
			continue
		}

		log.Printf("IPC handler: received request: %s", req.Action)

		// Handle request
		resp := h.HandleRequest(req)

		// Send response
		if err := encoder.Encode(resp); err != nil {
			log.Printf("IPC handler: error encoding response: %v", err)
			continue
		}

		log.Printf("IPC handler: sent response: status=%s", resp.Status)
	}

	// Cleanup on shutdown
	h.cleanup()
	return nil
}

// HandleRequest routes a request to the appropriate action handler
func (h *Handler) HandleRequest(req Request) Response {
	var resp Response
	
	switch req.Action {
	case ActionListVMs:
		resp = h.handleListVMs(req.Params)
	case ActionAddVM:
		resp = h.handleAddVM(req.Params)
	case ActionRemoveVM:
		resp = h.handleRemoveVM(req.Params)
	case ActionConnectVM:
		resp = h.handleConnectVM(req.Params)
	case ActionDisconnectVM:
		resp = h.handleDisconnectVM(req.Params)
	case ActionExecuteCommand:
		resp = h.handleExecuteCommand(req.Params)
	case ActionListFiles:
		resp = h.handleListFiles(req.Params)
	case ActionUploadFile:
		resp = h.handleUploadFile(req.Params)
	case ActionDownloadFile:
		resp = h.handleDownloadFile(req.Params)
	case ActionDeleteFile:
		resp = h.handleDeleteFile(req.Params)
	case ActionRenameFile:
		resp = h.handleRenameFile(req.Params)
	case ActionStorePassword:
		resp = h.handleStorePassword(req.Params)
	case ActionTestConnection:
		resp = h.handleTestConnection(req.Params)
	case ActionStartPTY:
		resp = h.handleStartPTY(req.Params)
	case ActionWriteToPTY:
		resp = h.handleWriteToPTY(req.Params)
	case ActionReadFromPTY:
		resp = h.handleReadFromPTY(req.Params)
	case ActionClosePTY:
		resp = h.handleClosePTY(req.Params)
	default:
		resp = NewErrorResponseWithMessage(fmt.Sprintf("unknown action: %s", req.Action))
	}
	
	// Add request ID to response for proper matching
	resp.RequestID = req.RequestID
	return resp
}

// cleanup closes all active connections
func (h *Handler) cleanup() {
	log.Println("IPC handler: cleaning up connections...")

	h.mu.Lock()
	defer h.mu.Unlock()

	// Close all SFTP managers
	for vmID, sftpMgr := range h.sftpManagers {
		if err := sftpMgr.Close(); err != nil {
			log.Printf("Error closing SFTP manager for VM %s: %v", vmID, err)
		}
	}

	// Close all SSH managers
	for vmID, sshMgr := range h.sshManagers {
		if err := sshMgr.Disconnect(); err != nil {
			log.Printf("Error disconnecting SSH manager for VM %s: %v", vmID, err)
		}
	}

	// Disconnect all auth providers
	for vmID, provider := range h.authProviders {
		if err := provider.Disconnect(); err != nil {
			log.Printf("Error disconnecting auth provider for VM %s: %v", vmID, err)
		}
	}

	log.Println("IPC handler: cleanup complete")
}

// getSSHManager gets or creates an SSH manager for a VM
func (h *Handler) getSSHManager(vmID string) (*ssh.Manager, error) {
	h.mu.RLock()
	manager, exists := h.sshManagers[vmID]
	h.mu.RUnlock()

	if exists && manager.IsConnected() {
		return manager, nil
	}

	// Get VM from registry
	v, err := h.registry.Get(vmID)
	if err != nil {
		return nil, fmt.Errorf("VM not found: %w", err)
	}

	// Get or create auth provider
	provider, err := h.getAuthProvider(vmID, v)
	if err != nil {
		return nil, fmt.Errorf("failed to get auth provider: %w", err)
	}

	// Create SSH manager
	manager = ssh.NewManager(v, provider)

	h.mu.Lock()
	h.sshManagers[vmID] = manager
	h.mu.Unlock()

	return manager, nil
}

// getSFTPManager gets or creates an SFTP manager for a VM
func (h *Handler) getSFTPManager(vmID string) (*sftp.Manager, error) {
	h.mu.RLock()
	manager, exists := h.sftpManagers[vmID]
	h.mu.RUnlock()

	if exists {
		return manager, nil
	}

	// Get SSH manager first
	sshMgr, err := h.getSSHManager(vmID)
	if err != nil {
		return nil, fmt.Errorf("failed to get SSH manager: %w", err)
	}

	// Ensure connected
	if !sshMgr.IsConnected() {
		if err := sshMgr.Connect(); err != nil {
			return nil, fmt.Errorf("failed to connect SSH: %w", err)
		}
	}

	// Create SFTP manager
	client := sshMgr.GetClient()
	if client == nil {
		return nil, fmt.Errorf("SSH client is nil")
	}

	manager, err = sftp.NewManager(client)
	if err != nil {
		return nil, fmt.Errorf("failed to create SFTP manager: %w", err)
	}

	h.mu.Lock()
	h.sftpManagers[vmID] = manager
	h.mu.Unlock()

	return manager, nil
}

// getAuthProvider gets or creates an auth provider for a VM
func (h *Handler) getAuthProvider(vmID string, v *vm.VM) (auth.Provider, error) {
	h.mu.RLock()
	provider, exists := h.authProviders[vmID]
	h.mu.RUnlock()

	if exists {
		return provider, nil
	}

	// Create new provider
	provider, err := auth.NewProvider(v)
	if err != nil {
		return nil, err
	}

	h.mu.Lock()
	h.authProviders[vmID] = provider
	h.mu.Unlock()

	return provider, nil
}
