import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

// Inside the Bloom desktop app the top bar doubles as the window's title bar.
if (navigator.userAgent.includes('Electron')) document.documentElement.classList.add('in-app');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
