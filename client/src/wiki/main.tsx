import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Wiki } from './Wiki';
import './wiki.css';

createRoot(document.getElementById('root')!).render(<StrictMode><Wiki /></StrictMode>);
