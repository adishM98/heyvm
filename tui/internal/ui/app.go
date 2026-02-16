package ui

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/ipc"
	"github.com/adishm/heyvm/tui/internal/model"
	"github.com/adishm/heyvm/tui/internal/views"
)

// App is the top-level TUI application.
type App struct {
	gui         *gocui.Gui
	client      *ipc.Client
	state       *model.AppState
	currentView string

	// Sub-view handlers.
	overviewView *views.OverviewView
	terminalView *views.TerminalView
	filesView    *views.FilesView
	addVMView    *views.AddVMView
	confirmView  *views.ConfirmView
}

// New creates a new App.
func New(client *ipc.Client) (*App, error) {
	g, err := gocui.NewGui(gocui.OutputNormal, true)
	if err != nil {
		return nil, fmt.Errorf("create gui: %w", err)
	}
	g.Mouse = true

	state := &model.AppState{
		LocalPath:  ".",
		RemotePath: "/",
	}

	a := &App{
		gui:    g,
		client: client,
		state:  state,
	}

	a.overviewView = views.NewOverviewView(client, state, g)
	a.terminalView = views.NewTerminalView(client, state, g)
	a.filesView = views.NewFilesView(client, state, g)
	a.addVMView = views.NewAddVMView(client, state, g)
	a.confirmView = views.NewConfirmView(state, g)

	g.SetManagerFunc(a.layout)

	if err := a.bindKeys(); err != nil {
		return nil, fmt.Errorf("bind keys: %w", err)
	}

	// Subscribe to PTY events.
	go a.handlePTYEvents()
	// Subscribe to transfer events.
	go a.handleTransferEvents()

	return a, nil
}

// Run loads VMs then starts the gocui main loop.
func (a *App) Run() error {
	// Load initial VM list before entering loop.
	go func() {
		resp, err := a.client.Request(ipc.ActionListVMs, nil)
		if err != nil {
			log.Printf("list_vms error: %v", err)
			return
		}
		if resp.Status != "success" {
			log.Printf("list_vms failed: %s", resp.Message)
			return
		}
		vms := parseVMs(resp.Data)
		a.state.Mu.Lock()
		a.state.VMs = vms
		a.state.Mu.Unlock()
		a.gui.Update(func(g *gocui.Gui) error {
			return nil
		})
	}()

	defer a.gui.Close()
	return a.gui.MainLoop()
}

// bindKeys registers all global keybindings.
func (a *App) bindKeys() error {
	// Quit.
	if err := a.gui.SetKeybinding("", gocui.KeyCtrlC, gocui.ModNone, a.quit); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, 'q', gocui.ModNone, a.quit); err != nil {
		return err
	}

	// VM list navigation.
	if err := a.gui.SetKeybinding(viewVMList, 'j', gocui.ModNone, a.navDown); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, 'k', gocui.ModNone, a.navUp); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, gocui.KeyArrowDown, gocui.ModNone, a.navDown); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, gocui.KeyArrowUp, gocui.ModNone, a.navUp); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, gocui.KeyEnter, gocui.ModNone, a.selectVM); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, 'a', gocui.ModNone, a.openAddVM); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, 'd', gocui.ModNone, a.deleteVM); err != nil {
		return err
	}
	if err := a.gui.SetKeybinding(viewVMList, 'r', gocui.ModNone, a.refreshVMs); err != nil {
		return err
	}

	// Tab switching (global).
	for _, v := range []string{viewVMList, viewDetail, viewTabBar} {
		view := v
		if err := a.gui.SetKeybinding(view, '1', gocui.ModNone, func(g *gocui.Gui, _ *gocui.View) error {
			return a.switchTab(g, model.TabOverview)
		}); err != nil {
			return err
		}
		if err := a.gui.SetKeybinding(view, '2', gocui.ModNone, func(g *gocui.Gui, _ *gocui.View) error {
			return a.switchTab(g, model.TabTerminal)
		}); err != nil {
			return err
		}
		if err := a.gui.SetKeybinding(view, '3', gocui.ModNone, func(g *gocui.Gui, _ *gocui.View) error {
			return a.switchTab(g, model.TabFiles)
		}); err != nil {
			return err
		}
	}

	// Ctrl+O: return to overview from terminal.
	if err := a.gui.SetKeybinding("", gocui.KeyCtrlO, gocui.ModNone, func(g *gocui.Gui, _ *gocui.View) error {
		return a.switchTab(g, model.TabOverview)
	}); err != nil {
		return err
	}

	// Esc: go back to VM list.
	if err := a.gui.SetKeybinding(viewDetail, gocui.KeyEsc, gocui.ModNone, func(g *gocui.Gui, _ *gocui.View) error {
		_, err2 := g.SetCurrentView(viewVMList)
		return err2
	}); err != nil {
		return err
	}

	// Delegate remaining bindings to sub-views.
	a.overviewView.BindKeys(a.gui)
	a.terminalView.BindKeys(a.gui)
	a.filesView.BindKeys(a.gui)
	a.addVMView.BindKeys(a.gui)
	a.confirmView.BindKeys(a.gui)

	return nil
}

func (a *App) quit(g *gocui.Gui, _ *gocui.View) error {
	return gocui.ErrQuit
}

func (a *App) navDown(g *gocui.Gui, _ *gocui.View) error {
	a.state.Mu.Lock()
	if a.state.SelectedIdx < len(a.state.VMs)-1 {
		a.state.SelectedIdx++
	}
	a.state.Mu.Unlock()
	return nil
}

func (a *App) navUp(g *gocui.Gui, _ *gocui.View) error {
	a.state.Mu.Lock()
	if a.state.SelectedIdx > 0 {
		a.state.SelectedIdx--
	}
	a.state.Mu.Unlock()
	return nil
}

func (a *App) selectVM(g *gocui.Gui, _ *gocui.View) error {
	a.state.Mu.Lock()
	vm := a.state.SelectedVM()
	if vm == nil {
		a.state.Mu.Unlock()
		return nil
	}
	vmID := vm.ID
	a.state.VMID = vmID
	a.state.Mu.Unlock()

	_, _ = g.SetCurrentView(viewDetail)

	// Connect in background.
	go func() {
		a.setStatus("Connecting to " + vmID + "...")
		resp, err := a.client.Request(ipc.ActionConnectVM, map[string]interface{}{
			"vm_id": vmID,
		})
		if err != nil || resp.Status != "success" {
			msg := "connect error"
			if err != nil {
				msg = err.Error()
			} else {
				msg = resp.Message
			}
			a.setStatus("Error: " + msg)
			return
		}
		a.setStatus("Connected to " + vmID)
		// Refresh VM list to get updated status.
		a.refreshVMsAsync()
	}()
	return nil
}

func (a *App) openAddVM(g *gocui.Gui, _ *gocui.View) error {
	a.state.Mu.Lock()
	a.state.AddVMOpen = true
	a.state.Mu.Unlock()
	return nil
}

func (a *App) deleteVM(g *gocui.Gui, _ *gocui.View) error {
	a.state.Mu.Lock()
	vm := a.state.SelectedVM()
	if vm == nil {
		a.state.Mu.Unlock()
		return nil
	}
	vmID := vm.ID
	vmName := vm.Name
	a.state.ConfirmMsg = fmt.Sprintf("Delete VM %q? (y/n)", vmName)
	a.state.ConfirmOpen = true
	a.state.ConfirmYes = func() {
		go func() {
			a.client.Request(ipc.ActionRemoveVM, map[string]interface{}{"vm_id": vmID})
			a.refreshVMsAsync()
		}()
	}
	a.state.ConfirmNo = nil
	a.state.Mu.Unlock()
	return nil
}

func (a *App) refreshVMs(g *gocui.Gui, _ *gocui.View) error {
	go a.refreshVMsAsync()
	return nil
}

func (a *App) refreshVMsAsync() {
	resp, err := a.client.Request(ipc.ActionListVMs, nil)
	if err != nil || resp.Status != "success" {
		return
	}
	vms := parseVMs(resp.Data)
	a.state.Mu.Lock()
	a.state.VMs = vms
	a.state.Mu.Unlock()
	a.gui.Update(func(*gocui.Gui) error { return nil })
}

func (a *App) switchTab(g *gocui.Gui, tab model.ActiveTab) error {
	a.state.Mu.Lock()
	prev := a.state.ActiveTab
	a.state.ActiveTab = tab
	vmID := a.state.VMID
	a.state.Mu.Unlock()

	if tab == model.TabTerminal && prev != model.TabTerminal && vmID != "" {
		go a.terminalView.StartPTY(vmID)
	}
	if tab == model.TabFiles && vmID != "" {
		go a.filesView.LoadBoth(vmID)
	}
	return nil
}

func (a *App) setStatus(msg string) {
	a.state.Mu.Lock()
	a.state.StatusMsg = msg
	a.state.Mu.Unlock()
	a.gui.Update(func(*gocui.Gui) error { return nil })
}

// handlePTYEvents listens for PTY_OUTPUT / PTY_EXIT events.
func (a *App) handlePTYEvents() {
	outCh := a.client.Subscribe(ipc.EventPTYOutput)
	exitCh := a.client.Subscribe(ipc.EventPTYExit)
	for {
		select {
		case resp := <-outCh:
			a.terminalView.HandleOutput(resp)
			a.gui.Update(func(*gocui.Gui) error { return nil })
		case resp := <-exitCh:
			a.terminalView.HandleExit(resp)
			a.gui.Update(func(*gocui.Gui) error { return nil })
		}
	}
}

// handleTransferEvents listens for TRANSFER_PROGRESS events.
func (a *App) handleTransferEvents() {
	ch := a.client.Subscribe(ipc.EventTransferProgress)
	for resp := range ch {
		data, _ := resp.Data.(map[string]interface{})
		if data == nil {
			continue
		}
		file, _ := data["file"].(string)
		pct, _ := data["percent"].(float64)
		dir, _ := data["direction"].(string)
		a.state.Mu.Lock()
		a.state.TransferFile = file
		a.state.TransferPercent = pct
		a.state.TransferDirection = dir
		a.state.Mu.Unlock()
		a.gui.Update(func(*gocui.Gui) error { return nil })
	}
}

// parseVMs converts the raw JSON data from list_vms into []*model.VM.
func parseVMs(data interface{}) []*model.VM {
	b, err := json.Marshal(data)
	if err != nil {
		return nil
	}
	var vms []*model.VM
	if err := json.Unmarshal(b, &vms); err != nil {
		return nil
	}
	return vms
}
