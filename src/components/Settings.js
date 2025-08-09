import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, collection, addDoc, getDocs, query, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

const Settings = () => {
    const context = useAppContext();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [periods, setPeriods] = useState([]);
    const [newPeriodStartDate, setNewPeriodStartDate] = useState('');
    const [activeView, setActiveView] = useState('menu');

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
                setSettings(docSnap.data());
            } else {
                setDoc(settingsDocRef, defaultSettings).then(() => setSettings(defaultSettings));
            }
            setLoading(false);
        }, () => setLoading(false));

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubPeriods = onSnapshot(periodsColRef, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setPeriods(data.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate)));
        });
        return () => { unsubSettings(); unsubPeriods(); };
    }, [context, defaultSettings]);

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

    const exportToCsv = async (collectionName, filename) => {
        // ... (código de exportação pode permanecer o mesmo)
    };

    const importFromCsv = async (collectionName, event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const lines = e.target.result.split('\n').filter(line => line.trim() !== '');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').replace(/\s+/g, '_').toLowerCase());
            
            let createdCount = 0;
            const batch = writeBatch(db);
            const associatesSnap = await getDocs(collection(db, getCollectionPath('associates', userId)));
            const associatesMap = new Map(associatesSnap.docs.map(d => [String(d.data().sequentialId), d.id]));
            const periodsSnap = await getDocs(collection(db, getCollectionPath('periods', userId)));
            const periodsMap = new Map(periodsSnap.docs.map(d => [d.data().code, {id: d.id, ...d.data()}]));
            const sortedPeriods = [...periodsMap.values()].sort((a,b) => new Date(a.readingDate) - new Date(b.readingDate));

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                if (values.length !== headers.length) continue;

                let rowObject = {};
                headers.forEach((header, index) => {
                    let value = values[index];
                    if (!isNaN(value) && value.trim() !== '') rowObject[header] = parseFloat(value);
                    else rowObject[header] = value;
                });

                if (collectionName === 'readings') {
                    const associateId = associatesMap.get(String(rowObject.sequentialid));
                    const currentPeriod = periodsMap.get(rowObject.periodocode);
                    const currentReadingValue = rowObject.leitura_atual ?? 0;

                    if (!associateId || !currentPeriod) continue;

                    let previousReadingValue;
                    if (rowObject.leitura_anterior !== undefined && !isNaN(rowObject.leitura_anterior)) {
                        previousReadingValue = rowObject.leitura_anterior;
                    } else {
                        const periodIndex = sortedPeriods.findIndex(p => p.id === currentPeriod.id);
                        const previousPeriod = periodIndex > 0 ? sortedPeriods[periodIndex - 1] : null;
                        if (previousPeriod) {
                            const q = query(collection(db, getCollectionPath('readings', userId)), where('associateId', '==', associateId), where('periodId', '==', previousPeriod.id));
                            const prevReadingSnap = await getDocs(q);
                            previousReadingValue = prevReadingSnap.empty ? 0 : prevReadingSnap.docs[0].data().currentReading;
                        } else {
                            previousReadingValue = 0;
                        }
                    }
                    
                    const newReading = {
                        associateId: associateId,
                        periodId: currentPeriod.id,
                        date: currentPeriod.readingDate, 
                        currentReading: currentReadingValue,
                        previousReading: previousReadingValue,
                        consumption: currentReadingValue - previousReadingValue
                    };
                    
                    batch.set(doc(collection(db, getCollectionPath('readings', userId))), newReading);
                    createdCount++;
                }
            }
            
            await batch.commit();
            setModalContent({ title: 'Importação Concluída', message: `${createdCount} registros criados.` });
            setShowModal(true);
        };
        reader.readAsText(file, 'UTF-8');
        event.target.value = '';
    };
    
    const downloadCsvTemplate = (collectionName) => {
        const templates = { 
            associates: ['sequentialId', 'name', 'address', 'contact', 'documentNumber', 'type', 'region', 'generalHydrometerId', 'isActive', 'observations'], 
            readings: ['sequentialId', 'periodoCode', 'leitura_atual', 'leitura_anterior'],
            periods: ['readingDate']
        };
        const headers = templates[collectionName];
        if (!headers) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([headers.join(',') + '\n'], { type: 'text/csv;charset=utf-8;' }));
        link.setAttribute('download', `${collectionName}_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderMenu = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Button onClick={() => setActiveView('tariffs')} variant="secondary" className="p-6 text-lg">Ajustar Tarifas</Button>
            <Button onClick={() => setActiveView('periods')} variant="secondary" className="p-6 text-lg">Gerenciar Períodos</Button>
            <Button onClick={() => setActiveView('regions')} variant="secondary" className="p-6 text-lg">Gerenciar Regiões</Button>
            <Button onClick={() => setActiveView('hydrometers')} variant="secondary" className="p-6 text-lg">Gerenciar Hidrômetros</Button>
            <Button onClick={() => setActiveView('importExport')} variant="secondary" className="p-6 text-lg md:col-span-2">Importar / Exportar Dados</Button>
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
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Período Faturamento</th>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Vencimento</th>
                                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periods.map(p => (
                                        <tr key={p.id} className="border-b">
                                            <td className="py-2 px-3">{p.billingPeriodName}</td>
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
            
            {/* Outras seções como 'tariffs', 'regions', etc. podem ser adicionadas aqui */}

            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Settings;