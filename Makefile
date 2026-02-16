.PHONY: help build-ui build-core build-tui build-all dev run-tui clean install test

help:
	@echo "heyvm - Interactive SSH VM Manager"
	@echo ""
	@echo "Available targets:"
	@echo "  install     - Install dependencies (UI + Core)"
	@echo "  build-ui    - Build UI (TypeScript/Ink)"
	@echo "  build-core  - Build Core backend (Go)"
	@echo "  build-tui   - Build Go TUI frontend"
	@echo "  build-all   - Build all components"
	@echo "  run-tui     - Build core + TUI, then run the Go TUI"
	@echo "  dev         - Run in development mode (TypeScript UI)"
	@echo "  test        - Run tests"
	@echo "  clean       - Clean build artifacts"
	@echo "  help        - Show this help message"

install:
	@echo "Installing UI dependencies..."
	cd ui && npm install
	@echo "Installing Core dependencies..."
	cd core && go mod tidy
	@echo "Dependencies installed successfully!"

build-ui:
	@echo "Building UI..."
	cd ui && npm run build
	@echo "UI build complete!"

build-core:
	@echo "Building Core backend..."
	cd core && go build -o ../bin/heyvm-core ./cmd/heyvm-core
	@echo "Core backend build complete! Binary: bin/heyvm-core"

build-tui:
	@echo "Building Go TUI frontend..."
	cd tui && go build -o ../bin/heyvm-tui ./cmd/heyvm-tui
	@echo "TUI build complete! Binary: bin/heyvm-tui"

run-tui: build-core build-tui
	@echo "Starting heyvm Go TUI..."
	./bin/heyvm-tui

build-all: build-core build-ui build-tui
	@echo "Full build complete!"

dev:
	@echo "Starting heyvm in development mode..."
	@echo "Building core backend first..."
	@make build-core
	@echo "Building UI..."
	cd ui && npm run build
	@echo "Starting integrated app..."
	cd ui && npm run dev:with-core

test:
	@echo "Running tests..."
	@echo "Testing Core backend..."
	cd core && go test -v ./...
	@echo "Tests complete!"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/*
	rm -rf ui/dist
	rm -rf ui/node_modules
	rm -rf core/vendor
	@echo "Clean complete!"

# Quick run target (for testing)
run: build-all
	@echo "Running heyvm..."
	cd ui && npm start
