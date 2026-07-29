<div align="center">
  <img src="https://raw.githubusercontent.com/Relintio/relintio-react-agent/main/assets/relintio-logo.svg" alt="Relintio" width="260">

  <h1>@relintio/react-agent</h1>

  <p>
    <a href="https://www.npmjs.com/package/@relintio/react-agent"><img alt="npm" src="https://img.shields.io/npm/v/%40relintio%2Freact-agent?color=efd420"></a>
    <a href="https://react.dev"><img alt="react" src="https://img.shields.io/badge/react-16.8%20%7C%2017%20%7C%2018%20%7C%2019-efd420"></a>
    <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-efd420"></a>
  </p>

  <p><strong>The Relintio agent for React in the browser.</strong></p>
</div>

---

Your API answers a suspicious request with `403` and `X-Relintio-Action: challenge`. This SDK notices, opens the hosted challenge in a sandboxed overlay, waits for the visitor to pass, and replays the request that was refused — so the user sees a verification step instead of a failure. It carries a publishable key, never your licence key, and it never receives your policy.

```tsx
import React from 'react';
import { RelintioProvider, useRelintioInterceptor } from '@relintio/react-agent';

function Protected({ children }: { children: React.ReactNode }) {
  useRelintioInterceptor();
  return <>{children}</>;
}

export default function App() {
  return (
    <RelintioProvider config={{ publishableKey: 'pk_live_...' }}>
      <Protected>
        <h1>Shop</h1>
      </Protected>
    </RelintioProvider>
  );
}
```

## Installation

```bash
npm install @relintio/react-agent
```

React 16.8 or newer, as a peer dependency. No runtime dependencies of its own.

This SDK is a companion, not enforcement. Nothing here decides whether a request is allowed — your server-side agent does that, and a browser that could decide it could also be told to decide differently. What this package does is make the decision survivable for a real person.

## Quickstart

### 1. Mount the provider

```tsx
import React from 'react';
import { RelintioProvider } from '@relintio/react-agent';

const config = {
  // A publishable key. Never your licence key — see "Which key goes here".
  publishableKey: 'pk_live_...',
  apiUrl: 'https://api.relintio.com/v1',
};

export function Root({ children }: { children: React.ReactNode }) {
  return <RelintioProvider config={config}>{children}</RelintioProvider>;
}
```

### 2. Register the interceptor

`useRelintioInterceptor` patches `window.fetch` for as long as the component is mounted. Pass an Axios instance to cover that too — Axios does not go through `fetch`, so an instance nobody hands over is an instance nobody protects.

```tsx
import React from 'react';
import axios from 'axios';
import { useRelintioInterceptor, useRelintio } from '@relintio/react-agent';

const api = axios.create({ baseURL: 'https://api.example.com' });

export function Shop() {
  useRelintioInterceptor({ axiosInstance: api });
  const { state } = useRelintio();

  return <main aria-busy={state.isChallenging}><h1>Shop</h1></main>;
}
```

Call the hook once, high in the tree. `useRelintio` throws if it is used outside a `RelintioProvider`, which is the failure you want: a silent no-op would look identical to working protection.

`useRelintio()` returns `{ config, state, triggerChallenge, resolveChallenge }`, and `state` is `{ isChallenging, challengeUrl, resolvedCount, verdict }`. You rarely need the two functions — the interceptor calls `triggerChallenge(url)` for you, and the built-in overlay calls `resolveChallenge()` when the challenge page posts back. Reach for them only when you are presenting the challenge yourself: `triggerChallenge` returns the promise the interrupted request is waiting on, and nothing releases that request until `resolveChallenge` runs.

## Configuration

Every field lives on the object passed as `config`.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `publishableKey` | `string` | — | Required. A `pk_live_…` key from **Dashboard → Deployment → React**. |
| `apiUrl` | `string` | `https://api.relintio.com/v1` | Control-plane base. A trailing slash is trimmed. |
| `challengeTimeoutMs` | `number` | `120000` | How long a pending challenge may stay open before its promise rejects. Floored at `10000`; anything lower is raised. |
| `verifyOnMount` | `boolean` | `false` | Ask for a verdict on mount. See below. |
| `fallbackUrl` | `string` | — | Declared on the config type and read by nothing in 2.0.0. Setting it has no effect. |

## Which key goes here

`publishableKey` takes a key beginning `pk_`. This SDK runs in the browser, so whatever key it holds is readable by anyone who views source — and a publishable key is built for exactly that. It holds one scope, `decision:read`: it may ask Relintio whether a request should be allowed and learn the answer. It cannot read your rules, cannot write telemetry into your device reputation data, and cannot cause a challenge pass to be issued.

Your **licence key must never appear here**. It is the HMAC key for the challenge passport and for request signing, so publishing it would let anyone mint themselves a pass through your WAF and forge telemetry against your account. The provider checks the prefix, logs an error, and never transmits a key that fails it.

That guard fires on a key that is present and not publishable. A missing or empty `publishableKey` is silent — nothing is sent, nothing is logged, and the app renders normally — so a build that drops the environment variable looks exactly like a build without the SDK.

Rotating a publishable key is safe and instant: revoke it in the dashboard, ship the new one, and nothing else in your account is affected.

## `verifyOnMount`

Off by default, and that default is the right one for most apps. Protection belongs at your origin; the interceptor reacts to what your origin decides. Turn `verifyOnMount` on only when the React app is the sole surface — a static front end, hosted on a CDN, with no server of its own running an agent. If you have a server, protect the server.

When it is on, the provider collects telemetry, posts once to `POST /agent/decision`, and stores the verdict on `state.verdict`. A verdict of `challenge` opens the overlay. Everything else is informational: this SDK will not block anyone, because a block a browser can impose is a block a browser can decline to impose.

## What happens at request time

**Through the interceptor.** Every `fetch` (and every rejected response from a supplied Axios instance) is inspected for `403` carrying `X-Relintio-Action: challenge` and `X-Relintio-Challenge-URL`. Anything else is passed through untouched. On a match the challenge URL is parsed and rejected unless it is `http:` or `https:`, the overlay opens, and the original request is replayed once the visitor passes. Concurrent challenges collapse into one: a second `triggerChallenge` while one is pending returns the same promise, so ten parallel requests produce one overlay, not ten.

**On mount, with `verifyOnMount`.** The collector runs, and the provider posts the publishable key, the current hostname and path, the referrer, `return_url`, `agent_kind: 'react'`, the agent version, any `up_token` in the query string, and the telemetry to `/agent/decision`, with a five-second abort. The response is a verdict — `action`, `reason`, `reason_code`, `risk_score`, `ip`, and `challenge_url` when a challenge is called for. It is not policy. The rules, thresholds and blocklists that produced it stay on the server, because a browser is the last place they belong.

**Never.** There is no heartbeat call. A browser announcing that it is online proves nothing when its key is public, so the platform derives liveness from the decisions the SDK actually asks for.

## What it sends

The collector is `agents/shared/collector.js`, copied byte-for-byte into this package because npm cannot pack a file from outside its own directory — a build test fails if the copy drifts. It gathers the twelve visitor signal families described in `contracts/telemetry-v2.md`: user agent, screen and display, timezone and language, probed fonts, plugins, canvas, WebGL renderer, audio, network conditions, device and window environment, behavioural counters, and — read server-side from the request, never posted — the HTTP headers.

The behavioural family is **counters only**. Dwell time, and how many times the pointer moved, a key was pressed, the page was scrolled, or the screen was touched. It does not record what was typed, where the pointer went, or what was scrolled to. Anything more would be a keylogger sitting on someone else's checkout page, and no verdict needs one.

A family that could not be probed is omitted rather than sent empty, because empty means "looked and found nothing" and that is itself a signal. Audio is the exception, and the only asynchronous family: it is raced against a 120 ms budget rather than awaited, so a browser with a hung audio stack costs the visitor a null `audio_hash` and not a delayed page. Null rather than absent is deliberate — a browser that has an audio context and renders nothing through it is worth a small nudge, where saying nothing at all would not be.

## Edge cases

**A challenge that never resolves rejects the request it interrupted.** Unmounting the provider rejects the pending promise with `Relintio provider unmounted`; outliving `challengeTimeoutMs` rejects it with `Relintio challenge timed out`. The interceptor awaits that promise without catching, so the rejection reaches your `fetch` or Axios caller in place of the original `403`. Your existing error handling sees a failed request, which is what it should see — but it is a different error than it would have seen.

**`window.fetch` is restored on unmount only if it is still ours.** If another library patches `fetch` after this hook ran, that patch stays and ours stays under it, because tearing it out would silently disable the other library.

**A retry that is challenged again** is returned to the caller as-is. The replayed `fetch` response is not re-inspected, and the Axios path carries a `__relintioRetried` flag, so a stubborn challenge surfaces as a `403` rather than an overlay loop.

**The overlay only resolves on a message from the challenge itself** — same origin as the challenge URL, and from that iframe's own `contentWindow`. A `postMessage` from anywhere else is ignored.

**Server rendering** is safe: the network call is guarded on `typeof window`, and everything else happens in effects.

**React Native does not get the challenge path.** The hooks and the interceptor import and run, but a challenge needs two things React Native does not have: `window.location`, which the challenge URL is resolved against, and a DOM to render the overlay into — that is a `div` wrapping an `iframe`. Without the first, `triggerChallenge` rejects with `Invalid challenge URL` instead of setting `state.challengeUrl`, so the intercepted request fails rather than pausing for the visitor. Nothing in 2.0.0 branches on the platform, so treat this package as browser-only until it does.

## In production

Your Content Security Policy has to allow both legs or protection turns into a blank rectangle: `connect-src https://api.relintio.com` for the verdict call, and `frame-src https://relintio.com` for the challenge overlay.

Keep the publishable key in build-time environment configuration rather than source, not because it is secret — it is not — but because rotating it should be a deploy, not a code change.

Watch the dashboard for a day before you turn enforcement on at your origin. Machine callers score as bots by default, so exclude health checks and inbound webhooks there; nothing in this package can carve them out for you.

## Upgrading to 2.0.0

Breaking, and all in the same direction — the browser stops holding anything worth stealing.

- `config.licenseKey` is now **`config.publishableKey`** and takes a `pk_live_…` key. The provider refuses to transmit anything else.
- Calls go to **`POST /agent/decision`**, not `/agent/verify`. The decision endpoint returns a verdict; `verify` returns the policy, and a publishable key is no longer permitted to ask for it — it would be answered with `403` and `required_scope: policy:read`.
- **The heartbeat call is gone.** Nothing replaces it.
- **`config.verifyOnMount`** is new and off by default.

## Links

- [Documentation](https://relintio.com/docs)
- [React quickstart](https://relintio.com/docs/quickstart/react)
- [API reference](https://relintio.com/docs/api-reference)
- [Licenses](https://relintio.com/licenses)

## License

MIT. See [LICENSE](./LICENSE).
