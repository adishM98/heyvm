package terminal

import (
	"strings"
	"sync"
)

// Emulator is a basic headless ANSI/VT100 terminal emulator.
// It maintains a grid of cells and appends completed lines to a Scrollback buffer.
// This implementation handles the most common escape sequences needed for shell interaction.
type Emulator struct {
	mu         sync.Mutex
	cols, rows int

	// Current grid: rows × cols, each cell is a rune + attributes.
	grid   [][]Cell
	curRow int
	curCol int

	// Scrollback receives lines that scroll off the top.
	scrollback *Scrollback

	// ESC sequence parser state.
	escBuf strings.Builder
	inEsc  bool
}

// Cell holds a character and its display attributes (color codes omitted for now).
type Cell struct {
	Ch   rune
	Attr string // raw SGR string, e.g. "1;32"
}

// NewEmulator creates an Emulator with the given dimensions.
func NewEmulator(cols, rows int, scrollback *Scrollback) *Emulator {
	e := &Emulator{cols: cols, rows: rows, scrollback: scrollback}
	e.grid = makeGrid(rows, cols)
	return e
}

func makeGrid(rows, cols int) [][]Cell {
	g := make([][]Cell, rows)
	for i := range g {
		g[i] = make([]Cell, cols)
		for j := range g[i] {
			g[i][j].Ch = ' '
		}
	}
	return g
}

// Resize changes the emulator dimensions.
func (e *Emulator) Resize(cols, rows int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.cols, e.rows = cols, rows
	// Rebuild grid, preserving as much as possible.
	newGrid := makeGrid(rows, cols)
	for r := 0; r < rows && r < len(e.grid); r++ {
		for c := 0; c < cols && c < len(e.grid[r]); c++ {
			newGrid[r][c] = e.grid[r][c]
		}
	}
	e.grid = newGrid
	if e.curRow >= rows {
		e.curRow = rows - 1
	}
	if e.curCol >= cols {
		e.curCol = cols - 1
	}
}

// Write feeds raw bytes (PTY output) into the emulator.
func (e *Emulator) Write(p []byte) (int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, b := range p {
		e.processByte(b)
	}
	return len(p), nil
}

// Lines returns a snapshot of all visible rows as strings (including ANSI resets).
func (e *Emulator) Lines() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]string, e.rows)
	for r, row := range e.grid {
		var sb strings.Builder
		for _, cell := range row {
			if cell.Ch == 0 {
				sb.WriteRune(' ')
			} else {
				sb.WriteRune(cell.Ch)
			}
		}
		out[r] = sb.String()
	}
	return out
}

// CursorRow returns the current cursor row (0-indexed).
func (e *Emulator) CursorRow() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.curRow
}

// CursorCol returns the current cursor column (0-indexed).
func (e *Emulator) CursorCol() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.curCol
}

// processByte handles one byte (caller holds mu).
func (e *Emulator) processByte(b byte) {
	if e.inEsc {
		e.escBuf.WriteByte(b)
		e.tryFlushEsc()
		return
	}

	switch b {
	case 0x1B: // ESC
		e.inEsc = true
		e.escBuf.Reset()
		e.escBuf.WriteByte(b)
	case '\r':
		e.curCol = 0
	case '\n':
		e.newline()
	case '\t':
		// Advance to next tab stop (every 8 cols).
		e.curCol = (e.curCol/8 + 1) * 8
		if e.curCol >= e.cols {
			e.curCol = e.cols - 1
		}
	case '\b':
		if e.curCol > 0 {
			e.curCol--
		}
	case 0x07: // BEL — ignore
	case 0x00: // NUL — ignore
	default:
		if b >= 0x20 { // printable
			e.putChar(rune(b))
		}
	}
}

// tryFlushEsc attempts to complete and execute an escape sequence.
func (e *Emulator) tryFlushEsc() {
	s := e.escBuf.String()
	if len(s) < 2 {
		return
	}

	// Two-byte sequences: ESC + single char.
	if len(s) == 2 {
		switch s[1] {
		case '[', '(', ')', 'P', ']', '^', '_':
			// Multi-byte sequence starts, continue accumulating.
			return
		case 'M': // Reverse index
			if e.curRow > 0 {
				e.curRow--
			}
			e.inEsc = false
			return
		case '7': // Save cursor
			e.inEsc = false
			return
		case '8': // Restore cursor
			e.inEsc = false
			return
		default:
			e.inEsc = false
			return
		}
	}

	switch s[1] {
	case '[':
		// CSI sequence — wait for final byte (A-Z, a-z, @, ~, etc.).
		last := s[len(s)-1]
		if (last >= 'A' && last <= 'Z') || (last >= 'a' && last <= 'z') || last == '@' || last == '~' || last == '`' {
			e.executeCSI(s[2:])
			e.inEsc = false
		}
		// else keep accumulating
	case ']':
		// OSC — terminated by BEL or ST.
		if last := s[len(s)-1]; last == 0x07 || (len(s) > 2 && s[len(s)-2] == 0x1B && last == '\\') {
			e.inEsc = false
		}
	case '(':
		if len(s) == 3 {
			e.inEsc = false // charset designation, ignore
		}
	default:
		if len(s) > 10 {
			e.inEsc = false // give up on unknown sequences
		}
	}
}

// executeCSI executes a CSI escape sequence. params is everything between [ and the final byte.
func (e *Emulator) executeCSI(params string) {
	if len(params) == 0 {
		return
	}
	final := params[len(params)-1]
	args := params[:len(params)-1]

	nums := parseNums(args)
	n1 := numOr(nums, 0, 1)
	n2 := numOr(nums, 1, 1)

	switch final {
	case 'A': // Cursor Up
		e.curRow -= n1
		if e.curRow < 0 {
			e.curRow = 0
		}
	case 'B': // Cursor Down
		e.curRow += n1
		if e.curRow >= e.rows {
			e.curRow = e.rows - 1
		}
	case 'C': // Cursor Forward
		e.curCol += n1
		if e.curCol >= e.cols {
			e.curCol = e.cols - 1
		}
	case 'D': // Cursor Back
		e.curCol -= n1
		if e.curCol < 0 {
			e.curCol = 0
		}
	case 'E': // Cursor Next Line
		e.curRow += n1
		e.curCol = 0
		if e.curRow >= e.rows {
			e.curRow = e.rows - 1
		}
	case 'F': // Cursor Previous Line
		e.curRow -= n1
		e.curCol = 0
		if e.curRow < 0 {
			e.curRow = 0
		}
	case 'G', '`': // Cursor Horizontal Absolute
		e.curCol = n1 - 1
		if e.curCol < 0 {
			e.curCol = 0
		}
		if e.curCol >= e.cols {
			e.curCol = e.cols - 1
		}
	case 'H', 'f': // Cursor Position
		e.curRow = n1 - 1
		e.curCol = n2 - 1
		if e.curRow < 0 {
			e.curRow = 0
		}
		if e.curRow >= e.rows {
			e.curRow = e.rows - 1
		}
		if e.curCol < 0 {
			e.curCol = 0
		}
		if e.curCol >= e.cols {
			e.curCol = e.cols - 1
		}
	case 'J': // Erase in Display
		switch n1 {
		case 0: // Erase below
			for c := e.curCol; c < e.cols; c++ {
				e.grid[e.curRow][c] = Cell{Ch: ' '}
			}
			for r := e.curRow + 1; r < e.rows; r++ {
				for c := range e.grid[r] {
					e.grid[r][c] = Cell{Ch: ' '}
				}
			}
		case 1: // Erase above
			for r := 0; r < e.curRow; r++ {
				for c := range e.grid[r] {
					e.grid[r][c] = Cell{Ch: ' '}
				}
			}
			for c := 0; c <= e.curCol && c < e.cols; c++ {
				e.grid[e.curRow][c] = Cell{Ch: ' '}
			}
		case 2, 3: // Erase all
			e.grid = makeGrid(e.rows, e.cols)
		}
	case 'K': // Erase in Line
		switch n1 {
		case 0: // Erase to end of line
			for c := e.curCol; c < e.cols; c++ {
				e.grid[e.curRow][c] = Cell{Ch: ' '}
			}
		case 1: // Erase to start of line
			for c := 0; c <= e.curCol && c < e.cols; c++ {
				e.grid[e.curRow][c] = Cell{Ch: ' '}
			}
		case 2: // Erase entire line
			for c := range e.grid[e.curRow] {
				e.grid[e.curRow][c] = Cell{Ch: ' '}
			}
		}
	case 'S': // Scroll Up
		for i := 0; i < n1; i++ {
			e.scrollUp()
		}
	case 'T': // Scroll Down
		for i := 0; i < n1; i++ {
			e.scrollDown()
		}
	case 'P': // Delete Characters
		row := e.grid[e.curRow]
		copy(row[e.curCol:], row[e.curCol+n1:])
		for c := e.cols - n1; c < e.cols; c++ {
			if c >= 0 {
				row[c] = Cell{Ch: ' '}
			}
		}
	case 'd': // Line Position Absolute
		e.curRow = n1 - 1
		if e.curRow < 0 {
			e.curRow = 0
		}
		if e.curRow >= e.rows {
			e.curRow = e.rows - 1
		}
	case 'm': // SGR — color/attribute (we track but don't render colors in gocui plain mode)
		// Ignored for rendering simplicity; gocui handles its own colors.
	case 'h', 'l': // Mode set/reset (e.g. ?25h show cursor) — ignore
	case 'r': // Set scroll region — ignore
	case 's': // Save cursor — ignore
	case 'u': // Restore cursor — ignore
	}
}

func (e *Emulator) putChar(ch rune) {
	if e.curRow >= e.rows {
		e.curRow = e.rows - 1
	}
	if e.curCol >= e.cols {
		// Wrap.
		e.curCol = 0
		e.newline()
	}
	e.grid[e.curRow][e.curCol] = Cell{Ch: ch}
	e.curCol++
	if e.curCol >= e.cols {
		e.curCol = 0
		e.newline()
	}
}

func (e *Emulator) newline() {
	if e.curRow < e.rows-1 {
		e.curRow++
	} else {
		e.scrollUp()
	}
}

func (e *Emulator) scrollUp() {
	// Save top line to scrollback.
	if e.scrollback != nil && len(e.grid) > 0 {
		var sb strings.Builder
		for _, cell := range e.grid[0] {
			if cell.Ch == 0 {
				sb.WriteRune(' ')
			} else {
				sb.WriteRune(cell.Ch)
			}
		}
		e.scrollback.Append([]string{strings.TrimRight(sb.String(), " ")})
	}
	// Shift rows up.
	copy(e.grid, e.grid[1:])
	e.grid[e.rows-1] = make([]Cell, e.cols)
	for c := range e.grid[e.rows-1] {
		e.grid[e.rows-1][c] = Cell{Ch: ' '}
	}
}

func (e *Emulator) scrollDown() {
	copy(e.grid[1:], e.grid)
	e.grid[0] = make([]Cell, e.cols)
	for c := range e.grid[0] {
		e.grid[0][c] = Cell{Ch: ' '}
	}
}

// parseNums parses semicolon-separated integers from a CSI parameter string.
func parseNums(s string) []int {
	if s == "" {
		return nil
	}
	var nums []int
	cur := 0
	hasCur := false
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			cur = cur*10 + int(ch-'0')
			hasCur = true
		} else if ch == ';' {
			nums = append(nums, cur)
			cur = 0
			hasCur = false
		}
	}
	if hasCur {
		nums = append(nums, cur)
	}
	return nums
}

// numOr returns nums[i] if it exists and is > 0, otherwise def.
func numOr(nums []int, i, def int) int {
	if i < len(nums) && nums[i] > 0 {
		return nums[i]
	}
	return def
}
