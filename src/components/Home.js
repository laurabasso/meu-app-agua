import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAppContext } from '../AppContext';
import Modal from './Modal';

// NOVO: Componente Home/Dashboard extraído para seu próprio arquivo.
const Home = () => {
    const { db, userId, getCollectionPath } = useAppContext();
    const [associatesCount, setAssociatesCount] = useState(0);
    const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
    const [paidInvoicesCount, setPaidInvoicesCount] = useState(0);
    const [totalConsumptionData, setTotalConsumptionData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info' });
    const [periods, setPeriods] = useState([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [generalReadings, setGeneralReadings] = useState([]);

    useEffect(() => {
        if (!db || !userId) return;

        const associatesColRef = collection(db, getCollectionPath('associates', userId));
        const unsubscribeAssociates = onSnapshot(associatesColRef, (snapshot) => {
            setAssociatesCount(snapshot.size);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar associados para dashboard:", error);
            setModalContent({ title: 'Erro', message: 'Não foi possível carregar os dados de associados.' });
            setShowModal(true);
            setLoading(false);
        });

        const invoicesColRef = collection(db, getCollectionPath('invoices', userId));
        const unsubscribeInvoices = onSnapshot(invoicesColRef, (snapshot) => {
            let pending = 0;
            let paid = 0;
            snapshot.forEach(doc => {
                const invoice = doc.data();
                if (invoice.status === 'Pendente') pending++;
                else if (invoice.status === 'Pago') paid++;
            });
            setPendingInvoicesCount(pending);
            setPaidInvoicesCount(paid);
        });

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubscribePeriods = onSnapshot(periodsColRef, (snapshot) => {
            const periodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const sortedPeriods = periodsData.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
            setPeriods(sortedPeriods);
            if (sortedPeriods.length > 0 && !selectedPeriodId) {
                setSelectedPeriodId(sortedPeriods[0].id);
            }
        });

        const generalReadingsColRef = collection(db, getCollectionPath('generalReadings', userId));
        const unsubscribeGeneralReadings = onSnapshot(generalReadingsColRef, (snapshot) => {
            setGeneralReadings(snapshot.docs.map(doc => doc.data()));
        });

        return () => {
            unsubscribeAssociates();
            unsubscribeInvoices();
            unsubscribePeriods();
            unsubscribeGeneralReadings();
        };
    }, [db, userId, getCollectionPath, selectedPeriodId]);

    useEffect(() => {
        if (selectedPeriodId && generalReadings.length > 0) {
            const consumptionByHydrometer = generalReadings
                .filter(r => r.periodId === selectedPeriodId)
                .reduce((acc, reading) => {
                    const name = reading.generalHydrometerName;
                    acc[name] = (acc[name] || 0) + (reading.consumption || 0);
                    return acc;
                }, {});

            const chartData = Object.entries(consumptionByHydrometer).map(([name, consumption]) => ({
                name,
                consumption: parseFloat(consumption.toFixed(2))
            }));
            setTotalConsumptionData(chartData);
        } else {
            setTotalConsumptionData([]);
        }
    }, [selectedPeriodId, generalReadings]);

    const invoiceStatusData = [
        { name: 'Pagas', value: paidInvoicesCount, color: '#4CAF50' },
        { name: 'Pendentes', value: pendingInvoicesCount, color: '#F44336' },
    ];

    if (loading) {
        return <div className="text-center p-10">Carregando dados do dashboard...</div>;
    }

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Dashboard - Visão Geral</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-50 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 text-center">Status das Faturas</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={invoiceStatusData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            >
                                {invoiceStatusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-gray-50 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 text-center">Consumo por Hidrômetro Geral (m³)</h3>
                    <div className="mb-4">
                        <select
                            value={selectedPeriodId}
                            onChange={(e) => setSelectedPeriodId(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150 bg-white"
                        >
                            <option value="">Selecione um Período</option>
                            {periods.map(period => (
                                <option key={period.id} value={period.id}>{period.billingPeriodName}</option>
                            ))}
                        </select>
                    </div>
                    {totalConsumptionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={totalConsumptionData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 10 }} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="consumption" fill="#82ca9d" name="Consumo (m³)" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-gray-600 text-center py-10">Nenhum dado de consumo para o período selecionado.</p>
                    )}
                </div>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Home;
