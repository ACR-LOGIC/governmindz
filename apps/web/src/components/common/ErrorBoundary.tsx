import React from "react";

interface Props {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error("ErrorBoundary caught:", error, info);
	}

	render() {
		if (this.state.hasError) {
			return (
				this.props.fallback ?? (
					<div className="p-6 text-sm text-red-400" role="alert">
						Something went wrong. Please refresh.
					</div>
				)
			);
		}
		return this.props.children;
	}
}

export default ErrorBoundary;
