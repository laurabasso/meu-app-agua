import React from 'react';
import ReactDOM from 'react-dom/client';
// 1. Descomente a linha abaixo para importar o BrowserRouter
import { BrowserRouter } from 'react-router-dom'; 
import './tailwind.css';
import AppWrapper from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* 2. Descomente as linhas abaixo para ativar o roteador */}
    <BrowserRouter>
      <AppWrapper />
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();