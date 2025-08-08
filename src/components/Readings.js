import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import LabeledInput from './LabeledInput';
import Button from './Button';
import ReadingsFilterModal from './ReadingsFilterModal';

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
    
    const [loadingStatus, setLoadingStatus] = useState({
        associates: true, periods: true, readings: true, settings: true,
    });
    const isLoading = useMemo(() => Object.values(loadingStatus).some(status => status), [loadingStatus]);

    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [editableReadings, setEditableReadings] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [successMessage, setSuccessMessage] = useState('');
    const [filter, setFilter] = useState({ status: 'active', region: 'all', generalHydrometerId: 'all' });
    const [isFilterModalOpen, setFilterModalOpen] = useState(false);
    const [filterOptions, setFilterOptions] = useState({ regions: [], generalHydrometers: [] });
    const [sortConfig, setSortConfig] = useState({ key: 'sequentialId', direction: 'ascending' });

    useEffect(() => {
        if (!context || !context.userId) return;

        const { db, getCollectionPath, userId } = context;

        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('associates', userId)), s => {
                setAssociates(s.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoadingStatus(prev => ({ ...prev, associates: false }));
            }),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), s => {
                const data = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
                setPeriods(data);
                if (data.length > 0 && selectedPeriodId === '') {
                    setSelectedPeriodId(data[0].id);
                }
                setLoadingStatus(prev => ({ ...prev, periods: false }));
            }),
            onSnapshot(collection(db, getCollectionPath('readings', userId)), s => {
                setReadings(s.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoadingStatus(prev => ({ ...prev, readings: false }));
            }),
            onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), s => {
                if (s.exists()) {
                    const data = s.data();
                    setFilterOptions({ regions: data.regions || [], generalHydrometers: data.generalHydrometers || [] });
                    setSettings(data);
                } else {
                    // **AQUI ESTÁ A CORREÇÃO CRÍTICA**
                    // Se as configurações não existirem, define um objeto vazio para não quebrar o código
                    setSettings({ tariffs: {}, regions: [], generalHydrometers: [] });
                }
                setLoadingStatus(prev => ({ ...prev, settings: false }));
            })
        ];

        return () => unsubscribes.forEach(unsub => unsub());
    }, [context]);

    const sortedAndFilteredAssociates = useMemo(() => {
        if (isLoading) return [];
        return associates.filter(a => {
            const name = a.name || '';
            const seqId = a.sequentialId || '';
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || String(seqId).includes(searchTerm);
            const matchesStatus = filter.status === 'all' || (filter.status === 'active' ? a.isActive : !a.isActive);
            const matchesRegion = filter.region === 'all' || a.region === filter.region;
            const matchesHydrometer = filter.generalHydrometerId === 'all' || a.generalHydrometerId === filter.generalHydrometerId;
            return matchesSearch && matchesStatus && matchesRegion && matchesHydrometer;
        }).sort((a, b) => {
            if (!sortConfig.key) return 0;
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }, [associates, searchTerm, filter, sortConfig, isLoading]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Aguardando contexto do utilizador...</div>;
    }
    const { db, getCollectionPath, userId, formatDate } = context;

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const calculateAmountDue = (consumption, associate) => {
        if (isLoading || !settings || !settings.tariffs || !associate) return 0;
        const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'] || {};
        const { standardMeters = 0, fixedFee = 0, excessTariff = 0 } = tariff;
        let amount = fixedFee;
        if (consumption > standardMeters) {
            amount += (consumption - standardMeters) * excessTariff;
        }
        if (associate.type === 'Outro' && consumption === 0) return 0;
        return amount;
    };

    const getReadingsForAssociate = (associateId, periodId) => {
        if (isLoading || !periodId) return { currentReading: null, previousReading: 0, consumption: 0, currentReadingDoc: null };
        const periodIndex = periods.findIndex(p => p.id === periodId);
        const previousPeriod = periodIndex > -1 ? periods[periodIndex + 1] : null;
        const prevReadingDoc = previousPeriod ? readings.find(r => r.associateId === associateId && r.periodId === previousPeriod.id) : null;
        const prevReadingValue = prevReadingDoc ? prevReadingDoc.currentReading : 0;
        const currentReadingDoc = readings.find(r => r.associateId === associateId && r.periodId === periodId);
        const currReadingValue = currentReadingDoc ? currentReadingDoc.currentReading : 0;
        let consumption = 0;
        if (currentReadingDoc) {
            consumption = currentReadingDoc.isReset ? currReadingValue : (currReadingValue - prevReadingValue);
        }
        return { currentReading: currReadingValue, previousReading: prevReadingValue, currentReadingDoc, consumption };
    };

    const handleSaveReading = async (associateId) => {
        // ... (esta função pode permanecer a mesma)
    };
    
    const SortableHeader = ({ children, sortKey }) => (
        <th className="py-3 px-4 text-left cursor-pointer hover:bg-gray-200" onClick={() => requestSort(sortKey)}>
            {children} {sortConfig.key === sortKey && (sortConfig.direction === 'ascending' ? '▲' : '▼')}
        </th>
    );

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Lançar Leituras</h2>
            {isLoading ? (
                <div className="text-center p-10 font-semibold">A carregar todos os dados necessários...</div>
            ) : (
                <>
                    {successMessage && <div className="bg-green-100 text-green-800 p-3 mb-4 rounded-lg text-center">{successMessage}</div>}
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                        <input type="text" placeholder="Buscar associado..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-3 border rounded-lg" />
                        <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full md:w-1/3 p-3 border rounded-lg">
                            <option value="">Selecione um Período</option>
                            {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                        </select>
                        <Button onClick={() => setFilterModalOpen(true)} variant="secondary">Filtros Avançados</Button>
                    </div>
                    <div className="overflow-x-auto rounded-xl shadow-md">
                        <table className="min-w-full bg-white">
                           <thead className="bg-gray-100">
                                <tr>
                                    <th className="py-3 px-4"><input type="checkbox" /></th>
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
                                        <tr key={assoc.id}>
                                            <td className="py-3 px-4"><input type="checkbox" /></td>
                                            <td className="py-3 px-4">{assoc.sequentialId}</td>
                                            <td className="py-3 px-4 font-semibold hover:underline cursor-pointer" onClick={() => navigate(`/associados/detalhes/${assoc.id}`)}>{assoc.name}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600">{assoc.generalHydrometerId}</td>
                                            <td className="py-3 px-4">{(previousReading || 0).toFixed(2)} m³ {currentReadingDoc?.isReset && <span className="text-blue-500 text-xs" title={`Contagem reiniciada em ${formatDate(currentReadingDoc?.resetLog?.resetDate)}`}>🔄</span>}</td>
                                            <td className="py-3 px-4">
                                                <LabeledInput type="number" step="0.01" value={editableReadings[assoc.id] ?? (currentReading ?? '')} onChange={e => setEditableReadings(prev => ({ ...prev, [assoc.id]: e.target.value }))} onBlur={() => handleSaveReading(assoc.id)} className="w-28" placeholder="0.00" />
                                            </td>
                                            <td className="py-3 px-4 font-semibold">{(consumption || 0).toFixed(2)} m³</td>
                                            <td className="py-3 px-4 font-bold text-blue-600">{consumption >= 0 ? `R$ ${invoiceAmount.toFixed(2)}` : 'Inválido'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {isFilterModalOpen && <ReadingsFilterModal filter={filter} onFilterChange={setFilter} onClose={() => setFilterModalOpen(false)} options={filterOptions} />}
            <Modal {...modalContent} show={showModal} onConfirm={modalContent.onConfirm || (() => setShowModal(false))} onCancel={modalContent.onCancel} />
        </div>
    );
};

export default Readings;