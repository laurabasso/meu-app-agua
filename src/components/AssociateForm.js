import React, { useState, useEffect } from 'react';
// CORREÇÃO: Adicionando onSnapshot que estava faltando para o useEffect.
import { doc, setDoc, addDoc, collection, getDoc, onSnapshot } from 'firebase/firestore';
// CORREÇÃO: Importando useAppContext do lugar certo.
import { useAppContext } from '../AppContext';
import Button from './Button';
import LabeledInput from './LabeledInput';
import Modal from './Modal';

const AssociateForm = ({ associateToEdit, onSave, onCancel }) => {
    // CORREÇÃO: Movendo todos os hooks para o topo.
    const context = useAppContext();
    const [associate, setAssociate] = useState(associateToEdit || { isActive: true, type: 'Associado' });
    const [regions, setRegions] = useState([]);
    const [generalHydrometers, setGeneralHydrometers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });

    // CORREÇÃO: Guard clause depois dos hooks.
    if (!context || !context.userId) return <div>Carregando...</div>;
    const { db, getCollectionPath, userId } = context;

    useEffect(() => {
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data();
                setRegions(settings.regions || []);
                setGeneralHydrometers(settings.generalHydrometers || []);
            }
        });
        return unsubscribe;
    }, [db, getCollectionPath, userId]);

    const handleChange = (field, value) => {
        setAssociate(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!associate.name || !associate.sequentialId) {
            setModalContent({ title: 'Erro', message: 'Nome e ID Sequencial são obrigatórios.' });
            setShowModal(true);
            return;
        }
        try {
            if (associate.id) { // Edit
                const associateRef = doc(db, getCollectionPath('associates', userId), associate.id);
                await setDoc(associateRef, associate, { merge: true });
            } else { // Add
                const settingsRef = doc(db, getCollectionPath('settings', userId), 'config');
                const settingsSnap = await getDoc(settingsRef);
                const nextId = (settingsSnap.data()?.nextSequentialId || 1);
                
                const newAssociate = { ...associate, sequentialId: nextId };
                await addDoc(collection(db, getCollectionPath('associates', userId)), newAssociate);
                await setDoc(settingsRef, { nextSequentialId: nextId + 1 }, { merge: true });
            }
            onSave();
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-2xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">{associate.id ? 'Editar Associado' : 'Adicionar Associado'}</h2>
            <div className="space-y-4">
                <LabeledInput label="ID Sequencial" type="number" value={associate.sequentialId || ''} onChange={e => handleChange('sequentialId', parseInt(e.target.value, 10))} />
                <LabeledInput label="Nome Completo" value={associate.name || ''} onChange={e => handleChange('name', e.target.value)} />
                <LabeledInput label="Endereço" value={associate.address || ''} onChange={e => handleChange('address', e.target.value)} />
                <LabeledInput label="Contato (Telefone)" value={associate.contact || ''} onChange={e => handleChange('contact', e.target.value)} />
                <LabeledInput label="CPF/CNPJ" value={associate.documentNumber || ''} onChange={e => handleChange('documentNumber', e.target.value)} />
                
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <select value={associate.type || 'Associado'} onChange={e => handleChange('type', e.target.value)} className="w-full p-2 border rounded-lg">
                    <option>Associado</option>
                    <option>Entidade</option>
                    <option>Outro</option>
                </select>

                <label className="block text-sm font-medium text-gray-700">Região</label>
                <select value={associate.region || ''} onChange={e => handleChange('region', e.target.value)} className="w-full p-2 border rounded-lg">
                    <option value="">Selecione a Região</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>

                <label className="block text-sm font-medium text-gray-700">Hidrômetro Geral</label>
                <select value={associate.generalHydrometerId || ''} onChange={e => handleChange('generalHydrometerId', e.target.value)} className="w-full p-2 border rounded-lg">
                    <option value="">Selecione o Hidrômetro Geral</option>
                    {generalHydrometers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>

                <div className="flex items-center">
                    <input type="checkbox" id="isActive" checked={associate.isActive} onChange={e => handleChange('isActive', e.target.checked)} className="h-4 w-4 rounded" />
                    <label htmlFor="isActive" className="ml-2">Associado Ativo</label>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-8">
                <Button onClick={onCancel} variant="secondary">Cancelar</Button>
                <Button onClick={handleSave} variant="primary">Salvar</Button>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default AssociateForm;
