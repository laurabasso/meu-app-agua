import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

const Settings = () => {
    const context = useAppContext();
    const [settings, setSettings] = useState({ tariffs: {}, regions: [], generalHydrometers: [] });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [periods, setPeriods] = useState([]);
    const [newPeriodStartDate, setNewPeriodStartDate] = useState('');
    const [activeView, setActiveView] = useState('menu');

    useEffect(() => {
        if (!context || !context.userId) { setLoading(false); return; }
        const { db, getCollectionPath, userId } = context;
        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setSettings(prev => ({...prev, ...docSnap.data()}));
            }
            setLoading(false);
        });
        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubPeriods = onSnapshot(periodsColRef, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setPeriods(data.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate)));
        });
        return () => { unsubSettings(); unsubPeriods(); };
    }, [context]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }
    
    const { db, userId, getCollectionPath, formatDate } = context;

    const handleSaveSettings = async (sectionKey) => {
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, { [sectionKey]: settings[sectionKey] }, { merge: true });
            setModalContent({ title: 'Sucesso', message: 'Configurações salvas!' });
            setShowModal(true);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao salvar: ${e.message}` });
            setShowModal(true);
        }
    };
    
    const handleTariffChange = (type, field, value) => {
        setSettings(prev => ({ ...prev, tariffs: { ...prev.tariffs, [type]: { ...(prev.tariffs ? prev.tariffs[type] : {}), [field]: parseFloat(value) || 0 }}}));
    };

    const handleListChange = (section, value) => {
        setSettings(prev => ({ ...prev, [section]: value.split('\n').map(item => item.trim()).filter(Boolean) }));
    };

    const generatePeriodData = (readingDateInput) => {
        const [year, month] = readingDateInput.split('-').map(Number);
        const readingDate = new Date(year, month - 1, 1);
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const billingPeriodName = `Período de ${monthNames[month - 1]} a ${monthNames[month % 12]} de ${year}`;
        const code = `${String(month).padStart(2, '0')}/${year}`;
        const billingDueDate = new Date(year, month - 1, 15);
        const consumptionEndDate = new Date(year, month - 1, 0);
        const consumptionStartDate = new Date(consumptionEndDate.getFullYear(), consumptionEndDate.getMonth() - 1, 1);
        const consumptionPeriodName = `Leitura de ${monthNames[consumptionStartDate.getMonth()]} a ${monthNames[consumptionEndDate.getMonth()]} de ${consumptionStartDate.getFullYear()}`;
        return { code, billingPeriodName, billingDueDate: billingDueDate.toISOString().split('T')[0], readingDate: readingDate.toISOString().split('T')[0], consumptionPeriodName, consumptionStartDate: consumptionStartDate.toISOString().split('T')[0], consumptionEndDate: consumptionEndDate.toISOString().split('T')[0] };
    };

    const handleAddPeriod = async () => {
        if (!newPeriodStartDate) return;

        // MELHORIA: Validação para não permitir datas futuras.
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Zera o tempo para comparar apenas a data.

        // A data do input 'YYYY-MM-DD' é interpretada como UTC. Para evitar problemas de fuso horário na comparação,
        // criamos o objeto Date e ajustamos para o fuso local.
        const selectedDate = new Date(newPeriodStartDate);
        const userTimezoneOffset = selectedDate.getTimezoneOffset() * 60000;
        const localSelectedDate = new Date(selectedDate.getTime() + userTimezoneOffset);

        if (localSelectedDate > today) {
            setModalContent({ 
                title: 'Data Futura Inválida', 
                message: 'Não é permitido criar um período de faturamento para uma data de leitura que ainda não chegou.' 
            });
            setShowModal(true);
            return;
        }

        const periodData = generatePeriodData(newPeriodStartDate);
        const q = query(collection(db, getCollectionPath('periods', userId)), where('code', '==', periodData.code));
        if (!(await getDocs(q)).empty) {
            setModalContent({ title: 'Aviso', message: 'Este período já existe.' });
            setShowModal(true);
            return;
        }
        await addDoc(collection(db, getCollectionPath('periods', userId)), periodData);
        setNewPeriodStartDate('');
    };

    const handleDeletePeriod = async (periodId) => {
        await deleteDoc(doc(db, getCollectionPath('periods', userId), periodId));
    };

    const exportToCsv = async (collectionName, filename) => {
        const colRef = collection(db, getCollectionPath(collectionName, userId));
        const snapshot = await getDocs(colRef);
        if (snapshot.empty) {
            setModalContent({ title: 'Aviso', message: `Não há dados para exportar.` });
            setShowModal(true); return;
        }
        const data = snapshot.docs.map(doc => doc.data());
        const headers = Object.keys(data[0]);
        let csvContent = headers.join(',') + '\n';
        data.forEach(row => { csvContent += headers.map(header => `"${( '' + row[header]).replace(/"/g, '""')}"`).join(',') + '\n'; });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
        link.setAttribute('download', `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const importFromCsv = (collectionName, event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const lines = e.target.result.split('\n').filter(line => line.trim() !== '');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const colRef = collection(db, getCollectionPath(collectionName, userId));
            let importedCount = 0;
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                let rowObject = {};
                headers.forEach((header, index) => {
                    let value = values[index];
                    if (!isNaN(value) && value.trim() !== '') rowObject[header] = parseFloat(value);
                    else if (value.toLowerCase() === 'true') rowObject[header] = true;
                    else if (value.toLowerCase() === 'false') rowObject[header] = false;
                    else rowObject[header] = value;
                });
                if (collectionName === 'associates' && rowObject.sequentialId) {
                    const q = query(colRef, where('sequentialId', '==', rowObject.sequentialId));
                    if (!(await getDocs(q)).empty) continue;
                }
                await addDoc(colRef, rowObject);
                importedCount++;
            }
            setModalContent({ title: 'Sucesso', message: `${importedCount} registros importados.` });
            setShowModal(true);
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const downloadCsvTemplate = (collectionName) => {
        const templates = { associates: ['sequentialId', 'name', 'address', 'contact', 'documentNumber', 'type', 'region', 'generalHydrometerId', 'isActive', 'observations'], readings: ['associateId', 'periodId', 'date', 'currentReading', 'previousReading', 'consumption'] };
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

    if (loading) return <div className="text-center p-10">Carregando...</div>;

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 text-center mb-8">Configurações</h2>
            
            {activeView === 'menu' && renderMenu()}

            {activeView === 'tariffs' && renderSection('Ajustar Tarifas', (
                <div className="p-6 border rounded-xl bg-gray-50">
                    {settings.tariffs && Object.keys(settings.tariffs).map(type => (
                        <div key={type} className="mb-6 p-4 border rounded-xl bg-white">
                            <h4 className="text-lg font-bold text-gray-800 mb-3">{type}</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <LabeledInput label="Taxa Fixa (R$)" type="number" value={settings.tariffs[type]?.fixedFee || ''} onChange={e => handleTariffChange(type, 'fixedFee', e.target.value)} />
                                <LabeledInput label="Metros Padrão (m³)" type="number" value={settings.tariffs[type]?.standardMeters || ''} onChange={e => handleTariffChange(type, 'standardMeters', e.target.value)} />
                                <LabeledInput label="Consumo Livre (m³)" type="number" value={settings.tariffs[type]?.freeConsumption || ''} onChange={e => handleTariffChange(type, 'freeConsumption', e.target.value)} />
                                <LabeledInput label="Tarifa Excedente (R$/m³)" type="number" value={settings.tariffs[type]?.excessTariff || ''} onChange={e => handleTariffChange(type, 'excessTariff', e.target.value)} />
                            </div>
                        </div>
                    ))}
                    <Button onClick={() => handleSaveSettings('tariffs')} variant="primary" className="w-full">Salvar Tarifas</Button>
                </div>
            ))}

            {activeView === 'importExport' && renderSection('Importar / Exportar Dados', (
                <div className="p-6 border rounded-xl bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3"><h4 className="font-semibold text-gray-600">Exportar para CSV</h4><Button onClick={() => exportToCsv('associates', 'associados_export')} variant="secondary" className="w-full">Exportar Associados</Button><Button onClick={() => exportToCsv('readings', 'leituras_export')} variant="secondary" className="w-full">Exportar Leituras</Button><Button onClick={() => exportToCsv('invoices', 'faturas_export')} variant="secondary" className="w-full">Exportar Faturas</Button></div>
                        <div className="space-y-3"><h4 className="font-semibold text-gray-600">Importar de CSV</h4><div className="p-4 border rounded-lg bg-white"><label className="block text-sm font-medium text-gray-700 mb-2">Importar Associados</label><Button onClick={() => downloadCsvTemplate('associates')} size="xs" variant="info" className="mb-2">Baixar Modelo</Button><input type="file" accept=".csv" onChange={e => importFromCsv('associates', e)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/></div><div className="p-4 border rounded-lg bg-white"><label className="block text-sm font-medium text-gray-700 mb-2">Importar Leituras</label><Button onClick={() => downloadCsvTemplate('readings')} size="xs" variant="info" className="mb-2">Baixar Modelo</Button><input type="file" accept=".csv" onChange={e => importFromCsv('readings', e)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/></div></div>
                    </div>
                </div>
            ))}

            {activeView === 'regions' && renderSection('Gerenciar Regiões', (
                <div className="p-6 border rounded-xl bg-gray-50"><textarea value={(settings.regions || []).join('\n')} onChange={e => handleListChange('regions', e.target.value)} rows="5" className="w-full p-3 border rounded-lg" placeholder="Uma região por linha"></textarea><Button onClick={() => handleSaveSettings('regions')} variant="primary" className="w-full mt-4">Salvar Regiões</Button></div>
            ))}

            {activeView === 'hydrometers' && renderSection('Gerenciar Hidrômetros Gerais', (
                <div className="p-6 border rounded-xl bg-gray-50"><textarea value={(settings.generalHydrometers || []).join('\n')} onChange={e => handleListChange('generalHydrometers', e.target.value)} rows="5" className="w-full p-3 border rounded-lg" placeholder="Um hidrômetro por linha"></textarea><Button onClick={() => handleSaveSettings('generalHydrometers')} variant="primary" className="w-full mt-4">Salvar Hidrômetros</Button></div>
            ))}

            {activeView === 'periods' && renderSection('Gerenciar Períodos', (
                <div className="p-6 border rounded-xl bg-gray-50">
                    <div className="mb-6 p-4 border rounded-xl bg-white">
                        <h4 className="font-semibold mb-2">Adicionar Novo Período</h4>
                        <LabeledInput label="Data da Leitura (ex: 2024-07-01)" type="date" value={newPeriodStartDate} onChange={e => setNewPeriodStartDate(e.target.value)} />
                        <p className="text-xs text-gray-500 mt-1">A data selecionada não pode ser futura.</p>
                        <Button onClick={handleAddPeriod} variant="success" className="w-full mt-4">Adicionar</Button>
                    </div>
                    <div><h4 className="font-semibold mb-2">Períodos Existentes</h4>
                        <div className="overflow-x-auto rounded-xl shadow-md">
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-100"><tr>
                                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Período Faturamento</th>
                                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Período Consumo</th>
                                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Vencimento</th>
                                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase">Ações</th>
                                </tr></thead>
                                <tbody>{periods.map(p => (<tr key={p.id} className="border-b"><td className="py-2 px-3">{p.billingPeriodName}</td><td className="py-2 px-3">{p.consumptionPeriodName}</td><td className="py-2 px-3">{formatDate(p.billingDueDate)}</td><td className="py-2 px-3"><Button onClick={() => handleDeletePeriod(p.id)} variant="danger" size="xs">Excluir</Button></td></tr>))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ))}

            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Settings;
