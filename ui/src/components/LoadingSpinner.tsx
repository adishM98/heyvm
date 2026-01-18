import React from 'react';
import { Box, Text } from 'ink';

interface LoadingSpinnerProps {
	message?: string;
}

export default function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
	return (
		<Box>
			<Text color="yellow">{message}</Text>
		</Box>
	);
}
