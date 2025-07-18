import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, updateDoc, query, where } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

// MELHORIA: Importando as bibliotecas de PDF diretamente dos pacotes npm.
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

const Invoices = () => {
    const context = useAppContext();
    const [invoices, setInvoices] = useState([]);
    const [associates, setAssociates] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [settings, setSettings] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState({ periodId: 'all', status: 'all' });
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '' });
    const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
    const [pdfExportConfig, setPdfExportConfig] = useState({ periodId: '', region: 'all' });
    const [pdfGenerating, setPdfGenerating] = useState(false);

    useEffect(() => {
        if (!context || !context.userId) return;
        const { db, getCollectionPath, userId } = context;
        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('invoices', userId)), s => setInvoices(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('associates', userId)), s => setAssociates(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), s => {
                const periodsData = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
                setPeriods(periodsData);
                if (periodsData.length > 0 && filter.periodId === 'all') {
                    setFilter(f => ({ ...f, periodId: periodsData[0].id }));
                }
            }),
            onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), s => s.exists() && setSettings(s.data()))
        ];
        return () => unsubscribes.forEach(unsub => unsub());
    }, [context]);

    const getAssociateInfo = (associateId) => {
        return associates.find(a => a.id === associateId) || { name: 'N/A', sequentialId: 'N/A' };
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter(invoice => {
            const associate = getAssociateInfo(invoice.associateId);
            const associateName = associate.name.toLowerCase();
            const associateId = String(associate.sequentialId);
            const matchesSearch = searchTerm === '' || associateName.includes(searchTerm.toLowerCase()) || associateId.includes(searchTerm);
            const matchesPeriod = filter.periodId === 'all' || invoice.periodId === filter.periodId;
            const matchesStatus = filter.status === 'all' || invoice.status === filter.status;
            return matchesSearch && matchesPeriod && matchesStatus;
        });
    }, [invoices, associates, searchTerm, filter]);

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

    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold">Carregando...</div>;
    }
    const { db, getCollectionPath, formatDate, userId } = context;

    const handleMarkAsPaid = async (invoiceId, method) => {
        await updateDoc(doc(db, getCollectionPath('invoices', userId), invoiceId), { 
            status: 'Pago',
            paymentMethod: method,
            paymentDate: new Date().toISOString()
        });
    };
    
    const generateInvoiceHtml = (invoice, associate, period, settings) => {
        const acajuviInfo = settings?.acajuviInfo || {};
        const tariff = settings?.tariffs?.[associate.type] || {};
        const currentReadingDisplay = (invoice.previousReadingValue + invoice.consumption).toFixed(2);
        const consumptionPeriodName = period.consumptionPeriodName || 'N/A';
        const metrosPadrao = tariff.standardMeters || 0;
        const taxaFixa = tariff.fixedFee || 0;
        const tarifaExcedente = tariff.excessTariff || 0;
        const excessoM3 = Math.max(0, invoice.consumption - metrosPadrao);
        const taxaExcessoValor = excessoM3 * tarifaExcedente;
        return `<div style="width: 210mm; height: 99mm; padding: 8mm; box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11px; position: relative; border-bottom: 1px dashed #999; color: #333;"><div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;"><div style="text-align: left;"><h3 style="font-size: 15px; font-weight: bold; margin: 0 0 5px 0;">${acajuviInfo.acajuviName || 'Associação de Água'}</h3><p style="font-size: 10px; margin: 0;">CNPJ: ${acajuviInfo.acajuviCnpj || 'N/A'}</p></div><div style="text-align: right;"><h4 style="font-size: 13px; margin: 0; font-weight: bold;">FATURA DE ÁGUA</h4><p style="font-size: 10px; margin: 0;">${period.billingPeriodName || 'N/A'}</p><p style="font-size: 10px; margin: 0;">Vencimento: <strong>${formatDate(period.billingDueDate)}</strong></p></div></div><div style="border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 4px 0; margin-bottom: 5px; font-size: 10px; display: flex; justify-content: space-between;"><div><strong>ASSOCIADO:</strong> ${associate.name} (ID ${associate.sequentialId})<br><strong>CPF/CNPJ:</strong> ${associate.documentNumber || 'N/A'}</div><div style="text-align: right;"><strong>PERÍODO DE CONSUMO:</strong> ${consumptionPeriodName}<br><strong>HIDRÔMETRO:</strong> ${associate.generalHydrometerId || 'N/A'}</div></div><table style="width: 100%; border-collapse: collapse; margin-bottom: 5px; font-size: 10px;"><thead style="background-color: #f3f4f6;"><tr><th style="padding: 4px; border: 1px solid #ddd; text-align: left;">Leitura Anterior</th><th style="padding: 4px; border: 1px solid #ddd; text-align: left;">Leitura Atual</th><th style="padding: 4px; border: 1px solid #ddd; text-align: left;">Consumo Total (m³)</th></tr></thead><tbody><tr><td style="padding: 4px; border: 1px solid #ddd;">${invoice.previousReadingValue.toFixed(2)}</td><td style="padding: 4px; border: 1px solid #ddd;">${currentReadingDisplay}</td><td style="padding: 4px; border: 1px solid #ddd;">${invoice.consumption.toFixed(2)}</td></tr></tbody></table><div style="display: flex; justify-content: space-between; align-items: flex-start;"><table style="width: 65%; border-collapse: collapse; font-size: 10px;"><thead><tr><th style="padding: 4px; text-align: left;">Detalhamento</th><th style="padding: 4px; text-align: center;">Valor</th></tr></thead><tbody><tr><td>Taxa Padrão................</td><td style="text-align: right;">R$ ${taxaFixa.toFixed(2)}</td></tr><tr><td>Excesso: ${excessoM3.toFixed(2)} m³................</td><td style="text-align: right;">R$ ${taxaExcessoValor.toFixed(2)}</td></tr><tr><td>Tarifa Excedente: R$ ${tarifaExcedente.toFixed(2)}/m³</td><td></td></tr></tbody></table><div style="text-align: right; border: 2px solid #333; padding: 5px;"><span style="font-size: 10px;">TOTAL A PAGAR</span><br><span style="font-size: 16px; font-weight: bold;">R$ ${invoice.amountDue.toFixed(2)}</span></div></div><div style="text-align: center; font-size: 10px; color: #333; position: absolute; bottom: 10mm; width: calc(100% - 16mm);"><strong>PIX:</strong> ${acajuviInfo.pixKey || 'N/A'} | <strong>Banco:</strong> ${acajuviInfo.bankName || 'N/A'} - Ag: ${acajuviInfo.bankAgency || 'N/A'} - Cc: ${acajuviInfo.bankAccountNumber || 'N/A'}</div></div>`;
    };

    // CORREÇÃO: A função agora usa o 'jsPDF' e 'html2canvas' importados.
    const handleGeneratePdf = async () => {
        if (!pdfExportConfig.periodId || !settings) {
            setModalContent({ title: 'Erro', message: 'Selecione um período para exportar.' });
            setShowModal(true); return;
        }
        setPdfGenerating(true);
        try {
            const period = periods.find(p => p.id === pdfExportConfig.periodId);
            let invoicesToExport = invoices.filter(inv => inv.periodId === pdfExportConfig.periodId);
            const associatesForInvoices = associates.filter(assoc => invoicesToExport.some(inv => inv.associateId === assoc.id));
            if (pdfExportConfig.region !== 'all') {
                const associateIdsInRegion = associatesForInvoices.filter(a => a.region === pdfExportConfig.region).map(a => a.id);
                invoicesToExport = invoicesToExport.filter(inv => associateIdsInRegion.includes(inv.associateId));
            }
            if (invoicesToExport.length === 0) {
                setModalContent({ title: 'Aviso', message: 'Nenhuma fatura encontrada para a seleção.' });
                setShowModal(true); setPdfGenerating(false); return;
            }
            const doc = new jsPDF('p', 'mm', 'a4');
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px'; tempDiv.style.width = '210mm';
            document.body.appendChild(tempDiv);
            const invoicesWithDetails = invoicesToExport.map(inv => ({...inv, associate: associatesForInvoices.find(a => a.id === inv.associateId)})).filter(inv => inv.associate).sort((a, b) => (a.associate.sequentialId || 0) - (b.associate.sequentialId || 0));
            for (let i = 0; i < invoicesWithDetails.length; i += 3) {
                const chunk = invoicesWithDetails.slice(i, i + 3);
                let pageHtml = '';
                chunk.forEach(inv => { pageHtml += generateInvoiceHtml(inv, inv.associate, period, settings); });
                if (chunk.length < 3) {
                    for (let j = 0; j < 3 - chunk.length; j++) { pageHtml += `<div style="width: 210mm; height: 99mm; box-sizing: border-box;"></div>`; }
                }
                tempDiv.innerHTML = pageHtml;
                const canvas = await html2canvas(tempDiv, { scale: 2.5 });
                if (i > 0) doc.addPage();
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
            }
            doc.save(`faturas_${period.billingPeriodName}_${pdfExportConfig.region}.pdf`);
            setPdfExportModalOpen(false);
        } catch (error) {
            setModalContent({ title: 'Erro no PDF', message: `Falha: ${error.message}` });
            setShowModal(true);
        } finally {
            setPdfGenerating(false);
            const tempDiv = document.querySelector('div[style*="left: -9999px"]');
            if (tempDiv) document.body.removeChild(tempDiv);
        }
    };

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-7xl mx-auto my-8 font-inter">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Controle de Faturas</h2>
                <Button onClick={() => setPdfExportModalOpen(true)} variant="purple" disabled={pdfGenerating}>{pdfGenerating ? 'Gerando...' : 'Exportar Faturas para PDF'}</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg"><div className="text-sm text-blue-800">Valor Total</div><div className="text-2xl font-bold text-blue-900">R$ {financialSummary.total.toFixed(2)}</div></div>
                <div className="p-4 bg-green-50 rounded-lg"><div className="text-sm text-green-800">Pago (Dinheiro)</div><div className="text-2xl font-bold text-green-900">R$ {financialSummary.totalDinheiro.toFixed(2)}</div></div>
                <div className="p-4 bg-teal-50 rounded-lg"><div className="text-sm text-teal-800">Pago (PIX)</div><div className="text-2xl font-bold text-teal-900">R$ {financialSummary.totalPix.toFixed(2)}</div></div>
                <div className="p-4 bg-red-50 rounded-lg"><div className="text-sm text-red-800">Pendente</div><div className="text-2xl font-bold text-red-900">R$ {financialSummary.totalPendente.toFixed(2)}</div></div>
            </div>
            <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                <LabeledInput type="text" placeholder="Buscar por nome ou ID do associado..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-grow"/>
                <div className="flex-shrink-0"><label className="block text-sm font-medium text-gray-700">Período</label><select value={filter.periodId} onChange={e => setFilter(f => ({...f, periodId: e.target.value}))} className="w-full p-2 border rounded-lg"><option value="all">Todos</option>{periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}</select></div>
                <div className="flex-shrink-0"><label className="block text-sm font-medium text-gray-700">Status</label><select value={filter.status} onChange={e => setFilter(f => ({...f, status: e.target.value}))} className="w-full p-2 border rounded-lg"><option value="all">Todos</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></div>
            </div>
            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white"><thead className="bg-gray-100"><tr><th className="py-3 px-4 text-left">ID</th><th className="py-3 px-4 text-left">Associado</th><th className="py-3 px-4 text-left">Período</th><th className="py-3 px-4 text-left">Valor (R$)</th><th className="py-3 px-4 text-left">Status</th><th className="py-3 px-4 text-left">Forma de Pag.</th><th className="py-3 px-4 text-left">Ações</th></tr></thead>
                    <tbody>{filteredInvoices.sort((a,b) => new Date(b.invoiceDate) - new Date(a.invoiceDate)).map(invoice => {
                        const associate = getAssociateInfo(invoice.associateId);
                        return (<tr key={invoice.id} className="border-b hover:bg-gray-50"><td className="py-3 px-4">{associate.sequentialId}</td><td className="py-3 px-4">{associate.name}</td><td className="py-3 px-4">{invoice.period}</td><td className="py-3 px-4">R$ {invoice.amountDue.toFixed(2)}</td><td className={`py-3 px-4 font-semibold ${invoice.status === 'Pendente' ? 'text-red-500' : 'text-green-600'}`}>{invoice.status}</td><td className="py-3 px-4">{invoice.paymentMethod || 'N/A'}</td><td className="py-3 px-4">{invoice.status === 'Pendente' && (<PaymentActions onPay={(method) => handleMarkAsPaid(invoice.id, method)} />)}</td></tr>);
                    })}</tbody>
                </table>
            </div>
            
            {pdfExportModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">Exportar Faturas para PDF</h2>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700">Selecione o Período</label><select value={pdfExportConfig.periodId} onChange={e => setPdfExportConfig(c => ({...c, periodId: e.target.value}))} className="w-full p-2 border rounded-lg mt-1"><option value="">-- Obrigatório --</option>{periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-gray-700">Selecione a Região</label><select value={pdfExportConfig.region} onChange={e => setPdfExportConfig(c => ({...c, region: e.target.value}))} className="w-full p-2 border rounded-lg mt-1"><option value="all">Todas as Regiões</option>{settings?.regions?.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                        </div>
                        <div className="flex justify-end gap-4 mt-8"><Button onClick={() => setPdfExportModalOpen(false)} variant="secondary">Cancelar</Button><Button onClick={handleGeneratePdf} variant="purple" disabled={pdfGenerating || !pdfExportConfig.periodId}>{pdfGenerating ? 'Gerando...' : 'Gerar PDF'}</Button></div>
                    </div>
                </div>
            )}

            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} />
        </div>
    );
};

export default Invoices;
