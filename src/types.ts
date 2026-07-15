export interface RelintioConfig {
  licenseKey: string;
  apiUrl?: string;
  fallbackUrl?: string;
  challengeTimeoutMs?: number;
}

export interface RelintioState {
  isChallenging: boolean;
  challengeUrl: string | null;
  resolvedCount: number;
}
