package views

import (
	"fmt"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/ipc"
	"github.com/adishm/heyvm/tui/internal/model"
)

const viewDetail = "detail"

// OverviewView renders the Overview tab.
type OverviewView struct {
	client *ipc.Client
	state  *model.AppState
	gui    *gocui.Gui
}

func NewOverviewView(client *ipc.Client, state *model.AppState, gui *gocui.Gui) *OverviewView {
	return &OverviewView{client: client, state: state, gui: gui}
}

func (o *OverviewView) BindKeys(g *gocui.Gui) {
	g.SetKeybinding(viewDetail, 'c', gocui.ModNone, o.connect)
	g.SetKeybinding(viewDetail, 'd', gocui.ModNone, o.disconnect)
}

func (o *OverviewView) Render(g *gocui.Gui, state *model.AppState) {
	v, err := g.View(viewDetail)
	if err != nil {
		return
	}
	v.Clear()
	v.Title = " Overview "

	state.Mu.Lock()
	vm := state.SelectedVM()
	state.Mu.Unlock()

	if vm == nil {
		fmt.Fprintln(v, "\n  Select a VM from the list.")
		return
	}

	fmt.Fprintf(v, "\n  Name:     %s\n", vm.Name)
	fmt.Fprintf(v, "  Host:     %s\n", vm.Host)
	fmt.Fprintf(v, "  Port:     %d\n", vm.Port)
	fmt.Fprintf(v, "  User:     %s\n", vm.Username)
	fmt.Fprintf(v, "  Auth:     %s\n", vm.Auth.Type)
	if vm.Auth.KeyPath != "" {
		fmt.Fprintf(v, "  Key:      %s\n", vm.Auth.KeyPath)
	}
	fmt.Fprintf(v, "  Status:   %s %s\n", vm.StatusIcon(), vm.Status)
	if vm.LastSeen != "" {
		fmt.Fprintf(v, "  LastSeen: %s\n", vm.LastSeen)
	}
	fmt.Fprintln(v)
	fmt.Fprintln(v, "  c:connect  d:disconnect  2:terminal  3:files")
}

func (o *OverviewView) connect(g *gocui.Gui, _ *gocui.View) error {
	o.state.Mu.Lock()
	vm := o.state.SelectedVM()
	o.state.Mu.Unlock()
	if vm == nil {
		return nil
	}
	vmID := vm.ID
	go func() {
		o.client.Request(ipc.ActionConnectVM, map[string]interface{}{"vm_id": vmID})
		o.refreshVMs()
	}()
	return nil
}

func (o *OverviewView) disconnect(g *gocui.Gui, _ *gocui.View) error {
	o.state.Mu.Lock()
	vm := o.state.SelectedVM()
	o.state.Mu.Unlock()
	if vm == nil {
		return nil
	}
	vmID := vm.ID
	go func() {
		o.client.Request(ipc.ActionDisconnectVM, map[string]interface{}{"vm_id": vmID})
		o.refreshVMs()
	}()
	return nil
}

func (o *OverviewView) refreshVMs() {
	resp, err := o.client.Request(ipc.ActionListVMs, nil)
	if err != nil || resp.Status != "success" {
		return
	}
	var vms []*model.VM
	if b, err := marshalJSON(resp.Data); err == nil {
		unmarshalJSON(b, &vms)
	}
	o.state.Mu.Lock()
	o.state.VMs = vms
	o.state.Mu.Unlock()
	o.gui.Update(func(*gocui.Gui) error { return nil })
}
