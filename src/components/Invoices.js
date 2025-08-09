import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, updateDoc, writeBatch, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';
import jsPDF from 'jspdf';
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
                        <button onClick={() => { onPay('Dinheiro'); setIsOpen(false); }} className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                            Em Dinheiro
                        </button>
                        <button onClick={() => { onPay('PIX'); setIsOpen(false); }} className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                            Via PIX
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const calculateAmountDue = (consumption, associate, settings) => {
    if (!settings || !settings.tariffs || !associate) return 0;
    const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'] || {};
    const { freeConsumption = 0, standardMeters = 0, fixedFee = 0, excessTariff = 0 } = tariff;
    if (associate.type !== 'Outro' && consumption <= freeConsumption) return fixedFee;
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
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState({ invoices: true, associates: true, readings: true, periods: true, settings: true });
    const isLoading = useMemo(() => Object.values(loadingStatus).some(status => status), [loadingStatus]);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!context || !context.userId) return;
        const { db, getCollectionPath, userId } = context;

        const errorHandler = (err, source) => {
            console.error(`ERRO NO FIREBASE (${source}):`, err);
            setError(`Falha ao carregar dados de '${source}'.`);
            setLoadingStatus({ invoices: false, associates: false, readings: false, periods: false, settings: false });
        };
        
        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('invoices', userId)), s => { setInvoicesData(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingStatus(prev => ({ ...prev, invoices: false })); }, e => errorHandler(e, 'faturas')),
            onSnapshot(collection(db, getCollectionPath('associates', userId)), s => { setAssociates(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingStatus(prev => ({ ...prev, associates: false })); }, e => errorHandler(e, 'associados')),
            onSnapshot(collection(db, getCollectionPath('readings', userId)), s => { setReadings(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingStatus(prev => ({ ...prev, readings: false })); }, e => errorHandler(e, 'leituras')),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), s => {
                const periodsData = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
                setPeriods(periodsData);
                if (periodsData.length > 0 && filter.periodId === 'all') {
                    setFilter(f => ({ ...f, periodId: periodsData[0].id }));
                }
                setLoadingStatus(prev => ({ ...prev, periods: false }));
            }, e => errorHandler(e, 'períodos')),
            onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), s => {
                if (s.exists()) {
                    setSettings(s.data());
                } else {
                    setError("Documento de 'Configurações' não encontrado.");
                }
                setLoadingStatus(prev => ({ ...prev, settings: false }));
            }, e => errorHandler(e, 'configurações'))
        ];

        return () => unsubscribes.forEach(unsub => unsub());
    }, [context]);

    const calculatedInvoices = useMemo(() => {
        if (isLoading || error) return [];
        
        const readingsByAssociate = readings.reduce((acc, reading) => {
            if (!acc[reading.associateId]) acc[reading.associateId] = [];
            acc[reading.associateId].push(reading);
            return acc;
        }, {});

        let allInvoices = [];
        for (const associateId in readingsByAssociate) {
            const associateReadings = readingsByAssociate[associateId].sort((a, b) => new Date(a.date) - new Date(b.date));
            associateReadings.forEach((reading, index) => {
                const associate = associates.find(a => a.id === associateId);
                const period = periods.find(p => p.id === reading.periodId);
                if (!associate || !period) return;

                const previousReadingValue = reading.isReset ? 0 : (index > 0 ? associateReadings[index - 1].currentReading : 0);
                const consumption = reading.isReset ? reading.currentReading : reading.currentReading - previousReadingValue;
                const amountDue = calculateAmountDue(consumption, associate, settings);
                const paymentInfo = invoicesData.find(inv => inv.associateId === associateId && inv.periodId === reading.periodId);
                
                allInvoices.push({
                    id: paymentInfo?.id || `${associateId}-${reading.periodId}`,
                    associateId, periodId: reading.periodId, associate, period, consumption, amountDue,
                    previousReadingValue, latestReadingId: reading.id,
                    status: paymentInfo?.status || 'Pendente',
                    paymentMethod: paymentInfo?.paymentMethod,
                });
            });
        }
        return allInvoices;
    }, [readings, associates, periods, settings, invoicesData, isLoading, error]);

    const filteredInvoices = useMemo(() => {
        return calculatedInvoices.filter(invoice => {
            const matchesSearch = searchTerm === '' || (invoice.associate.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || String(invoice.associate.sequentialId || '').includes(searchTerm);
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

    if (!context || !context.userId) return <div className="text-center p-10 font-semibold">Carregando contexto...</div>;
    const { db, getCollectionPath, formatDate, userId } = context;

    const handleMarkAsPaid = async (invoiceId, method) => {
        await updateDoc(doc(db, getCollectionPath('invoices', userId), invoiceId), { status: 'Pago', paymentMethod: method, paymentDate: new Date().toISOString() });
    };
    
    const handleExportSummaryPdf = async () => {
        const periodId = filter.periodId === 'all' ? (periods[0]?.id || '') : filter.periodId;
        const period = periods.find(p => p.id === periodId);
        if (!period) {
            setModalContent({ title: 'Erro', message: 'Período não encontrado.' }); setShowModal(true); return;
        }
        const docPDF = new jsPDF({ orientation: 'landscape' });
        const regions = settings?.regions || ['Sem Regiao'];
        
        regions.forEach((region, index) => {
            const regionInvoices = filteredInvoices.filter(inv => (inv.associate.region || 'Sem Regiao') === region).sort((a,b) => (a.associate.sequentialId || 0) - (b.associate.sequentialId || 0));
            if (regionInvoices.length > 0) {
                if (index > 0) docPDF.addPage();
                docPDF.text(`Resumo de Faturas - Região: ${region}`, 14, 22);
                docPDF.text(`Período: ${period?.consumptionPeriodName || 'N/A'}`, 14, 30);
                
                const tableData = regionInvoices.map(item => [
                    item.associate.sequentialId, item.associate.name,
                    Math.round(item.previousReadingValue || 0),
                    Math.round((item.previousReadingValue || 0) + (item.consumption || 0)),
                    Math.round(item.consumption || 0),
                    formatCurrency(item.amountDue), '', '', ''
                ]);
                
                autoTable(docPDF, {
                    startY: 35,
                    head: [['ID', 'Nome', 'Leit. Ant.', 'Leit. Atual', 'Consumo', 'Valor', 'PIX', 'Dinheiro', 'Data Pag.']],
                    body: tableData,
                    styles: { fontSize: 8 }
                });
            }
        });
        docPDF.save(`resumo_faturas_${period?.code.replace('/', '-')}.pdf`);
    };

    const drawInvoiceOnDoc = (docPDF, yOffset, data) => {
        const { invoice, associate, period, settings, reading } = data;
        const acajuviInfo = settings?.acajuviInfo || {};
        const tariff = settings?.tariffs?.[associate.type] || {};
        const currentReadingDisplay = ((invoice.previousReadingValue || 0) + (invoice.consumption || 0)).toFixed(2);
        
        docPDF.setFontSize(11); docPDF.setFont('helvetica', 'bold');
        docPDF.text(acajuviInfo.acajuviName || 'Associação de Água', 15, yOffset + 15);
        docPDF.setFont('helvetica', 'normal'); docPDF.setFontSize(9);
        docPDF.text(`CNPJ: ${acajuviInfo.acajuviCnpj || 'N/A'}`, 15, yOffset + 20);
        docPDF.setFontSize(10); docPDF.setFont('helvetica', 'bold');
        docPDF.text('FATURA DE ÁGUA', 195, yOffset + 15, { align: 'right' });
        docPDF.setFont('helvetica', 'normal'); docPDF.setFontSize(9);
        docPDF.text(`Vencimento: ${formatDate(period.billingDueDate)}`, 195, yOffset + 24, { align: 'right' });
        docPDF.line(15, yOffset + 28, 195, yOffset + 28);
        docPDF.setFontSize(9);
        docPDF.text(`ASSOCIADO: ${associate.name} (ID: ${associate.sequentialId})`, 15, yOffset + 34);
        docPDF.text(`CPF/CNPJ: ${associate.documentNumber || 'N/A'}`, 15, yOffset + 38); // LINHA ADICIONADA
        docPDF.text(`PERÍODO DE CONSUMO: ${period.consumptionPeriodName || 'N/A'}`, 195, yOffset + 34, { align: 'right' });

        autoTable(docPDF, {
            startY: yOffset + 42,
            head: [['Leitura Anterior', 'Leitura Atual', 'Consumo Total (m³)']],
            body: [[(invoice.previousReadingValue || 0).toFixed(2), currentReadingDisplay, (invoice.consumption || 0).toFixed(2)]],
            theme: 'grid', headStyles: { fillColor: [240, 240, 240], textColor: 0 }, styles: { fontSize: 9 }
        });
        
        const finalY = (docPDF).lastAutoTable.finalY;
        
        autoTable(docPDF, {
            startY: finalY + 2,
            body: [
                ['Taxa Padrão', { content: formatCurrency(tariff.fixedFee || 0), styles: { halign: 'right' } }],
                [`Excesso (${Math.max(0, (invoice.consumption || 0) - (tariff.standardMeters || 0)).toFixed(2)} m³)`, { content: formatCurrency(Math.max(0, (invoice.consumption || 0) - (tariff.standardMeters || 0)) * (tariff.excessTariff || 0)), styles: { halign: 'right' } }]
            ],
            theme: 'plain', styles: { fontSize: 9 }
        });
        
        const finalY2 = (docPDF).lastAutoTable.finalY;
        docPDF.setFontSize(10);
        docPDF.setFont('helvetica', 'normal');
        docPDF.text('TOTAL A PAGAR', 155, finalY2 + 5, { align: 'right' }); // LAYOUT CORRIGIDO
        docPDF.setFontSize(16); docPDF.setFont('helvetica', 'bold');
        docPDF.text(formatCurrency(invoice.amountDue), 195, finalY2 + 5, { align: 'right' }); // LAYOUT CORRIGIDO
        
        docPDF.setFont('helvetica', 'normal'); docPDF.setFontSize(9);
        docPDF.text(`PIX: ${acajuviInfo.pixKey || 'N/A'}`, 105, yOffset + 88, { align: 'center' });
        if (reading?.isReset) { docPDF.setFontSize(8); docPDF.text('🔄 Contagem reiniciada neste período.', 15, yOffset + 92); }
        docPDF.line(10, yOffset + 99, 200, yOffset + 99, 'D');
    };

    const handleGenerateZip = async () => {
        const periodId = filter.periodId;
        if (!periodId || periodId === 'all') {
            setModalContent({ title: 'Ação Necessária', message: 'Por favor, selecione um período específico para exportar as faturas.' });
            setShowModal(true); return;
        }
        setPdfGenerating(true);
        try {
            const period = periods.find(p => p.id === periodId);
            const invoicesToExport = calculatedInvoices.filter(inv => inv.periodId === periodId);

            if (invoicesToExport.length === 0) {
                setModalContent({ title: 'Aviso', message: 'Nenhuma fatura encontrada para este período.' });
                setShowModal(true); return;
            }

            const zip = new JSZip();
            
            const invoicesByRegion = invoicesToExport.reduce((acc, item) => {
                const region = item.associate.region || 'Sem Regiao';
                if (!acc[region]) acc[region] = [];
                acc[region].push(item);
                return acc;
            }, {});

            for (const region in invoicesByRegion) {
                const doc = new jsPDF('p', 'mm', 'a4');
                const regionInvoices = invoicesByRegion[region].sort((a, b) => (a.associate.sequentialId || 0) - (b.associate.sequentialId || 0));
                
                regionInvoices.forEach((item, index) => {
                    if (index > 0 && index % 3 === 0) doc.addPage();
                    const yOffset = (index % 3) * 99; 
                    const reading = readings.find(r => r.id === item.latestReadingId);
                    
                    drawInvoiceOnDoc(doc, yOffset, { invoice: item, associate: item.associate, period, settings, reading });
                });
                
                zip.file(`${region}/faturas_${region}.pdf`, doc.output('blob'));
            }

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `faturas_${period.code.replace('/', '-')}.zip`;
            link.click();

        } catch (error) {
            console.error("Erro na geração do ZIP:", error);
            setModalContent({ title: 'Erro na Geração do ZIP', message: `Falha: ${error.message}` });
            setShowModal(true);
        } finally {
            setPdfGenerating(false);
        }
    };
    
    if (error) return <div className="p-8 bg-red-50 text-red-700 rounded-xl shadow-lg"><h2 className="text-3xl font-bold mb-4">Erro Crítico</h2><p>{error}</p></div>;
    
    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800">Controle de Faturas</h2>
                <div className="flex gap-4">
                    <Button onClick={handleExportSummaryPdf} variant="secondary" disabled={pdfGenerating}>
                        Exportar Resumo
                    </Button>
                    <Button onClick={handleGenerateZip} variant="purple" disabled={pdfGenerating}>
                        {pdfGenerating ? 'A Gerar ZIP...' : 'Exportar Faturas (ZIP)'}
                    </Button>
                </div>
            </div>

            {isLoading ? (<div className="text-center p-10 font-semibold">A carregar faturas...</div>) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-blue-50 rounded-lg"><div className="text-sm text-blue-800">Valor Total</div><div className="text-2xl font-bold text-blue-900">{formatCurrency(financialSummary.total)}</div></div>
                        <div className="p-4 bg-green-50 rounded-lg"><div className="text-sm text-green-800">Pago (Dinheiro)</div><div className="text-2xl font-bold text-green-900">{formatCurrency(financialSummary.totalDinheiro)}</div></div>
                        <div className="p-4 bg-teal-50 rounded-lg"><div className="text-sm text-teal-800">Pago (PIX)</div><div className="text-2xl font-bold text-teal-900">{formatCurrency(financialSummary.totalPix)}</div></div>
                        <div className="p-4 bg-red-50 rounded-lg"><div className="text-sm text-red-800">Pendente</div><div className="text-2xl font-bold text-red-900">{formatCurrency(financialSummary.totalPendente)}</div></div>
                    </div>
            
                    <div className="flex flex-col md:flex-row gap-4 mb-4 p-4 border rounded-lg bg-gray-50">
                        <LabeledInput type="text" placeholder="Buscar por nome ou ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-grow"/>
                        <div className="flex-shrink-0"><label className="block text-sm font-medium text-gray-700">Período</label><select value={filter.periodId} onChange={e => setFilter(f => ({...f, periodId: e.target.value}))} className="w-full p-2 border rounded-lg"><option value="all">Todos</option>{periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}</select></div>
                        <div className="flex-shrink-0"><label className="block text-sm font-medium text-gray-700">Status</label><select value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value}))} className="w-full p-2 border rounded-lg"><option value="all">Todos</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></div>
                    </div>

                    <div className="overflow-x-auto rounded-xl shadow-md">
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="py-3 px-4">ID</th><th className="py-3 px-4 text-left">Associado</th><th className="py-3 px-4 text-left">Período</th>
                                    <th className="py-3 px-4 text-left">Valor (R$)</th><th className="py-3 px-4 text-left">Status</th><th className="py-3 px-4 text-left">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.map(invoice => (
                                    <tr key={invoice.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4">{invoice.associate.sequentialId}</td>
                                        <td className="py-3 px-4">{invoice.associate.name}</td>
                                        <td className="py-3 px-4">{invoice.period.billingPeriodName}</td>
                                        <td className="py-3 px-4">{formatCurrency(invoice.amountDue)}</td>
                                        <td className={`py-3 px-4 font-semibold ${invoice.status === 'Pendente' ? 'text-red-500' : 'text-green-600'}`}>{invoice.status}</td>
                                        <td className="py-3 px-4">{invoice.status === 'Pendente' && (<PaymentActions onPay={(method) => handleMarkAsPaid(invoice.id, method)} />)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Invoices;