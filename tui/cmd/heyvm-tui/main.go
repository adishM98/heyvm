package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/ipc"
	"github.com/adishm/heyvm/tui/internal/ui"
)

func main() {
	// Set up logging to a file (not stderr, which would corrupt the TUI).
	logPath := filepath.Join(os.TempDir(), "heyvm-tui.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}

	// Find the core binary.
	corePath, err := findCoreBinary()
	if err != nil {
		fmt.Fprintf(os.Stderr, "heyvm-tui: cannot find heyvm-core: %v\n", err)
		os.Exit(1)
	}

	// Spawn the core process.
	cmd := exec.Command(corePath)
	coreIn, err := cmd.StdinPipe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "heyvm-tui: stdin pipe: %v\n", err)
		os.Exit(1)
	}
	coreOut, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "heyvm-tui: stdout pipe: %v\n", err)
		os.Exit(1)
	}
	// Redirect core stderr to our log file.
	if logFile != nil {
		cmd.Stderr = logFile
	} else {
		cmd.Stderr = os.Stderr
	}

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "heyvm-tui: start core: %v\n", err)
		os.Exit(1)
	}
	defer cmd.Process.Kill()

	// Create IPC client.
	client := ipc.NewClient(coreIn, coreOut)

	// Create and run the TUI.
	app, err := ui.New(client)
	if err != nil {
		fmt.Fprintf(os.Stderr, "heyvm-tui: init ui: %v\n", err)
		os.Exit(1)
	}

	if err := app.Run(); err != nil && err != gocui.ErrQuit {
		fmt.Fprintf(os.Stderr, "heyvm-tui: %v\n", err)
		os.Exit(1)
	}
}

// findCoreBinary locates the heyvm-core binary.
// It checks, in order: same directory as the tui binary, ../bin/heyvm-core, PATH.
func findCoreBinary() (string, error) {
	name := "heyvm-core"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}

	// Same directory as this binary.
	exe, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(exe), name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		// ../bin/ relative to exe dir.
		candidate = filepath.Join(filepath.Dir(exe), "..", "bin", name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	// Look in bin/ relative to CWD.
	cwd, err := os.Getwd()
	if err == nil {
		candidate := filepath.Join(cwd, "bin", name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	// Fall back to PATH.
	return exec.LookPath(name)
}
