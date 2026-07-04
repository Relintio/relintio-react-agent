# Relintio React & React Native WAF Protection Agent SDK

Official React client-side SDK for integrating the Relintio WAF challenge protocol. Intercepts backend requests blocked by challenges, displays the interactive verification modal, and retries requests automatically.

## Installation

```bash
npm install @relintio/react-agent
```

## Features

- **Standard Fetch Interceptor:** Overrides `window.fetch` to catch `X-Relintio-Action: challenge` headers and pause/resume outgoing calls.
- **Axios Middleware:** Registers response interceptors for custom Axios instances.
- **Dynamic Challenges:** Automatically renders a premium-styled security overlay when a challenge is requested.
- **React Hooks:** Access challenge state or manually trigger overlays with `useRelintio()`.

## Quickstart

### 1. Wrap your App in `RelintioProvider`

```tsx
import React from 'react';
import { RelintioProvider } from '@relintio/react-agent';

const relintioConfig = {
  licenseKey: 'YOUR_LICENSE_KEY',
  apiUrl: 'https://api.relintio.com/api',
};

export default function App() {
  return (
    <RelintioProvider config={relintioConfig}>
      <MainApp />
    </RelintioProvider>
  );
}
```

### 2. Register the Request Interceptor

Use the hook inside your top-level layout or components to protect requests:

```tsx
import React from 'react';
import { useRelintioInterceptor } from '@relintio/react-agent';
import axios from 'axios';

// Create your API instances
const api = axios.create({
  baseURL: 'https://your-api.com',
});

export function MainApp() {
  // Automatically intercept fetch & axios calls
  useRelintioInterceptor({ axiosInstance: api });

  return (
    <div>
      <h1>Protected Application</h1>
    </div>
  );
}
```
