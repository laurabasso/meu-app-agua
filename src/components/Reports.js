import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAppContext } from '../AppContext';

const Reports = () => {
    // CORREÇÃO: Movendo todos os hooks para o topo.
    const context = useAppContext();
    const [associatesCount, setAssociatesCount] = useState(0);
    const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
    const [paidInvoicesCount, setPaidInvoicesCount] = useState(0);

    // CORREÇÃO: Guard clause depois dos hooks.
    if (!context || !context.userId) {
        return <div className="text-center p-10">Carregando...</div>;
    }
    const { db, userId, getCollectionPath } = context;

    useEffect(() => {
        const associatesColRef = collection(db, getCollectionPath('associates', userId));
        const unsubAssociates = onSnapshot(associatesColRef, (snapshot) => {
            setAssociatesCount(snapshot.size);
        });

        const invoicesColRef = collection(db, getCollectionPath('invoices', userId));
        const unsubInvoices = onSnapshot(invoicesColRef, (snapshot) => {
            let pending = 0;
            let paid = 0;
            snapshot.forEach(doc => {
                if (doc.data().status === 'Pendente') pending++;
                else if (doc.data().status === 'Pago') paid++;
            });
            setPendingInvoicesCount(pending);
            setPaidInvoicesCount(paid);
        });

        return () => {
            unsubAssociates();
            unsubInvoices();
        };
    }, [db, userId, getCollectionPath]);

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Relatórios</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-xl shadow-md text-center text-white">
                    <h3 className="text-xl font-semibold mb-2">Total de Associados</h3>
                    <p className="text-5xl font-bold">{associatesCount}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-700 p-6 rounded-xl shadow-md text-center text-white">
                    <h3 className="text-xl font-semibold mb-2">Faturas Pendentes</h3>
                    <p className="text-5xl font-bold">{pendingInvoicesCount}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-700 p-6 rounded-xl shadow-md text-center text-white">
                    <h3 className="text-xl font-semibold mb-2">Faturas Pagas</h3>
                    <p className="text-5xl font-bold">{paidInvoicesCount}</p>
                </div>
            </div>
        </div>
    );
};

export default Reports;
