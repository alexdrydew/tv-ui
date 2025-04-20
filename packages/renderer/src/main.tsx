import ReactDOM from 'react-dom/client';
import { StrictMode, Suspense, lazy } from 'react';
import './index.css';

const delay = import.meta.env.MODE === 'development' ? 500 : 0;
const App = lazy(() => {
    return new Promise((resolve) => {
        // @ts-expect-error App type is lazy
        setTimeout(() => resolve(import('./App.tsx')), delay);
    });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Suspense fallback={<div>Waiting for preload to initialize...</div>}>
            <App />
        </Suspense>
    </StrictMode>,
);
