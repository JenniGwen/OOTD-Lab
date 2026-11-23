import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ExtensionInstall } from './components/ExtensionInstall';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/^\/extension\/?$/.test(window.location.pathname) ? <ExtensionInstall />
      : /^\/privacy\/?$/.test(window.location.pathname) ? <PrivacyPolicy />
      : <App />}
  </StrictMode>,
);
