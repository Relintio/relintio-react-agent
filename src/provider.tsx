import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RelintioConfig, RelintioState } from './types';

interface RelintioContextType {
  config: RelintioConfig;
  state: RelintioState;
  triggerChallenge: (url: string) => Promise<void>;
  resolveChallenge: () => void;
}

const RelintioContext = createContext<RelintioContextType | undefined>(undefined);

export const RelintioProvider: React.FC<{
  config: RelintioConfig;
  children: React.ReactNode;
}> = ({ config, children }) => {
  const [state, setState] = useState<RelintioState>({
    isChallenging: false,
    challengeUrl: null,
    resolvedCount: 0,
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

  // Safe default for API URL
  const enrichedConfig = {
    ...config,
    apiUrl: config.apiUrl || 'https://relintio.com/api',
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
