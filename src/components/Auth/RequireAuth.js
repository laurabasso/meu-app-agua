import React from 'react';
import { useAuth } from './AuthContext';
import Login from './Login';

// Componente simples de carregamento
const LoadingScreen = () => (
    <div className="flex justify-center items-center h-screen w-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">Carregando Sistema...</div>
    </div>
);

const RequireAuth = ({ children }) => {
    const { currentUser, loading } = useAuth();

    // 1. Se ainda estiver carregando a informação de auth, mostre uma tela de loading
    if (loading) {
        return <LoadingScreen />;
    }

    // 2. Se não estiver carregando E não houver usuário, mostre o Login
    if (!currentUser) {
        return <Login />;
    }

    // 3. Se não estiver carregando E houver usuário, mostre a aplicação
    return children;
};

export default RequireAuth;