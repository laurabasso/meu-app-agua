import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Button from './Button';

const Reports = () => {
    const context = useAppContext();
    const [periods, setPeriods] = useState([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [associates, setAssociates] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [generalReadings, setGeneralReadings] = useState([]);
    const [loading, setLoading] = useState(true);

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

    const reportData = useMemo(() => {
        if (!selectedPeriodId || associates.length === 0) return { lossAnalysis: [], associatesReport: [], generalHydrometersReport: [] };

        // Análise de Perdas
        const generalReadingsForPeriod = generalReadings.filter(r => r.periodId === selectedPeriodId);
        const invoicesForPeriod = invoices.filter(i => i.periodId === selectedPeriodId);

        const consumptionByGeneralHydrometer = associates.reduce((acc, assoc) => {
            if (!assoc.generalHydrometerId) return acc;
            if (!acc[assoc.generalHydrometerId]) {
                acc[assoc.generalHydrometerId] = { name: assoc.generalHydrometerId, somaConsumos: 0 };
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
                'Perda (m³)': consumoRegistrado - somaConsumos,
            };
        });

        // Relatório de Associados
        const associatesReport = invoicesForPeriod.map(invoice => {
            const associate = associates.find(a => a.id === invoice.associateId);
            return {
                id: associate?.sequentialId || 'N/A',
                nome: associate?.name || 'N/A',
                hidrometro: associate?.generalHydrometerId || 'N/A',
                consumo: invoice.consumption,
                valor: invoice.amountDue,
            };
        }).sort((a, b) => a.id - b.id);

        return { lossAnalysis, associatesReport, generalHydrometersReport: generalReadingsForPeriod };

    }, [selectedPeriodId, associates, invoices, generalReadings]);

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }
    const { formatDate } = context;

    const exportToPdf = async (type) => {
        const { jsPDF } = window.jspdf;
        const { autoTable } = window.jspdf_autotable; // jspdf-autotable é carregado no index.html
        const doc = new jsPDF();
        const period = periods.find(p => p.id === selectedPeriodId);

        doc.setFontSize(16);
        doc.text(`Relatório de ${type === 'associates' ? 'Faturamento Geral' : 'Hidrômetros Gerais'}`, 14, 22);
        doc.setFontSize(11);
        doc.text(`Período: ${period?.billingPeriodName || 'N/A'}`, 14, 30);

        if (type === 'associates') {
            const tableData = [];
            const summary = {};
            reportData.associatesReport.forEach(item => {
                tableData.push([item.id, item.nome, item.hidrometro, item.consumo.toFixed(2), `R$ ${item.valor.toFixed(2)}`]);
                if (!summary[item.hidrometro]) summary[item.hidrometro] = { consumo: 0, valor: 0 };
                summary[item.hidrometro].consumo += item.consumo;
                summary[item.hidrometro].valor += item.valor;
            });
            
            doc.autoTable({
                startY: 35,
                head: [['ID', 'Nome', 'Hidrômetro', 'Consumo (m³)', 'Valor Fatura']],
                body: tableData,
            });

            let finalY = doc.autoTable.previous.finalY + 10;
            doc.setFontSize(14);
            doc.text('Resumo por Hidrômetro', 14, finalY);
            const summaryData = Object.entries(summary).map(([key, value]) => [key, `${value.consumo.toFixed(2)} m³`, `R$ ${value.valor.toFixed(2)}`]);
            doc.autoTable({ startY: finalY + 2, head: [['Hidrômetro', 'Consumo Total', 'Valor Total']], body: summaryData });

        } else if (type === 'generalHydrometers') {
            const tableData = reportData.generalHydrometersReport.map(item => [
                item.generalHydrometerName, item.previousReading.toFixed(2), item.currentReading.toFixed(2), item.consumption.toFixed(2)
            ]);
            const totalConsumption = reportData.generalHydrometersReport.reduce((acc, item) => acc + item.consumption, 0);
            tableData.push(['', '', 'TOTAL', totalConsumption.toFixed(2)]);

            doc.autoTable({
                startY: 35,
                head: [['Nome', 'Leitura Anterior', 'Leitura Atual', 'Consumo (m³)']],
                body: tableData,
            });
        }

        doc.save(`relatorio_${type}_${period?.code.replace('/', '-')}.pdf`);
    };

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter space-y-12">
            <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2 text-center">Relatórios Gerenciais</h2>
                <div className="max-w-md mx-auto">
                    <label className="block text-sm font-medium text-gray-700">Selecione o Período para Análise</label>
                    <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                        {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                    </select>
                </div>
            </div>

            {/* Análise de Perdas */}
            <div className="p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Análise de Perdas por Hidrômetro Geral</h3>
                <p className="text-sm text-gray-600 mb-4">Compare o consumo total registrado no hidrômetro geral com a soma dos consumos individuais dos associados. Diferenças grandes podem indicar vazamentos.</p>
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <BarChart data={reportData.lossAnalysis} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} interval={0} />
                            <YAxis />
                            <Tooltip formatter={(value) => `${value.toFixed(2)} m³`} />
                            <Legend />
                            <Bar dataKey="Consumo Registrado (Geral)" fill="#8884d8" />
                            <Bar dataKey="Soma dos Consumos (Associados)" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Relatório de Faturamento */}
            <div className="p-6 border rounded-xl bg-gray-50">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-700">Relatório Geral de Faturamento</h3>
                    <Button onClick={() => exportToPdf('associates')} variant="primary">Exportar PDF</Button>
                </div>
                <div className="overflow-x-auto rounded-xl shadow-md max-h-96">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-100 sticky top-0"><tr><th className="py-2 px-3 text-left">ID</th><th className="py-2 px-3 text-left">Nome</th><th className="py-2 px-3 text-left">Hidrômetro</th><th className="py-2 px-3 text-left">Consumo (m³)</th><th className="py-2 px-3 text-left">Valor Fatura</th></tr></thead>
                        <tbody>{reportData.associatesReport.map(item => (<tr key={item.id} className="border-b"><td className="py-2 px-3">{item.id}</td><td className="py-2 px-3">{item.nome}</td><td className="py-2 px-3">{item.hidrometro}</td><td className="py-2 px-3">{item.consumo.toFixed(2)}</td><td className="py-2 px-3">R$ {item.valor.toFixed(2)}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>

            {/* Relatório de Hidrômetros Gerais */}
            <div className="p-6 border rounded-xl bg-gray-50">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-700">Relatório de Hidrômetros Gerais</h3>
                    <Button onClick={() => exportToPdf('generalHydrometers')} variant="primary">Exportar PDF</Button>
                </div>
                 <div className="overflow-x-auto rounded-xl shadow-md max-h-96">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-100 sticky top-0"><tr><th className="py-2 px-3 text-left">Nome</th><th className="py-2 px-3 text-left">Leitura Anterior</th><th className="py-2 px-3 text-left">Leitura Atual</th><th className="py-2 px-3 text-left">Consumo (m³)</th></tr></thead>
                        <tbody>{reportData.generalHydrometersReport.map(item => (<tr key={item.id} className="border-b"><td className="py-2 px-3">{item.generalHydrometerName}</td><td className="py-2 px-3">{item.previousReading.toFixed(2)}</td><td className="py-2 px-3">{item.currentReading.toFixed(2)}</td><td className="py-2 px-3">{item.consumption.toFixed(2)}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

export default Reports;
