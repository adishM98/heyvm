/**
 * Mouse event parser for SGR extended mouse tracking (1006)
 *
 * SGR format: \x1b[<button;col;row;M (down) or m (up)
 *
 * Button codes:
 * - 64: scroll up
 * - 65: scroll down
 * - 0: left click
 * - 1: middle click
 * - 2: right click
 */

export interface MouseEvent {
	button: number;  // 64=scroll_up, 65=scroll_down, 0=left_click, etc.
	x: number;       // 1-based column
	y: number;       // 1-based row
	type: 'down' | 'up';
}

/**
 * Parse SGR mouse escape sequence from stdin buffer
 *
 * @param data - Buffer from stdin containing potential mouse event
 * @returns MouseEvent object if valid SGR sequence found, null otherwise
 *
 * @example
 * // Scroll up event
 * parseMouseEvent(Buffer.from('\x1b[<64;50;10;M'))
 * // => { button: 64, x: 50, y: 10, type: 'down' }
 *
 * // Scroll down event
 * parseMouseEvent(Buffer.from('\x1b[<65;50;10;M'))
 * // => { button: 65, x: 50, y: 10, type: 'down' }
 *
 * // Non-mouse data
 * parseMouseEvent(Buffer.from('hello'))
 * // => null
 */
export function parseMouseEvent(data: Buffer): MouseEvent | null {
	const str = data.toString('utf8');

	// SGR format: \x1b[<button;col;row;M (down) or m (up)
	const match = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);

	if (!match) return null;

	return {
		button: parseInt(match[1], 10),
		x: parseInt(match[2], 10),
		y: parseInt(match[3], 10),
		type: match[4] === 'M' ? 'down' : 'up',
	};
}
