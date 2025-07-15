import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, getDoc, addDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useAppContext } from '../App';
import Modal from './Modal';

const AssociateForm = ({ associateToEdit, onSave, onCancel }) => {
    const { db, userId } = useAppContext();
    const [associate, setAssociate] = useState(associateToEdit || { name: '', address: '', contact: '', documentNumber: '', type: 'Associado', region: '', generalHydrometerId: '', sequentialId: null, isActive: true, observations: '' });
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
    const [associates, setAssociates] = useState([]);
    const [regions, setRegions] = useState([]);
    const [generalHydrometers, setGeneralHydrometers] = useState([]);

    useEffect(() => {
        if (!db || !userId) return;

        const associatesColRef = collection(db, `artifacts/${userId}/users/${userId}/associates`);
        const unsubscribeAssociates = onSnapshot(associatesColRef, (snapshot) => {
            setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const settingsDocRef = doc(db, `artifacts/${userId}/users/${userId}/settings`, 'config');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setRegions(docSnap.data().regions || ['Centro', 'Industrial', 'Buset', 'Vila Rica', 'São Vitor']);
                setGeneralHydrometers(docSnap.data().generalHydrometers || [
                    '#2 Geral Centro', '#3 Giacomin Industrial', '#4 Hortência Buset',
                    '#5 Hortência Industrial', '#6 Osmar Buset', '#7 Macari Buset',
                    '#8 Picada Estorta Centro', '#9 Jair Vila Rica', '#10 Edino Vila Rica',
                    '#11 Mussoi Vila Rica', '#12 Tchicão Vila Rica', '#13 Vila Gaio São Vitor',
                    'Consumo da Rede'
                ]);
            } else {
                setRegions(['Centro', 'Industrial', 'Buset', 'Vila Rica', 'São Vitor']);
                setGeneralHydrometers([
                    '#2 Geral Centro', '#3 Giacomin Industrial', '#4 Hortência Buset',
                    '#5 Hortência Industrial', '#6 Osmar Buset', '#7 Macari Buset',
                    '#8 Picada Estorta Centro', '#9 Jair Vila Rica', '#10 Edino Vila Rica',
                    '#11 Mussoi Vila Rica', '#12 Tchicão Vila Rica', '#13 Vila Gaio São Vitor',
                    'Consumo da Rede'
                ]);
            }
        });

        return () => {
            unsubscribeAssociates();
            unsubscribeSettings();
        };
    }, [db, userId]);

    const handleSave = async () => {
        if (!associate.name || !associate.type || !associate.region || !associate.generalHydrometerId) {
            setModalContent({
                title: 'Campos Obrigatórios',
                message: 'Por favor, preencha os campos obrigatórios: Nome, Tipo de Associado, Região e Hidrômetro Geral.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        try {
            if (associateToEdit && associateToEdit.id) {
                const associateRef = doc(db, `artifacts/${userId}/users/${userId}/associates`, associate.id);
                await updateDoc(associateRef, associate);
                setModalContent({
                    title: 'Sucesso',
                    message: 'Associado atualizado com sucesso!',
                    type: 'info',
                    onConfirm: () => { setShowModal(false); onSave(); }
                });
            } else {
                const settingsDocRef = doc(db, `artifacts/${userId}/users/${userId}/settings`, 'config');
                const settingsSnap = await getDoc(settingsDocRef);
                let nextSequentialId = 1;
                if (settingsSnap.exists() && settingsSnap.data().nextSequentialId) {
                    nextSequentialId = settingsSnap.data().nextSequentialId;
                }

                const newAssociateData = {
                    ...associate,
                    sequentialId: nextSequentialId,
                };

                await addDoc(collection(db, `artifacts/${userId}/users/${userId}/associates`), newAssociateData);
                await setDoc(settingsDocRef, { nextSequentialId: nextSequentialId + 1 }, { merge: true });

                setModalContent({
                    title: 'Sucesso',
                    message: 'Associado adicionado com sucesso!',
                    type: 'info',
                    onConfirm: () => { setShowModal(false); onSave(); }
                });
            }
            setShowModal(true);
        } catch (e) {
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar o associado. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-3xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">
                {associateToEdit ? 'Editar Associado' : 'Cadastrar Novo Associado'}
            </h2>
            {/* ...restante do formulário igual ao App.js... */}
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};

export default AssociateForm;
