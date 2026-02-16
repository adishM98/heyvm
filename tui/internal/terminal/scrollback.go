package terminal

// Scrollback is a fixed-capacity ring buffer of strings (one per line of output).
type Scrollback struct {
	lines []string
	cap   int
}

// NewScrollback allocates a ring buffer with the given capacity.
func NewScrollback(cap int) *Scrollback {
	return &Scrollback{lines: make([]string, 0, cap), cap: cap}
}

// Append adds lines to the buffer, dropping the oldest if at capacity.
func (s *Scrollback) Append(lines []string) {
	for _, l := range lines {
		if len(s.lines) >= s.cap {
			s.lines = s.lines[1:]
		}
		s.lines = append(s.lines, l)
	}
}

// Lines returns all buffered lines (oldest first).
func (s *Scrollback) Lines() []string {
	return s.lines
}

// Len returns the current number of buffered lines.
func (s *Scrollback) Len() int {
	return len(s.lines)
}

// Tail returns the last n lines (or all if n > Len).
func (s *Scrollback) Tail(n int) []string {
	if n >= len(s.lines) {
		return s.lines
	}
	return s.lines[len(s.lines)-n:]
}

// Clear empties the buffer.
func (s *Scrollback) Clear() {
	s.lines = s.lines[:0]
}
