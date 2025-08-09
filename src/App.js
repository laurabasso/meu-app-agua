/* global __app_id */
import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Componentes de página
import Home from './components/Home';
import Associates from './components/Associates';
import AssociateForm from './components/AssociateForm';
import AssociateDetails from './components/AssociateDetails';
import Readings from './components/Readings';
import GeneralHydrometers from './components/GeneralHydrometers';
import Invoices from './components/Invoices';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Profile from './components/Profile';
import ExternalScripts from './components/ExternalScripts';

// Autenticação e Contexto
import { AuthProvider, useAuth } from './components/Auth/AuthContext';
import RequireAuth from './components/Auth/RequireAuth';
import { AppContext } from './AppContext';
import firebaseConfig from './firebaseConfig';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function getCollectionPath(collectionName, userId) {
    if (!userId) { return `artifacts/default-app-id/users/nouser/${collectionName}`; }
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    return `/artifacts/${appId}/users/${userId}/${collectionName}`;
}
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Data inválida';
}

export default function AppWrapper() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RequireAuth>
          <App />
        </RequireAuth>
      </AuthProvider>
    </BrowserRouter>
  );
}

function App() {
    const { currentUser, handleLogout } = useAuth();

    const appContextValue = {
        db, auth, userId: currentUser?.uid, currentUser, getCollectionPath, formatDate,
    };

    // **A CORREÇÃO ESTÁ AQUI**
    // As chaves do objeto (que geram o link) agora estão em português,
    // para corresponderem exatamente aos `path` das Rotas.
    const navLinks = {
        home: 'Início',
        associados: 'Associados', // Antes: associates
        leituras: 'Leituras',     // Antes: readings
        hidrometros: 'Hidrômetros Gerais',
        faturas: 'Faturas',
        relatorios: 'Relatórios',
        configuracoes: 'Configurações',
        perfil: 'Perfil'
    };

    return (
        <AppContext.Provider value={appContextValue}>
            <div className="min-h-screen bg-gray-100 font-inter">
                <ExternalScripts />
                <nav className="bg-blue-700 p-4 shadow-lg">
                    <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
                        <h1 className="text-white text-2xl font-bold mb-4 md:mb-0">Controle de Água ACAJUVI</h1>
                        <div className="flex flex-wrap justify-center gap-2">
                            {Object.entries(navLinks).map(([path, name]) => (
                                <NavLink key={path} to={`/${path}`} className={({ isActive }) => `px-4 py-2 text-sm rounded-lg font-semibold text-blue-100 hover:bg-blue-600 transition ${isActive ? 'bg-blue-800' : ''}`}>
                                    {name}
                                </NavLink>
                            ))}
                            {currentUser && <button onClick={handleLogout} className="px-4 py-2 text-sm rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700">Sair</button>}
                        </div>
                    </div>
                </nav>
                <main className="container mx-auto p-4">
                    <Routes>
                        <Route path="/home" element={<Home />} />
                        <Route path="/associados" element={<Associates />} />
                        <Route path="/associados/novo" element={<AssociateForm />} />
                        <Route path="/associados/editar/:id" element={<AssociateForm />} />
                        <Route path="/associados/detalhes/:id" element={<AssociateDetails />} />
                        <Route path="/leituras" element={<Readings />} />
                        <Route path="/hidrometros" element={<GeneralHydrometers />} />
                        <Route path="/faturas" element={<Invoices />} />
                        <Route path="/relatorios" element={<Reports />} />
                        <Route path="/configuracoes" element={<Settings />} />
                        <Route path="/perfil" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/home" replace />} />
                    </Routes>
                </main>
            </div>
        </AppContext.Provider>
    );
}