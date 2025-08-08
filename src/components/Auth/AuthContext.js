import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const auth = getAuth();

    useEffect(() => {
        // **INÍCIO DA LÓGICA DO MODO DE DESENVOLVIMENTO**
        if (process.env.REACT_APP_DEV_MODE === 'true') {
            console.warn("MODO DE DESENVOLVIMENTO ATIVO: Autenticação simulada.");
            const mockUser = {
                uid: "dev_user_12345", // Um ID de utilizador falso
                email: "dev@user.com",
            };
            setCurrentUser(mockUser);
            setLoading(false);
            return; // Impede que o código de produção abaixo seja executado
        }
        // **FIM DA LÓGICA DO MODO DE DESENVOLVIMENTO**

        // Lógica de produção (só é executada se o modo de desenvolvimento estiver desligado)
        const unsubscribe = onAuthStateChanged(auth, user => {
            setCurrentUser(user);
            setLoading(false);
        });
        return unsubscribe;
    }, [auth]);

    const handleLogin = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const handleLogout = () => {
        // No modo de desenvolvimento, apenas limpa o utilizador falso
        if (process.env.REACT_APP_DEV_MODE === 'true') {
            setCurrentUser(null);
            return;
        }
        return signOut(auth);
    };

    const value = {
        currentUser,
        loading,
        handleLogin,
        handleLogout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};