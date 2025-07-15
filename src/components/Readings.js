import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, getDocs, setDoc } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import LabeledInput from './LabeledInput';

const Readings = ({ onViewAssociateDetails }) => {
    const context = useAppContext();
    const [readings, setReadings] = useState([]);
    const [associates, setAssociates] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [settings, setSettings] = useState(null);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [editableReadings, setEditableReadings] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [successMessage, setSuccessMessage] = useState('');
    const [filter, setFilter] = useState({ status: 'all', region: 'all' });
    const [filterOptions, setFilterOptions] = useState({ regions: [] });

    const filteredAssociates = useMemo(() => {
        return associates.filter(a => {
            const name = a.name || '';
            const seqId = a.sequentialId || '';
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || String(seqId).includes(searchTerm);
            const matchesStatus = filter.status === 'all' || (filter.status === 'active' ? a.isActive : !a.isActive);
            const matchesRegion = filter.region === 'all' || a.region === filter.region;
            return matchesSearch && matchesStatus && matchesRegion;
        });
    }, [associates, searchTerm, filter]);

    useEffect(() => {
        if (!context || !context.userId) return;
        
        const { db, getCollectionPath, userId } = context;

        const unsubAssociates = onSnapshot(collection(db, getCollectionPath('associates', userId)), (snapshot) => {
            setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (a.sequentialId || 0) - (b.sequentialId || 0)));
        });

        const unsubPeriods = onSnapshot(collection(db, getCollectionPath('periods', userId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const sorted = data.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
            setPeriods(sorted);
            if (sorted.length > 0 && !selectedPeriodId) {
                setSelectedPeriodId(sorted[0].id);
            }
        });

        const unsubReadings = onSnapshot(collection(db, getCollectionPath('readings', userId)), (snapshot) => {
            setReadings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        
        const unsubSettings = onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFilterOptions({ regions: data.regions || [] });
                setSettings(data);
            }
        });

        return () => {
            unsubAssociates();
            unsubPeriods();
            unsubReadings();
            unsubSettings();
        };
    }, [context, selectedPeriodId]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }
    
    const { db, getCollectionPath, userId } = context;
    
    const calculateAmountDue = (consumption, associate) => {
        if (!settings || !settings.tariffs || !associate) return 0;
        const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'];
        if (!tariff) return 0;

        const consumoLivre = tariff.freeConsumption || 0;
        const metrosPadrao = tariff.standardMeters || 0;
        const taxaFixa = tariff.fixedFee || 0;
        const tarifaExcedente = tariff.excessTariff || 0;

        if (consumption < consumoLivre) {
            return 0;
        }
    
        if (consumption <= metrosPadrao) {
            return taxaFixa;
        }
    
        const baseConsumoExcedente = Math.max(consumoLivre, metrosPadrao);
        const consumoExcedente = consumption - baseConsumoExcedente;
        const valorExcedente = consumoExcedente * tarifaExcedente;
        
        return taxaFixa + valorExcedente;
    };

    const getReadingsForAssociate = (associateId, periodId) => {
        if (!periodId) return { currentReading: null, previousReading: 0, consumption: 0, currentReadingDoc: null };
        const periodIndex = periods.findIndex(p => p.id === periodId);
        const previousPeriod = periodIndex > -1 && periods[periodIndex + 1] ? periods[periodIndex + 1] : null;
        const prevReadingDoc = previousPeriod ? readings.find(r => r.associateId === associateId && r.periodId === previousPeriod.id) : null;
        const prevReadingValue = prevReadingDoc ? prevReadingDoc.currentReading : 0;
        const currentReadingDoc = readings.find(r => r.associateId === associateId && r.periodId === periodId);
        const currReadingValue = currentReadingDoc ? currentReadingDoc.currentReading : 0;
        const consumption = currReadingValue > 0 ? currReadingValue - prevReadingValue : 0;
        return { currentReading: currentReadingDoc ? currentReadingDoc.currentReading : null, previousReading: prevReadingValue, currentReadingDoc, consumption };
    };

    // MELHORIA: Função para criar ou atualizar a fatura automaticamente.
    const createOrUpdateInvoice = async (readingData) => {
        const associate = associates.find(a => a.id === readingData.associateId);
        const period = periods.find(p => p.id === readingData.periodId);
        if (!associate || !period) return;

        const amountDue = calculateAmountDue(readingData.consumption, associate);

        const invoiceData = {
            associateId: readingData.associateId,
            periodId: readingData.periodId,
            period: period.billingPeriodName,
            consumption: readingData.consumption,
            amountDue: parseFloat(amountDue.toFixed(2)),
            invoiceDate: new Date().toISOString().split('T')[0],
            previousReadingValue: readingData.previousReading,
            latestReadingId: readingData.id, // Salva o ID da leitura para referência
        };

        // Verifica se a fatura já existe para ser atualizada ou criada
        const invoicesRef = collection(db, getCollectionPath('invoices', userId));
        const q = query(invoicesRef, where("associateId", "==", readingData.associateId), where("periodId", "==", readingData.periodId));
        const existingInvoices = await getDocs(q);

        if (existingInvoices.empty) {
            // Cria nova fatura com status Pendente
            await addDoc(invoicesRef, { ...invoiceData, status: 'Pendente' });
        } else {
            // Atualiza a fatura existente
            const invoiceDoc = existingInvoices.docs[0];
            await setDoc(doc(db, getCollectionPath('invoices', userId), invoiceDoc.id), invoiceData, { merge: true });
        }
    };

    const handleSaveReading = async (associateId) => {
        const value = editableReadings[associateId];
        if (value === undefined || value === '' || !selectedPeriodId) return;
        const { currentReadingDoc, previousReading } = getReadingsForAssociate(associateId, selectedPeriodId);
        const parsedValue = parseFloat(value);
        if (isNaN(parsedValue) || parsedValue < previousReading) {
            setModalContent({ title: 'Leitura Inválida', message: 'A leitura atual não pode ser menor que a anterior.' });
            setShowModal(true);
            return;
        }
        
        const readingData = { associateId, periodId: selectedPeriodId, date: new Date().toISOString().split('T')[0], currentReading: parsedValue, previousReading, consumption: parsedValue - previousReading };
        
        try {
            let savedReadingId;
            if (currentReadingDoc) {
                const readingRef = doc(db, getCollectionPath('readings', userId), currentReadingDoc.id);
                await updateDoc(readingRef, readingData);
                savedReadingId = currentReadingDoc.id;
            } else {
                const newReadingRef = await addDoc(collection(db, getCollectionPath('readings', userId)), readingData);
                savedReadingId = newReadingRef.id;
            }
            
            // MELHORIA: Chama a função para gerar a fatura após salvar a leitura.
            await createOrUpdateInvoice({ ...readingData, id: savedReadingId });

            setEditableReadings(prev => ({...prev, [associateId]: undefined}));
            setSuccessMessage(`Leitura e Fatura de ${associates.find(a=>a.id === associateId)?.name} salvas/atualizadas!`);
            setTimeout(() => setSuccessMessage(''), 2500);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Lançar Leituras e Gerar Faturas</h2>
            {successMessage && <div className="bg-green-100 text-green-800 p-3 mb-4 rounded-lg text-center">{successMessage}</div>}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <input type="text" placeholder="Buscar associado..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-3 border rounded-lg" />
                <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full md:w-1/3 p-3 border rounded-lg">
                    <option value="">Selecione um Período</option>
                    {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                </select>
                <div className="w-full md:w-auto">
                    <label className="block text-sm font-medium text-gray-700">Região</label>
                    <select value={filter.region} onChange={e => setFilter(f => ({...f, region: e.target.value}))} className="w-full p-2 border rounded-lg">
                        <option value="all">Todas</option>
                        {filterOptions.regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                 <div className="w-full md:w-auto">
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value}))} className="w-full p-2 border rounded-lg">
                        <option value="all">Todos</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="py-3 px-4 text-left">ID</th>
                            <th className="py-3 px-4 text-left">Nome</th>
                            <th className="py-3 px-4 text-left">Leitura Anterior</th>
                            <th className="py-3 px-4 text-left">Leitura Atual</th>
                            <th className="py-3 px-4 text-left">Consumo</th>
                            <th className="py-3 px-4 text-left">Valor da Fatura (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAssociates.map(assoc => {
                            const { currentReading, previousReading, consumption } = getReadingsForAssociate(assoc.id, selectedPeriodId);
                            const invoiceAmount = calculateAmountDue(consumption, assoc);
                            return (
                                <tr key={assoc.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">{assoc.sequentialId}</td>
                                    <td className="py-3 px-4 font-semibold hover:underline cursor-pointer" onClick={() => onViewAssociateDetails(assoc)}>{assoc.name}</td>
                                    <td className="py-3 px-4">{previousReading.toFixed(2)} m³</td>
                                    <td className="py-3 px-4">
                                        <LabeledInput
                                            type="number"
                                            step="0.01"
                                            value={editableReadings[assoc.id] !== undefined ? editableReadings[assoc.id] : (currentReading !== null ? currentReading : '')}
                                            onChange={e => setEditableReadings(prev => ({ ...prev, [assoc.id]: e.target.value }))}
                                            onBlur={() => handleSaveReading(assoc.id)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveReading(assoc.id)}
                                            className="w-28"
                                            placeholder="0.00"
                                        />
                                    </td>
                                    <td className="py-3 px-4 font-semibold">{consumption.toFixed(2)} m³</td>
                                    <td className="py-3 px-4 font-bold text-blue-600">
                                        {consumption > 0 ? `R$ ${invoiceAmount.toFixed(2)}` : 'R$ 0.00'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Readings;
