import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
// CORREÇÃO: Importando useAppContext do lugar certo.
import { useAppContext } from '../AppContext';
import Button from './Button';
import Modal from './Modal';

const AssociateDetails = ({ associate, onBack }) => {
    // CORREÇÃO: Movendo a chamada do hook para o topo.
    const context = useAppContext();
    const [observations, setObservations] = useState(associate.observations || '');
    const [readings, setReadings] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });

    // CORREÇÃO: Guard clause depois dos hooks.
    if (!context) return <div>Carregando...</div>;
    const { db, getCollectionPath, formatDate } = context;
    
    useEffect(() => {
        if (!associate.id) return;
        const readingsColRef = collection(db, getCollectionPath('readings', context.userId));
        const q = query(readingsColRef, where("associateId", "==", associate.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const readingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReadings(readingsData.sort((a, b) => new Date(b.date) - new Date(a.date)));
        });
        return unsubscribe;
    }, [db, associate.id, getCollectionPath, context.userId]);

    const handleSaveObservations = async () => {
        const associateRef = doc(db, getCollectionPath('associates', context.userId), associate.id);
        try {
            await updateDoc(associateRef, { observations });
            setModalContent({ title: 'Sucesso', message: 'Observações salvas!' });
            setShowModal(true);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };

    // O resto do componente continua igual...
    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <Button onClick={onBack} variant="secondary" className="mb-8">Voltar para a Lista</Button>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">{associate.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div><strong>ID Sequencial:</strong> {associate.sequentialId}</div>
                <div><strong>Endereço:</strong> {associate.address}</div>
                <div><strong>Contato:</strong> {associate.contact}</div>
                <div><strong>Documento:</strong> {associate.documentNumber}</div>
                <div><strong>Tipo:</strong> {associate.type}</div>
                <div><strong>Região:</strong> {associate.region}</div>
                <div><strong>Status:</strong> {associate.isActive ? 'Ativo' : 'Inativo'}</div>
            </div>

            <div className="mb-6">
                <h3 className="text-xl font-semibold mb-2">Observações</h3>
                <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows="4"
                    className="w-full p-2 border rounded-lg"
                />
                <Button onClick={handleSaveObservations} variant="primary" className="mt-2">Salvar Observações</Button>
            </div>

            <div>
                <h3 className="text-xl font-semibold mb-2">Histórico de Leituras</h3>
                <div className="overflow-x-auto rounded-xl shadow-md">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-3 px-4 text-left">Data</th>
                                <th className="py-3 px-4 text-left">Leitura (m³)</th>
                                <th className="py-3 px-4 text-left">Consumo (m³)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {readings.map(r => (
                                <tr key={r.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">{formatDate(r.date)}</td>
                                    <td className="py-3 px-4">{r.currentReading}</td>
                                    <td className="py-3 px-4">{r.consumption}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default AssociateDetails;