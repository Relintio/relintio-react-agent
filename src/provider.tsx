import React, { createContext, useContext, useState, useEffect } from 'react';
import { RelintioConfig, RelintioState } from './types';

interface RelintioContextType {
  config: RelintioConfig;
  state: RelintioState;
  triggerChallenge: (url: string) => void;
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

  const triggerChallenge = (url: string) => {
    setState((prev) => ({
      ...prev,
      isChallenging: true,
      challengeUrl: url,
    }));
  };

  const resolveChallenge = () => {
    setState((prev) => ({
      ...prev,
      isChallenging: false,
      challengeUrl: null,
      resolvedCount: prev.resolvedCount + 1,
    }));
  };

  // Safe default for API URL
  const enrichedConfig = {
    ...config,
    apiUrl: config.apiUrl || 'https://api.relintio.com/api',
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
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'relintio_challenge_success') {
        onResolve();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onResolve]);

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
          src={url}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Relintio WAF Security Challenge"
        />
      </div>
    </div>
  );
};
