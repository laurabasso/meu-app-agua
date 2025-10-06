import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import LabeledInput from './LabeledInput';
import Button from './Button';
import ReadingsFilterModal from './ReadingsFilterModal';

// Componente para o ícone de ordenação
const SortIcon = ({ direction }) => {
    if (!direction) return null;
    return direction === 'ascending' ? ' ▲' : ' ▼';
};

const Readings = () => {
    const navigate = useNavigate();
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

    const [filter, setFilter] = useState({ 
        status: 'active', 
        region: 'all', 
        generalHydrometerId: 'all' 
    });
    const [isFilterModalOpen, setFilterModalOpen] = useState(false);
    const [filterOptions, setFilterOptions] = useState({ regions: [], generalHydrometers: [] });

    const [sortConfig, setSortConfig] = useState({ key: 'sequentialId', direction: 'ascending' });
    const [selectedAssociates, setSelectedAssociates] = useState(new Set());


    useEffect(() => {
        if (!context || !context.userId) return;
        
        const { db, getCollectionPath, userId } = context;

        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('associates', userId)), (snapshot) => {
                setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), (snapshot) => {
                const periodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                    .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
                setPeriods(periodsData);
                if (periodsData.length > 0 && !selectedPeriodId) {
                    setSelectedPeriodId(periodsData[0].id);
                }
            }),
            onSnapshot(collection(db, getCollectionPath('readings', userId)), (snapshot) => {
                setReadings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }),
            onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setFilterOptions({
                        regions: data.regions || [],
                        generalHydrometers: data.generalHydrometers || [],
                    });
                    setSettings(data);
                }
            })
        ];

        return () => unsubscribes.forEach(unsub => unsub());
    }, [context, selectedPeriodId]);

    const sortedAndFilteredAssociates = useMemo(() => {
        let filtered = [...associates];

        filtered = filtered.filter(a => {
            const name = a.name || '';
            const seqId = a.sequentialId || '';
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || String(seqId).includes(searchTerm);
            const matchesStatus = filter.status === 'all' || (filter.status === 'active' ? a.isActive : !a.isActive);
            const matchesRegion = filter.region === 'all' || a.region === filter.region;
            const matchesHydrometer = filter.generalHydrometerId === 'all' || a.generalHydrometerId === filter.generalHydrometerId;
            return matchesSearch && matchesStatus && matchesRegion && matchesHydrometer;
        });

        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                
                if (valA < valB) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (valA > valB) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filtered;

    }, [associates, searchTerm, filter, sortConfig]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }
    
    const { db, getCollectionPath, userId, currentUser, formatDate } = context;

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const calculateAmountDue = (consumption, associate) => {
        if (!settings || !settings.tariffs || !associate) {
            return 0;
        }

        const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'];
        if (!tariff) {
            return 0;
        }

        const {
            standardMeters = 0,
            fixedFee = 0,
            excessTariff = 0
        } = tariff;

        let amount = fixedFee;

        if (consumption > standardMeters) {
            const excessConsumption = consumption - standardMeters;
            amount += excessConsumption * excessTariff;
        }
        
        if (associate.type === 'Outro' && consumption === 0) {
            return 0;
        }

        return amount;
    };

    // **INÍCIO DA CORREÇÃO**
    const getReadingsForAssociate = (associateId, periodId) => {
        if (!periodId) {
            return {
                currentReading: null,
                previousReading: 0,
                consumption: 0,
                currentReadingDoc: null,
            };
        }

        const periodIndex = periods.findIndex(p => p.id === periodId);
        const previousPeriod = periodIndex > -1 && periods[periodIndex + 1] ? periods[periodIndex + 1] : null;

        const prevReadingDoc = previousPeriod
            ? readings.find(r => r.associateId === associateId && r.periodId === previousPeriod.id)
            : null;
        
        // Garante que o valor seja sempre um número, tratando casos de null ou undefined.
        const prevReadingValue = Number(prevReadingDoc?.currentReading) || 0;
        
        const currentReadingDoc = readings.find(r => r.associateId === associateId && r.periodId === periodId);
        // Garante que o valor seja sempre um número.
        const currReadingValue = Number(currentReadingDoc?.currentReading) || 0;
        
        let consumption = 0;
        if (currentReadingDoc) {
            if (currentReadingDoc.isReset) {
                consumption = currReadingValue;
            } else {
                consumption = currReadingValue - prevReadingValue;
            }
        }

        return {
            currentReading: currentReadingDoc ? currentReadingDoc.currentReading : null,
            previousReading: prevReadingValue,
            currentReadingDoc,
            consumption
        };
    };
    // **FIM DA CORREÇÃO**

    const createOrUpdateInvoice = async (batch, readingData) => {
        const associate = associates.find(a => a.id === readingData.associateId);
        const period = periods.find(p => p.id === readingData.periodId);

        if (!associate || !period) {
            return;
        }

        const amountDue = calculateAmountDue(readingData.consumption, associate);

        const invoiceData = {
            associateId: readingData.associateId,
            periodId: readingData.periodId,
            period: period.billingPeriodName,
            consumption: readingData.consumption,
            amountDue: parseFloat(amountDue.toFixed(2)),
            invoiceDate: new Date().toISOString().split('T')[0],
            previousReadingValue: readingData.previousReading,
            latestReadingId: readingData.id,
        };

        const invoicesRef = collection(db, getCollectionPath('invoices', userId));
        const q = query(invoicesRef, where("associateId", "==", readingData.associateId), where("periodId", "==", readingData.periodId));
        const existingInvoices = await getDocs(q);

        if (existingInvoices.empty) {
            const newInvoiceRef = doc(invoicesRef);
            batch.set(newInvoiceRef, { ...invoiceData, status: 'Pendente' });
        } else {
            const invoiceDocRef = doc(db, getCollectionPath('invoices', userId), existingInvoices.docs[0].id);
            batch.set(invoiceDocRef, invoiceData, { merge: true });
        }
    };

    const handleSaveReading = async (associateId) => {
        const value = editableReadings[associateId];
        if (value === undefined || value === '' || !selectedPeriodId) {
            return;
        }

        const { currentReadingDoc, previousReading } = getReadingsForAssociate(associateId, selectedPeriodId);
        const parsedValue = parseFloat(value);
        
        if (isNaN(parsedValue) || (parsedValue < previousReading && !currentReadingDoc?.isReset)) {
            setModalContent({
                title: 'Leitura Inválida',
                message: 'A leitura atual não pode ser menor que a anterior.',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const consumption = currentReadingDoc?.isReset ? parsedValue : parsedValue - previousReading;
        
        const readingData = {
            associateId,
            periodId: selectedPeriodId,
            date: new Date().toISOString().split('T')[0],
            currentReading: parsedValue,
            previousReading,
            consumption,
        };
        
        const batch = writeBatch(db);
        let savedReadingId;
        
        if (currentReadingDoc) {
            const readingRef = doc(db, getCollectionPath('readings', userId), currentReadingDoc.id);
            batch.update(readingRef, readingData);
            savedReadingId = currentReadingDoc.id;
        } else {
            const newReadingRef = doc(collection(db, getCollectionPath('readings', userId)));
            batch.set(newReadingRef, readingData);
            savedReadingId = newReadingRef.id;
        }
        
        await createOrUpdateInvoice(batch, { ...readingData, id: savedReadingId });
        await batch.commit();
        
        setEditableReadings(prev => {
            const newEditable = { ...prev };
            delete newEditable[associateId];
            return newEditable;
        });
        
        const associateName = associates.find(a => a.id === associateId)?.name || 'Associado';
        setSuccessMessage(`Leitura de ${associateName} salva com sucesso!`);
        setTimeout(() => setSuccessMessage(''), 2500);
    };
    
    const handleToggleSelect = (associateId) => {
        setSelectedAssociates(prev => {
            const newSet = new Set(prev);
            if (newSet.has(associateId)) {
                newSet.delete(associateId);
            } else {
                newSet.add(associateId);
            }
            return newSet;
        });
    };

    const handleToggleSelectAll = () => {
        if (selectedAssociates.size === sortedAndFilteredAssociates.length) {
            setSelectedAssociates(new Set());
        } else {
            setSelectedAssociates(new Set(sortedAndFilteredAssociates.map(a => a.id)));
        }
    };

    const handleBulkResetBaseline = () => {
        const selectedCount = selectedAssociates.size;
        if (selectedCount === 0) return;

        setModalContent({
            title: 'Confirmar Reinício de Contagem',
            message: `Você confirma que deseja reiniciar a contagem para os ${selectedCount} associados selecionados? A leitura anterior para o período atual será definida como 0. O histórico de consumo e faturas não será alterado.`,
            type: 'confirm',
            onConfirm: async () => {
                setShowModal(false);
                const batch = writeBatch(db);
                let successCount = 0;

                for (const assocId of selectedAssociates) {
                    const { currentReadingDoc, currentReading } = getReadingsForAssociate(assocId, selectedPeriodId);
                    
                    const readingValue = editableReadings[assocId] !== undefined ? parseFloat(editableReadings[assocId]) : currentReading || 0;
                    
                    const resetLog = {
                        resetDate: new Date().toISOString(),
                        user: currentUser?.uid || 'unknown'
                    };

                    const readingData = {
                        associateId: assocId,
                        periodId: selectedPeriodId,
                        date: new Date().toISOString().split('T')[0],
                        currentReading: readingValue,
                        previousReading: 0,
                        consumption: readingValue,
                        isReset: true,
                        resetLog: resetLog
                    };
                    
                    if (currentReadingDoc) {
                        const readingRef = doc(db, getCollectionPath('readings', userId), currentReadingDoc.id);
                        batch.update(readingRef, readingData);
                    } else {
                        const newReadingRef = doc(collection(db, getCollectionPath('readings', userId)));
                        batch.set(newReadingRef, readingData);
                    }

                    const logRef = doc(collection(db, getCollectionPath('baselineResetLogs', userId)));
                    batch.set(logRef, {
                        associateId: assocId,
                        periodId: selectedPeriodId,
                        ...resetLog
                    });
                    
                    successCount++;
                }

                await batch.commit();
                setSuccessMessage(`${successCount} contagens foram reiniciadas com sucesso!`);
                setSelectedAssociates(new Set());
                setTimeout(() => setSuccessMessage(''), 3000);
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    const SortableHeader = ({ children, sortKey }) => (
        <th className="py-3 px-4 text-left cursor-pointer hover:bg-gray-200" onClick={() => requestSort(sortKey)}>
            {children}
            {sortConfig.key === sortKey ? <SortIcon direction={sortConfig.direction} /> : null}
        </th>
    );

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Lançar Leituras</h2>

            {successMessage && (
                <div className="bg-green-100 text-green-800 p-3 mb-4 rounded-lg text-center">
                    {successMessage}
                </div>
            )}
            
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <input
                    type="text"
                    placeholder="Buscar associado..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full p-3 border rounded-lg"
                />
                <select 
                    value={selectedPeriodId} 
                    onChange={e => setSelectedPeriodId(e.target.value)}
                    className="w-full md:w-1/3 p-3 border rounded-lg"
                >
                    <option value="">Selecione um Período</option>
                    {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                </select>
                <Button onClick={() => setFilterModalOpen(true)} variant="secondary">Filtros Avançados</Button>
            </div>
            
            <div className="flex items-center gap-4 mb-4 p-2 bg-gray-50 rounded-lg">
                <div className="relative group">
                     <Button 
                        onClick={handleBulkResetBaseline} 
                        variant="primary" 
                        disabled={selectedAssociates.size === 0}
                    >
                        Ações para {selectedAssociates.size} selecionados
                    </Button>
                     {selectedAssociates.size > 0 && (
                        <div className="absolute bottom-full mb-2 w-64 bg-gray-800 text-white text-xs rounded py-1 px-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            Reiniciar Contagem (Troca de Hidrômetro)
                        </div>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                        <tr>
                             <th className="py-3 px-4">
                                <input
                                    type="checkbox"
                                    onChange={handleToggleSelectAll}
                                    checked={selectedAssociates.size === sortedAndFilteredAssociates.length && sortedAndFilteredAssociates.length > 0}
                                />
                            </th>
                            <SortableHeader sortKey="sequentialId">ID</SortableHeader>
                            <SortableHeader sortKey="name">Nome</SortableHeader>
                            <SortableHeader sortKey="generalHydrometerId">Hidrômetro</SortableHeader>
                            <th className="py-3 px-4 text-left">Leitura Anterior</th>
                            <th className="py-3 px-4 text-left">Leitura Atual</th>
                            <th className="py-3 px-4 text-left">Consumo</th>
                            <th className="py-3 px-4 text-left">Valor da Fatura (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedAndFilteredAssociates.map(assoc => {
                            const { currentReading, previousReading, consumption, currentReadingDoc } = getReadingsForAssociate(assoc.id, selectedPeriodId);
                            const invoiceAmount = calculateAmountDue(consumption, assoc);
                            return (
                                <tr key={assoc.id} className={`border-b transition-colors ${selectedAssociates.has(assoc.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                     <td className="py-3 px-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedAssociates.has(assoc.id)}
                                            onChange={() => handleToggleSelect(assoc.id)}
                                        />
                                    </td>
                                    <td className="py-3 px-4">{assoc.sequentialId}</td>
                                    
                                    <td className="py-3 px-4 font-semibold hover:underline cursor-pointer" onClick={() => navigate(`/associados/detalhes/${assoc.id}`)}>{assoc.name}</td>
                                    
                                    <td className="py-3 px-4 text-sm text-gray-600">{assoc.generalHydrometerId}</td>
                                    <td className="py-3 px-4">
                                        {previousReading.toFixed(2)} m³
                                        {currentReadingDoc?.isReset && (
                                            <span className="text-blue-500 text-xs" title={`Contagem reiniciada em ${formatDate(currentReadingDoc?.resetLog?.resetDate)}`}>
                                                🔄
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4">
                                        <LabeledInput
                                            type="number"
                                            step="0.01"
                                            value={editableReadings[assoc.id] !== undefined ? editableReadings[assoc.id] : (currentReading !== null ? currentReading : '')}
                                            onChange={(e) => setEditableReadings(prev => ({ ...prev, [assoc.id]: e.target.value }))}
                                            onBlur={() => handleSaveReading(assoc.id)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveReading(assoc.id)}
                                            className="w-28"
                                            placeholder="0.00"
                                        />
                                    </td>
                                    <td className="py-3 px-4 font-semibold">{consumption.toFixed(2)} m³</td>
                                    <td className="py-3 px-4 font-bold text-blue-600">{consumption >= 0 ? `R$ ${invoiceAmount.toFixed(2)}` : 'Inválido'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {isFilterModalOpen && (
                <ReadingsFilterModal
                    filter={filter}
                    onFilterChange={setFilter}
                    onClose={() => setFilterModalOpen(false)}
                    options={filterOptions}
                />
            )}
            
            <Modal {...modalContent} show={showModal} onConfirm={modalContent.onConfirm || (() => setShowModal(false))} onCancel={modalContent.onCancel} />
        </div>
    );
};

export default Readings;