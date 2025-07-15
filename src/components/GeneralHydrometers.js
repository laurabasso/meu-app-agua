import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

const GeneralHydrometers = () => {
    // CORREÇÃO: Movendo todos os hooks para o topo.
    const context = useAppContext();
    const [generalReadings, setGeneralReadings] = useState([]);
    const [generalHydrometersList, setGeneralHydrometersList] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [editableReadings, setEditableReadings] = useState({});

    // CORREÇÃO: Guard clause depois dos hooks.
    if (!context || !context.userId) {
        return <div className="text-center p-10">Carregando...</div>;
    }
    const { db, userId, getCollectionPath } = context;

    useEffect(() => {
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().generalHydrometers) {
                setGeneralHydrometersList(docSnap.data().generalHydrometers);
            }
        });

        const readingsColRef = collection(db, getCollectionPath('generalReadings', userId));
        const unsubReadings = onSnapshot(readingsColRef, (snapshot) => {
            setGeneralReadings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubPeriods = onSnapshot(periodsColRef, (snapshot) => {
            const periodsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const sorted = periodsData.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
            setPeriods(sorted);
            if (sorted.length > 0 && !selectedPeriodId) {
                setSelectedPeriodId(sorted[0].id);
            }
        });

        return () => {
            unsubSettings();
            unsubReadings();
            unsubPeriods();
        };
    }, [db, userId, getCollectionPath, selectedPeriodId]);

    const getReadingsForPeriod = (hydrometerName, periodId) => {
        const period = periods.find(p => p.id === periodId);
        if (!period) return { currentReading: null, previousReading: 0, consumption: 0 };

        const previousPeriodIndex = periods.findIndex(p => p.id === periodId) + 1;
        const previousPeriod = periods[previousPeriodIndex];
        
        const prevReadingDoc = previousPeriod 
            ? generalReadings.find(r => r.generalHydrometerName === hydrometerName && r.periodId === previousPeriod.id)
            : null;
        const prevReadingValue = prevReadingDoc ? prevReadingDoc.currentReading : 0;

        const currentReadingDoc = generalReadings.find(r => r.generalHydrometerName === hydrometerName && r.periodId === periodId);
        const currReadingValue = currentReadingDoc ? currentReadingDoc.currentReading : 0;
        
        return {
            currentReading: currentReadingDoc ? currentReadingDoc.currentReading : null,
            previousReading: prevReadingValue,
            currentReadingDoc: currentReadingDoc,
            consumption: currReadingValue - prevReadingValue,
        };
    };

    const handleSaveReading = async (hydrometerName) => {
        const value = editableReadings[hydrometerName];
        if (value === undefined || value === '') return;

        const { currentReadingDoc, previousReading } = getReadingsForPeriod(hydrometerName, selectedPeriodId);
        const parsedValue = parseFloat(value);

        if (parsedValue < previousReading) {
            setModalContent({ title: 'Leitura Inválida', message: 'A leitura atual não pode ser menor que a anterior.' });
            setShowModal(true);
            return;
        }

        const readingData = {
            generalHydrometerName: hydrometerName,
            date: new Date().toISOString().split('T')[0],
            currentReading: parsedValue,
            previousReading: previousReading,
            periodId: selectedPeriodId,
            consumption: parsedValue - previousReading,
        };

        try {
            if (currentReadingDoc) {
                await updateDoc(doc(db, getCollectionPath('generalReadings', userId), currentReadingDoc.id), readingData);
            } else {
                await addDoc(collection(db, getCollectionPath('generalReadings', userId)), readingData);
            }
            setEditableReadings(prev => ({ ...prev, [hydrometerName]: undefined }));
            setSuccessMessage('Leitura salva com sucesso!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };

    const filteredHydrometers = generalHydrometersList.filter(h =>
        h.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Leituras de Hidrômetros Gerais</h2>
            {successMessage && <div className="bg-green-100 text-green-700 p-3 rounded-lg mb-4">{successMessage}</div>}
            
            <div className="mb-8 p-6 border rounded-xl bg-gray-50 flex flex-col md:flex-row gap-4 items-center">
                <LabeledInput type="text" placeholder="Buscar hidrômetro..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full" />
                <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full p-3 border rounded-lg">
                    <option value="">Selecione um Período</option>
                    {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                </select>
            </div>

            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="py-3 px-4 text-left">Hidrômetro</th>
                            <th className="py-3 px-4 text-left">Leitura Anterior (m³)</th>
                            <th className="py-3 px-4 text-left">Leitura Atual (m³)</th>
                            <th className="py-3 px-4 text-left">Consumo (m³)</th>
                            <th className="py-3 px-4 text-left">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredHydrometers.map(name => {
                            const { currentReading, previousReading, consumption } = getReadingsForPeriod(name, selectedPeriodId);
                            return (
                                <tr key={name} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4 font-semibold">{name}</td>
                                    <td className="py-3 px-4">{previousReading.toFixed(2)}</td>
                                    <td className="py-3 px-4">
                                        <LabeledInput
                                            type="number"
                                            step="0.01"
                                            value={editableReadings[name] !== undefined ? editableReadings[name] : (currentReading || '')}
                                            onChange={e => setEditableReadings(prev => ({ ...prev, [name]: e.target.value }))}
                                            onBlur={() => handleSaveReading(name)}
                                            className="w-28"
                                        />
                                    </td>
                                    <td className="py-3 px-4 font-semibold">{consumption.toFixed(2)}</td>
                                    <td className="py-3 px-4">
                                        <Button onClick={() => handleSaveReading(name)} variant="primary" size="xs">Salvar</Button>
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

export default GeneralHydrometers;
