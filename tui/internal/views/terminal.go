package views

import (
	"encoding/base64"
	"fmt"
	"sync"
	"time"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/ipc"
	"github.com/adishm/heyvm/tui/internal/model"
	"github.com/adishm/heyvm/tui/internal/terminal"
)

// TerminalView manages PTY rendering in the Terminal tab.
type TerminalView struct {
	client *ipc.Client
	state  *model.AppState
	gui    *gocui.Gui

	mu           sync.Mutex
	emulator     *terminal.Emulator
	scrollback   *terminal.Scrollback
	scrollOffset int   // lines scrolled back (0 = live)
	cursorOn     bool  // for cursor blink
	sessionID    string
	vmID         string
	active       bool

	blinkStop chan struct{}
}

func NewTerminalView(client *ipc.Client, state *model.AppState, gui *gocui.Gui) *TerminalView {
	sb := terminal.NewScrollback(1000)
	return &TerminalView{
		client:     client,
		state:      state,
		gui:        gui,
		scrollback: sb,
		cursorOn:   true,
	}
}

func (t *TerminalView) BindKeys(g *gocui.Gui) {
	g.SetKeybinding(viewDetail, gocui.KeyPgup, gocui.ModNone, t.scrollUp)
	g.SetKeybinding(viewDetail, gocui.KeyPgdn, gocui.ModNone, t.scrollDown)
	g.SetKeybinding(viewDetail, gocui.KeyArrowUp, gocui.ModShift, t.scrollUp1)
	g.SetKeybinding(viewDetail, gocui.KeyArrowDown, gocui.ModShift, t.scrollDown1)
}

func (t *TerminalView) scrollUp(g *gocui.Gui, _ *gocui.View) error {
	t.mu.Lock()
	t.scrollOffset += 24
	t.mu.Unlock()
	return nil
}

func (t *TerminalView) scrollDown(g *gocui.Gui, _ *gocui.View) error {
	t.mu.Lock()
	if t.scrollOffset >= 24 {
		t.scrollOffset -= 24
	} else {
		t.scrollOffset = 0
	}
	t.mu.Unlock()
	return nil
}

func (t *TerminalView) scrollUp1(g *gocui.Gui, _ *gocui.View) error {
	t.mu.Lock()
	t.scrollOffset++
	t.mu.Unlock()
	return nil
}

func (t *TerminalView) scrollDown1(g *gocui.Gui, _ *gocui.View) error {
	t.mu.Lock()
	if t.scrollOffset > 0 {
		t.scrollOffset--
	}
	t.mu.Unlock()
	return nil
}

// StartPTY requests a new PTY session from core.
func (t *TerminalView) StartPTY(vmID string) {
	t.mu.Lock()
	// Close existing session.
	if t.sessionID != "" {
		oldSID := t.sessionID
		oldVMID := t.vmID
		t.client.Send(ipc.ActionClosePTY, map[string]interface{}{
			"vm_id":      oldVMID,
			"session_id": oldSID,
		})
		t.sessionID = ""
	}

	// Determine PTY size from the detail view.
	cols, rows := 80, 24
	if v, err := t.gui.View(viewDetail); err == nil {
		w, h := v.Size()
		if w > 0 {
			cols = w
		}
		if h > 0 {
			rows = h
		}
	}

	t.emulator = terminal.NewEmulator(cols, rows, t.scrollback)
	t.scrollback.Clear()
	t.scrollOffset = 0
	t.vmID = vmID
	t.active = true
	t.mu.Unlock()

	// Emit start_pty (fire-and-forget; PTY_READY event will arrive asynchronously).
	t.client.Send(ipc.ActionStartPTY, map[string]interface{}{
		"vm_id": vmID,
		"rows":  rows,
		"cols":  cols,
	})

	// Wait for PTY_READY.
	readyCh := t.client.Subscribe(ipc.EventPTYReady)
	defer t.client.Unsubscribe(ipc.EventPTYReady, readyCh)

	select {
	case resp := <-readyCh:
		data, _ := resp.Data.(map[string]interface{})
		if sid, ok := data["session_id"].(string); ok {
			t.mu.Lock()
			t.sessionID = sid
			t.mu.Unlock()
		}
	case <-time.After(10 * time.Second):
		return
	}

	// Install the terminal view as the key editor for raw PTY passthrough.
	if v, err := t.gui.View(viewDetail); err == nil {
		v.Editable = true
		v.Editor = &ptyEditor{tv: t}
	}

	// Start cursor blink goroutine.
	t.mu.Lock()
	if t.blinkStop != nil {
		close(t.blinkStop)
	}
	stop := make(chan struct{})
	t.blinkStop = stop
	t.mu.Unlock()

	go t.blinkLoop(stop)
}

func (t *TerminalView) blinkLoop(stop chan struct{}) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			t.mu.Lock()
			t.cursorOn = !t.cursorOn
			t.mu.Unlock()
			t.gui.Update(func(*gocui.Gui) error { return nil })
		case <-stop:
			return
		}
	}
}

// HandleOutput processes a PTY_OUTPUT event.
func (t *TerminalView) HandleOutput(resp ipc.Response) {
	data, _ := resp.Data.(map[string]interface{})
	if data == nil {
		return
	}

	t.mu.Lock()
	sid := t.sessionID
	t.mu.Unlock()

	respSID, _ := data["session_id"].(string)
	if respSID != sid {
		return
	}

	encoded, _ := data["data"].(string)
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return
	}

	t.mu.Lock()
	em := t.emulator
	if em != nil {
		em.Write(raw)
		// Any PTY input resets scroll to live.
		t.scrollOffset = 0
	}
	t.mu.Unlock()
}

// HandleExit processes a PTY_EXIT event.
func (t *TerminalView) HandleExit(resp ipc.Response) {
	t.mu.Lock()
	t.active = false
	t.mu.Unlock()
}

// WriteInput sends user keystrokes to the PTY.
func (t *TerminalView) WriteInput(data string) {
	t.mu.Lock()
	sid := t.sessionID
	vmID := t.vmID
	t.mu.Unlock()

	if sid == "" {
		return
	}
	t.client.Send(ipc.ActionWriteToPTY, map[string]interface{}{
		"vm_id":      vmID,
		"session_id": sid,
		"data":       data,
	})
	// Reset scroll on any input.
	t.mu.Lock()
	t.scrollOffset = 0
	t.mu.Unlock()
}

func (t *TerminalView) Render(g *gocui.Gui, state *model.AppState) {
	v, err := g.View(viewDetail)
	if err != nil {
		return
	}
	v.Clear()
	v.Title = " Terminal "

	t.mu.Lock()
	em := t.emulator
	offset := t.scrollOffset
	active := t.active
	cursorOn := t.cursorOn
	curRow, curCol := 0, 0
	if em != nil {
		curRow = em.CursorRow()
		curCol = em.CursorCol()
	}
	t.mu.Unlock()

	if em == nil {
		fmt.Fprintln(v, "\n  No PTY session. Press '2' to start terminal.")
		return
	}

	lines := em.Lines()
	sbLines := t.scrollback.Lines()

	if offset > 0 {
		// Show scrollback.
		allLines := append(sbLines, lines...)
		_, rows := v.Size()
		start := len(allLines) - rows - offset
		if start < 0 {
			start = 0
		}
		end := start + rows
		if end > len(allLines) {
			end = len(allLines)
		}
		for _, l := range allLines[start:end] {
			fmt.Fprintln(v, l)
		}
		fmt.Fprintf(v, "\x1b[7m-- SCROLLBACK (offset %d) --\x1b[m", offset)
		return
	}

	// Live view.
	for r, line := range lines {
		if r == curRow && active && cursorOn {
			// Insert cursor indicator.
			col := curCol
			if col > len(line) {
				col = len(line)
			}
			fmt.Fprintf(v, "%s\x1b[7m%s\x1b[m%s\n", line[:col], cursorChar(line, col), line[col+1:])
		} else {
			fmt.Fprintln(v, line)
		}
	}
}

func cursorChar(line string, col int) string {
	if col >= len(line) {
		return " "
	}
	return string(line[col])
}

// ptyEditor intercepts gocui key events and forwards them as PTY input.
type ptyEditor struct {
	tv *TerminalView
}

func (e *ptyEditor) Edit(v *gocui.View, key gocui.Key, ch rune, mod gocui.Modifier) {
	var data string
	switch key {
	case gocui.KeyEnter:
		data = "\r"
	case gocui.KeyBackspace, gocui.KeyBackspace2:
		data = "\x7f"
	case gocui.KeyTab:
		data = "\t"
	case gocui.KeyArrowUp:
		data = "\x1b[A"
	case gocui.KeyArrowDown:
		data = "\x1b[B"
	case gocui.KeyArrowRight:
		data = "\x1b[C"
	case gocui.KeyArrowLeft:
		data = "\x1b[D"
	case gocui.KeyHome:
		data = "\x1b[H"
	case gocui.KeyEnd:
		data = "\x1b[F"
	case gocui.KeyPgup:
		data = "\x1b[5~"
	case gocui.KeyPgdn:
		data = "\x1b[6~"
	case gocui.KeyDelete:
		data = "\x1b[3~"
	case gocui.KeyCtrlC:
		data = "\x03"
	case gocui.KeyCtrlD:
		data = "\x04"
	case gocui.KeyCtrlZ:
		data = "\x1a"
	case gocui.KeyCtrlA:
		data = "\x01"
	case gocui.KeyCtrlE:
		data = "\x05"
	case gocui.KeyCtrlK:
		data = "\x0b"
	case gocui.KeyCtrlL:
		data = "\x0c"
	case gocui.KeyCtrlU:
		data = "\x15"
	case gocui.KeyCtrlW:
		data = "\x17"
	case gocui.KeyEsc:
		data = "\x1b"
	case gocui.KeyCtrlO:
		// Ctrl+O is consumed by app (go to overview). Don't forward.
		return
	case 0:
		if ch != 0 {
			data = string(ch)
		}
	}
	if data != "" {
		e.tv.WriteInput(data)
	}
}
