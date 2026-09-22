import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { applyTheme, installThemeLifecycleSync } from './config.ts';
import { ErrorBoundary } from './components/ErrorBoundary';

// Apply and continuously restore one authoritative theme across page resume/focus.
applyTheme();
installThemeLifecycleSync();

// Clean up any lingering service workers from older installations
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
 navigator.serviceWorker.getRegistrations().then((registrations) => {
 for (const registration of registrations) {
 registration.unregister().catch(() => {});
 }
 }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
 <StrictMode>
 <ErrorBoundary>
 <BrowserRouter>
 <App />
 </BrowserRouter>
 </ErrorBoundary>
 </StrictMode>,
);
