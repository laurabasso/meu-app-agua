import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import Button from '../Button';
import LabeledInput from '../LabeledInput';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, error } = useAuth();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        await login(email, password);
        setLoading(false);
    };

    // MELHORIA: Layout profissional para a tela de login.
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-gray-800">
                        Acessar o Sistema
                    </h2>
                    <p className="mt-2 text-gray-600">
                        Bem-vindo(a) de volta!
                    </p>
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <LabeledInput
                        label="Email"
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seuemail@exemplo.com"
                        required
                    />
                    <LabeledInput
                        label="Senha"
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="********"
                        required
                    />

                    {error && (
                        <div className="p-3 text-sm text-center text-red-800 bg-red-100 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div>
                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full py-3"
                            disabled={loading}
                        >
                            {loading ? 'Entrando...' : 'Entrar'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
