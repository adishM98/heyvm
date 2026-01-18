package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/adishm/heyvm/internal/ipc"
	"github.com/adishm/heyvm/internal/vm"
)

func main() {
	// Initialize config directory (~/.heyvm/)
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}

	configDir := filepath.Join(homeDir, ".heyvm")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		log.Fatal(err)
	}

	// Create logs directory
	logsDir := filepath.Join(configDir, "logs")
	if err := os.MkdirAll(logsDir, 0700); err != nil {
		log.Fatal(err)
	}

	// Set up logging to file
	logFile := filepath.Join(logsDir, "heyvm-core.log")
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	log.SetOutput(f)

	log.Println("=====================================")
	log.Println("heyvm-core starting...")
	log.Printf("Config directory: %s", configDir)
	log.Printf("Log file: %s", logFile)

	// Initialize VM registry
	registry, err := vm.NewRegistry(configDir)
	if err != nil {
		log.Fatalf("Failed to create VM registry: %v", err)
	}

	// Load existing VMs from config
	if err := registry.Load(); err != nil {
		log.Printf("Warning: Could not load VM registry: %v", err)
		log.Println("Starting with empty registry (this is normal for first run)")
	} else {
		vmCount := registry.Count()
		log.Printf("Loaded %d VM(s) from config", vmCount)
	}

	// Create IPC handler
	handler := ipc.NewHandler(registry)

	log.Println("IPC handler initialized")
	log.Println("heyvm-core ready to accept requests")
	log.Println("=====================================")

	// Start IPC request/response loop
	// This blocks until stdin is closed or an error occurs
	if err := handler.Start(); err != nil {
		log.Fatalf("IPC handler error: %v", err)
	}

	log.Println("heyvm-core shutting down gracefully")
}
