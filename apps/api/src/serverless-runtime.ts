/**
 * Serverless function runtime — executes employee-deployed JS functions
 * in sandboxed V8 isolates via the `isolated-vm` package.
 *
 * Each function runs in its own isolate with:
 *   - 128MB memory limit
 *   - 5 second execution timeout
 *   - No access to Node.js APIs, filesystem, or network
 *   - Only a `fetch` shim and `console.log` are provided
 *
 * Functions are written as: export default async (req) => { return { ... } }
 * The `req` object contains: { method, path, query, headers, body }
 * Return value is sent as JSON response.
 */
import ivm from "isolated-vm";

const MEMORY_LIMIT_MB = 128;
const TIMEOUT_MS = 5000;

export interface FunctionRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface FunctionResponse {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

/**
 * Execute a serverless function in a V8 isolate.
 *
 * @param code - The function source code (ES module style with default export)
 * @param req  - The incoming request data
 * @param envVars - Environment variables available to the function
 * @returns The function's response
 */
export async function executeFunction(
  code: string,
  req: FunctionRequest,
  envVars: Record<string, string> = {},
): Promise<FunctionResponse> {
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    // Set up minimal globals
    await jail.set("global", jail.derefInto());

    // Provide console.log (captures output but doesn't expose Node)
    const logs: string[] = [];
    await jail.set(
      "_log",
      new ivm.Callback((...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      }),
    );

    // Provide env vars as a frozen object
    await jail.set("_envJson", JSON.stringify(envVars));

    // Provide the request as JSON
    await jail.set("_reqJson", JSON.stringify(req));

    // Wrap the user code: transform `export default async (req) => ...` into something callable
    // Also handles: `export default function(req) { ... }` and plain function bodies
    const wrappedCode = `
      const console = { log: _log, warn: _log, error: _log, info: _log };
      const env = Object.freeze(JSON.parse(_envJson));
      const __req = JSON.parse(_reqJson);

      // Simple fetch shim that returns a promise-like error
      // (real network access not available in isolate)
      const fetch = () => { throw new Error("fetch() is not available in serverless functions. Use env vars to pass data in, or return data for the client to fetch."); };

      let __handler;
      const module = { exports: {} };
      const exports = module.exports;

      // Support various export patterns
      ${code.replace(/export\s+default\s+/, "__handler = ")}

      // If no handler was set, check module.exports
      if (!__handler && module.exports.default) __handler = module.exports.default;
      if (!__handler && typeof module.exports === 'function') __handler = module.exports;

      (async () => {
        if (typeof __handler !== 'function') {
          return JSON.stringify({ status: 500, body: { error: 'No default export function found' } });
        }
        try {
          const result = await __handler(__req);
          // If result has status/headers/body shape, use it directly
          if (result && typeof result === 'object' && 'body' in result) {
            return JSON.stringify(result);
          }
          // Otherwise wrap the return value as the body
          return JSON.stringify({ status: 200, body: result });
        } catch (err) {
          return JSON.stringify({ status: 500, body: { error: err.message || 'Function execution error' } });
        }
      })()
    `;

    const script = await isolate.compileScript(wrappedCode);
    const resultRef = await script.run(context, { timeout: TIMEOUT_MS });
    const resultJson = typeof resultRef === "string" ? resultRef : String(resultRef);

    const result = JSON.parse(resultJson) as FunctionResponse;

    // Attach logs if any
    if (logs.length > 0) {
      if (!result.headers) result.headers = {};
      result.headers["x-function-logs"] = logs.join("\n").slice(0, 1000);
    }

    return result;
  } finally {
    isolate.dispose();
  }
}

/**
 * Parse a route pattern like "GET /api/data" into method + path.
 */
export function parseRoutePattern(pattern: string): { method: string; path: string } {
  const parts = pattern.trim().split(/\s+/);
  if (parts.length === 2) {
    return { method: parts[0].toUpperCase(), path: parts[1] };
  }
  // Default to GET if no method specified
  return { method: "GET", path: parts[0] };
}

/**
 * Match a request against the registered server functions.
 * Supports basic path params like /api/users/:id
 *
 * @returns The matching function code and extracted params, or null
 */
export function matchRoute(
  serverFunctions: Record<string, string>,
  method: string,
  path: string,
): { code: string; params: Record<string, string> } | null {
  for (const [pattern, code] of Object.entries(serverFunctions)) {
    const parsed = parseRoutePattern(pattern);

    if (parsed.method !== method.toUpperCase()) continue;

    // Try exact match first
    if (parsed.path === path) {
      return { code, params: {} };
    }

    // Try pattern match with :params
    const patternParts = parsed.path.split("/");
    const pathParts = path.split("/");

    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return { code, params };
    }
  }

  return null;
}
