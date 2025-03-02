import App from './App';
import { createRoot } from 'react-dom/client';
import './index.css';

// Import init function from "@neutralinojs/lib"
import { init } from "@neutralinojs/lib"
import React = require('react');

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

init(); // Add this function call
