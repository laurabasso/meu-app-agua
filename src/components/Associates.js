import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Button from './Button';
import AssociatesFilterModal from './AssociatesFilterModal';
import Modal from './Modal';

const SortIcon = ({ direction }) => {
    if (!direction) return null;
    return direction === 'ascending' ? ' ▲' : ' ▼';
};

const Associates = () => {
    const navigate = useNavigate();
    const context = useAppContext();
    const [associates, setAssociates] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState({ status: 'all', region: 'all', generalHydrometerId: 'all', type: 'all' });
    const [isFilterModalOpen, setFilterModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [showModal, setShowModal] = useState(false);
    const [filterOptions, setFilterOptions] = useState({ regions: [], generalHydrometers: [] });
    const [sortConfig, setSortConfig] = useState({ key: 'sequentialId', direction: 'ascending' });

    useEffect(() => {
        if (!context || !context.userId) return;

        const { db, getCollectionPath, userId } = context;

        const unsubAssociates = onSnapshot(collection(db, getCollectionPath('associates', userId)), (snapshot) => {
            setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        }, (error) => {
            console.error("Erro ao buscar associados:", error);
            setIsLoading(false);
        });

        const unsubSettings = onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data();
                setFilterOptions({
                    regions: settings.regions || [],
                    generalHydrometers: settings.generalHydrometers || [],
                });
            }
        });

        return () => { 
            unsubAssociates(); 
            unsubSettings(); 
        };
    }, [context]);

    const sortedAndFilteredAssociates = useMemo(() => {
        if (isLoading) return [];
        let filtered = [...associates];
        filtered = filtered.filter(assoc => {
            const name = assoc.name || '';
            const seqId = assoc.sequentialId || '';
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || String(seqId).includes(searchTerm);
            const matchesStatus = filter.status === 'all' || (filter.status === 'active' ? assoc.isActive : !assoc.isActive);
            const matchesRegion = filter.region === 'all' || assoc.region === filter.region;
            const matchesHydrometer = filter.generalHydrometerId === 'all' || assoc.generalHydrometerId === filter.generalHydrometerId;
            const matchesType = filter.type === 'all' || assoc.type === filter.type;
            return matchesSearch && matchesStatus && matchesRegion && matchesHydrometer && matchesType;
        });
        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [associates, searchTerm, filter, sortConfig, isLoading]);
    
    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Aguardando contexto do utilizador...</div>;
    }
    
    const { db, getCollectionPath, userId } = context;

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const handleDeleteAssociate = async (associateId) => {
        const readingsQuery = query(collection(db, getCollectionPath('readings', userId)), where('associateId', '==', associateId));
        const invoicesQuery = query(collection(db, getCollectionPath('invoices', userId)), where('associateId', '==', associateId));
        if (!(await getDocs(readingsQuery)).empty || !(await getDocs(invoicesQuery)).empty) {
            setModalContent({ title: 'Exclusão Bloqueada', message: 'Este associado possui leituras ou faturas e não pode ser excluído.' });
            setShowModal(true); return;
        }
        setModalContent({
            title: 'Confirmar Exclusão', message: 'Tem certeza que deseja excluir este associado?', type: 'confirm',
            onConfirm: async () => {
                await deleteDoc(doc(db, getCollectionPath('associates', userId), associateId));
                setShowModal(false);
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
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Associados</h2>
                <Button onClick={() => navigate('/associados/novo')} variant="primary">Adicionar Associado</Button>
            </div>
             {isLoading ? (
                <div className="text-center p-10 font-semibold">A carregar dados dos associados...</div>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <input type="text" placeholder="Buscar por nome ou ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-3 border rounded-lg" />
                        <Button onClick={() => setFilterModalOpen(true)} variant="secondary">Filtros Avançados</Button>
                    </div>
                    <div className="overflow-x-auto rounded-xl shadow-md">
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-100">
                                <tr>
                                    <SortableHeader sortKey="sequentialId">ID</SortableHeader>
                                    <SortableHeader sortKey="name">Nome</SortableHeader>
                                    <SortableHeader sortKey="region">Região</SortableHeader>
                                    <SortableHeader sortKey="generalHydrometerId">Hidrômetro</SortableHeader>
                                    <SortableHeader sortKey="type">Tipo</SortableHeader>
                                    <SortableHeader sortKey="isActive">Status</SortableHeader>
                                    <th className="py-3 px-4 text-left">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAndFilteredAssociates.map(assoc => (
                                    <tr key={assoc.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4">{assoc.sequentialId}</td>
                                        <td className="py-3 px-4 font-semibold">{assoc.name}</td>
                                        <td className="py-3 px-4">{assoc.region}</td>
                                        <td className="py-3 px-4 text-sm text-gray-600">{assoc.generalHydrometerId}</td>
                                        <td className="py-3 px-4">{assoc.type}</td>
                                        <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${assoc.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{assoc.isActive ? 'Ativo' : 'Inativo'}</span></td>
                                        <td className="py-3 px-4 space-x-2 whitespace-nowrap">
                                            <Button onClick={() => navigate(`/associados/detalhes/${assoc.id}`)} size="xs" variant="info">Ver</Button>
                                            <Button onClick={() => navigate(`/associados/editar/${assoc.id}`)} size="xs" variant="secondary">Editar</Button>
                                            <Button onClick={() => handleDeleteAssociate(assoc.id)} size="xs" variant="danger">Excluir</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {isFilterModalOpen && <AssociatesFilterModal filter={filter} onFilterChange={setFilter} onClose={() => setFilterModalOpen(false)} options={filterOptions} />}
            <Modal {...modalContent} show={showModal} onConfirm={modalContent.onConfirm} onCancel={() => setShowModal(false)} />
        </div>
    );
};

export default Associates;