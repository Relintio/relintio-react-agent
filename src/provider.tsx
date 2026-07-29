import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RelintioConfig, RelintioState, RelintioVerdict } from './types';
// Plain ES5 JavaScript, typed by collector.d.ts. Deliberately not ported to
// TypeScript: it has to stay byte-identical to agents/shared/collector.js, or
// this app and the challenge page compute different device identities for the
// same machine and every visitor who passes a challenge is a stranger again.
import * as collector from './collector';

interface RelintioContextType {
  config: RelintioConfig;
  state: RelintioState;
  triggerChallenge: (url: string) => Promise<void>;
  resolveChallenge: () => void;
}

const RelintioContext = createContext<RelintioContextType | undefined>(undefined);
const AGENT_VERSION = '2.0.0';

export const RelintioProvider: React.FC<{
  config: RelintioConfig;
  children: React.ReactNode;
}> = ({ config, children }) => {
  const apiUrl = config.apiUrl || 'https://api.relintio.com/v1';
  const [state, setState] = useState<RelintioState>({
    isChallenging: false,
    challengeUrl: null,
    resolvedCount: 0,
    verdict: null,
  });
  const pendingChallenge = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  const triggerChallenge = useCallback((url: string): Promise<void> => {
    if (pendingChallenge.current) {
      return pendingChallenge.current.promise;
    }

    let challengeUrl: string;
    try {
      const parsed = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return Promise.reject(new Error('Unsupported challenge URL protocol'));
      }
      challengeUrl = parsed.toString();
    } catch {
      return Promise.reject(new Error('Invalid challenge URL'));
    }

    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timeoutMs = Math.max(10_000, config.challengeTimeoutMs ?? 120_000);
    const timeoutId = window.setTimeout(() => {
      const pending = pendingChallenge.current;
      pendingChallenge.current = null;
      setState((previous) => ({ ...previous, isChallenging: false, challengeUrl: null }));
      pending?.reject(new Error('Relintio challenge timed out'));
    }, timeoutMs);

    pendingChallenge.current = {
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timeoutId,
    };
    setState((prev) => ({
      ...prev,
      isChallenging: true,
      challengeUrl,
    }));

    return promise;
  }, [config.challengeTimeoutMs]);

  const resolveChallenge = useCallback(() => {
    const pending = pendingChallenge.current;
    if (!pending) return;

    window.clearTimeout(pending.timeoutId);
    pendingChallenge.current = null;
    setState((prev) => ({
      ...prev,
      isChallenging: false,
      challengeUrl: null,
      resolvedCount: prev.resolvedCount + 1,
    }));
    pending.resolve();
  }, []);

  useEffect(() => () => {
    const pending = pendingChallenge.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingChallenge.current = null;
    pending.reject(new Error('Relintio provider unmounted'));
  }, []);

  // A licence key in a browser bundle is a security incident, not a
  // configuration mistake to route around. Refusing to start is the point:
  // failing loudly in the console beats quietly publishing the key that signs
  // this customer's challenge passports.
  const key = config.publishableKey;
  const keyIsPublishable = typeof key === 'string' && key.indexOf('pk_') === 0;

  useEffect(() => {
    if (!key || keyIsPublishable) return;
    // eslint-disable-next-line no-console
    console.error(
      '[Relintio] Refusing to start: publishableKey must be a publishable key (pk_live_...). '
      + 'A licence key must never be shipped in browser JavaScript. '
      + 'Get a publishable key from Dashboard → Deployment → React.'
    );
  }, [key, keyIsPublishable]);

  // There is no heartbeat call. A browser declaring itself online proves
  // nothing when its key is public, so the server derives liveness from the
  // decisions this actually asks for.
  useEffect(() => {
    if (typeof window === 'undefined' || !keyIsPublishable || !config.verifyOnMount) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const behaviour = collector.watchBehaviour();
    let cancelled = false;

    collector.collect({ behaviour })
      .then((payload) => window.fetch(`${apiUrl.replace(/\/$/, '')}/agent/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Version': AGENT_VERSION },
        body: JSON.stringify({
          license_key: key,
          domain: window.location.hostname,
          path: window.location.pathname,
          referrer: document.referrer || '',
          return_url: window.location.href,
          agent_kind: 'react',
          agent_version: AGENT_VERSION,
          up_token: new URLSearchParams(window.location.search || '').get('up_token') || '',
          telemetry: payload.telemetry,
          env: payload.env,
        }),
        signal: controller.signal,
      }))
      .then((response) => (response && response.ok ? response.json() : null))
      .then((verdict: RelintioVerdict | null) => {
        if (cancelled || !verdict) return;

        setState((previous) => ({ ...previous, verdict }));

        if (verdict.action === 'challenge' && verdict.challenge_url) {
          triggerChallenge(verdict.challenge_url).catch(() => undefined);
        }
      })
      // Fail open, always. An app that goes dark because the verdict service
      // was briefly unreachable has done its users more harm than any bot.
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
    // triggerChallenge is stable for the lifetime of a given timeout config.
  }, [apiUrl, key, keyIsPublishable, config.verifyOnMount, triggerChallenge]);

  // Safe default for API URL
  const enrichedConfig = {
    ...config,
    apiUrl,
  };

  return (
    <RelintioContext.Provider
      value={{
        config: enrichedConfig,
        state,
        triggerChallenge,
        resolveChallenge,
      }}
    >
      {children}
      {state.isChallenging && state.challengeUrl && (
        <RelintioChallengeModal
          url={state.challengeUrl}
          onResolve={resolveChallenge}
        />
      )}
    </RelintioContext.Provider>
  );
};

export const useRelintio = () => {
  const context = useContext(RelintioContext);
  if (!context) {
    throw new Error('useRelintio must be used within a RelintioProvider');
  }
  return context;
};

// Internal challenge overlay
const RelintioChallengeModal: React.FC<{
  url: string;
  onResolve: () => void;
}> = ({ url, onResolve }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const expectedOrigin = new URL(url, window.location.href).origin;
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === expectedOrigin
        && event.source === iframeRef.current?.contentWindow
        && event.data === 'relintio_challenge_success'
      ) {
        onResolve();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onResolve, url]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '480px',
          height: '600px',
          backgroundColor: '#0c0c0e',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>
            Security Verification
          </span>
          <span style={{ color: '#888', fontSize: '11px' }}>
            Protected by Relintio
          </span>
        </div>
        <iframe
          ref={iframeRef}
          src={url}
          sandbox="allow-forms allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Relintio WAF Security Challenge"
        />
      </div>
    </div>
  );
};
