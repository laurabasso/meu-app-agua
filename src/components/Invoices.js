import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, updateDoc, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';
import jsPDF from 'jspdf';
// CORREÇÃO: Importando o autoTable para que a função seja reconhecida.
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

// Componente para o menu de pagamento
const PaymentActions = ({ onPay }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative inline-block text-left">
            <Button onClick={() => setIsOpen(!isOpen)} size="xs" variant="primary">
                Marcar Paga
            </Button>
            {isOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                        <a href="#" onClick={(e) => { e.preventDefault(); onPay('Dinheiro'); setIsOpen(false); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                            Em Dinheiro
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onPay('PIX'); setIsOpen(false); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                            Via PIX
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};

const calculateAmountDue = (consumption, associate, settings) => {
    if (!settings || !settings.tariffs || !associate) return 0;
    const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'];
    if (!tariff) return 0;
    const { freeConsumption = 0, standardMeters = 0, fixedFee = 0, excessTariff = 0 } = tariff;
    if (associate.type !== 'Outro' && consumption <= freeConsumption) {
        return fixedFee;
    }
    if (consumption <= standardMeters) return fixedFee;
    const excessBase = Math.max(freeConsumption, standardMeters);
    return fixedFee + ((consumption - excessBase) * excessTariff);
};

const Invoices = () => {
    const context = useAppContext();
    const [invoicesData, setInvoicesData] = useState([]);
    const [associates, setAssociates] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [settings, setSettings] = useState(null);
    const [readings, setReadings] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState({ periodId: 'all', status: 'all' });
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
    const [pdfExportConfig, setPdfExportConfig] = useState({ periodId: '', region: 'all' });
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [selectedInvoices, setSelectedInvoices] = useState(new Set());

    useEffect(() => {
        if (!context || !context.userId) return;
        const { db, getCollectionPath, userId } = context;
        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('invoices', userId)), s => setInvoicesData(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('associates', userId)), s => setAssociates(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('readings', userId)), s => setReadings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), s => {
                const periodsData = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
                setPeriods(periodsData);
                if (periodsData.length > 0 && filter.periodId === 'all') {
                    setFilter(f => ({ ...f, periodId: periodsData[0].id }));
                    setPdfExportConfig(c => ({ ...c, periodId: periodsData[0].id }));
                }
            }),
            onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), s => s.exists() && setSettings(s.data()))
        ];
        return () => unsubscribes.forEach(unsub => unsub());
    }, [context]);

    const calculatedInvoices = useMemo(() => {
        if (readings.length === 0 || associates.length === 0 || periods.length === 0 || !settings) return [];
        const readingsByAssociate = readings.reduce((acc, reading) => {
            if (!acc[reading.associateId]) acc[reading.associateId] = [];
            acc[reading.associateId].push(reading);
            return acc;
        }, {});
        let allCalculatedInvoices = [];
        for (const associateId in readingsByAssociate) {
            const associateReadings = readingsByAssociate[associateId];
            const sortedReadings = associateReadings.sort((a, b) => new Date(a.date) - new Date(b.date));
            sortedReadings.forEach((reading, index) => {
                const associate = associates.find(a => a.id === associateId);
                const period = periods.find(p => p.id === reading.periodId);
                if (!associate || !period) return;
                const previousReadingValue = reading.isReset ? 0 : (index > 0 ? sortedReadings[index - 1].currentReading : 0);
                const consumption = reading.isReset ? reading.currentReading : reading.currentReading - previousReadingValue;
                const amountDue = calculateAmountDue(consumption, associate, settings);
                const paymentInfo = invoicesData.find(inv => inv.associateId === associateId && inv.periodId === reading.periodId);
                allCalculatedInvoices.push({
                    id: paymentInfo?.id || `${associateId}-${reading.periodId}`,
                    associateId: associateId,
                    periodId: reading.periodId,
                    associate: associate,
                    period: period,
                    consumption: consumption,
                    amountDue: amountDue,
                    previousReadingValue: previousReadingValue,
                    latestReadingId: reading.id,
                    status: paymentInfo?.status || 'Pendente',
                    paymentMethod: paymentInfo?.paymentMethod,
                });
            });
        }
        return allCalculatedInvoices;
    }, [readings, associates, periods, settings, invoicesData]);

    const getAssociateInfo = (associateId) => associates.find(a => a.id === associateId) || { name: 'N/A', sequentialId: 'N/A' };

    const filteredInvoices = useMemo(() => {
        return calculatedInvoices.filter(invoice => {
            const associateName = invoice.associate.name.toLowerCase();
            const associateId = String(invoice.associate.sequentialId);
            const matchesSearch = searchTerm === '' || associateName.includes(searchTerm.toLowerCase()) || associateId.includes(searchTerm);
            const matchesPeriod = filter.periodId === 'all' || invoice.periodId === filter.periodId;
            const matchesStatus = filter.status === 'all' || invoice.status === filter.status;
            return matchesSearch && matchesPeriod && matchesStatus;
        });
    }, [calculatedInvoices, searchTerm, filter]);

    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const financialSummary = useMemo(() => {
        return filteredInvoices.reduce((acc, inv) => {
            const amount = inv.amountDue || 0;
            acc.total += amount;
            if (inv.status === 'Pago') {
                if (inv.paymentMethod === 'Dinheiro') acc.totalDinheiro += amount;
                else if (inv.paymentMethod === 'PIX') acc.totalPix += amount;
            } else {
                acc.totalPendente += amount;
            }
            return acc;
        }, { total: 0, totalDinheiro: 0, totalPix: 0, totalPendente: 0 });
    }, [filteredInvoices]);

    if (!context || !context.userId) return <div className="text-center p-10 font-semibold">Carregando...</div>;
    const { db, getCollectionPath, formatDate, userId } = context;

    const handleMarkAsPaid = async (invoiceId, method) => {
        await updateDoc(doc(db, getCollectionPath('invoices', userId), invoiceId), { 
            status: 'Pago',
            paymentMethod: method,
            paymentDate: new Date().toISOString()
        });
    };
    
    const handleExportSummaryPdf = async () => {
        const period = periods.find(p => p.id === filter.periodId);
        if (!period) {
             setModalContent({ title: 'Erro', message: 'Por favor, selecione um período válido para gerar o resumo.' });
             setShowModal(true); return;
        }
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const regions = settings?.regions || [];

        regions.forEach((region, index) => {
            const regionInvoices = filteredInvoices
                .filter(inv => inv.associate.region === region)
                .sort((a, b) => (a.associate.sequentialId || 0) - (b.associate.sequentialId || 0));

            if (regionInvoices.length > 0) {
                if (index > 0) doc.addPage();
                doc.setFontSize(16);
                doc.text(`Resumo de Faturas para Controle - Região: ${region}`, 14, 22);
                doc.setFontSize(11);
                doc.text(`Período de Consumo: ${period?.consumptionPeriodName || 'N/A'}`, 14, 30);
                
                const tableData = regionInvoices.map(item => [
                    item.associate.sequentialId,
                    item.associate.name,
                    item.associate.generalHydrometerId,
                    Math.round(item.previousReadingValue || 0),
                    Math.round((item.previousReadingValue || 0) + (item.consumption || 0)),
                    Math.round(item.consumption || 0),
                    formatCurrency(item.amountDue),
                    '', '', ''
                ]);

                autoTable(doc, {
                    startY: 35,
                    head: [['ID', 'Nome', 'Hidrômetro', 'Leit. Ant.', 'Leit. Atual', 'Consumo', 'Valor', 'PIX', 'Dinheiro', 'Data Pag.']],
                    body: tableData,
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: [22, 160, 133] },
                    didDrawCell: (data) => {
                        if (data.section === 'body' && (data.column.index === 7 || data.column.index === 8)) {
                            doc.setDrawColor(0);
                            doc.rect(data.cell.x + data.cell.width / 2 - 1.5, data.cell.y + 2, 3, 3);
                        }
                    }
                });
            }
        });

        doc.save(`resumo_faturas_${period?.code.replace('/', '-')}.pdf`);
    };

    const drawInvoiceOnDoc = (doc, yOffset, data) => {
        const { invoice, associate, period, settings, reading } = data;
        const acajuviInfo = settings?.acajuviInfo || {};
        const tariff = settings?.tariffs?.[associate.type] || {};
        const currentReadingDisplay = ((invoice.previousReadingValue || 0) + (invoice.consumption || 0)).toFixed(2);
        const consumptionPeriodName = period.consumptionPeriodName || 'N/A';
        const metrosPadrao = tariff.standardMeters || 0;
        const taxaFixa = tariff.fixedFee || 0;
        const tarifaExcedente = tariff.excessTariff || 0;
        const excessoM3 = Math.max(0, (invoice.consumption || 0) - metrosPadrao);
        const taxaExcessoValor = excessoM3 * tarifaExcedente;
        
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text(acajuviInfo.acajuviName || 'Associação de Água', 15, yOffset + 15);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(`CNPJ: ${acajuviInfo.acajuviCnpj || 'N/A'}`, 15, yOffset + 20);
        doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text('FATURA DE ÁGUA', 195, yOffset + 15, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(`Vencimento: ${formatDate(period.billingDueDate)}`, 195, yOffset + 24, { align: 'right' });
        doc.line(15, yOffset + 28, 195, yOffset + 28);
        doc.setFontSize(9);
        doc.text(`ASSOCIADO: ${associate.name} (ID: ${associate.sequentialId})`, 15, yOffset + 34);
        doc.text(`CPF/CNPJ: ${associate.documentNumber || 'N/A'}`, 15, yOffset + 38);
        doc.text(`PERÍODO DE CONSUMO: ${consumptionPeriodName}`, 195, yOffset + 34, { align: 'right' });
        doc.text(`HIDRÔMETRO: ${associate.generalHydrometerId || 'N/A'}`, 195, yOffset + 38, { align: 'right' });

        autoTable(doc, {
            startY: yOffset + 42,
            head: [['Leitura Anterior', 'Leitura Atual', 'Consumo Total (m³)']],
            body: [[(invoice.previousReadingValue || 0).toFixed(2), currentReadingDisplay, (invoice.consumption || 0).toFixed(2)]],
            theme: 'grid', headStyles: { fillColor: [240, 240, 240], textColor: 0 }, styles: { fontSize: 9 }
        });

        autoTable(doc, {
            startY: doc.autoTable.previous.finalY + 2,
            body: [
                ['Taxa Padrão', { content: formatCurrency(taxaFixa), styles: { halign: 'right' } }],
                [`Excesso (${excessoM3.toFixed(2)} m³ acima de ${metrosPadrao} m³)`, { content: formatCurrency(taxaExcessoValor), styles: { halign: 'right' } }],
                [`(Tarifa Excedente: ${formatCurrency(tarifaExcedente)}/m³)`, '']
            ],
            theme: 'plain', styles: { fontSize: 9 }
        });
        
        doc.setFontSize(10); doc.text('TOTAL A PAGAR', 195, doc.autoTable.previous.finalY - 5, { align: 'right' });
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(invoice.amountDue), 195, doc.autoTable.previous.finalY, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(`PIX: ${acajuviInfo.pixKey || 'N/A'} | Banco: ${acajuviInfo.bankName || 'N/A'} - Ag: ${acajuviInfo.bankAgency || 'N/A'} - Cc: ${acajuviInfo.bankAccountNumber || 'N/A'}`, 105, yOffset + 88, { align: 'center' });
        if (reading?.isReset) { doc.setFontSize(8); doc.text('🔄 Contagem reiniciada neste período.', 15, yOffset + 92); }
        doc.line(10, yOffset + 99, 200, yOffset + 99, 'D'); // Linha de recorte
    };

    const handleGenerateZip = async () => {
        if (!pdfExportConfig.periodId || !settings) {
            setModalContent({ title: 'Erro', message: 'Selecione um período para exportar.' });
            setShowModal(true); return;
        }
        setPdfGenerating(true);
        try {
            const period = periods.find(p => p.id === pdfExportConfig.periodId);
            const invoicesWithDetails = calculatedInvoices.filter(inv => inv.periodId === pdfExportConfig.periodId);
            if (invoicesWithDetails.length === 0) {
                setModalContent({ title: 'Aviso', message: 'Nenhuma fatura encontrada para este período.' });
                setShowModal(true); setPdfGenerating(false); return;
            }
            const zip = new JSZip();
            const invoicesByRegion = invoicesWithDetails.reduce((acc, item) => {
                const region = item.associate.region || 'Sem Regiao';
                if (!acc[region]) acc[region] = [];
                acc[region].push(item);
                return acc;
            }, {});
            for (const region in invoicesByRegion) {
                const doc = new jsPDF('p', 'mm', 'a4');
                const regionInvoices = invoicesByRegion[region].sort((a, b) => (a.associate.sequentialId || 0) - (b.associate.sequentialId || 0));
                
                regionInvoices.forEach((item, index) => {
                    const yOffset = (index % 3) * 99; // 0, 99, 198
                    if (index > 0 && index % 3 === 0) {
                        doc.addPage();
                    }
                    const reading = readings.find(r => r.id === item.latestReadingId);
                    drawInvoiceOnDoc(doc, yOffset, { invoice: item, associate: item.associate, period, settings, reading });
                });
                
                const pdfData = doc.output('blob');
                zip.file(`${region}.pdf`, pdfData);
            }
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `faturas_${period.code.replace('/', '-')}.zip`;
            link.click();
            setPdfExportModalOpen(false);
        } catch (error) {
            console.error("Erro no ZIP:", error);
            setModalContent({ title: 'Erro no ZIP', message: `Falha: ${error.message}` });
            setShowModal(true);
        } finally {
            setPdfGenerating(false);
        }
    };

    const handleToggleSelect = (invoiceId) => {
        setSelectedInvoices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(invoiceId)) newSet.delete(invoiceId);
            else newSet.add(invoiceId);
            return newSet;
        });
    };

    const handleToggleSelectAll = () => {
        if (selectedInvoices.size === filteredInvoices.length) {
            setSelectedInvoices(new Set());
        } else {
            setSelectedInvoices(new Set(filteredInvoices.map(inv => inv.id)));
        }
    };

    const handleBulkDelete = () => {
        if (selectedInvoices.size === 0) return;
        setModalContent({
            title: 'Confirmar Exclusão em Massa',
            message: `Você confirma a exclusão de ${selectedInvoices.size} faturas? Esta ação não pode ser desfeita.`,
            type: 'confirm',
            onConfirm: async () => {
                const batch = writeBatch(db);
                selectedInvoices.forEach(id => {
                    batch.delete(doc(db, getCollectionPath('invoices', userId), id));
                });
                await batch.commit();
                setSelectedInvoices(new Set());
                setShowModal(false);
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800">Controle de Faturas</h2>
                <div className="flex gap-4">
                    <Button onClick={handleExportSummaryPdf} variant="secondary">Exportar Resumo para Controle</Button>
                    <Button onClick={() => setPdfExportModalOpen(true)} variant="purple">Exportar Faturas (ZIP)</Button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg"><div className="text-sm text-blue-800">Valor Total</div><div className="text-2xl font-bold text-blue-900">{formatCurrency(financialSummary.total)}</div></div>
                <div className="p-4 bg-green-50 rounded-lg"><div className="text-sm text-green-800">Pago (Dinheiro)</div><div className="text-2xl font-bold text-green-900">{formatCurrency(financialSummary.totalDinheiro)}</div></div>
                <div className="p-4 bg-teal-50 rounded-lg"><div className="text-sm text-teal-800">Pago (PIX)</div><div className="text-2xl font-bold text-teal-900">{formatCurrency(financialSummary.totalPix)}</div></div>
                <div className="p-4 bg-red-50 rounded-lg"><div className="text-sm text-red-800">Pendente</div><div className="text-2xl font-bold text-red-900">{formatCurrency(financialSummary.totalPendente)}</div></div>
            </div>
            <div className="flex flex-col md:flex-row gap-4 mb-4 p-4 border rounded-lg bg-gray-50">
                <LabeledInput type="text" placeholder="Buscar por nome ou ID do associado..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-grow"/>
                <div className="flex-shrink-0"><label className="block text-sm font-medium text-gray-700">Período</label><select value={filter.periodId} onChange={e => setFilter(f => ({...f, periodId: e.target.value}))} className="w-full p-2 border rounded-lg"><option value="all">Todos</option>{periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}</select></div>
                <div className="flex-shrink-0"><label className="block text-sm font-medium text-gray-700">Status</label><select value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value}))} className="w-full p-2 border rounded-lg"><option value="all">Todos</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></div>
            </div>
            <div className="flex items-center gap-4 mb-4 p-2 bg-gray-50 rounded-lg">
                <Button onClick={handleBulkDelete} variant="danger" disabled={selectedInvoices.size === 0}>
                    Excluir {selectedInvoices.size} faturas selecionadas
                </Button>
            </div>
            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white"><thead className="bg-gray-100"><tr>
                    <th className="py-3 px-4"><input type="checkbox" onChange={handleToggleSelectAll} checked={selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0} /></th>
                    <th className="py-3 px-4 text-left">ID</th><th className="py-3 px-4 text-left">Associado</th><th className="py-3 px-4 text-left">Período</th><th className="py-3 px-4 text-left">Valor (R$)</th><th className="py-3 px-4 text-left">Status</th><th className="py-3 px-4 text-left">Forma de Pag.</th><th className="py-3 px-4 text-left">Ações</th></tr></thead>
                    <tbody>{filteredInvoices.map(invoice => (
                        <tr key={invoice.id} className={`border-b transition-colors ${selectedInvoices.has(invoice.id) ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                            <td className="py-3 px-4"><input type="checkbox" checked={selectedInvoices.has(invoice.id)} onChange={() => handleToggleSelect(invoice.id)} /></td>
                            <td className="py-3 px-4">{invoice.associate.sequentialId}</td><td className="py-3 px-4">{invoice.associate.name}</td><td className="py-3 px-4">{invoice.period.billingPeriodName}</td><td className="py-3 px-4">{formatCurrency(invoice.amountDue)}</td><td className={`py-3 px-4 font-semibold ${invoice.status === 'Pendente' ? 'text-red-500' : 'text-green-600'}`}>{invoice.status}</td><td className="py-3 px-4">{invoice.paymentMethod || 'N/A'}</td><td className="py-3 px-4">{invoice.status === 'Pendente' && (<PaymentActions onPay={(method) => handleMarkAsPaid(invoice.id, method)} />)}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            {pdfExportModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">Exportar Faturas (ZIP)</h2>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700">Selecione o Período</label><select value={pdfExportConfig.periodId} onChange={e => setPdfExportConfig(c => ({...c, periodId: e.target.value}))} className="w-full p-2 border rounded-lg mt-1"><option value="">-- Obrigatório --</option>{periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}</select></div>
                        </div>
                        <div className="flex justify-end gap-4 mt-8"><Button onClick={() => setPdfExportModalOpen(false)} variant="secondary">Cancelar</Button><Button onClick={handleGenerateZip} variant="purple" disabled={pdfGenerating || !pdfExportConfig.periodId}>{pdfGenerating ? 'Gerando ZIP...' : 'Gerar ZIP'}</Button></div>
                    </div>
                </div>
            )}
            <Modal {...modalContent} show={showModal} onConfirm={modalContent.onConfirm || (() => setShowModal(false))} onCancel={modalContent.onCancel} />
        </div>
    );
};

export default Invoices;
