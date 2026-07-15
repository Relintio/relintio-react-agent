import { useEffect } from 'react';
import { useRelintio } from './provider';

interface RelintioInterceptorOptions {
  axiosInstance?: any; // Allow any axios instance
}

export const useRelintioInterceptor = (options: RelintioInterceptorOptions = {}) => {
  const { triggerChallenge } = useRelintio();

  useEffect(() => {
    // 1. Intercept standard window.fetch calls
    const originalFetch = window.fetch;
    const interceptedFetch: typeof window.fetch = async function (input, init) {
      const request = new Request(input, init);
      const response = await originalFetch(request.clone());

      if (response.status === 403) {
        const relintioAction = response.headers.get('X-Relintio-Action');
        const challengeUrl = response.headers.get('X-Relintio-Challenge-URL');

        if (relintioAction === 'challenge' && challengeUrl) {
          await triggerChallenge(challengeUrl);

          // Retry the request after successful resolution
          return originalFetch(request.clone());
        }
      }

      return response;
    };
    window.fetch = interceptedFetch;

    // 2. Intercept Axios calls if an instance is provided
    let axiosInterceptorId: number | null = null;
    if (options.axiosInstance) {
      axiosInterceptorId = options.axiosInstance.interceptors.response.use(
        (response: any) => response,
        async (error: any) => {
          const { response, config } = error;
          if (response && response.status === 403) {
            const relintioAction = response.headers['x-relintio-action'];
            const challengeUrl = response.headers['x-relintio-challenge-url'];

            if (relintioAction === 'challenge' && challengeUrl && !config.__relintioRetried) {
              config.__relintioRetried = true;
              await triggerChallenge(challengeUrl);

              // Retry the original request
              return options.axiosInstance(config);
            }
          }
          return Promise.reject(error);
        }
      );
    }

    // Cleanup interceptors on unmount
    return () => {
      if (window.fetch === interceptedFetch) {
        window.fetch = originalFetch;
      }
      if (options.axiosInstance && axiosInterceptorId !== null) {
        options.axiosInstance.interceptors.response.eject(axiosInterceptorId);
      }
    };
  }, [options.axiosInstance, triggerChallenge]);
};
