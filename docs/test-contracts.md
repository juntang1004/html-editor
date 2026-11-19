# Unit and HTTP contracts

Run from the development repository:

```sh
node --test tests/design.test.mjs tests/server.test.mjs
```

The suite uses Node's built-in test runner and assertions. HTTP tests listen only on `127.0.0.1`, use an OS-assigned port, and close all connections and servers in test cleanup. Every API client is an injected mock; no OpenAI requests, real API keys, or original installation configuration are needed. Configuration tests create and remove their own temporary directory with synthetic values.

## Server injection

`createStudioServer(options)` returns an unstarted Node HTTP server. Supported options are `apiKey`, `model`, `token`, `apiClient` (fetch-compatible), `publicDir`, `instance`, and `timeoutMs: {action, design}`. Tests must supply an API mock whenever a key is supplied. The default client is real fetch for normal application use.

Importing `server.mjs` does not read `.env.local` or bind a port. The CLI (`node server.mjs`) explicitly calls `loadConfiguration()` and binds loopback. `loadConfiguration({directory, env})` supports isolated configuration tests; normal CLI environment variables retain precedence over local values.

## Covered behavior

- Action IDs must belong to the supplied scene, supported action fields must have valid types, and duration/delay must be finite milliseconds in 0–10000.
- Design proposals restrict CSS properties and values, preserve scientific numeric tokens, reject unknown/protected targets, and enforce operation limits.
- Applying design changes preserves the input state, merges existing patches, and escapes text before generating markup.
- HTTP checks cover session output, Host/Origin/token boundaries, private-file denial, request validation/size, successful action/design proposals, refusal/empty responses, malformed model JSON, invalid proposals, upstream rate limits/failures, timeout, and concurrent-request exclusion.
- Error responses distinguish `model_refusal`, `empty_output`, `invalid_json`, `invalid_proposal`, and `timeout`. Existing HTTP status behavior is preserved except malformed request JSON now receives 400 rather than 500.

## Limits and next-stage regressions

These contracts do not establish natural-language capability against a real model or visual parity with PowerPoint. Current design validation deliberately does not allow arbitrary `animation-duration`/`transition-duration` styling; a contract test records that restriction, not a successful animation-edit feature. User-reported thumbnail, selection, keyboard, resizing, export, and original-HTML animation behavior require browser/desktop regression tests and later implementation work.
