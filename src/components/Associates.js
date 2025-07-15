import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Button from './Button';
import AssociatesFilterModal from './AssociatesFilterModal';

const Associates = ({ onAddAssociate, onEditAssociate, onViewAssociateDetails }) => {
    // CORREÇÃO: Movendo todos os hooks para o topo.
    const context = useAppContext();
    const [associates, setAssociates] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState({ status: 'all', region: 'all' });
    const [isFilterModalOpen, setFilterModalOpen] = useState(false);

    // CORREÇÃO: Guard clause depois dos hooks.
    if (!context || !context.userId) return <div>Carregando...</div>;
    const { db, getCollectionPath, userId } = context;

    useEffect(() => {
        const associatesColRef = collection(db, getCollectionPath('associates', userId));
        const unsubscribe = onSnapshot(associatesColRef, (snapshot) => {
            const associatesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAssociates(associatesData.sort((a, b) => a.sequentialId - b.sequentialId));
        });
        return () => unsubscribe();
    }, [db, getCollectionPath, userId]);

    const filteredAssociates = associates.filter(assoc => {
        const name = assoc.name || '';
        const seqId = assoc.sequentialId || '';
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              String(seqId).includes(searchTerm);
        const matchesStatus = filter.status === 'all' || (filter.status === 'active' ? assoc.isActive : !assoc.isActive);
        const matchesRegion = filter.region === 'all' || assoc.region === filter.region;
        return matchesSearch && matchesStatus && matchesRegion;
    });

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Associados</h2>
                <Button onClick={onAddAssociate} variant="primary">Adicionar Associado</Button>
            </div>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Buscar por nome ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-3 border rounded-lg"
                />
                <Button onClick={() => setFilterModalOpen(true)} variant="secondary">Filtros</Button>
            </div>
            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="py-3 px-4 text-left">ID</th>
                            <th className="py-3 px-4 text-left">Nome</th>
                            <th className="py-3 px-4 text-left">Região</th>
                            <th className="py-3 px-4 text-left">Status</th>
                            <th className="py-3 px-4 text-left">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAssociates.map(assoc => (
                            <tr key={assoc.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{assoc.sequentialId}</td>
                                <td className="py-3 px-4 font-semibold">{assoc.name}</td>
                                <td className="py-3 px-4">{assoc.region}</td>
                                <td className="py-3 px-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${assoc.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {assoc.isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td className="py-3 px-4 space-x-2">
                                    <Button onClick={() => onViewAssociateDetails(assoc)} size="xs" variant="info">Ver</Button>
                                    <Button onClick={() => onEditAssociate(assoc)} size="xs" variant="secondary">Editar</Button>
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
                />
            )}
        </div>
    );
};

export default Associates;
