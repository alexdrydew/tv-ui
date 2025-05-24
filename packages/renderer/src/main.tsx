import ReactDOM from 'react-dom/client';
import { StrictMode, Suspense, lazy } from 'react';
import './index.css';
import { init } from '@noriginmedia/norigin-spatial-navigation';

const delay = import.meta.env.MODE === 'development' ? 500 : 0;
const App = lazy(() => {
    return new Promise((resolve) => {
        // @ts-expect-error App type is lazy
        setTimeout(() => resolve(import('./App.tsx')), delay);
    });
});

init({
    // debug: import.meta.env.DEV,
    // visualDebug: true,
    shouldFocusDOMNode: true,
    shouldUseNativeEvents: true,
    useGetBoundingClientRect: true,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Suspense fallback={<div>Waiting for preload to initialize...</div>}>
            <App />
        </Suspense>
    </StrictMode>,
);
