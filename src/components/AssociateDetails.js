import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useAppContext } from '../App';
import Modal from './Modal';

const AssociateDetails = ({ associate, onBack, onSaveObservations }) => {
    const { db, userId } = useAppContext();
    const [observations, setObservations] = useState(associate.observations || '');
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });

    const handleSave = async () => {
        try {
            const associateRef = doc(db, `artifacts/${userId}/users/${userId}/associates`, associate.id);
            await updateDoc(associateRef, { observations: observations });
            setModalContent({
                title: 'Sucesso',
                message: 'Observações salvas com sucesso!',
                type: 'info',
                onConfirm: () => { setShowModal(false); if (onSaveObservations) onSaveObservations(); }
            });
            setShowModal(true);
        } catch (e) {
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar as observações. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-3xl mx-auto my-8 font-inter">
            {/* ...restante do layout igual ao App.js... */}
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};

export default AssociateDetails;
