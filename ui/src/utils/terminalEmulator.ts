import { Terminal } from '@xterm/headless';

/**
 * Terminal emulator that processes ANSI escape sequences
 * and provides a clean text buffer for rendering
 */
export class TerminalEmulator {
	private terminal: Terminal;
	private lines: string[] = [];

	constructor(rows: number = 24, cols: number = 80) {
		this.terminal = new Terminal({
			rows,
			cols,
			allowProposedApi: true,
		});

		// Update our line buffer whenever the terminal changes
		this.terminal.onData(() => {
			this.updateLines();
		});

		this.updateLines();
	}

	/**
	 * Write data to the terminal (processes ANSI escape sequences)
	 */
	write(data: string): void {
		this.terminal.write(data);
		this.updateLines();
	}

	/**
	 * Resize the terminal
	 */
	resize(rows: number, cols: number): void {
		this.terminal.resize(cols, rows);
		this.updateLines();
	}

	/**
	 * Get the current screen content as lines of text
	 */
	getLines(): string[] {
		return this.lines;
	}

	/**
	 * Get the visible viewport (exactly N rows, no more)
	 * This returns the actual visible portion of the terminal
	 */
	getViewport(rows?: number): string[] {
		const numRows = rows || this.terminal.rows;
		const buffer = this.terminal.buffer.active;
		const viewport: string[] = [];
		
		// Calculate the viewport start based on cursor position and scrollback
		const viewportStart = buffer.viewportY;
		
		for (let i = 0; i < numRows; i++) {
			const line = buffer.getLine(viewportStart + i);
			viewport.push(line ? line.translateToString(true) : '');
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
	 * Update the lines buffer from the terminal buffer
	 */
	private updateLines(): void {
		const buffer = this.terminal.buffer.active;
		const newLines: string[] = [];

		for (let i = 0; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (line) {
				newLines.push(line.translateToString(true));
			}
		}

		this.lines = newLines;
	}

	/**
	 * Clear the terminal
	 */
	clear(): void {
		this.terminal.clear();
		this.updateLines();
	}

	/**
	 * Dispose of the terminal
	 */
	dispose(): void {
		this.terminal.dispose();
	}
}
