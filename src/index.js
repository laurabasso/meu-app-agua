import React from 'react';
import ReactDOM from 'react-dom/client';
// A importação do BrowserRouter foi removida daqui
import './tailwind.css';
import AppWrapper from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* O BrowserRouter foi removido daqui */}
    <AppWrapper />
  </React.StrictMode>
);

reportWebVitals();