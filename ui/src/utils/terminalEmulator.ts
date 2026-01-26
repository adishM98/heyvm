import { Terminal } from '@xterm/headless';

/**
 * Terminal emulator that processes ANSI escape sequences
 * and provides a clean text buffer for rendering
 */
export class TerminalEmulator {
	private terminal: Terminal;

	constructor(rows: number = 24, cols: number = 80) {
		this.terminal = new Terminal({
			rows,
			cols,
			allowProposedApi: true,
			scrollback: 1000,
		});

		// Note: onData is for user input, not needed here
		// Terminal output is processed via write()
	}

	/**
	 * Write data to the terminal (processes ANSI escape sequences)
	 * CRITICAL: Do NOT call updateLines here - it's too slow
	 */
	write(data: string): void {
		this.terminal.write(data);
	}

	/**
	 * Resize the terminal
	 */
	resize(rows: number, cols: number): void {
		this.terminal.resize(cols, rows);
	}

	/**
	 * Get the current screen content as lines of text
	 */
	getLines(): string[] {
		const buffer = this.terminal.buffer.active;
		const lines: string[] = [];
		for (let i = 0; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (line) {
				lines.push(line.translateToString(true));
			}
		}
		return lines;
	}

	/**
	 * Get the visible viewport (exactly N rows, no more)
	 * This returns the actual visible portion of the terminal
	 * @param rows Number of rows to return
	 * @param scrollOffset Number of lines to scroll up from bottom (0 = live/bottom)
	 */
	getViewport(rows?: number, scrollOffset: number = 0): string[] {
		const numRows = rows || this.terminal.rows;
		const buffer = this.terminal.buffer.active;
		const viewport: string[] = [];
		
		// Calculate viewport start: go back by scrollOffset from current viewport
		const viewportStart = Math.max(0, buffer.viewportY - scrollOffset);
		
		// Optimized: Pre-allocate array and use direct assignment
		viewport.length = numRows;
		for (let i = 0; i < numRows; i++) {
			const line = buffer.getLine(viewportStart + i);
			// trimEnd() for better performance - remove trailing whitespace
			viewport[i] = line ? line.translateToString(true).trimEnd() : '';
		}
		
		return viewport;
	}

	/**
	 * Get cursor position
	 */
	getCursorPosition(): { x: number; y: number } {
		const buffer = this.terminal.buffer.active;
		return { x: buffer.cursorX, y: buffer.cursorY };
	}

	/**
	 * Get the terminal instance (for accessing buffer)
	 */
	getTerminal(): Terminal {
		return this.terminal;
	}

	/**
	 * Clear the terminal
	 */
	clear(): void {
		this.terminal.clear();
	}

	/**
	 * Dispose of the terminal
	 */
	dispose(): void {
		this.terminal.dispose();
	}
}
