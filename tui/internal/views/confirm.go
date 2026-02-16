package views

import (
	"fmt"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/model"
)

const viewConfirm = "confirm"

// ConfirmView is a yes/no modal overlay.
type ConfirmView struct {
	state *model.AppState
	gui   *gocui.Gui
}

func NewConfirmView(state *model.AppState, gui *gocui.Gui) *ConfirmView {
	return &ConfirmView{state: state, gui: gui}
}

func (c *ConfirmView) BindKeys(g *gocui.Gui) {
	g.SetKeybinding(viewConfirm, 'y', gocui.ModNone, c.confirm)
	g.SetKeybinding(viewConfirm, 'n', gocui.ModNone, c.cancel)
	g.SetKeybinding(viewConfirm, gocui.KeyEnter, gocui.ModNone, c.confirm)
	g.SetKeybinding(viewConfirm, gocui.KeyEsc, gocui.ModNone, c.cancel)
}

func (c *ConfirmView) Layout(g *gocui.Gui, maxX, maxY int) error {
	w, h := 50, 5
	x0 := (maxX - w) / 2
	y0 := (maxY - h) / 2

	v, err := g.SetView(viewConfirm, x0, y0, x0+w, y0+h, 0)
	if err != nil && err != gocui.ErrUnknownView {
		return err
	}
	v.Title = " Confirm "
	v.Clear()

	c.state.Mu.Lock()
	msg := c.state.ConfirmMsg
	c.state.Mu.Unlock()

	fmt.Fprintln(v)
	fmt.Fprintf(v, "  %s\n", msg)
	fmt.Fprintln(v, "  y:yes  n:no")

	_, err2 := g.SetCurrentView(viewConfirm)
	return err2
}

func (c *ConfirmView) confirm(g *gocui.Gui, _ *gocui.View) error {
	c.state.Mu.Lock()
	fn := c.state.ConfirmYes
	c.state.ConfirmOpen = false
	c.state.ConfirmYes = nil
	c.state.ConfirmNo = nil
	c.state.Mu.Unlock()

	if fn != nil {
		fn()
	}
	_, err := g.SetCurrentView(viewDetail)
	return err
}

func (c *ConfirmView) cancel(g *gocui.Gui, _ *gocui.View) error {
	c.state.Mu.Lock()
	fn := c.state.ConfirmNo
	c.state.ConfirmOpen = false
	c.state.ConfirmYes = nil
	c.state.ConfirmNo = nil
	c.state.Mu.Unlock()

	if fn != nil {
		fn()
	}
	_, err := g.SetCurrentView(viewDetail)
	return err
}
