package ui

import (
	"fmt"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/model"
)

const (
	viewVMList   = "vmlist"
	viewDetail   = "detail"
	viewTabBar   = "tabbar"
	viewStatus   = "status"
	viewAddVM    = "addvm"
	viewConfirm  = "confirm"
)

// layout is the gocui layout function — called on every resize and g.Update.
func (a *App) layout(g *gocui.Gui) error {
	maxX, maxY := g.Size()
	if maxX < 20 || maxY < 5 {
		return nil
	}

	listW := maxX * 35 / 100
	if listW < 20 {
		listW = 20
	}

	// VM list pane (left).
	if v, err := g.SetView(viewVMList, 0, 0, listW-1, maxY-2, 0); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Title = " VMs "
		v.Highlight = true
		v.SelBgColor = gocui.ColorBlue
		v.SelFgColor = gocui.ColorWhite
		if a.currentView == "" {
			a.currentView = viewVMList
			if _, err2 := g.SetCurrentView(viewVMList); err2 != nil {
				return err2
			}
		}
	}

	// Tab bar (right top, 1 line).
	if v, err := g.SetView(viewTabBar, listW, 0, maxX-1, 2, 0); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = true
		_ = v
	}

	// Detail pane (right, below tab bar).
	if _, err := g.SetView(viewDetail, listW, 2, maxX-1, maxY-2, 0); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
	}

	// Status bar (bottom).
	if v, err := g.SetView(viewStatus, 0, maxY-2, maxX-1, maxY, 0); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = false
		v.BgColor = gocui.ColorBlue
		v.FgColor = gocui.ColorWhite
		_ = v
	}

	a.renderAll(g)

	// Modal overlays (drawn after base views).
	a.state.Mu.Lock()
	addVMOpen := a.state.AddVMOpen
	confirmOpen := a.state.ConfirmOpen
	a.state.Mu.Unlock()

	if addVMOpen {
		if err := a.addVMView.Layout(g, maxX, maxY); err != nil {
			return err
		}
	} else {
		g.DeleteView(viewAddVM)
	}

	if confirmOpen {
		if err := a.confirmView.Layout(g, maxX, maxY); err != nil {
			return err
		}
	} else {
		g.DeleteView(viewConfirm)
	}

	return nil
}

// renderAll redraws all visible views from current state.
func (a *App) renderAll(g *gocui.Gui) {
	a.renderVMList(g)
	a.renderTabBar(g)
	a.renderDetail(g)
	a.renderStatus(g)
}

func (a *App) renderVMList(g *gocui.Gui) {
	v, err := g.View(viewVMList)
	if err != nil {
		return
	}
	v.Clear()

	a.state.Mu.Lock()
	vms := a.state.VMs
	sel := a.state.SelectedIdx
	a.state.Mu.Unlock()

	if len(vms) == 0 {
		fmt.Fprintln(v, "  (no VMs — press 'a' to add)")
		return
	}
	for i, vm := range vms {
		icon := vm.StatusIcon()
		line := fmt.Sprintf(" %s %-20s %s", icon, vm.Name, vm.Host)
		if i == sel {
			fmt.Fprintf(v, "\x1b[7m%s\x1b[m\n", line)
		} else {
			fmt.Fprintln(v, line)
		}
	}
}

func (a *App) renderTabBar(g *gocui.Gui) {
	v, err := g.View(viewTabBar)
	if err != nil {
		return
	}
	v.Clear()

	a.state.Mu.Lock()
	tab := a.state.ActiveTab
	a.state.Mu.Unlock()

	tabs := []string{"[1] Overview", "[2] Terminal", "[3] Files"}
	for i, t := range tabs {
		if model.ActiveTab(i) == tab {
			fmt.Fprintf(v, "\x1b[7m %s \x1b[m", t)
		} else {
			fmt.Fprintf(v, " %s ", t)
		}
	}
	fmt.Fprintln(v)
}

func (a *App) renderDetail(g *gocui.Gui) {
	a.state.Mu.Lock()
	tab := a.state.ActiveTab
	a.state.Mu.Unlock()

	switch tab {
	case model.TabOverview:
		a.overviewView.Render(g, a.state)
	case model.TabTerminal:
		a.terminalView.Render(g, a.state)
	case model.TabFiles:
		a.filesView.Render(g, a.state)
	}
}

func (a *App) renderStatus(g *gocui.Gui) {
	v, err := g.View(viewStatus)
	if err != nil {
		return
	}
	v.Clear()

	a.state.Mu.Lock()
	msg := a.state.StatusMsg
	a.state.Mu.Unlock()

	if msg == "" {
		msg = " q:quit  a:add  d:delete  1/2/3:tabs  j/k:nav  Enter:select  Ctrl+O:overview"
	}
	fmt.Fprint(v, msg)
}
