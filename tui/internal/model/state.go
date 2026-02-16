package model

import "sync"

// ActiveTab represents which tab is shown in the detail pane.
type ActiveTab int

const (
	TabOverview  ActiveTab = 0
	TabTerminal  ActiveTab = 1
	TabFiles     ActiveTab = 2
)

// AppState holds the complete mutable state of the TUI.
// All fields are protected by Mu; callers must hold Mu when reading or writing.
type AppState struct {
	Mu sync.Mutex

	// VM list
	VMs         []*VM
	SelectedIdx int // index into VMs

	// Detail pane
	ActiveTab ActiveTab

	// PTY session (Terminal tab)
	PTYSessionID string
	VMID         string // ID of the VM whose detail is shown

	// Modal overlays
	AddVMOpen   bool
	ConfirmOpen bool
	ConfirmMsg  string
	ConfirmYes  func()
	ConfirmNo   func()

	// Files tab
	LocalPath    string
	RemotePath   string
	LocalFiles   []FileInfo
	RemoteFiles  []FileInfo
	LocalIdx     int
	RemoteIdx    int
	FileFocusLeft bool // true = local pane focused

	// Transfer progress (last event)
	TransferFile      string
	TransferPercent   float64
	TransferDirection string

	// Status bar message
	StatusMsg string

	// Quit signal
	Quitting bool
}

// SelectedVM returns the currently highlighted VM, or nil if none.
func (s *AppState) SelectedVM() *VM {
	if len(s.VMs) == 0 || s.SelectedIdx < 0 || s.SelectedIdx >= len(s.VMs) {
		return nil
	}
	return s.VMs[s.SelectedIdx]
}

// FindVM returns the VM with the given ID, or nil.
func (s *AppState) FindVM(id string) *VM {
	for _, v := range s.VMs {
		if v.ID == id {
			return v
		}
	}
	return nil
}
