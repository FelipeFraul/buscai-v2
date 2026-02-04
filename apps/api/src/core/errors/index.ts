export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "APP_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isNotImplementedError(error: unknown): boolean {
  return error instanceof Error && error.message === "Not implemented";
}
