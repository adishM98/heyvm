package views

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/ipc"
	"github.com/adishm/heyvm/tui/internal/model"
)

const viewAddVM = "addvm"

// AddVMView is a multi-step modal form for adding a new VM.
type AddVMView struct {
	client *ipc.Client
	state  *model.AppState
	gui    *gocui.Gui

	// Form state.
	step       int // 0 = auth type, 1 = form fields
	authType   model.AuthType
	fields     []field
	fieldIdx   int
	statusMsg  string
	testing    bool
}

type field struct {
	label    string
	value    string
	password bool
}

func NewAddVMView(client *ipc.Client, state *model.AppState, gui *gocui.Gui) *AddVMView {
	return &AddVMView{client: client, state: state, gui: gui}
}

func (a *AddVMView) BindKeys(g *gocui.Gui) {
	g.SetKeybinding(viewAddVM, gocui.KeyEsc, gocui.ModNone, a.close)
	g.SetKeybinding(viewAddVM, gocui.KeyTab, gocui.ModNone, a.nextField)
	g.SetKeybinding(viewAddVM, gocui.KeyArrowDown, gocui.ModNone, a.nextField)
	g.SetKeybinding(viewAddVM, gocui.KeyArrowUp, gocui.ModNone, a.prevField)
	g.SetKeybinding(viewAddVM, gocui.KeyEnter, gocui.ModNone, a.handleEnter)
	g.SetKeybinding(viewAddVM, gocui.KeyBackspace, gocui.ModNone, a.backspace)
	g.SetKeybinding(viewAddVM, gocui.KeyBackspace2, gocui.ModNone, a.backspace)
	g.SetKeybinding(viewAddVM, '1', gocui.ModNone, a.keyHandler)
	g.SetKeybinding(viewAddVM, '2', gocui.ModNone, a.keyHandler)
}

func (a *AddVMView) Layout(g *gocui.Gui, maxX, maxY int) error {
	w, h := 60, 20
	x0 := (maxX - w) / 2
	y0 := (maxY - h) / 2

	v, err := g.SetView(viewAddVM, x0, y0, x0+w, y0+h, 0)
	if err != nil && err != gocui.ErrUnknownView {
		return err
	}
	v.Title = " Add VM "
	v.Editable = false
	v.Editor = &addVMEditor{av: a}
	v.Editable = true
	v.Clear()

	a.render(v)
	_, err2 := g.SetCurrentView(viewAddVM)
	return err2
}

func (a *AddVMView) render(v *gocui.View) {
	if a.step == 0 {
		fmt.Fprintln(v, "\n  Select authentication type:")
		fmt.Fprintln(v)
		fmt.Fprintln(v, "  [1] SSH Key")
		fmt.Fprintln(v, "  [2] Password")
		fmt.Fprintln(v)
		fmt.Fprintln(v, "  ESC to cancel")
	} else {
		fmt.Fprintln(v, "\n  New VM details:")
		fmt.Fprintln(v)
		for i, f := range a.fields {
			marker := "  "
			if i == a.fieldIdx {
				marker = "> "
			}
			val := f.value
			if f.password {
				val = strings.Repeat("*", len(val))
			}
			fmt.Fprintf(v, "  %s%-18s %s\n", marker, f.label+":", val)
		}
		fmt.Fprintln(v)
		if a.statusMsg != "" {
			fmt.Fprintf(v, "  %s\n", a.statusMsg)
		} else if a.testing {
			fmt.Fprintln(v, "  Testing connection...")
		}
		fmt.Fprintln(v)
		fmt.Fprintln(v, "  Tab/↑↓:navigate  Enter:test+save  ESC:cancel")
	}
}

func (a *AddVMView) close(g *gocui.Gui, _ *gocui.View) error {
	a.reset()
	a.state.Mu.Lock()
	a.state.AddVMOpen = false
	a.state.Mu.Unlock()
	_, err := g.SetCurrentView(viewVMList)
	return err
}

func (a *AddVMView) reset() {
	a.step = 0
	a.fieldIdx = 0
	a.fields = nil
	a.statusMsg = ""
	a.testing = false
}

func (a *AddVMView) nextField(g *gocui.Gui, _ *gocui.View) error {
	if a.step == 1 && a.fieldIdx < len(a.fields)-1 {
		a.fieldIdx++
	}
	return nil
}

func (a *AddVMView) prevField(g *gocui.Gui, _ *gocui.View) error {
	if a.step == 1 && a.fieldIdx > 0 {
		a.fieldIdx--
	}
	return nil
}

func (a *AddVMView) backspace(g *gocui.Gui, _ *gocui.View) error {
	if a.step == 1 && a.fieldIdx < len(a.fields) {
		f := &a.fields[a.fieldIdx]
		if len(f.value) > 0 {
			f.value = f.value[:len(f.value)-1]
		}
	}
	return nil
}

func (a *AddVMView) keyHandler(g *gocui.Gui, v *gocui.View) error {
	// Step 0: auth type selection via 1/2 keys — handled by addVMEditor.
	return nil
}

func (a *AddVMView) handleEnter(g *gocui.Gui, _ *gocui.View) error {
	if a.step == 0 {
		return nil // auth type selected via number keys, not Enter
	}
	// Step 1: test connection then save.
	go a.testAndSave(g)
	return nil
}

func (a *AddVMView) testAndSave(g *gocui.Gui) {
	a.testing = true
	a.statusMsg = ""
	g.Update(func(*gocui.Gui) error { return nil })

	vm, password := a.buildVM()
	if vm == nil {
		a.statusMsg = "Error: all fields required"
		a.testing = false
		g.Update(func(*gocui.Gui) error { return nil })
		return
	}

	// Test connection.
	params := map[string]interface{}{"vm": vmToMap(vm)}
	if password != "" {
		params["password"] = password
	}
	resp, err := a.client.Request(ipc.ActionTestConnection, params)
	a.testing = false
	if err != nil || resp.Status != "success" {
		msg := "Connection failed"
		if err != nil {
			msg = err.Error()
		} else if resp.Message != "" {
			msg = resp.Message
		}
		a.statusMsg = "Error: " + msg
		g.Update(func(*gocui.Gui) error { return nil })
		return
	}

	// Store password if requested.
	if a.authType == model.AuthTypePassword {
		for _, f := range a.fields {
			if f.label == "Store password" && f.value == "y" {
				// We'll store after add.
				break
			}
		}
	}

	// Add VM.
	addResp, err := a.client.Request(ipc.ActionAddVM, map[string]interface{}{"vm": vmToMap(vm)})
	if err != nil || addResp.Status != "success" {
		a.statusMsg = "Error adding VM"
		g.Update(func(*gocui.Gui) error { return nil })
		return
	}

	// Store password if needed.
	if a.authType == model.AuthTypePassword && password != "" {
		storePass := false
		for _, f := range a.fields {
			if f.label == "Store password" && strings.ToLower(f.value) == "y" {
				storePass = true
				break
			}
		}
		if storePass {
			// Extract ID from response.
			if data, ok := addResp.Data.(map[string]interface{}); ok {
				if id, ok := data["id"].(string); ok {
					a.client.Request(ipc.ActionStorePassword, map[string]interface{}{
						"vm_id":    id,
						"password": password,
					})
				}
			}
		}
	}

	// Close and refresh.
	a.reset()
	a.state.Mu.Lock()
	a.state.AddVMOpen = false
	a.state.Mu.Unlock()
	g.Update(func(g *gocui.Gui) error {
		g.SetCurrentView(viewVMList)
		return nil
	})

	// Refresh VM list.
	resp2, err := a.client.Request(ipc.ActionListVMs, nil)
	if err == nil && resp2.Status == "success" {
		var vms []*model.VM
		if b, e := marshalJSON(resp2.Data); e == nil {
			unmarshalJSON(b, &vms)
		}
		a.state.Mu.Lock()
		a.state.VMs = vms
		a.state.Mu.Unlock()
		g.Update(func(*gocui.Gui) error { return nil })
	}
}

func (a *AddVMView) buildVM() (*model.VM, string) {
	vals := make(map[string]string)
	for _, f := range a.fields {
		vals[f.label] = f.value
	}

	name := vals["Name"]
	host := vals["Host"]
	portStr := vals["Port"]
	if portStr == "" {
		portStr = "22"
	}
	username := vals["Username"]

	if name == "" || host == "" || username == "" {
		return nil, ""
	}

	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 22
	}

	vm := &model.VM{
		Name:     name,
		Host:     host,
		Port:     port,
		Username: username,
		Auth: model.AuthConfig{
			Type: a.authType,
		},
	}

	var password string
	if a.authType == model.AuthTypeKey {
		vm.Auth.KeyPath = vals["Key path"]
	} else {
		password = vals["Password"]
		storeStr := strings.ToLower(vals["Store password"])
		vm.Auth.RememberPassword = storeStr == "y" || storeStr == "yes"
	}

	return vm, password
}

func vmToMap(vm *model.VM) map[string]interface{} {
	return map[string]interface{}{
		"name":     vm.Name,
		"host":     vm.Host,
		"port":     vm.Port,
		"username": vm.Username,
		"auth": map[string]interface{}{
			"type":             string(vm.Auth.Type),
			"keyPath":          vm.Auth.KeyPath,
			"rememberPassword": vm.Auth.RememberPassword,
		},
	}
}

// addVMEditor handles character input for the AddVM form.
type addVMEditor struct {
	av *AddVMView
}

func (e *addVMEditor) Edit(v *gocui.View, key gocui.Key, ch rune, mod gocui.Modifier) {
	av := e.av
	if av.step == 0 {
		switch ch {
		case '1':
			av.authType = model.AuthTypeKey
			av.step = 1
			av.fields = []field{
				{label: "Name"},
				{label: "Host"},
				{label: "Port", value: "22"},
				{label: "Username"},
				{label: "Key path"},
			}
			av.fieldIdx = 0
		case '2':
			av.authType = model.AuthTypePassword
			av.step = 1
			av.fields = []field{
				{label: "Name"},
				{label: "Host"},
				{label: "Port", value: "22"},
				{label: "Username"},
				{label: "Password", password: true},
				{label: "Store password", value: "n"},
			}
			av.fieldIdx = 0
		}
	} else {
		if key == 0 && ch != 0 && av.fieldIdx < len(av.fields) {
			av.fields[av.fieldIdx].value += string(ch)
		}
	}
}

// viewVMList is referenced from the confirm/addvm views.
const viewVMList = "vmlist"
