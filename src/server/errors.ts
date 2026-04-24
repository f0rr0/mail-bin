export class AppError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "AppError";
		this.status = status;
	}
}

export function normalizeAppError(error: unknown) {
	if (error instanceof AppError) {
		return error;
	}

	if (error instanceof Error) {
		if (error.message.includes("UNIQUE constraint failed")) {
			return new AppError(409, "A record with that identity already exists.");
		}

		return new AppError(500, error.message || "Unexpected server error.");
	}

	return new AppError(500, "Unexpected server error.");
}
