package ssh

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"sync"

	cryptossh "golang.org/x/crypto/ssh"
)

// Session represents an interactive PTY session
type Session struct {
	id      string
	session *cryptossh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
	stderr  io.Reader
	rows    int
	cols    int
	closed  bool
	mu      sync.Mutex
}

// ID returns the session ID
func (s *Session) ID() string {
	if s.id == "" {
		s.id = generateSessionID()
	}
	return s.id
}

// Write sends data to the session's stdin
func (s *Session) Write(data []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return 0, ErrSessionClosed
	}

	return s.stdin.Write(data)
}

// Read reads data from the session's stdout
func (s *Session) Read(buf []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return 0, ErrSessionClosed
	}

	return s.stdout.Read(buf)
}

// ReadStderr reads data from the session's stderr
func (s *Session) ReadStderr(buf []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return 0, ErrSessionClosed
	}

	return s.stderr.Read(buf)
}

// Resize changes the terminal size
func (s *Session) Resize(rows, cols int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return ErrSessionClosed
	}

	if err := s.session.WindowChange(rows, cols); err != nil {
		return fmt.Errorf("failed to resize window: %w", err)
	}

	s.rows = rows
	s.cols = cols
	return nil
}

// Close closes the session
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil
	}

	s.closed = true

	if s.session != nil {
		return s.session.Close()
	}

	return nil
}

// IsClosed returns true if the session is closed
func (s *Session) IsClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// GetSize returns the current terminal size
func (s *Session) GetSize() (rows, cols int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rows, s.cols
}

// generateSessionID generates a unique session ID
func generateSessionID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
