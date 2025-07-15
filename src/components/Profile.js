import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';

const Profile = () => {
    // CORREÇÃO: Movendo todos os hooks para o topo.
    const context = useAppContext();
    const [acajuviInfo, setAcajuviInfo] = useState({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });

    // CORREÇÃO: Guard clause depois dos hooks.
    if (!context || !context.userId) {
        return <div className="text-center p-10">Carregando...</div>;
    }
    const { db, auth, userId, currentUser, getCollectionPath } = context;

    useEffect(() => {
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setAcajuviInfo(docSnap.data().acajuviInfo || {});
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, userId, getCollectionPath]);

    const handleSave = async () => {
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, { acajuviInfo }, { merge: true });
            setModalContent({ title: 'Sucesso', message: 'Informações salvas com sucesso!' });
            setShowModal(true);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };

    const handleChangePassword = () => {
        if (!currentUser?.email) return;
        sendPasswordResetEmail(auth, currentUser.email)
            .then(() => {
                setModalContent({ title: 'E-mail Enviado', message: 'Verifique sua caixa de entrada para redefinir sua senha.' });
                setShowModal(true);
            })
            .catch((error) => {
                setModalContent({ title: 'Erro', message: error.message });
                setShowModal(true);
            });
    };

    const handleInfoChange = (field, value) => {
        setAcajuviInfo(prev => ({ ...prev, [field]: value }));
    };

    if (loading) {
        return <div className="text-center p-10">Carregando perfil...</div>;
    }

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-3xl mx-auto my-8 font-inter space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 text-center">Perfil e Informações</h2>

            <div className="p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Usuário</h3>
                <p className="mb-4"><strong>Email:</strong> {currentUser?.email}</p>
                <Button onClick={handleChangePassword} variant="secondary">Alterar Senha</Button>
            </div>

            <div className="p-6 border rounded-xl bg-gray-50 space-y-4">
                <h3 className="text-xl font-semibold text-gray-700">Informações da Associação</h3>
                <input value={acajuviInfo.acajuviName || ''} onChange={(e) => handleInfoChange('acajuviName', e.target.value)} placeholder="Nome da Associação" className="w-full p-2 border rounded" />
                <input value={acajuviInfo.acajuviCnpj || ''} onChange={(e) => handleInfoChange('acajuviCnpj', e.target.value)} placeholder="CNPJ" className="w-full p-2 border rounded" />
                <input value={acajuviInfo.acajuviAddress || ''} onChange={(e) => handleInfoChange('acajuviAddress', e.target.value)} placeholder="Endereço" className="w-full p-2 border rounded" />
                <input value={acajuviInfo.pixKey || ''} onChange={(e) => handleInfoChange('pixKey', e.target.value)} placeholder="Chave PIX" className="w-full p-2 border rounded" />
                <Button onClick={handleSave} variant="primary" className="w-full">Salvar Informações</Button>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Profile;
