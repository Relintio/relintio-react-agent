export interface RelintioConfig {
  /**
   * A publishable key (`pk_live_...`).
   *
   * This runs in the browser, so whatever key it holds is readable by every
   * visitor. A publishable key is public by design and carries exactly one
   * capability: it may ask Relintio for a verdict on a request. It cannot read
   * your rules, write telemetry, or cause a challenge pass to be issued.
   *
   * Your licence key must never appear here. It is the HMAC key for the
   * challenge passport and for request signing — publishing it would let anyone
   * mint themselves a pass through your WAF. The provider refuses to start if
   * it is given one.
   *
   * Get a key from Dashboard → Deployment → React.
   */
  publishableKey: string;

  apiUrl?: string;
  fallbackUrl?: string;
  challengeTimeoutMs?: number;

  /**
   * Ask for a verdict on mount and act on it.
   *
   * Off by default. The interceptor already reacts to a challenge when your own
   * API returns one, and that is the right shape for most apps: protection
   * lives at your origin and this SDK reacts to it. Turn this on when the React
   * app is the only surface — a static front end with no server of its own to
   * run an agent on.
   */
  verifyOnMount?: boolean;
}

export interface RelintioState {
  isChallenging: boolean;
  challengeUrl: string | null;
  resolvedCount: number;

  /** The last verdict, when `verifyOnMount` is enabled. */
  verdict: RelintioVerdict | null;
}

export interface RelintioVerdict {
  action: 'allow' | 'challenge' | 'block' | 'slow' | 'decoy';
  reason?: string;
  reason_code?: string | null;
  risk_score?: number;
  challenge_url?: string;
  ip?: string;
}

/** What the collector gathers. Documented in contracts/telemetry-v2.md. */
export interface RelintioTelemetryPayload {
  telemetry: Record<string, unknown>;
  env: Record<string, unknown>;
}
