/**
 * Local classifier checks for AuthContext stale-session hardening.
 * No DB. No providers. No payment-test mutation.
 */
import {
  isDefinitiveAuthRefreshFailure,
  isTransientAuthTransportFailure,
} from "../src/lib/authIntegrity";

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function namedError(name: string, message: string, extra: Record<string, unknown> = {}): Error {
  const error = new Error(message);
  error.name = name;
  Object.assign(error, extra);
  return error;
}

assert(
  "refresh_token_not_found is definitive",
  isDefinitiveAuthRefreshFailure(namedError("AuthApiError", "Invalid Refresh Token", {
    code: "refresh_token_not_found",
    status: 400,
  })),
);
assert(
  "invalid refresh token message is definitive",
  isDefinitiveAuthRefreshFailure(namedError("AuthApiError", "Invalid Refresh Token: Refresh Token Not Found", {
    status: 400,
  })),
);
assert(
  "AuthSessionMissingError is definitive",
  isDefinitiveAuthRefreshFailure(namedError("AuthSessionMissingError", "Auth session missing!")),
);
assert(
  "401 auth API is definitive",
  isDefinitiveAuthRefreshFailure(namedError("AuthApiError", "unauthorized", { status: 401 })),
);
assert(
  "AuthRetryableFetchError is transient and not definitive",
  isTransientAuthTransportFailure(namedError("AuthRetryableFetchError", "Service temporarily unavailable", { status: 503 }))
    && !isDefinitiveAuthRefreshFailure(namedError("AuthRetryableFetchError", "Service temporarily unavailable", { status: 503 })),
);
assert(
  "network TypeError is transient and not definitive",
  isTransientAuthTransportFailure(new TypeError("Failed to fetch"))
    && !isDefinitiveAuthRefreshFailure(new TypeError("Failed to fetch")),
);
assert(
  "AbortError is transient",
  isTransientAuthTransportFailure(namedError("AbortError", "The operation was aborted.")),
);
assert(
  "lock stolen is transient",
  isTransientAuthTransportFailure(namedError("Error", "Lock was stolen by another request"))
    && !isDefinitiveAuthRefreshFailure(namedError("Error", "Lock was stolen by another request")),
);
assert(
  "unknown error is not a forced logout",
  !isDefinitiveAuthRefreshFailure(new Error("something odd"))
    && !isTransientAuthTransportFailure(new Error("something odd")),
);
assert(
  "successful refresh has no failure classification",
  !isDefinitiveAuthRefreshFailure(null) && !isTransientAuthTransportFailure(undefined),
);

const failed = results.filter((item) => !item.pass);
console.log(
  `verify-auth-refresh-failure ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`,
);
if (failed.length > 0) process.exit(1);
