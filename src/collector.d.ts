import { RelintioTelemetryPayload } from './types';

export interface RelintioBehaviourWatcher {
  snapshot(): {
    dwell_ms: number;
    pointer: number;
    keys: number;
    scrolls: number;
    touches: number;
  };
}

export interface RelintioCollectOptions {
  behaviour?: RelintioBehaviourWatcher | null;
  audioBudgetMs?: number;
}

export function collect(options?: RelintioCollectOptions): Promise<RelintioTelemetryPayload>;
export function collectSync(behaviour?: RelintioBehaviourWatcher | null): RelintioTelemetryPayload;
export function watchBehaviour(): RelintioBehaviourWatcher;
export function digest(input: unknown): string;
export const FONT_PROBE_LIST: string[];
