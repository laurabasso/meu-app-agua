import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Button from '../Button';
import LabeledInput from '../LabeledInput';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    // **A CORREÇÃO ESTÁ AQUI**
    // Alterado de { login } para { handleLogin } para corresponder ao AuthContext
    const { handleLogin } = useAuth(); 
    
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            // E aqui, chamamos a função correta
            await handleLogin(email, password);
            navigate('/home');
        } catch (error) {
            console.error("Erro no login:", error);
            setError('Falha ao entrar. Verifique o seu e-mail e senha.');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white rounded-xl shadow-lg w-full max-w-md">
                <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Login</h2>
                {error && <p className="bg-red-100 text-red-700 p-3 mb-4 rounded-lg text-center">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <LabeledInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <LabeledInput
                        label="Senha"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <Button type="submit" variant="primary" className="w-full">
                        Entrar
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default Login;