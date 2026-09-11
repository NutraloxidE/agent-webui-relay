export class RelayError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    exitCode = 30,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof RelayError) {
    return {
      ok: false,
      status: "error",
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    status: "error",
    error: { code: "INTERNAL_ERROR", message },
  };
}

export function exitCodeFor(error: unknown): number {
  return error instanceof RelayError ? error.exitCode : 30;
}
