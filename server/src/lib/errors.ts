import type { SearchStatus } from "@prisma/client";

export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PRIVATE_PROFILE"
  | "PERMISSION_REQUIRED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "API_NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL";

/** User-facing messages. Raw upstream errors and secrets never reach the client. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "The request was invalid.",
  NOT_FOUND: "Instagram profile could not be found or is unavailable through the configured API.",
  PRIVATE_PROFILE: "Private-profile information is not available through this application.",
  PERMISSION_REQUIRED: "This information requires additional Instagram/Meta API permissions.",
  RATE_LIMITED: "Instagram API rate limit reached. Please try again later.",
  NETWORK_ERROR: "Unable to connect to the Instagram API.",
  API_NOT_CONFIGURED:
    "Instagram API credentials are not configured. Add them in server/.env or switch INSTAGRAM_API_MODE to mock.",
  UNAUTHORIZED: "Sign in to use the dashboard.",
  FORBIDDEN: "You do not have access to this action.",
  CONFLICT: "This resource already exists.",
  INTERNAL: "Something went wrong. Please try again.",
};

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  PRIVATE_PROFILE: 403,
  PERMISSION_REQUIRED: 403,
  RATE_LIMITED: 429,
  NETWORK_ERROR: 502,
  API_NOT_CONFIGURED: 503,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe, user-facing message. */
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    userMessage?: string,
    opts: { details?: Record<string, unknown>; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(userMessage ?? ERROR_MESSAGES[code], { cause: opts.cause });
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.userMessage = userMessage ?? ERROR_MESSAGES[code];
    this.details = opts.details;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

export function toSearchStatus(code: ErrorCode): SearchStatus {
  switch (code) {
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "PRIVATE_PROFILE":
      return "PRIVATE";
    case "PERMISSION_REQUIRED":
    case "API_NOT_CONFIGURED":
      return "PERMISSION_REQUIRED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "INVALID_INPUT":
      return "INVALID_INPUT";
    default:
      return "NETWORK_ERROR";
  }
}
