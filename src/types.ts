export interface RelintioConfig {
  licenseKey: string;
  apiUrl?: string;
  fallbackUrl?: string;
}

export interface RelintioState {
  isChallenging: boolean;
  challengeUrl: string | null;
  resolvedCount: number;
}
