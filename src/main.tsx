import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './core/ui/tokens.css';
import './core/ui/base.css';
import './core/ui/colourTheme.css';
import './core/ui/fonts.css';
import { initTheme } from './core/theme/theme';
import { router } from './app/router';
import { UpdatePrompt } from './app/UpdatePrompt';
import { UpdateRegistrar } from './core/update/UpdateRegistrar';

// Theme first, so the first paint already has the right colors.
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdateRegistrar />
    <UpdatePrompt />
  </StrictMode>,
);
