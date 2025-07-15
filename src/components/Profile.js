import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

const Profile = () => {
    // CORREÇÃO: Todos os hooks (useState, useEffect, useAppContext) são chamados no topo, incondicionalmente.
    const context = useAppContext();
    const [acajuviInfo, setAcajuviInfo] = useState({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });

    useEffect(() => {
        // A lógica DENTRO do hook pode ser condicional.
        // Se o contexto ou o userId ainda não estiverem prontos, o efeito não faz nada.
        if (!context || !context.userId) {
            setLoading(false); // Garante que o estado de loading seja falso se não houver contexto.
            return;
        }
        const { db, getCollectionPath, userId } = context;

        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setAcajuviInfo(docSnap.data().acajuviInfo || {});
            }
            setLoading(false);
        });
        // A função de limpeza do useEffect.
        return () => unsubscribe();
    }, [context]); // O efeito agora depende do objeto 'context' inteiro. Ele será re-executado quando o contexto mudar de null para um valor válido.

    // CORREÇÃO: A verificação de segurança para a renderização da UI acontece DEPOIS de todos os hooks terem sido chamados.
    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold text-gray-600">Carregando...</div>;
    }
    
    // Desestruturamos o contexto aqui, pois agora temos certeza de que ele existe.
    const { db, auth, userId, currentUser, getCollectionPath } = context;

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
            <h2 className="text-3xl font-bold text-gray-800 text-center">Perfil e Informações da Associação</h2>

            <div className="p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Usuário Logado</h3>
                <p className="mb-4"><strong>Email:</strong> {currentUser?.email}</p>
                <Button onClick={handleChangePassword} variant="secondary">Alterar Senha por E-mail</Button>
            </div>

            <div className="p-6 border rounded-xl bg-gray-50 space-y-4">
                <h3 className="text-xl font-semibold text-gray-700">Informações da Associação (para Faturas)</h3>
                <LabeledInput label="Nome da Associação" value={acajuviInfo.acajuviName || ''} onChange={(e) => handleInfoChange('acajuviName', e.target.value)} />
                <LabeledInput label="CNPJ" value={acajuviInfo.acajuviCnpj || ''} onChange={(e) => handleInfoChange('acajuviCnpj', e.target.value)} />
                <LabeledInput label="Endereço" value={acajuviInfo.acajuviAddress || ''} onChange={(e) => handleInfoChange('acajuviAddress', e.target.value)} />
                <LabeledInput label="Telefone" value={acajuviInfo.acajuviPhone || ''} onChange={(e) => handleInfoChange('acajuviPhone', e.target.value)} />
                <LabeledInput label="Email de Contato" value={acajuviInfo.acajuviEmail || ''} onChange={(e) => handleInfoChange('acajuviEmail', e.target.value)} />
                <hr/>
                <h4 className="font-semibold text-gray-600 pt-2">Dados Bancários</h4>
                <LabeledInput label="Nome do Banco" value={acajuviInfo.bankName || ''} onChange={(e) => handleInfoChange('bankName', e.target.value)} />
                <LabeledInput label="Agência" value={acajuviInfo.bankAgency || ''} onChange={(e) => handleInfoChange('bankAgency', e.target.value)} />
                <LabeledInput label="Conta Corrente" value={acajuviInfo.bankAccountNumber || ''} onChange={(e) => handleInfoChange('bankAccountNumber', e.target.value)} />
                <LabeledInput label="Chave PIX" value={acajuviInfo.pixKey || ''} onChange={(e) => handleInfoChange('pixKey', e.target.value)} />
                
                <Button onClick={handleSave} variant="primary" className="w-full !mt-6">Salvar Informações da Associação</Button>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Profile;
