package ipc

// Request represents an IPC request from the UI
type Request struct {
	RequestID int                    `json:"request_id"`
	Action    string                 `json:"action"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

// Response represents an IPC response to the UI
type Response struct {
	RequestID int         `json:"request_id"`
	Status    string      `json:"status"`  // "success" | "error"
	Message   string      `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

// NewSuccessResponse creates a success response
func NewSuccessResponse(data interface{}) Response {
	return Response{
		Status: "success",
		Data:   data,
	}
}

// NewSuccessResponseWithID creates a success response with request ID
func NewSuccessResponseWithID(requestID int, data interface{}) Response {
	return Response{
		RequestID: requestID,
		Status:    "success",
		Data:      data,
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

// NewSuccessResponseWithMessageAndID creates a success response with message and request ID
func NewSuccessResponseWithMessageAndID(requestID int, message string, data interface{}) Response {
	return Response{
		RequestID: requestID,
		Status:    "success",
		Message:   message,
		Data:      data,
	}
}

// NewErrorResponse creates an error response
func NewErrorResponse(err error) Response {
	return Response{
		Status:  "error",
		Message: err.Error(),
	}
}

// NewErrorResponseWithID creates an error response with request ID
func NewErrorResponseWithID(requestID int, err error) Response {
	return Response{
		RequestID: requestID,
		Status:    "error",
		Message:   err.Error(),
	}
}

// NewErrorResponseWithMessage creates an error response with a custom message
func NewErrorResponseWithMessage(message string) Response {
	return Response{
		Status:  "error",
		Message: message,
	}
}

// NewErrorResponseWithMessageAndID creates an error response with custom message and request ID
func NewErrorResponseWithMessageAndID(requestID int, message string) Response {
	return Response{
		RequestID: requestID,
		Status:    "error",
		Message:   message,
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
	ActionStartPTY        = "start_pty"
	ActionWriteToPTY      = "write_to_pty"
	ActionReadFromPTY     = "read_from_pty"
	ActionClosePTY        = "close_pty"
)
