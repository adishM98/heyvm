import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
	title: string;
	subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
	return (
		<Box marginBottom={1}>
			<Text bold color="magenta">
				{title}
			</Text>
			{subtitle && (
				<Text dimColor> {subtitle}</Text>
			)}
		</Box>
	);
}
