import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAppContext } from '../AppContext';
import Modal from './Modal';

const Home = () => {
    const context = useAppContext();
    const [periods, setPeriods] = useState([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [associates, setAssociates] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [generalReadings, setGeneralReadings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });

    useEffect(() => {
        if (!context || !context.userId) return;
        const { db, getCollectionPath, userId } = context;

        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('associates', userId)), s => setAssociates(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('invoices', userId)), s => setInvoices(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('generalReadings', userId)), s => setGeneralReadings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), s => {
                const data = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
                setPeriods(data);
                if (data.length > 0 && !selectedPeriodId) {
                    setSelectedPeriodId(data[0].id);
                }
                setLoading(false);
            })
        ];
        return () => unsubscribes.forEach(unsub => unsub());
    }, [context]);

    const dashboardData = useMemo(() => {
        const associatesCount = associates.length;
        const invoicesForPeriod = invoices.filter(i => i.periodId === selectedPeriodId);
        
        const paidInvoicesCount = invoicesForPeriod.filter(i => i.status === 'Pago').length;
        const pendingInvoicesCount = invoicesForPeriod.length - paidInvoicesCount;

        // MELHORIA: Cálculo da média de consumo por região
        const consumptionByRegion = associates.reduce((acc, assoc) => {
            if (!assoc.region) return acc;
            if (!acc[assoc.region]) {
                acc[assoc.region] = { totalConsumption: 0, count: 0 };
            }
            const invoice = invoicesForPeriod.find(i => i.associateId === assoc.id);
            if (invoice) {
                acc[assoc.region].totalConsumption += invoice.consumption;
                acc[assoc.region].count++;
            }
            return acc;
        }, {});

        const averageConsumptionByRegion = Object.entries(consumptionByRegion).map(([region, data]) => ({
            name: region,
            'Média (m³)': data.count > 0 ? data.totalConsumption / data.count : 0,
        }));

        // MELHORIA: Lógica da análise de perdas (vazamentos)
        const generalReadingsForPeriod = generalReadings.filter(r => r.periodId === selectedPeriodId);
        const consumptionByGeneralHydrometer = associates.reduce((acc, assoc) => {
            if (!assoc.generalHydrometerId) return acc;
            if (!acc[assoc.generalHydrometerId]) {
                acc[assoc.generalHydrometerId] = { somaConsumos: 0 };
            }
            const invoice = invoicesForPeriod.find(i => i.associateId === assoc.id);
            if (invoice) {
                acc[assoc.generalHydrometerId].somaConsumos += invoice.consumption;
            }
            return acc;
        }, {});

        const lossAnalysis = generalReadingsForPeriod.map(gr => {
            const group = consumptionByGeneralHydrometer[gr.generalHydrometerName];
            const somaConsumos = group ? group.somaConsumos : 0;
            const consumoRegistrado = gr.consumption || 0;
            return {
                name: gr.generalHydrometerName,
                'Consumo Registrado (Geral)': consumoRegistrado,
                'Soma dos Consumos (Associados)': somaConsumos,
            };
        });

        return {
            associatesCount,
            paidInvoicesCount,
            pendingInvoicesCount,
            averageConsumptionByRegion,
            lossAnalysis,
        };

    }, [selectedPeriodId, associates, invoices, generalReadings]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }

    if (loading) {
        return <div className="text-center p-10">Carregando dados do dashboard...</div>;
    }

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter space-y-12">
            <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2 text-center">Dashboard</h2>
                <div className="max-w-md mx-auto">
                    <label className="block text-sm font-medium text-gray-700">Período de Análise</label>
                    <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                        {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-xl shadow-md text-center text-white">
                    <h3 className="text-xl font-semibold mb-2">Total de Associados</h3>
                    <p className="text-5xl font-bold">{dashboardData.associatesCount}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-700 p-6 rounded-xl shadow-md text-center text-white">
                    <h3 className="text-xl font-semibold mb-2">Faturas Pendentes</h3>
                    <p className="text-5xl font-bold">{dashboardData.pendingInvoicesCount}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-700 p-6 rounded-xl shadow-md text-center text-white">
                    <h3 className="text-xl font-semibold mb-2">Faturas Pagas</h3>
                    <p className="text-5xl font-bold">{dashboardData.paidInvoicesCount}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* MELHORIA: Gráfico de média de consumo por região */}
                <div className="p-6 border rounded-xl bg-gray-50">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 text-center">Média de Consumo por Região</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <BarChart data={dashboardData.averageConsumptionByRegion} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={80} />
                                <Tooltip formatter={(value) => `${value.toFixed(2)} m³`} />
                                <Legend />
                                <Bar dataKey="Média (m³)" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                {/* MELHORIA: Gráfico de análise de perdas */}
                <div className="p-6 border rounded-xl bg-gray-50">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4 text-center">Análise de Perdas (Consumo Geral vs Associados)</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <BarChart data={dashboardData.lossAnalysis} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis />
                                <Tooltip formatter={(value) => `${value.toFixed(2)} m³`} />
                                <Legend />
                                <Bar dataKey="Consumo Registrado (Geral)" fill="#82ca9d" />
                                <Bar dataKey="Soma dos Consumos (Associados)" fill="#ffc658" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Home;
