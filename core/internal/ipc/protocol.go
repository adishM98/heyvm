package ipc

// Request represents an IPC request from the UI
type Request struct {
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params,omitempty"`
}

// Response represents an IPC response to the UI
type Response struct {
	Status  string      `json:"status"`  // "success" | "error"
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// NewSuccessResponse creates a success response
func NewSuccessResponse(data interface{}) Response {
	return Response{
		Status: "success",
		Data:   data,
	}
}

// NewSuccessResponseWithMessage creates a success response with a message
func NewSuccessResponseWithMessage(message string, data interface{}) Response {
	return Response{
		Status:  "success",
		Message: message,
		Data:    data,
	}
}

// NewErrorResponse creates an error response
func NewErrorResponse(err error) Response {
	return Response{
		Status:  "error",
		Message: err.Error(),
	}
}

// NewErrorResponseWithMessage creates an error response with a custom message
func NewErrorResponseWithMessage(message string) Response {
	return Response{
		Status:  "error",
		Message: message,
	}
}

// Action constants
const (
	ActionListVMs         = "list_vms"
	ActionAddVM           = "add_vm"
	ActionRemoveVM        = "remove_vm"
	ActionConnectVM       = "connect_vm"
	ActionDisconnectVM    = "disconnect_vm"
	ActionExecuteCommand  = "execute_command"
	ActionListFiles       = "list_files"
	ActionUploadFile      = "upload_file"
	ActionDownloadFile    = "download_file"
	ActionDeleteFile      = "delete_file"
	ActionRenameFile      = "rename_file"
	ActionStorePassword   = "store_password"
	ActionTestConnection  = "test_connection"
)
