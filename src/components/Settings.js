import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

// NOVO: Componente de Configurações extraído para seu próprio arquivo.
const Settings = () => {
    const context = useAppContext();
    if (!context || !context.userId) {
        return <div className="text-center p-10">Carregando...</div>;
    }
    const { db, userId, getCollectionPath, formatDate } = context;

    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    
    const [periods, setPeriods] = useState([]);
    const [newPeriodStartDate, setNewPeriodStartDate] = useState('');
    const [isGeneratingPeriods, setIsGeneratingPeriods] = useState(false);


    // Carrega as configurações e períodos do Firestore
    useEffect(() => {
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setSettings(docSnap.data());
            }
            setLoading(false);
        });

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubscribePeriods = onSnapshot(periodsColRef, (snapshot) => {
            const periodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPeriods(periodsData.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate)));
        });
        
        // Auto-geração de períodos (lógica simplificada)
        const generateMissingPeriods = async () => {
            setIsGeneratingPeriods(true);
            const today = new Date();
            const lastPeriodDate = periods.length > 0 ? new Date(periods[0].readingDate) : new Date(today.getFullYear(), today.getMonth() - 2, 1);
            
            let nextPeriodDate = new Date(lastPeriodDate);
            nextPeriodDate.setMonth(nextPeriodDate.getMonth() + 2);

            if(nextPeriodDate <= today) {
                const periodData = generatePeriodData(nextPeriodDate.toISOString().split('T')[0]);
                const q = query(collection(db, getCollectionPath('periods', userId)), where('code', '==', periodData.code));
                const existing = await getDocs(q);
                if(existing.empty) {
                    await addDoc(collection(db, getCollectionPath('periods', userId)), periodData);
                }
            }
            setIsGeneratingPeriods(false);
        };

        if(!loading && periods.length > 0) {
            generateMissingPeriods();
        }


        return () => {
            unsubscribeSettings();
            unsubscribePeriods();
        };
    }, [db, userId, getCollectionPath, loading]); // Adicionado loading para re-executar quando o carregamento inicial terminar

    const handleSaveSettings = async (section) => {
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, { [section]: settings[section] }, { merge: true });
            setModalContent({ title: 'Sucesso', message: `Seção "${section}" salva com sucesso!` });
            setShowModal(true);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };

    const handleFieldChange = (section, field, value, type = 'string') => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: type === 'number' ? parseFloat(value) || 0 : value
            }
        }));
    };
    
    const handleListChange = (section, value) => {
        const list = value.split('\n').map(item => item.trim()).filter(Boolean);
        setSettings(prev => ({ ...prev, [section]: list }));
    };

    // Funções de gerenciamento de períodos
    const generatePeriodData = (readingDateInput) => {
        // ... (lógica de geração de período)
        const parts = readingDateInput.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;

        const readingDate = new Date(year, month, 1);
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        
        const billingPeriodName = `Período de ${monthNames[month]} a ${monthNames[(month + 1) % 12]} de ${year}`;
        const code = `${String(month + 1).padStart(2, '0')}/${year}`;
        const billingDueDate = new Date(year, month, 15);
        const consumptionStartDate = new Date(year, month - 2, 1);
        const consumptionEndDate = new Date(year, month, 0);
        const consumptionPeriodName = `Consumo de ${monthNames[consumptionStartDate.getMonth()]} a ${monthNames[consumptionEndDate.getMonth()]}`;

        return {
            code,
            billingPeriodName,
            billingDueDate: billingDueDate.toISOString().split('T')[0],
            readingDate: readingDate.toISOString().split('T')[0],
            consumptionPeriodName,
            consumptionStartDate: consumptionStartDate.toISOString().split('T')[0],
            consumptionEndDate: consumptionEndDate.toISOString().split('T')[0],
        };
    };

    const handleAddPeriod = async () => {
        if (!newPeriodStartDate) {
            setModalContent({ title: 'Aviso', message: 'Por favor, selecione a data de início da leitura.' });
            setShowModal(true);
            return;
        }
        const periodData = generatePeriodData(newPeriodStartDate);
        const q = query(collection(db, getCollectionPath('periods', userId)), where('code', '==', periodData.code));
        const existing = await getDocs(q);

        if (!existing.empty) {
            setModalContent({ title: 'Aviso', message: 'Este período já existe.' });
            setShowModal(true);
            return;
        }
        await addDoc(collection(db, getCollectionPath('periods', userId)), periodData);
        setNewPeriodStartDate('');
        setModalContent({ title: 'Sucesso', message: 'Período adicionado!' });
        setShowModal(true);
    };

    const handleDeletePeriod = async (periodId) => {
        await deleteDoc(doc(db, getCollectionPath('periods', userId), periodId));
    };

    if (loading) {
        return <div className="text-center p-10">Carregando configurações...</div>;
    }

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 text-center">Configurações Gerais</h2>

            {/* Seção de Tarifas */}
            <div className="p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Tarifas por Tipo de Associado</h3>
                {settings.tariffs && Object.keys(settings.tariffs).map(type => (
                    <div key={type} className="mb-6 p-4 border rounded-xl bg-white">
                        <h4 className="text-lg font-bold text-gray-800 mb-3">{type}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <LabeledInput label="Taxa Fixa (R$)" type="number" value={settings.tariffs[type].fixedFee} onChange={e => handleFieldChange('tariffs', type, {...settings.tariffs[type], fixedFee: parseFloat(e.target.value)})} />
                            {/* Adicionar outros campos de tarifa aqui */}
                        </div>
                    </div>
                ))}
                <Button onClick={() => handleSaveSettings('tariffs')} variant="primary" className="w-full">Salvar Tarifas</Button>
            </div>

            {/* Seção de Regiões */}
            <div className="p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Regiões dos Associados</h3>
                <textarea
                    value={(settings.regions || []).join('\n')}
                    onChange={e => handleListChange('regions', e.target.value)}
                    rows="5"
                    className="w-full p-3 border rounded-lg"
                    placeholder="Uma região por linha"
                ></textarea>
                <Button onClick={() => handleSaveSettings('regions')} variant="primary" className="w-full mt-4">Salvar Regiões</Button>
            </div>
            
            {/* Seção de Períodos */}
            <div className="p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerenciar Períodos</h3>
                <div className="mb-4 p-4 border rounded-xl bg-white">
                    <h4 className="font-semibold mb-2">Adicionar Novo Período</h4>
                    <LabeledInput label="Data de Início da Leitura" type="date" value={newPeriodStartDate} onChange={e => setNewPeriodStartDate(e.target.value)} />
                    <Button onClick={handleAddPeriod} variant="success" className="w-full mt-4">Adicionar Período</Button>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">Períodos Existentes</h4>
                    <ul className="space-y-2">
                        {periods.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-2 bg-white rounded-lg border">
                                <span>{p.billingPeriodName} ({formatDate(p.readingDate)})</span>
                                <Button onClick={() => handleDeletePeriod(p.id)} variant="danger" size="xs">Excluir</Button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Settings;
