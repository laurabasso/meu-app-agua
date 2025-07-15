import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useAppContext } from '../App';
import Modal from './Modal';
import AssociatesFilterModal from './AssociatesFilterModal';

const Associates = ({ onAddAssociate, onEditAssociate, onViewAssociateDetails }) => {
    const { db, userId } = useAppContext();
    const [associates, setAssociates] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
    const [filters, setFilters] = useState({ type: 'Todos', region: 'Todas', generalHydrometer: 'Todos' });
    const [searchTerm, setSearchTerm] = useState('');
    const [predefinedRegions, setPredefinedRegions] = useState([]);
    const [predefinedGeneralHydrometers, setPredefinedGeneralHydrometers] = useState([]);
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');

    useEffect(() => {
        if (!db || !userId) return;

        const associatesColRef = collection(db, `artifacts/${userId}/users/${userId}/associates`);
        const unsubscribeAssociates = onSnapshot(associatesColRef, (snapshot) => {
            setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível carregar os associados. Por favor, tente novamente.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        });

        const settingsDocRef = doc(db, `artifacts/${userId}/users/${userId}/settings`, 'config');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setPredefinedRegions(docSnap.data().regions || ['Centro', 'Industrial', 'Buset', 'Vila Rica', 'São Vitor']);
                setPredefinedGeneralHydrometers(docSnap.data().generalHydrometers || [
                    '#2 Geral Centro', '#3 Giacomin Industrial', '#4 Hortência Buset',
                    '#5 Hortência Industrial', '#6 Osmar Buset', '#7 Macari Buset',
                    '#8 Picada Estorta Centro', '#9 Jair Vila Rica', '#10 Edino Vila Rica',
                    '#11 Mussoi Vila Rica', '#12 Tchicão Vila Rica', '#13 Vila Gaio São Vitor',
                    'Consumo da Rede'
                ]);
            } else {
                setPredefinedRegions(['Centro', 'Industrial', 'Buset', 'Vila Rica', 'São Vitor']);
                setPredefinedGeneralHydrometers([
                    '#2 Geral Centro', '#3 Giacomin Industrial', '#4 Hortência Buset',
                    '#5 Hortência Industrial', '#6 Osmar Buset', '#7 Macari Buset',
                    '#8 Picada Estorta Centro', '#9 Jair Vila Rica', '#10 Edino Vila Rica',
                    '#11 Mussoi Vila Rica', '#12 Tchicão Vila Rica', '#13 Vila Gaio São Vitor',
                    'Consumo da Rede'
                ]);
            }
        });

        return () => {
            unsubscribeAssociates();
            unsubscribeSettings();
        };
    }, [db, userId]);

    const handleDeleteAssociate = (associateId) => {
        setModalContent({
            title: 'Confirmar Exclusão',
            message: 'Tem certeza que deseja excluir este associado? Esta ação é irreversível.',
            type: 'confirm',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, `artifacts/${userId}/users/${userId}/associates`, associateId));
                    setModalContent({
                        title: 'Sucesso',
                        message: 'Associado excluído com sucesso!',
                        type: 'info',
                        onConfirm: () => setShowModal(false)
                    });
                    setShowModal(true);
                } catch (e) {
                    setModalContent({
                        title: 'Erro',
                        message: 'Não foi possível excluir o associado. Por favor, tente novamente.',
                        type: 'danger',
                        onConfirm: () => setShowModal(false)
                    });
                    setShowModal(true);
                }
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    // ...restante da renderização da tabela e filtros igual ao App.js...
    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
            {/* ...código da tabela e filtros... */}
            <Modal {...modalContent} show={showModal} />
            <AssociatesFilterModal
                show={showFilterModal}
                onClose={() => setShowFilterModal(false)}
                filters={filters}
                onApplyFilters={setFilters}
                regions={predefinedRegions}
                generalHydrometers={predefinedGeneralHydrometers}
            />
        </div>
    );
};

export default Associates;
