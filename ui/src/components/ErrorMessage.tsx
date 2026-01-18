import React from 'react';
import { Box, Text } from 'ink';

interface ErrorMessageProps {
	message: string;
	onDismiss?: () => void;
}

export default function ErrorMessage({ message, onDismiss }: ErrorMessageProps) {
	return (
		<Box marginBottom={1} borderStyle="single" borderColor="red" paddingX={1}>
			<Text color="red">✕ Error: {message}</Text>
			{onDismiss && (
				<Text dimColor> (Press any key to dismiss)</Text>
			)}
		</Box>
	);
}
