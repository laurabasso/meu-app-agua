/* global __app_id */
import React, { useState } from 'react';
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

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Funções utilitárias
function getCollectionPath(collectionName, userId) {
  if (!userId) {
    console.error("UserID indisponível em getCollectionPath.");
    return `artifacts/default-app-id/users/nouser/${collectionName}`;
  }
  // CORREÇÃO: Adicionado comentário /* global __app_id */ no topo do arquivo para o ESLint.
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  return `/artifacts/${appId}/users/${userId}/${collectionName}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Data inválida';
}

// Componente Wrapper
export default function AppWrapper() {
  return (
    <AuthProvider>
      <RequireAuth>
        <App />
      </RequireAuth>
    </AuthProvider>
  );
}

// Componente Principal
function App() {
  const { currentUser, handleLogout } = useAuth();
  const [currentPage, setCurrentPage] = useState('home');
  const [associateToEdit, setAssociateToEdit] = useState(null);
  const [viewingAssociateDetails, setViewingAssociateDetails] = useState(null);

  const appContextValue = {
    db,
    auth,
    userId: currentUser?.uid,
    currentUser,
    getCollectionPath,
    formatDate,
  };

  const navigateTo = (page, data = null) => {
    if (page === 'associateForm') setAssociateToEdit(data);
    if (page === 'associateDetails') setViewingAssociateDetails(data);
    setCurrentPage(page);
  };

  const pages = {
    home: <Home />,
    associates: <Associates onAddAssociate={() => navigateTo('associateForm', {})} onEditAssociate={(assoc) => navigateTo('associateForm', assoc)} onViewAssociateDetails={(assoc) => navigateTo('associateDetails', assoc)} />,
    associateForm: <AssociateForm associateToEdit={associateToEdit} onSave={() => navigateTo('associates')} onCancel={() => navigateTo('associates')} />,
    associateDetails: <AssociateDetails associate={viewingAssociateDetails} onBack={() => navigateTo('associates')} />,
    readings: <Readings onViewAssociateDetails={(assoc) => navigateTo('associateDetails', assoc)} />,
    generalHydrometers: <GeneralHydrometers />,
    invoices: <Invoices />,
    reports: <Reports />,
    settings: <Settings />,
    profile: <Profile />,
  };

  const pageNames = {
      home: 'Início', associates: 'Associados', readings: 'Leituras', 
      generalHydrometers: 'Hidrômetros Gerais', invoices: 'Faturas', 
      reports: 'Relatórios', settings: 'Configurações', profile: 'Perfil'
  };

  return (
    <AppContext.Provider value={appContextValue}>
      <div className="min-h-screen bg-gray-100 font-inter">
        <ExternalScripts />
        <nav className="bg-blue-700 p-4 shadow-lg">
          <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
            <h1 className="text-white text-2xl font-bold mb-4 md:mb-0">Sistema de Água</h1>
            <div className="flex flex-wrap justify-center gap-2">
              {Object.keys(pageNames).map(pageKey => (
                <button key={pageKey} onClick={() => navigateTo(pageKey)}
                  className={`px-4 py-2 text-sm rounded-lg font-semibold transition ${currentPage === pageKey ? 'bg-blue-800 text-white' : 'text-blue-100 hover:bg-blue-600'}`}>
                  {pageNames[pageKey]}
                </button>
              ))}
              {currentUser && <button onClick={handleLogout} className="px-4 py-2 text-sm rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700">Sair</button>}
            </div>
          </div>
        </nav>
        <main className="container mx-auto p-4">{pages[currentPage] || <Home />}</main>
      </div>
    </AppContext.Provider>
  );
}
