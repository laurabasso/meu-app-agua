import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, getDocs, addDoc, updateDoc, query, where } from 'firebase/firestore';
import { useAppContext } from '../AppContext';
import Modal from './Modal';
import Button from './Button';
import LabeledInput from './LabeledInput';

// Função para calcular o valor devido
function calculateAmountDue(associate, consumption, settings) {
    if (!associate || !settings || !settings.tariffs) return 0;
    const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'];
    if (!tariff) return 0;

    let amount = tariff.fixedFee || 0;
    const freeConsumption = tariff.freeConsumption || 0;
    const standardMeters = tariff.standardMeters || 0;
    const basicTariff = tariff.basicTariff || 0;
    const excessTariff = tariff.excessTariff || 0;
    
    let billableConsumption = consumption - freeConsumption;
    if (billableConsumption < 0) billableConsumption = 0;

    if (billableConsumption <= standardMeters) {
        amount += billableConsumption * basicTariff;
    } else {
        amount += (standardMeters * basicTariff) + ((billableConsumption - standardMeters) * excessTariff);
    }
    
    return amount;
}

const Invoices = () => {
    // CORREÇÃO: Obter o contexto inteiro primeiro
    const context = useAppContext();

    // CORREÇÃO: Adicionar uma verificação de segurança (guard clause)
    if (!context || !context.userId) {
        return <div className="text-center p-10 font-semibold text-gray-600">Carregando dados do usuário...</div>;
    }

    // CORREÇÃO: Desestruturar o contexto somente após a verificação
    const { db, userId, getCollectionPath, formatDate } = context;

    const [invoices, setInvoices] = useState([]);
    const [associates, setAssociates] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [readings, setReadings] = useState([]);
    const [settings, setSettings] = useState(null);
    const [selectedAssociateId, setSelectedAssociateId] = useState('');
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info' });
    const [searchTerm, setSearchTerm] = useState('');
    const [pdfGenerating, setPdfGenerating] = useState(false);

    useEffect(() => {
        // A verificação no início do componente já garante que db e userId existem.
        const unsubscribes = [
            onSnapshot(collection(db, getCollectionPath('invoices', userId)), snapshot => 
                setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
            ),
            onSnapshot(collection(db, getCollectionPath('associates', userId)), snapshot => 
                setAssociates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
            ),
            onSnapshot(collection(db, getCollectionPath('periods', userId)), snapshot => 
                setPeriods(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
            ),
            onSnapshot(collection(db, getCollectionPath('readings', userId)), snapshot => 
                setReadings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
            ),
            onSnapshot(doc(db, getCollectionPath('settings', userId), 'config'), docSnap => {
                if (docSnap.exists()) setSettings(docSnap.data());
            })
        ];

        return () => unsubscribes.forEach(unsub => unsub());
    }, [db, userId, getCollectionPath]);

    // O restante do seu componente Invoices.js permanece o mesmo...
    // (A lógica para gerar faturas, PDF, etc., não precisa de alterações)

    const handleGenerateInvoice = async () => {
        if (!settings) {
            setModalContent({ title: 'Erro', message: 'Configurações de tarifas não carregadas.' });
            setShowModal(true);
            return;
        }

        const associate = associates.find(a => a.id === selectedAssociateId);
        const period = periods.find(p => p.id === selectedPeriodId);

        if (!associate || !period) {
            setModalContent({ title: 'Erro', message: 'Selecione um associado e um período.' });
            setShowModal(true);
            return;
        }

        const latestReading = readings.find(r => r.associateId === selectedAssociateId && r.periodId === selectedPeriodId);
        if (!latestReading) {
            setModalContent({ title: 'Erro', message: 'Nenhuma leitura encontrada para o associado no período.' });
            setShowModal(true);
            return;
        }
        
        const previousReadingValue = latestReading.previousReading || 0;
        const consumption = latestReading.consumption || 0;
        const amountDue = calculateAmountDue(associate, consumption, settings);

        try {
            const q = query(collection(db, getCollectionPath('invoices', userId)), where('associateId', '==', selectedAssociateId), where('periodId', '==', selectedPeriodId));
            const existing = await getDocs(q);
            if (!existing.empty) {
                setModalContent({ title: 'Aviso', message: 'Fatura já existe para este associado e período.' });
                setShowModal(true);
                return;
            }

            await addDoc(collection(db, getCollectionPath('invoices', userId)), {
                associateId: selectedAssociateId,
                periodId: selectedPeriodId,
                period: period.billingPeriodName,
                consumption: parseFloat(consumption.toFixed(2)),
                amountDue: parseFloat(amountDue.toFixed(2)),
                invoiceDate: new Date().toISOString().split('T')[0],
                status: 'Pendente',
                latestReadingId: latestReading.id,
                previousReadingValue,
            });
            setModalContent({ title: 'Sucesso', message: 'Fatura gerada com sucesso!' });
            setShowModal(true);
        } catch (e) {
            setModalContent({ title: 'Erro', message: `Falha ao gerar fatura: ${e.message}` });
            setShowModal(true);
        }
    };

    const handleMarkAsPaid = (invoiceId) => {
        setModalContent({
            title: 'Confirmar Pagamento',
            message: 'Deseja marcar esta fatura como "Paga"?',
            type: 'confirm',
            onConfirm: async () => {
                const invoiceRef = doc(db, getCollectionPath('invoices', userId), invoiceId);
                await updateDoc(invoiceRef, { status: 'Pago' });
                setShowModal(false);
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };
    
    const generateInvoiceHtml = (invoice, associate, period, settings) => {
        const acajuviInfo = settings || {};
        const currentReadingDisplay = (invoice.previousReadingValue + invoice.consumption).toFixed(2);

        return `
            <div style="width: 210mm; height: 99mm; padding: 10mm; box-sizing: border-box; font-family: 'Inter', sans-serif; font-size: 10px; position: relative; border-bottom: 1px dashed #ccc;">
                <div style="text-align: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                    <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 5px; color: #1f2937;">${acajuviInfo.acajuviName || 'Associação de Água'}</h3>
                    <p style="font-size: 9px; color: #555;">CNPJ: ${acajuviInfo.acajuviCnpj || 'N/A'} | Endereço: ${acajuviInfo.acajuviAddress || 'N/A'}</p>
                </div>
                <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; color: #1f2937;">Fatura de Água</h3>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                    <div>
                        <strong>Associado:</strong> ${associate.name} (ID: ${associate.sequentialId})<br>
                        <strong>Endereço:</strong> ${associate.address || 'N/A'}
                    </div>
                    <div style="text-align: right;">
                        <strong>Período:</strong> ${period.billingPeriodName}<br>
                        <strong>Vencimento:</strong> ${formatDate(period.billingDueDate)}
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left;">Leitura Anterior (m³)</th>
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left;">Leitura Atual (m³)</th>
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left;">Consumo (m³)</th>
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left;">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 5px; border: 1px solid #ddd;">${invoice.previousReadingValue.toFixed(2)}</td>
                            <td style="padding: 5px; border: 1px solid #ddd;">${currentReadingDisplay}</td>
                            <td style="padding: 5px; border: 1px solid #ddd;">${invoice.consumption.toFixed(2)}</td>
                            <td style="padding: 5px; border: 1px solid #ddd; font-weight: bold;">R$ ${invoice.amountDue.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
                <div style="text-align: center; font-size: 9px; color: #888; position: absolute; bottom: 10mm; width: calc(100% - 20mm);">
                    <p><strong>PIX:</strong> ${acajuviInfo.pixKey || 'N/A'} | <strong>Banco:</strong> ${acajuviInfo.bankName || 'N/A'} - Ag: ${acajuviInfo.bankAgency || 'N/A'} - Cc: ${acajuviInfo.bankAccountNumber || 'N/A'}</p>
                </div>
            </div>
        `;
    };

    const handleGeneratePdf = async () => {
        if (!selectedPeriodId || !settings) {
            setModalContent({ title: 'Erro', message: 'Selecione um período e verifique se as configurações estão carregadas.' });
            setShowModal(true);
            return;
        }
        setPdfGenerating(true);
        try {
            const period = periods.find(p => p.id === selectedPeriodId);
            const invoicesForPeriod = invoices.filter(inv => inv.periodId === selectedPeriodId);
            if (invoicesForPeriod.length === 0) {
                setModalContent({ title: 'Aviso', message: 'Nenhuma fatura encontrada para este período.' });
                setShowModal(true);
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.width = '210mm';
            document.body.appendChild(tempDiv);

            const invoicesWithDetails = invoicesForPeriod.map(inv => ({
                ...inv,
                associate: associates.find(a => a.id === inv.associateId)
            })).filter(inv => inv.associate);

            invoicesWithDetails.sort((a, b) => (a.associate.sequentialId > b.associate.sequentialId) ? 1 : -1);

            for (let i = 0; i < invoicesWithDetails.length; i += 3) {
                const chunk = invoicesWithDetails.slice(i, i + 3);
                let html = '';
                for (const invoice of chunk) {
                    html += generateInvoiceHtml(invoice, invoice.associate, period, settings);
                }
                tempDiv.innerHTML = html;
                const canvas = await window.html2canvas(tempDiv, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                if (i > 0) doc.addPage();
                doc.addImage(imgData, 'PNG', 0, 0, 210, 297);
            }
            
            doc.save(`faturas_${period.billingPeriodName.replace(/\s/g, '_')}.pdf`);
        } catch (error) {
            setModalContent({ title: 'Erro no PDF', message: `Falha ao gerar PDF: ${error.message}` });
            setShowModal(true);
        } finally {
            setPdfGenerating(false);
            const tempDiv = document.querySelector('div[style*="left: -9999px"]');
            if (tempDiv) document.body.removeChild(tempDiv);
        }
    };
    
    const getAssociateName = (associateId) => associates.find(a => a.id === associateId)?.name || 'N/A';

    const filteredInvoices = invoices.filter(invoice => {
        const associateName = getAssociateName(invoice.associateId).toLowerCase();
        return associateName.includes(searchTerm.toLowerCase()) || (invoice.period && invoice.period.toLowerCase().includes(searchTerm.toLowerCase()));
    });

    return (
        <div className="p-4 md:p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Gerenciar Faturas</h2>

            <div className="mb-8 p-6 border rounded-xl bg-gray-50">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerar Nova Fatura</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <select value={selectedAssociateId} onChange={e => setSelectedAssociateId(e.target.value)} className="w-full p-3 border rounded-lg">
                        <option value="">Selecione um Associado</option>
                        {associates.map(a => <option key={a.id} value={a.id}>{a.name} (ID: {a.sequentialId})</option>)}
                    </select>
                    <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full p-3 border rounded-lg">
                        <option value="">Selecione um Período</option>
                        {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                    </select>
                    <Button onClick={handleGenerateInvoice} variant="success" className="w-full md:col-span-2">Gerar Fatura</Button>
                </div>
            </div>

            <div className="mb-8 p-6 border rounded-xl bg-gray-50 text-center">
                 <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerar PDF de Faturas por Período</h3>
                 <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="w-full md:w-1/2 p-3 border rounded-lg mb-4">
                     <option value="">Selecione um Período para PDF</option>
                     {periods.map(p => <option key={p.id} value={p.id}>{p.billingPeriodName}</option>)}
                 </select>
                 <Button onClick={handleGeneratePdf} variant="purple" disabled={pdfGenerating}>
                     {pdfGenerating ? 'Gerando...' : 'Gerar PDF de Faturas'}
                 </Button>
            </div>

            <div className="mb-8">
                <LabeledInput type="text" placeholder="Buscar por nome ou período..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>

            <div className="overflow-x-auto rounded-xl shadow-md">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="py-3 px-4 text-left text-xs font-semibold uppercase text-gray-600">Associado</th>
                            <th className="py-3 px-4 text-left text-xs font-semibold uppercase text-gray-600">Período</th>
                            <th className="py-3 px-4 text-left text-xs font-semibold uppercase text-gray-600">Valor (R$)</th>
                            <th className="py-3 px-4 text-left text-xs font-semibold uppercase text-gray-600">Status</th>
                            <th className="py-3 px-4 text-left text-xs font-semibold uppercase text-gray-600">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.sort((a,b) => new Date(b.invoiceDate) - new Date(a.invoiceDate)).map(invoice => (
                            <tr key={invoice.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{getAssociateName(invoice.associateId)}</td>
                                <td className="py-3 px-4">{invoice.period}</td>
                                <td className="py-3 px-4">R$ {invoice.amountDue.toFixed(2)}</td>
                                <td className={`py-3 px-4 font-semibold ${invoice.status === 'Pendente' ? 'text-red-500' : 'text-green-600'}`}>
                                    {invoice.status}
                                </td>
                                <td className="py-3 px-4">
                                    {invoice.status === 'Pendente' && (
                                        <Button onClick={() => handleMarkAsPaid(invoice.id)} variant="primary" size="xs">Marcar como Paga</Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Modal {...modalContent} show={showModal} onConfirm={() => setShowModal(false)} onCancel={() => setShowModal(false)} />
        </div>
    );
};

export default Invoices;
