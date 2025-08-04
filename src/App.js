/* global __app_id */
import React, { useState } from 'react';
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
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
  const navigate = useNavigate(); // Hook do React Router para navegar programaticamente

  // Mantemos o estado para formulários e detalhes, que funcionam como "modais" sobre a página de associados
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

  // Funções para abrir as telas de formulário e detalhes
  const handleEditAssociate = (assoc) => {
    setAssociateToEdit(assoc);
    navigate('/associados'); // Garante que a URL base seja a de associados
  };

  const handleAddAssociate = () => {
    setAssociateToEdit({}); // Objeto vazio para indicar criação
    navigate('/associados');
  };

  const handleViewDetails = (assoc) => {
    setViewingAssociateDetails(assoc);
    navigate('/associados');
  };
  
  const handleCloseForms = () => {
      setAssociateToEdit(null);
      setViewingAssociateDetails(null);
      navigate('/associados');
  }

  const renderCurrentView = () => {
    if (viewingAssociateDetails) {
        return <AssociateDetails associate={viewingAssociateDetails} onBack={handleCloseForms} />;
    }
    if (associateToEdit) {
        return <AssociateForm associateToEdit={associateToEdit} onSave={handleCloseForms} onCancel={handleCloseForms} />;
    }
    // Renderiza as rotas principais se nenhuma tela "modal" estiver ativa
    return (
        <Routes>
            <Route path="/home" element={<Home />} />
            <Route path="/associados" element={<Associates onAddAssociate={handleAddAssociate} onEditAssociate={handleEditAssociate} onViewAssociateDetails={handleViewDetails} />} />
            <Route path="/leituras" element={<Readings onViewAssociateDetails={handleViewDetails} />} />
            <Route path="/hidrometros" element={<GeneralHydrometers />} />
            <Route path="/faturas" element={<Invoices />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/configuracoes" element={<Settings />} />
            <Route path="/perfil" element={<Profile />} />
            {/* Rota padrão para redirecionar para /home */}
            <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
    );
  };
  
  const navLinks = {
      home: 'Início', associates: 'Associados', leituras: 'Leituras', 
      hidrometros: 'Hidrômetros Gerais', faturas: 'Faturas', 
      relatorios: 'Relatórios', configuracoes: 'Configurações', perfil: 'Perfil'
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
                <NavLink 
                  key={path} 
                  to={`/${path}`}
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? '#1e40af' : '', // bg-blue-800
                  })}
                  className="px-4 py-2 text-sm rounded-lg font-semibold text-blue-100 hover:bg-blue-600 transition"
                >
                  {name}
                </NavLink>
              ))}
              {currentUser && <button onClick={handleLogout} className="px-4 py-2 text-sm rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700">Sair</button>}
            </div>
          </div>
        </nav>
        <main className="container mx-auto p-4">{renderCurrentView()}</main>
      </div>
    </AppContext.Provider>
  );
}