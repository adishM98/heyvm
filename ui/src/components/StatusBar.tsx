import React from 'react';
import { Box, Text } from 'ink';

interface Keybinding {
	key: string;
	description: string;
}

interface StatusBarProps {
	keybindings: Keybinding[];
}

export default function StatusBar({ keybindings }: StatusBarProps) {
	return (
		<Box borderStyle="single" borderColor="gray" paddingX={1}>
			<Text dimColor>
				{keybindings.map((binding, index) => (
					<React.Fragment key={index}>
						{index > 0 && ' • '}
						<Text bold>{binding.key}</Text> {binding.description}
					</React.Fragment>
				))}
			</Text>
		</Box>
	);
}
