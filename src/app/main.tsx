import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPage } from '@/pages/chat';
import { ErrorBoundary } from './providers/ErrorBoundary';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing.');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ChatPage />
    </ErrorBoundary>
  </StrictMode>,
);
