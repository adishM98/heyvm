package vm

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Config represents the YAML configuration file structure
type Config struct {
	VMs []VM `yaml:"vms"`
}

// Registry manages the collection of VMs
type Registry struct {
	vms       map[string]*VM
	configDir string
	mu        sync.RWMutex
}

// NewRegistry creates a new VM registry
func NewRegistry(configDir string) (*Registry, error) {
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}

	return &Registry{
		vms:       make(map[string]*VM),
		configDir: configDir,
	}, nil
}

// Add adds a VM to the registry
func (r *Registry) Add(vm *VM) error {
	if vm == nil {
		return fmt.Errorf("cannot add nil VM")
	}

	// Validate VM
	if err := vm.Validate(); err != nil {
		return fmt.Errorf("VM validation failed: %w", err)
	}

	// Generate ID if not provided
	if vm.ID == "" {
		vm.ID = r.generateID()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Check if VM already exists
	if _, exists := r.vms[vm.ID]; exists {
		return ErrVMAlreadyExists
	}

	// Set initial status
	if vm.Status == "" {
		vm.Status = VMStatusDisconnected
	}

	// Store VM (clone to prevent external modifications)
	r.vms[vm.ID] = vm.Clone()

	return nil
}

// Get retrieves a VM by ID
func (r *Registry) Get(id string) (*VM, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	vm, exists := r.vms[id]
	if !exists {
		return nil, ErrVMNotFound
	}

	return vm.Clone(), nil
}

// List returns all VMs in the registry
func (r *Registry) List() []*VM {
	r.mu.RLock()
	defer r.mu.RUnlock()

	vms := make([]*VM, 0, len(r.vms))
	for _, vm := range r.vms {
		vms = append(vms, vm.Clone())
	}

	return vms
}

// Remove removes a VM from the registry
func (r *Registry) Remove(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.vms[id]; !exists {
		return ErrVMNotFound
	}

	delete(r.vms, id)
	return nil
}

// Update updates a VM's information
func (r *Registry) Update(vm *VM) error {
	if vm == nil {
		return fmt.Errorf("cannot update with nil VM")
	}

	if err := vm.Validate(); err != nil {
		return fmt.Errorf("VM validation failed: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.vms[vm.ID]; !exists {
		return ErrVMNotFound
	}

	r.vms[vm.ID] = vm.Clone()
	return nil
}

// UpdateStatus updates a VM's status
func (r *Registry) UpdateStatus(id string, status VMStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	vm, exists := r.vms[id]
	if !exists {
		return ErrVMNotFound
	}

	vm.Status = status
	vm.LastSeen = time.Now()
	return nil
}

// Save persists the registry to the config file
func (r *Registry) Save() error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	config := Config{
		VMs: make([]VM, 0, len(r.vms)),
	}

	for _, vm := range r.vms {
		config.VMs = append(config.VMs, *vm)
	}

	data, err := yaml.Marshal(&config)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	configPath := filepath.Join(r.configDir, "config.yaml")

	// Write with secure permissions (0600)
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// Load reads the registry from the config file
func (r *Registry) Load() error {
	configPath := filepath.Join(r.configDir, "config.yaml")

	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Config doesn't exist - this is OK for first run
		return nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return ErrConfigCorrupted
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Clear existing VMs
	r.vms = make(map[string]*VM)

	// Load VMs from config
	for i := range config.VMs {
		vm := &config.VMs[i]

		// Validate each VM
		if err := vm.Validate(); err != nil {
			// Log warning but continue loading other VMs
			fmt.Fprintf(os.Stderr, "Warning: skipping invalid VM %s: %v\n", vm.Name, err)
			continue
		}

		// Generate ID if missing
		if vm.ID == "" {
			vm.ID = r.generateID()
		}

		// Reset status to disconnected on load
		vm.Status = VMStatusDisconnected

		r.vms[vm.ID] = vm
	}

	return nil
}

// Count returns the number of VMs in the registry
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.vms)
}

// generateID generates a unique ID for a VM
func (r *Registry) generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
