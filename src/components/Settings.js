import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, collection, addDoc, getDocs, query, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

// A função de cálculo foi movida para cá para ser reutilizada na sincronização
const calculateAmountDue = (consumption, associate, settings) => {
    if (!settings || !settings.tariffs || !associate) return 0;
    const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'] || {};
    const { freeConsumption = 0, standardMeters = 0, fixedFee = 0, excessTariff = 0 } = tariff;
    if (associate.type !== 'Outro' && consumption <= freeConsumption) return fixedFee;
    if (consumption <= standardMeters) return fixedFee;
    const excessBase = Math.max(freeConsumption, standardMeters);
    return fixedFee + ((consumption - excessBase) * excessTariff);
};

const Settings = () => {
    const context = useAppContext();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [periods, setPeriods] = useState([]);
    const [newPeriodStartDate, setNewPeriodStartDate] = useState('');
    const [activeView, setActiveView] = useState('menu');
    const [periodToProcess, setPeriodToProcess] = useState('');

    const defaultSettings = {
        tariffs: {
            Associado: { fixedFee: 20.00, standardMeters: 10, freeConsumption: 5, excessTariff: 7.00 },
            Entidade: { fixedFee: 30.00, standardMeters: 15, freeConsumption: 7, excessTariff: 9.00 },
            Outro: { fixedFee: 25.00, standardMeters: 12, freeConsumption: 6, excessTariff: 8.00 },
        },
        regions: [],
        generalHydrometers: [],
        nextSequentialId: 1,
        acajuviInfo: { acajuviName: 'ACAJUVI', acajuviCnpj: 'XX.XXX.XXX/XXXX-XX', acajuviAddress: 'Endereço Padrão', pixKey: 'sua-chave-pix@email.com' }
    };

    useEffect(() => {
        if (!context || !context.userId) { setLoading(false); return; }
        const { db, getCollectionPath, userId } = context;
        
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setSettings(prev => ({...defaultSettings, ...docSnap.data(), tariffs: {...defaultSettings.tariffs, ...(docSnap.data().tariffs || {})}}));
            } else {
                setDoc(settingsDocRef, defaultSettings).then(() => setSettings(defaultSettings));
            }
            setLoading(false);
        }, () => setLoading(false));

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubPeriods = onSnapshot(periodsColRef, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const sortedData = data.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
            setPeriods(sortedData);
            if (sortedData.length > 0 && !periodToProcess) {
                setPeriodToProcess(sortedData[0].id);
            }
        });
        return () => { unsubSettings(); unsubPeriods(); };
    }, [context]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }
    
    const { db, userId, getCollectionPath, formatDate } = context;

    const handleSaveSettings = async (sectionKey) => {
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        await setDoc(settingsDocRef, { [sectionKey]: settings[sectionKey] }, { merge: true });
        setModalContent({ title: 'Sucesso', message: 'Configurações salvas!' });
        setShowModal(true);
    };
    
    const handleTariffChange = (type, field, value) => {
        setSettings(prev => ({ ...prev, tariffs: { ...prev.tariffs, [type]: { ...(prev.tariffs ? prev.tariffs[type] : {}), [field]: parseFloat(value) || 0 }}}));
    };

    const handleListChange = (section, value) => {
        setSettings(prev => ({ ...prev, [section]: value.split('\n').map(item => item.trim()).filter(Boolean) }));
    };

    const generatePeriodData = (readingDateInput) => {
        const [year, monthNum] = readingDateInput.split('-').map(Number);
        const monthIndex = monthNum - 1;
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const readingDate = new Date(year, monthIndex, 1);
        const consumptionEndDate = new Date(year, monthIndex, 0);
        const consumptionStartDate = new Date(year, monthIndex - 2, 1);
        const firstMonthBilling = readingDate;
        const secondMonthBilling = new Date(year, monthIndex + 1, 1);
        const billingDueDate = new Date(year, monthIndex + 2, 15);
        const code = `${String(firstMonthBilling.getMonth() + 1).padStart(2, '0')}/${firstMonthBilling.getFullYear()}`;
        return { 
            code, 
            billingPeriodName: `Período de ${monthNames[firstMonthBilling.getMonth()]} a ${monthNames[secondMonthBilling.getMonth()]} de ${secondMonthBilling.getFullYear()}`, 
            billingDueDate: billingDueDate.toISOString().split('T')[0], 
            readingDate: readingDate.toISOString().split('T')[0], 
            consumptionPeriodName: `Leitura de ${monthNames[consumptionStartDate.getMonth()]} a ${monthNames[consumptionEndDate.getMonth()]} de ${consumptionEndDate.getFullYear()}`, 
        };
    };

    const handleAddPeriod = async () => {
        if (!newPeriodStartDate) return;
        const periodData = generatePeriodData(newPeriodStartDate);
        const q = query(collection(db, getCollectionPath('periods', userId)), where('code', '==', periodData.code));
        if (!(await getDocs(q)).empty) {
            setModalContent({ title: 'Aviso', message: 'Este período já existe.' });
            setShowModal(true); return;
        }
        await addDoc(collection(db, getCollectionPath('periods', userId)), periodData);
        setNewPeriodStartDate('');
    };

    const handleDeletePeriod = async (periodId) => {
        await deleteDoc(doc(db, getCollectionPath('periods', userId), periodId));
    };

    const exportToCsv = async (collectionName, filename) => { /* ... */ };
    const importFromCsv = async (collectionName, event) => { /* ... */ };
    const downloadCsvTemplate = (collectionName) => { /* ... */ };
    const handleDeleteDuplicateReadings = async () => { /* ... */ };
    const handleSyncInvoices = async () => {
        if (!periodToProcess) {
            setModalContent({ title: 'Erro', message: 'Por favor, selecione um período.' });
            setShowModal(true);
            return;
        }

        setModalContent({ title: 'Aguarde', message: 'Sincronizando faturas... Isso pode levar alguns momentos.' });
        setShowModal(true);

        const associatesSnap = await getDocs(collection(db, getCollectionPath('associates', userId)));
        const associates = associatesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const readingsQuery = query(collection(db, getCollectionPath('readings', userId)), where('periodId', '==', periodToProcess));
        const readingsSnap = await getDocs(readingsQuery);

        const period = periods.find(p => p.id === periodToProcess);
        const batch = writeBatch(db);
        let updatedCount = 0;
        let createdCount = 0;
        let deletedCount = 0;

        for (const readingDoc of readingsSnap.docs) {
            const reading = { id: readingDoc.id, ...readingDoc.data() };
            const associate = associates.find(a => a.id === reading.associateId);
            if (!associate) continue;
            
            const amountDue = calculateAmountDue(reading.consumption, associate, settings);

            const invoiceQuery = query(collection(db, getCollectionPath('invoices', userId)), where('associateId', '==', reading.associateId), where('periodId', '==', reading.periodId));
            const existingInvoiceSnap = await getDocs(invoiceQuery);

            if (amountDue > 0) {
                const invoiceData = {
                    associateId: reading.associateId,
                    periodId: reading.periodId,
                    period: period.billingPeriodName,
                    consumption: reading.consumption,
                    amountDue: parseFloat(amountDue.toFixed(2)),
                    invoiceDate: new Date().toISOString().split('T')[0],
                    previousReadingValue: reading.previousReading,
                    latestReadingId: reading.id,
                };
                
                if (existingInvoiceSnap.empty) {
                    const newInvoiceRef = doc(collection(db, getCollectionPath('invoices', userId)));
                    batch.set(newInvoiceRef, { ...invoiceData, status: 'Pendente' });
                    createdCount++;
                } else {
                    const invoiceDocRef = doc(db, getCollectionPath('invoices', userId), existingInvoiceSnap.docs[0].id);
                    batch.set(invoiceDocRef, invoiceData, { merge: true });
                    updatedCount++;
                }
            } else {
                if (!existingInvoiceSnap.empty) {
                    const invoiceDocRef = doc(db, getCollectionPath('invoices', userId), existingInvoiceSnap.docs[0].id);
                    batch.delete(invoiceDocRef);
                    deletedCount++;
                }
            }
        }
        
        await batch.commit();
        setModalContent({ title: 'Sincronização Concluída', message: `${createdCount} faturas criadas, ${updatedCount} atualizadas e ${deletedCount} removidas.` });
        setShowModal(true);
    };

    const renderMenu = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Button onClick={() => setActiveView('tariffs')} variant="secondary" className="p-6 text-lg">Ajustar Tarifas</Button>
            <Button onClick={() => setActiveView('periods')} variant="secondary" className="p-6 text-lg">Gerenciar Períodos</Button>
            <Button onClick={() => setActiveView('regions')} variant="secondary" className="p-6 text-lg">Gerenciar Regiões</Button>
            <Button onClick={() => setActiveView('hydrometers')} variant="secondary" className="p-6 text-lg">Gerenciar Hidrômetros</Button>
            <Button onClick={() => setActiveView('importExport')} variant="secondary" className="p-6 text-lg">Importar / Exportar Dados</Button>
            <Button onClick={() => setActiveView('cleanup')} variant="danger" className="p-6 text-lg md:col-span-2">Limpeza e Sincronização</Button>
        </div>
    );

    const renderSection = (title, children) => (
        <div>
            <Button onClick={() => setActiveView('menu')} variant="secondary" className="mb-6">← Voltar ao Menu</Button>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">{title}</h3>
            {children}
        </div>
    );

    if (loading || !settings) return <div className="text-center p-10">Carregando configurações...</div>;

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 text-center mb-8">Configurações</h2>
            
            {activeView === 'menu' && renderMenu()}

            {activeView === 'tariffs' && renderSection('Ajustar Tarifas', (
                <div className="space-y-6">
                    {Object.keys(settings.tariffs).map(type => (
                        <div key={type} className="p-6 border rounded-xl bg-gray-50 space-y-3">
                            <h4 className="font-bold text-lg text-gray-700">{type}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <LabeledInput label="Taxa Fixa (R$)" type="number" value={settings.tariffs[type]?.fixedFee || ''} onChange={e => handleTariffChange(type, 'fixedFee', e.target.value)} />
                                <LabeledInput label="Consumo Padrão (m³)" type="number" value={settings.tariffs[type]?.standardMeters || ''} onChange={e => handleTariffChange(type, 'standardMeters', e.target.value)} />
                                <LabeledInput label="Consumo Livre (m³)" type="number" value={settings.tariffs[type]?.freeConsumption || ''} onChange={e => handleTariffChange(type, 'freeConsumption', e.target.value)} />
                                <LabeledInput label="Tarifa Excedente (R$/m³)" type="number" value={settings.tariffs[type]?.excessTariff || ''} onChange={e => handleTariffChange(type, 'excessTariff', e.target.value)} />
                            </div>
                        </div>
                    ))}
                    <Button onClick={() => handleSaveSettings('tariffs')} variant="primary" className="w-full !mt-8">Salvar Tarifas</Button>
                </div>
            ))}
            
            {activeView === 'regions' && renderSection('Gerenciar Regiões', (
                <div className="p-6 border rounded-xl bg-gray-50">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Regiões (uma por linha)</label>
                    <textarea value={(settings.regions || []).join('\n')} onChange={e => handleListChange('regions', e.target.value)} rows="8" className="w-full p-2 border rounded-lg" />
                    <Button onClick={() => handleSaveSettings('regions')} variant="primary" className="w-full mt-4">Salvar Regiões</Button>
                </div>
            ))}

            {activeView === 'hydrometers' && renderSection('Gerenciar Hidrômetros Gerais', (
                <div className="p-6 border rounded-xl bg-gray-50">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hidrômetros (um por linha)</label>
                    <textarea value={(settings.generalHydrometers || []).join('\n')} onChange={e => handleListChange('generalHydrometers', e.target.value)} rows="8" className="w-full p-2 border rounded-lg" />
                    <Button onClick={() => handleSaveSettings('generalHydrometers')} variant="primary" className="w-full mt-4">Salvar Hidrômetros</Button>
                </div>
            ))}

            {activeView === 'importExport' && renderSection('Importar / Exportar Dados', (
                 <div className="p-6 border rounded-xl bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <h4 className="font-semibold text-gray-600">Exportar para CSV</h4>
                            <Button onClick={() => exportToCsv('associates', 'associados_export')} variant="secondary" className="w-full">Exportar Associados</Button>
                            <Button onClick={() => exportToCsv('readings', 'leituras_export')} variant="secondary" className="w-full">Exportar Leituras</Button>
                            <Button onClick={() => exportToCsv('periods', 'periodos_export')} variant="secondary" className="w-full">Exportar Períodos</Button>
                        </div>
                        <div className="space-y-3">
                            <h4 className="font-semibold text-gray-600">Importar / Atualizar Dados</h4>
                            <div className="p-4 border rounded-lg bg-white">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Leituras</label>
                                <p className="text-xs text-gray-600 mb-2">Adiciona novos registros de leitura. Use o modelo para garantir a formatação correta.</p>
                                <Button onClick={() => downloadCsvTemplate('readings')} size="xs" variant="info" className="mb-2">Baixar Modelo</Button>
                                <input type="file" accept=".csv" onChange={e => importFromCsv('readings', e)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {activeView === 'periods' && renderSection('Gerenciar Períodos', (
                <div className="p-6 border rounded-xl bg-gray-50">
                    <div className="mb-6 p-4 border rounded-xl bg-white">
                        <h4 className="font-semibold mb-2">Adicionar Novo Período</h4>
                        <LabeledInput label="Data da Nova Leitura (ex: 01/06/2025)" type="date" value={newPeriodStartDate} onChange={e => setNewPeriodStartDate(e.target.value)} />
                        <Button onClick={handleAddPeriod} variant="success" className="w-full mt-4">Adicionar</Button>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2">Períodos Existentes</h4>
                        <div className="overflow-x-auto rounded-xl shadow-md">
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Período (Faturamento)</th>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Período (Consumo)</th>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Data da Leitura</th>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Vencimento</th>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periods.map(p => (
                                        <tr key={p.id} className="border-b">
                                            <td className="py-2 px-3">{(p.billingPeriodName || '').replace('Período de ', '')}</td>
                                            <td className="py-2 px-3">{(p.consumptionPeriodName || '').replace('Leitura de ', '')}</td>
                                            <td className="py-2 px-3">{formatDate(p.readingDate)}</td>
                                            <td className="py-2 px-3">{formatDate(p.billingDueDate)}</td>
                                            <td className="py-2 px-3"><Button onClick={() => handleDeletePeriod(p.id)} variant="danger" size="xs">Excluir</Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ))}
            
            {activeView === 'cleanup' && renderSection('Limpeza e Sincronização', (
                <div className="space-y-8">
                    <div className="p-6 border rounded-xl bg-gray-50 space-y-4">
                        <h4 className="font-semibold text-lg">Remover Leituras Duplicadas</h4>
                        <p className="text-sm text-gray-600">Remove leituras duplicadas para cada associado dentro de um período, mantendo apenas a mais recente.</p>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Período para Limpeza</label>
                            <select value={periodToProcess} onChange={e => setPeriodToProcess(e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                                {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                            </select>
                        </div>
                        <Button onClick={handleDeleteDuplicateReadings} variant="danger" className="w-full">Executar Limpeza</Button>
                    </div>
                    
                    <div className="p-6 border rounded-xl bg-gray-50 space-y-4">
                        <h4 className="font-semibold text-lg">Sincronizar Faturas</h4>
                        <p className="text-sm text-gray-600">Cria ou atualiza faturas com base nas leituras existentes para o período selecionado. Faturas com valor R$ 0,00 serão removidas.</p>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Período para Sincronizar</label>
                            <select value={periodToProcess} onChange={e => setPeriodToProcess(e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                                {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                            </select>
                        </div>
                        <Button onClick={handleSyncInvoices} variant="primary" className="w-full">Sincronizar Faturas</Button>
                    </div>
                </div>
            ))}

            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Settings;