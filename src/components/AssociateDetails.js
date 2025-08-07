import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, query, where, deleteDoc, getDoc } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Button from './Button';
import Modal from './Modal';
import LabeledInput from './LabeledInput';

const AssociateDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const context = useAppContext();
    const [associate, setAssociate] = useState(null);
    const [observations, setObservations] = useState('');
    const [readings, setReadings] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [editingReading, setEditingReading] = useState(null);

    useEffect(() => {
        if (!context?.userId || !id) return;
        const { db, getCollectionPath, userId } = context;
        const unsubAssociate = onSnapshot(doc(db, getCollectionPath('associates', userId), id), (docSnap) => {
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() };
                setAssociate(data);
                setObservations(data.observations || '');
            }
        });
        const unsubReadings = onSnapshot(query(collection(db, getCollectionPath('readings', userId)), where("associateId", "==", id)), (s) => {
            setReadings(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date)));
        });
        const unsubInvoices = onSnapshot(query(collection(db, getCollectionPath('invoices', userId)), where("associateId", "==", id)), (s) => {
            setInvoices(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate)));
        });
        return () => { unsubAssociate(); unsubReadings(); unsubInvoices(); };
    }, [context, id]);

    if (!context?.userId || !associate) return <div className="text-center p-10 font-semibold">Carregando...</div>;
    const { db, getCollectionPath, formatDate, userId } = context;

    const handleSaveObservations = async () => {
        await updateDoc(doc(db, getCollectionPath('associates', userId), associate.id), { observations });
        setModalContent({ title: 'Sucesso', message: 'Observações salvas!', onConfirm: () => setShowModal(false) });
        setShowModal(true);
    };

    const handleDeleteHistory = (collectionName, docId) => {
        setModalContent({
            title: 'Confirmar Exclusão', message: `Tem certeza que deseja excluir este registro?`, type: 'confirm',
            onConfirm: async () => {
                await deleteDoc(doc(db, getCollectionPath(collectionName, userId), docId));
                setShowModal(false);
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    const handleUpdateReading = async () => {
        if (!editingReading) return;
        const newReadingValue = parseFloat(editingReading.currentReading);
        if (isNaN(newReadingValue) || newReadingValue < editingReading.previousReading) {
            setModalContent({ title: 'Valor Inválido', message: 'A leitura não pode ser menor que a anterior.' });
            setShowModal(true); return;
        }
        await updateDoc(doc(db, getCollectionPath('readings', userId), editingReading.id), {
            currentReading: newReadingValue,
            consumption: newReadingValue - editingReading.previousReading
        });
        setEditingReading(null);
    };

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <Button onClick={() => navigate('/associados')} variant="secondary" className="mb-8">Voltar para Associados</Button>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">{associate.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 p-4 border rounded-lg bg-gray-50">
                <div><strong>ID:</strong> {associate.sequentialId}</div><div><strong>Endereço:</strong> {associate.address}</div>
                <div><strong>Contato:</strong> {associate.contact}</div><div><strong>Documento:</strong> {associate.documentNumber}</div>
                <div><strong>Tipo:</strong> {associate.type}</div><div><strong>Região:</strong> {associate.region}</div>
                <div><strong>Hidrômetro:</strong> {associate.generalHydrometerId}</div><div><strong>Status:</strong> {associate.isActive ? 'Ativo' : 'Inativo'}</div>
            </div>
            <div className="mb-6"><h3 className="text-xl font-semibold mb-2">Observações</h3><textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows="4" className="w-full p-2 border rounded-lg" /><Button onClick={handleSaveObservations} variant="primary" className="mt-2">Salvar</Button></div>
            <div className="mb-6"><h3 className="text-xl font-semibold mb-2">Histórico de Faturas</h3><div className="overflow-x-auto rounded-xl shadow-md"><table className="min-w-full bg-white"><thead className="bg-gray-100"><tr><th className="py-3 px-4 text-left">Período</th><th className="py-3 px-4 text-left">Valor (R$)</th><th className="py-3 px-4 text-left">Status</th><th className="py-3 px-4 text-left">Ações</th></tr></thead><tbody>{invoices.length > 0 ? invoices.map(inv => (<tr key={inv.id} className="border-b"><td className="py-3 px-4">{inv.period}</td><td className="py-3 px-4">R$ {inv.amountDue.toFixed(2)}</td><td className={`py-3 px-4 font-semibold ${inv.status === 'Pendente' ? 'text-red-500' : 'text-green-600'}`}>{inv.status}</td><td className="py-3 px-4"><Button onClick={() => handleDeleteHistory('invoices', inv.id)} variant="danger" size="xs">Excluir</Button></td></tr>)) : (<tr><td colSpan="4" className="text-center py-4">Nenhuma fatura.</td></tr>)}</tbody></table></div></div>
            <div><h3 className="text-xl font-semibold mb-2">Histórico de Leituras</h3><div className="overflow-x-auto rounded-xl shadow-md"><table className="min-w-full bg-white"><thead className="bg-gray-100"><tr><th className="py-3 px-4 text-left">Data</th><th className="py-3 px-4 text-left">Leitura</th><th className="py-3 px-4 text-left">Consumo</th><th className="py-3 px-4 text-left">Ações</th></tr></thead><tbody>{readings.length > 0 ? readings.map(r => (<tr key={r.id} className="border-b"><td className="py-3 px-4">{formatDate(r.date)}</td><td className="py-3 px-4">{r.currentReading} m³</td><td className="py-3 px-4">{r.consumption} m³</td><td className="py-3 px-4 space-x-2"><Button onClick={() => setEditingReading(r)} variant="secondary" size="xs">Editar</Button><Button onClick={() => handleDeleteHistory('readings', r.id)} variant="danger" size="xs">Excluir</Button></td></tr>)) : (<tr><td colSpan="4" className="text-center py-4">Nenhuma leitura.</td></tr>)}</tbody></table></div></div>
            <Modal {...modalContent} show={showModal} onConfirm={modalContent.onConfirm} onCancel={() => setShowModal(false)} />
            {editingReading && <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"><div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md"><h2 className="text-2xl font-bold mb-6">Editar Leitura</h2><p className="mb-4">Editando leitura de {formatDate(editingReading.date)}.</p><LabeledInput label="Nova Leitura (m³)" type="number" value={editingReading.currentReading} onChange={(e) => setEditingReading(prev => ({ ...prev, currentReading: e.target.value }))} /><div className="flex justify-end gap-4 mt-8"><Button onClick={() => setEditingReading(null)} variant="secondary">Cancelar</Button><Button onClick={handleUpdateReading} variant="primary">Salvar</Button></div></div></div>}
        </div>
    );
};

export default AssociateDetails;