import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Button from './Button';
import Modal from './Modal';
import AssociatesFilterModal from './AssociatesFilterModal';

const Associates = () => {
    const navigate = useNavigate();
    const context = useAppContext();
    const [associates, setAssociates] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [associateToDelete, setAssociateToDelete] = useState(null);
    const [isFilterModalOpen, setFilterModalOpen] = useState(false);
    const [filter, setFilter] = useState({
        status: 'all',
        region: 'all',
        generalHydrometerId: 'all',
        type: 'all'
    });
    const [sortConfig, setSortConfig] = useState({ key: 'sequentialId', direction: 'ascending' });

    useEffect(() => {
        if (!context || !context.userId) return;
        const { db, getCollectionPath, userId } = context;

        const unsubAssociates = onSnapshot(collection(db, getCollectionPath('associates', userId)), (snapshot) => {
            setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        const unsubSettings = onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), (docSnap) => {
            if (docSnap.exists()) {
                setSettings(docSnap.data());
            }
        });

        return () => {
            unsubAssociates();
            unsubSettings();
        };
    }, [context]);

    const sortedAndFilteredAssociates = useMemo(() => {
        return associates.filter(a => {
            const name = a.name || '';
            const seqId = a.sequentialId || '';
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || String(seqId).includes(searchTerm);
            const matchesStatus = filter.status === 'all' || (filter.status === 'active' ? a.isActive : !a.isActive);
            const matchesRegion = filter.region === 'all' || a.region === filter.region;
            const matchesHydrometer = filter.generalHydrometerId === 'all' || a.generalHydrometerId === filter.generalHydrometerId;
            const matchesType = filter.type === 'all' || a.type === filter.type;
            return matchesSearch && matchesStatus && matchesRegion && matchesHydrometer && matchesType;
        }).sort((a, b) => {
            if (!sortConfig.key) return 0;
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }, [associates, searchTerm, filter, sortConfig]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Aguardando contexto do utilizador...</div>;
    }

    const { db, getCollectionPath, userId } = context;

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const confirmDelete = (associate) => {
        setAssociateToDelete(associate);
        setShowDeleteModal(true);
    };

    const handleDelete = async () => {
        if (associateToDelete) {
            await deleteDoc(doc(db, getCollectionPath('associates', userId), associateToDelete.id));
            setShowDeleteModal(false);
            setAssociateToDelete(null);
        }
    };

    const SortableHeader = ({ children, sortKey }) => (
        <th className="py-3 px-4 text-left cursor-pointer hover:bg-gray-200" onClick={() => requestSort(sortKey)}>
            {children} {sortConfig.key === sortKey && (sortConfig.direction === 'ascending' ? '▲' : '▼')}
        </th>
    );

    if (loading) {
        return <div className="text-center p-10">A carregar associados...</div>;
    }

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800">Associados</h2>
                <div className="flex gap-4">
                    <Button onClick={() => setFilterModalOpen(true)} variant="secondary">Filtros Avançados</Button>
                    <Button onClick={() => navigate('/associados/novo')} variant="primary">Adicionar Novo</Button>
                </div>
            </div>
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Buscar por nome ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-3 border rounded-lg"
                />
            </div>
            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                        <tr>
                            <SortableHeader sortKey="sequentialId">ID</SortableHeader>
                            <SortableHeader sortKey="name">Nome</SortableHeader>
                            <SortableHeader sortKey="region">Região</SortableHeader>
                            <th className="py-3 px-4 text-left">Status</th>
                            <th className="py-3 px-4 text-left">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedAndFilteredAssociates.map(assoc => (
                            <tr key={assoc.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{assoc.sequentialId}</td>
                                <td className="py-3 px-4 font-semibold">{assoc.name}</td>
                                <td className="py-3 px-4">{assoc.region}</td>
                                <td className={`py-3 px-4 font-semibold ${assoc.isActive ? 'text-green-600' : 'text-red-500'}`}>
                                    {assoc.isActive ? 'Ativo' : 'Inativo'}
                                </td>
                                <td className="py-3 px-4 space-x-2 whitespace-nowrap">
                                    <Button onClick={() => navigate(`/associados/detalhes/${assoc.id}`)} variant="outline" size="xs">Detalhes</Button>
                                    <Button onClick={() => navigate(`/associados/editar/${assoc.id}`)} variant="secondary" size="xs">Editar</Button>
                                    <Button onClick={() => confirmDelete(assoc)} variant="danger" size="xs">Excluir</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isFilterModalOpen && (
                <AssociatesFilterModal
                    filter={filter}
                    onFilterChange={setFilter}
                    onClose={() => setFilterModalOpen(false)}
                    options={{
                        regions: settings?.regions || [],
                        generalHydrometers: settings?.generalHydrometers || []
                    }}
                />
            )}
            <Modal
                show={showDeleteModal}
                title="Confirmar Exclusão"
                message={`Tem a certeza de que deseja excluir "${associateToDelete?.name}"? Esta ação não pode ser desfeita.`}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteModal(false)}
                type="danger"
            />
        </div>
    );
};

export default Associates;