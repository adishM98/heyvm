package ipc

// Request is a JSON-RPC-style request sent to core over stdin.
type Request struct {
	RequestID int                    `json:"request_id"`
	Action    string                 `json:"action"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

// Response is a JSON message received from core over stdout.
type Response struct {
	RequestID int         `json:"request_id"`
	Status    string      `json:"status"`  // "success" | "error"
	Message   string      `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Event     string      `json:"event,omitempty"` // non-empty for async events
}

// Action constants — must mirror core/internal/ipc/protocol.go exactly.
const (
	ActionListVMs        = "list_vms"
	ActionAddVM          = "add_vm"
	ActionRemoveVM       = "remove_vm"
	ActionConnectVM      = "connect_vm"
	ActionDisconnectVM   = "disconnect_vm"
	ActionExecuteCommand = "execute_command"
	ActionListFiles      = "list_files"
	ActionUploadFile     = "upload_file"
	ActionDownloadFile   = "download_file"
	ActionDeleteFile     = "delete_file"
	ActionRenameFile     = "rename_file"
	ActionStorePassword  = "store_password"
	ActionTestConnection = "test_connection"
	ActionStartPTY       = "start_pty"
	ActionWriteToPTY     = "write_to_pty"
	ActionResizePTY      = "resize_pty"
	ActionClosePTY       = "close_pty"
)

// Event constants — must mirror core/internal/ipc/protocol.go exactly.
const (
	EventPTYReady         = "PTY_READY"
	EventPTYOutput        = "PTY_OUTPUT"
	EventPTYExit          = "PTY_EXIT"
	EventPTYError         = "PTY_ERROR"
	EventTransferProgress = "TRANSFER_PROGRESS"
)
