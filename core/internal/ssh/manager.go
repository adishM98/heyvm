package ssh

import (
	"bytes"
	"fmt"
	"sync"

	"github.com/adishm/heyvm/internal/auth"
	"github.com/adishm/heyvm/internal/vm"
	"golang.org/x/crypto/ssh"
)

// Manager manages SSH connections and sessions
type Manager struct {
	vm       *vm.VM
	auth     auth.Provider
	client   *ssh.Client
	sessions map[string]*Session
	mu       sync.RWMutex
}

// NewManager creates a new SSH manager
func NewManager(v *vm.VM, authProvider auth.Provider) *Manager {
	return &Manager{
		vm:       v,
		auth:     authProvider,
		sessions: make(map[string]*Session),
	}
}

// Connect establishes an SSH connection
// This method is idempotent - if already connected, it returns nil
func (m *Manager) Connect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Idempotent: if already connected, just return success
	if m.client != nil {
		return nil
	}

	client, err := m.auth.Connect(m.vm)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}

	m.client = client
	return nil
}

// Disconnect closes the SSH connection and all sessions
func (m *Manager) Disconnect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Close all sessions
	for _, session := range m.sessions {
		session.Close()
	}
	m.sessions = make(map[string]*Session)

	// Close client
	if m.client != nil {
		if err := m.client.Close(); err != nil {
			return fmt.Errorf("failed to close SSH client: %w", err)
		}
		m.client = nil
	}

	return nil
}

// IsConnected returns true if the SSH client is connected
func (m *Manager) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.client != nil
}

// ExecuteCommand executes a single command and returns the output
func (m *Manager) ExecuteCommand(cmd string) (string, error) {
	m.mu.RLock()
	client := m.client
	m.mu.RUnlock()

	if client == nil {
		return "", ErrNotConnected
	}

	// Create a new session for this command
	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrSessionFailed, err)
	}
	defer session.Close()

	// Capture output
	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	// Execute command
	if err := session.Run(cmd); err != nil {
		// Include stderr in error if command failed
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%w: %v (stderr: %s)", ErrCommandFailed, err, stderr.String())
		}
		return "", fmt.Errorf("%w: %v", ErrCommandFailed, err)
	}

	return stdout.String(), nil
}

// StartPTY starts an interactive PTY session
func (m *Manager) StartPTY(rows, cols int) (*Session, error) {
	m.mu.RLock()
	client := m.client
	m.mu.RUnlock()

	if client == nil {
		return nil, ErrNotConnected
	}

	// Create SSH session
	sshSession, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSessionFailed, err)
	}

	// Request PTY
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,     // Enable echoing
		ssh.TTY_OP_ISPEED: 14400, // Input speed = 14.4kbaud
		ssh.TTY_OP_OSPEED: 14400, // Output speed = 14.4kbaud
	}

	if err := sshSession.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		sshSession.Close()
		return nil, fmt.Errorf("%w: %v", ErrPTYFailed, err)
	}

	// Get pipes for stdin/stdout/stderr
	stdin, err := sshSession.StdinPipe()
	if err != nil {
		sshSession.Close()
		return nil, fmt.Errorf("failed to get stdin pipe: %w", err)
	}

	stdout, err := sshSession.StdoutPipe()
	if err != nil {
		sshSession.Close()
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := sshSession.StderrPipe()
	if err != nil {
		sshSession.Close()
		return nil, fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	// Start shell
	if err := sshSession.Shell(); err != nil {
		sshSession.Close()
		return nil, fmt.Errorf("failed to start shell: %w", err)
	}

	// Create session wrapper
	session := &Session{
		session: sshSession,
		stdin:   stdin,
		stdout:  stdout,
		stderr:  stderr,
		rows:    rows,
		cols:    cols,
	}

	// Store session
	m.mu.Lock()
	m.sessions[session.ID()] = session
	m.mu.Unlock()

	return session, nil
}

// GetSession retrieves a session by ID
func (m *Manager) GetSession(id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, exists := m.sessions[id]
	if !exists {
		return nil, fmt.Errorf("session not found: %s", id)
	}

	return session, nil
}

// CloseSession closes a specific session
func (m *Manager) CloseSession(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[id]
	if !exists {
		return fmt.Errorf("session not found: %s", id)
	}

	if err := session.Close(); err != nil {
		return fmt.Errorf("failed to close session: %w", err)
	}

	delete(m.sessions, id)
	return nil
}

// GetClient returns the underlying SSH client
// This is useful for creating SFTP clients
func (m *Manager) GetClient() *ssh.Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.client
}
