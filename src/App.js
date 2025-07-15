/* global __app_id, __initial_auth_token */
/* global html2canvas, jspdf */
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import Modal from './components/Modal';
import Readings from './components/Readings';
import LabeledInput from './components/LabeledInput';
import Button from './components/Button';
import AssociateForm from './components/AssociateForm';
import AssociatesFilterModal from './components/AssociatesFilterModal';
import Associates from './components/Associates';
import AssociateDetails from './components/AssociateDetails';


import { AuthProvider, useAuth } from './components/Auth/AuthContext';
import RequireAuth from './components/Auth/RequireAuth';
export default function AppWrapper() {
    return (
        <AuthProvider>
            <RequireAuth>
                <App />
            </RequireAuth>
        </AuthProvider>
    );
}

// Cria um contexto para os serviços Firebase e dados do usuário
export const AppContext = createContext(null);

// Hook personalizado para usar o contexto do aplicativo
export const useAppContext = () => useContext(AppContext);

// Função utilitária stub para evitar erro de referência
function getCollectionPath(collectionName, userId) {
  // Ajuste conforme sua estrutura de dados no Firestore
  return `${userId}/${collectionName}`;
}

// Função utilitária stub para cálculo de valor devido
function calculateAmountDue(associate, consumption, settings) {
  // Implemente a lógica real conforme necessário
  if (!associate || !settings) return 0;
  const tariff = settings.tariffs[associate.type] || settings.tariffs['Associado'];
  if (!tariff) return 0;
  let amount = tariff.fixedFee;
  if (consumption > tariff.freeConsumption) {
    amount += (tariff.basicTariff * tariff.freeConsumption) + ((consumption - tariff.freeConsumption) * tariff.excessTariff);
  } else {
    amount += tariff.basicTariff * consumption;
  }
  return amount;
}

// Função utilitária stub para formatação de datas
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  // Retorna no formato dd/mm/yyyy
  return d.toLocaleDateString('pt-BR');
}

const App = () => {
    const { currentUser } = useAuth();
    const [currentPage, setCurrentPage] = useState('home');
    const [associateToEdit, setAssociateToEdit] = useState(null);
    const [viewingAssociateDetails, setViewingAssociateDetails] = useState(null);
    const [modalContent, setModalContent] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const gerarFatura = async ({ associates, readings, periods, selectedAssociateId, selectedPeriodId, settings, userId }) => {
        if (!settings) {
            setModalContent({
                title: 'Configurações Não Carregadas',
                message: 'As configurações de tarifas não foram carregadas. Por favor, tente novamente.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const associate = associates.find(a => a.id === selectedAssociateId);
        const period = periods.find(p => p.id === selectedPeriodId);

        if (!associate || !period) {
            setModalContent({
                title: 'Erro',
                message: 'Associado ou Período selecionado não encontrado.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const latestReadingInCurrentPeriod = readings.find(
            r => r.associateId === selectedAssociateId && r.periodId === selectedPeriodId
        );

        if (!latestReadingInCurrentPeriod) {
            setModalContent({
                title: 'Leituras Insuficientes',
                message: 'Nenhuma leitura encontrada para o associado no período selecionado. Por favor, insira a leitura atual na aba "Leituras".',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const previousPeriodReadings = readings
            .filter(r => r.associateId === selectedAssociateId && new Date(r.date) < new Date(period.readingDate))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        const previousReadingValue = previousPeriodReadings.length > 0 ? previousPeriodReadings[0].currentReading : 0;
        const consumption = latestReadingInCurrentPeriod.currentReading - previousReadingValue;
        const amountDue = calculateAmountDue(associate, consumption, settings);
        const invoiceDate = new Date().toISOString().split('T')[0];

        const newInvoice = {
            associateId: selectedAssociateId,
            periodId: selectedPeriodId,
            period: period.billingPeriodName,
            consumption: parseFloat(consumption.toFixed(2)),
            amountDue: parseFloat(amountDue.toFixed(2)),
            invoiceDate: invoiceDate,
            status: 'Pendente',
            latestReadingId: latestReadingInCurrentPeriod.id,
            previousReadingValue: previousReadingValue,
        };

        try {
            const q = query(
                collection(db, getCollectionPath('invoices', userId)),
                where('associateId', '==', selectedAssociateId),
                where('periodId', '==', selectedPeriodId)
            );
            const existingInvoices = await getDocs(q);

            if (!existingInvoices.empty) {
                setModalContent({
                    title: 'Fatura Existente',
                    message: 'Já existe uma fatura gerada para este associado e período.',
                    type: 'info',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
                return;
            }

            await addDoc(collection(db, getCollectionPath('invoices', userId)), newInvoice);
            setModalContent({
                title: 'Sucesso',
                message: 'Fatura gerada com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } catch (e) {
            console.error("Erro ao gerar fatura: ", e);
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível gerar a fatura. Por favor, tente novamente.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const renderPage = () => {
        if (associateToEdit) {
            return <AssociateForm associateToEdit={associateToEdit} onSave={() => { setAssociateToEdit(null); setCurrentPage('associates'); }} onCancel={() => setAssociateToEdit(null)} />;
        }
        if (viewingAssociateDetails) {
            return <AssociateDetails associate={viewingAssociateDetails} onBack={() => setViewingAssociateDetails(null)} onSaveObservations={(updatedObservations) => {}} />;
        }

        switch (currentPage) {
            case 'home':
            case 'associates':
            case 'readings':
            case 'generalHydrometers':
            case 'invoices':
            case 'reports':
            case 'settings':
            case 'profile':
            default:
                return <Home />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-inter">
            <ExternalScripts />
            <nav className="bg-blue-700 p-4 shadow-lg">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
                    <h1 className="text-white text-3xl font-bold mb-4 md:mb-0">Sistema de Água Potável</h1>
                    <div className="flex flex-wrap justify-center gap-3">
                        {/* ... seus botões aqui ... */}
                    </div>
                </div>
            </nav>
            <main className="container mx-auto p-4">
                {renderPage()}
            </main>
        </div>
    );
};

    const handleMarkAsPaid = (invoiceId) => {
        setModalContent({
            title: 'Confirmar Pagamento',
            message: 'Tem certeza que deseja marcar esta fatura como "Paga"?',
            type: 'confirm',
            onConfirm: async () => {
                try {
                    const invoiceRef = doc(db, getCollectionPath('invoices', userId), invoiceId);
                    await updateDoc(invoiceRef, { status: 'Pago' });
                    setModalContent({
                        title: 'Sucesso',
                        message: 'Fatura marcada como paga com sucesso!',
                        type: 'info',
                        onConfirm: () => setShowModal(false)
                    });
                    setShowModal(true);
                } catch (e) {
                    console.error("Erro ao marcar fatura como paga: ", e);
                    setModalContent({
                        title: 'Erro',
                        message: 'Não foi possível marcar a fatura como paga. Por favor, tente novamente.',
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

    const generateInvoiceHtml = (invoice, associate, period, acajuviInfo) => {
        const currentReadingDisplay = (invoice.previousReadingValue + invoice.consumption).toFixed(2);

        return `
            <div style="width: 210mm; height: 99mm; padding: 10mm; box-sizing: border-box; font-family: 'Inter', sans-serif; font-size: 10px; position: relative; border: 1px dashed #ccc; margin-bottom: 5mm;">
                <div style="text-align: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                    <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 5px; color: #1f2937;">${acajuviInfo.acajuviName || 'Associação de Água'}</h3>
                    <p style="font-size: 9px; color: #555;">CNPJ: ${acajuviInfo.acajuviCnpj || 'N/A'} | Endereço: ${acajuviInfo.acajuviAddress || 'N/A'}</p>
                    <p style="font-size: 9px; color: #555;">Telefone: ${acajuviInfo.acajuviPhone || 'N/A'} | Email: ${acajuviInfo.acajuviEmail || 'N/A'}</p>
                </div>
                <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; color: #1f2937;">Fatura de Água</h3>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                    <div style="flex: 1; margin-right: 10px;">
                        <strong>Associado:</strong> ${associate.name} (ID: ${associate.sequentialId})<br>
                        <strong>Endereço:</strong> ${associate.address || 'N/A'}<br>
                        <strong>Contato:</strong> ${associate.contact || 'N/A'}<br>
                        <strong>Região:</strong> ${associate.region || 'N/A'}<br>
                        <strong>Hidrômetro Geral:</strong> ${associate.generalHydrometerId || 'N/A'}
                    </div>
                    <div style="flex: 1; text-align: right;">
                        <strong>Período de Faturamento:</strong> ${period.billingPeriodName}<br>
                        <strong>Período de Consumo:</strong> ${period.consumptionPeriodName}<br>
                        <strong>Data da Fatura:</strong> ${formatDate(invoice.invoiceDate)}<br>
                        <strong>Vencimento:</strong> ${formatDate(period.billingDueDate)}<br>
                        <strong>Status:</strong> ${invoice.status}
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left; color: #4b5563;">Leitura Anterior (m³)</th>
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left; color: #4b5563;">Leitura Atual (m³)</th>
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left; color: #4b5563;">Consumo (m³)</th>
                            <th style="padding: 5px; border: 1px solid #ddd; text-align: left; color: #4b5563;">Valor Devido (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 5px; border: 1px solid #ddd; color: #374151;">${invoice.previousReadingValue.toFixed(2)}</td>
                            <td style="padding: 5px; border: 1px solid #ddd; color: #374151;">${currentReadingDisplay}</td>
                            <td style="padding: 5px; border: 1px solid #ddd; color: #374151;">${invoice.consumption.toFixed(2)}</td>
                            <td style="padding: 5px; border: 1px solid #ddd; color: #374151; font-weight: bold;">R$ ${invoice.amountDue.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
                <div style="text-align: center; font-size: 9px; color: #888; position: absolute; bottom: 15mm; width: calc(100% - 20mm);">
                    <p><strong>Dados Bancários:</strong> ${acajuviInfo.bankName || 'N/A'} - Ag: ${acajuviInfo.bankAgency || 'N/A'} - Cc: ${acajuviInfo.bankAccountNumber || 'N/A'}</p>
                    <p><strong>Chave PIX:</strong> ${acajuviInfo.pixKey || 'N/A'}</p>
                </div>
                <p style="text-align: center; font-size: 8px; color: #888; position: absolute; bottom: 5mm; width: calc(100% - 20mm); border-bottom: 1px dashed #ccc;">
                    Linha de Recorte
                </p>
            </div>
        `;
    };

    const handleGeneratePdf = async () => {
        if (!selectedPeriodId) {
            setModalContent({
                title: 'Período Não Selecionado',
                message: 'Por favor, selecione um período para gerar o PDF das faturas.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        setPdfGenerating(true);
        let tempDiv = null;
        try {
            const period = periods.find(p => p.id === selectedPeriodId);
            if (!period) {
                setModalContent({
                    title: 'Erro',
                    message: 'Período selecionado não encontrado.',
                    type: 'danger',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
                setPdfGenerating(false);
                return;
            }

            const invoicesForPeriod = invoices.filter(inv => inv.periodId === selectedPeriodId);

            if (invoicesForPeriod.length === 0) {
                setModalContent({
                    title: 'Nenhuma Fatura',
                    message: 'Não há faturas geradas para o período selecionado. Por favor, gere as faturas primeiro.',
                    type: 'info',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
                setPdfGenerating(false);
                return;
            }

            const detailedInvoices = invoicesForPeriod.map(inv => {
                const associate = associates.find(a => a.id === inv.associateId);
                // previousReadingValue is now stored in the invoice itself
                return {
                    ...inv,
                    associate: associate,
                };
            }).filter(inv => inv.associate);

            detailedInvoices.sort((a, b) => {
                const regionA = a.associate?.region || '';
                const regionB = b.associate?.region || '';
                const hydrometerA = a.associate?.generalHydrometerId || '';
                const hydrometerB = b.associate?.generalHydrometerId || '';

                if (regionA < regionB) return -1;
                if (regionA > regionB) return 1;
                if (hydrometerA < hydrometerB) return -1;
                if (hydrometerA > b.associate?.generalHydrometerId) return 1;
                return 0;
            });

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const A4_HEIGHT_MM = 297;
            const INVOICE_HEIGHT_MM = A4_HEIGHT_MM / 3;

            let currentHtmlContent = '';
            let invoicesOnCurrentPage = 0;
            let currentRegion = null;

            tempDiv = document.createElement('div');
            tempDiv.style.width = '210mm';
            tempDiv.style.height = 'fit-content';
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            document.body.appendChild(tempDiv);

            for (let i = 0; i < detailedInvoices.length; i++) {
                const invoice = detailedInvoices[i];

                if (currentRegion === null) {
                    currentRegion = invoice.associate.region;
                } else if (invoice.associate.region !== currentRegion) {
                    if (invoicesOnCurrentPage > 0) {
                        while (invoicesOnCurrentPage < 3) {
                            currentHtmlContent += `<div style="width: 210mm; height: ${INVOICE_HEIGHT_MM}mm; padding: 10mm; box-sizing: border-box; font-family: 'Inter', sans-serif; font-size: 10px; position: relative;"></div>`;
                            invoicesOnCurrentPage++;
                        }
                        tempDiv.innerHTML = currentHtmlContent;
                        const canvas = await html2canvas(tempDiv, { scale: 2 });
                        const imgData = canvas.toDataURL('image/png');
                        doc.addImage(imgData, 'PNG', 0, 0, 210, A4_HEIGHT_MM);
                        doc.addPage();
                    }
                    currentHtmlContent = '';
                    invoicesOnCurrentPage = 0;
                    currentRegion = invoice.associate.region;
                } else if (invoicesOnCurrentPage === 3) {
                    tempDiv.innerHTML = currentHtmlContent;
                    const canvas = await html2canvas(tempDiv, { scale: 2 });
                    const imgData = canvas.toDataURL('image/png');
                    doc.addImage(imgData, 'PNG', 0, 0, 210, A4_HEIGHT_MM);
                    doc.addPage();
                    currentHtmlContent = '';
                    invoicesOnCurrentPage = 0;
                }

                currentHtmlContent += generateInvoiceHtml(invoice, invoice.associate, period || {}, settings || {});
                invoicesOnCurrentPage++;
            }

            if (currentHtmlContent) {
                while (invoicesOnCurrentPage < 3) {
                    currentHtmlContent += `<div style="width: 210mm; height: ${INVOICE_HEIGHT_MM}mm; padding: 10mm; box-sizing: border-box; font-family: 'Inter', sans-serif; font-size: 10px; position: relative;"></div>`;
                    invoicesOnCurrentPage++;
                }
                tempDiv.innerHTML = currentHtmlContent;
                const canvas = await html2canvas(tempDiv, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                doc.addImage(imgData, 'PNG', 0, 0, 210, A4_HEIGHT_MM);
            }

            doc.save(`faturas_${period.billingPeriodName.replace(/ /g, '_')}.pdf`);

            setModalContent({
                title: 'PDF Gerado',
                message: 'O PDF com as faturas foi gerado com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            setModalContent({
                title: 'Erro ao Gerar PDF',
                message: `Não foi possível gerar o PDF das faturas. Erro: ${error.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } finally {
            setPdfGenerating(false);
            if (tempDiv && tempDiv.parentNode) {
                tempDiv.parentNode.removeChild(tempDiv);
            }
        }
    };

    const filteredInvoices = invoices.filter(invoice => {
        const associate = associates.find(a => a.id === invoice.associateId);
        const associateName = associate ? associate.name.toLowerCase() : '';
        const periodName = invoice.period ? invoice.period.toLowerCase() : '';
        const searchLower = searchTerm.toLowerCase();

        return associateName.includes(searchLower) || periodName.includes(searchLower);
    });

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Gerar e Visualizar Faturas</h2>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerar Nova Fatura</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <select
                        value={selectedAssociateId}
                        onChange={(e) => setSelectedAssociateId(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition duration-150 bg-white"
                    >
                        <option value="">Selecione um Associado</option>
                        {associates.map(associate => (
                            <option key={associate.id} value={associate.id}>{associate.name} (ID: ${associate.sequentialId})</option>
                        ))}
                    </select>
                    <select
                        value={selectedPeriodId}
                        onChange={(e) => setSelectedPeriodId(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition duration-150 bg-white"
                    >
                        <option value="">Selecione um Período</option>
                        {periods.map(period => (
                            <option key={period.id} value={period.id}>{period.billingPeriodName}</option>
                        ))}
                    </select>
                    <Button
                        onClick={handleGenerateInvoice}
                        variant="success"
                        className="w-full md:col-span-2 py-3 px-6"
                    >
                        Gerar Fatura
                    </Button>
                </div>
                {settings && (
                    <p className="mt-4 text-sm text-gray-600">
                        A fatura será gerada com base na leitura atual do hidrômetro do associado no período selecionado,
                        e a leitura anterior do período anterior, aplicando as tarifas configuradas.
                    </p>
                )}
            </div>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 text-center shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerar PDF de Faturas por Período</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Selecione um período e clique no botão para gerar um único PDF com todas as faturas desse período,
                    organizadas por região, com 3 faturas por página e linha de recorte.
                </p>
                <select
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="w-full md:w-1/2 p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 transition duration-150 bg-white mb-4"
                >
                    <option value="">Selecione um Período para PDF</option>
                    {periods.map(period => (
                        <option key={period.id} value={period.id}>{period.billingPeriodName}</option>
                    ))}
                </select>
                <Button
                    onClick={handleGeneratePdf}
                    variant="purple"
                    className="w-full md:w-auto py-3 px-6"
                    disabled={pdfGenerating}
                >
                    {pdfGenerating ? 'Gerando PDF...' : 'Gerar PDF de Faturas'}
                </Button>
                {pdfGenerating && (
                    <p className="mt-2 text-sm text-gray-600">Isso pode levar alguns segundos...</p>
                )}
            </div>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <LabeledInput
                    label={null}
                    type="text"
                    placeholder="Buscar faturas por nome do associado ou período..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                />
            </div>

            <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Faturas Geradas</h3>
                {filteredInvoices.length === 0 ? (
                    <p className="text-gray-600 p-4 bg-gray-50 rounded-lg">Nenhuma fatura encontrada com os critérios de busca.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl shadow-md border border-gray-200">
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tl-xl">Associado</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Período</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Consumo (m³)</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Valor Devido (R$)</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data da Fatura</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tr-xl">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate)).map((invoice) => (
                                    <tr key={invoice.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition duration-100">
                                        <td className="py-3 px-4 text-gray-800 text-sm">{getAssociateName(invoice.associateId)}</td>
                                        <td className="py-3 px-4 text-gray-800 text-sm">{invoice.period}</td>
                                        <td className="py-3 px-4 text-gray-800 text-sm">{invoice.consumption}</td>
                                        <td className="py-3 px-4 text-gray-800 text-sm">R$ {invoice.amountDue.toFixed(2)}</td>
                                        <td className="py-3 px-4 text-gray-800 text-sm">{formatDate(invoice.invoiceDate)}</td>
                                        <td className={`py-3 px-4 font-semibold text-sm ${invoice.status === 'Pendente' ? 'text-red-500' : 'text-green-600'}`}>
                                            {invoice.status}
                                        </td>
                                        <td className="py-3 px-4 text-sm">
                                            {invoice.status === 'Pendente' && (
                                                <Button
                                                    onClick={() => handleMarkAsPaid(invoice.id)}
                                                    variant="purple"
                                                    size="xs"
                                                    className="px-3 py-1"
                                                >
                                                    Marcar como Paga
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};

// Componente de Relatórios
const Reports = () => {
    const { db, userId } = useAppContext();
    const [associatesCount, setAssociatesCount] = useState(0);
    const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
    const [paidInvoicesCount, setPaidInvoicesCount] = useState(0);

    useEffect(() => {
        if (!db || !userId) return;

        const associatesColRef = collection(db, getCollectionPath('associates', userId));
        const unsubscribeAssociates = onSnapshot(associatesColRef, (snapshot) => {
            setAssociatesCount(snapshot.size);
        }, (error) => {
            console.error("Erro ao carregar contagem de associados:", error);
        });

        const invoicesColRef = collection(db, getCollectionPath('invoices', userId));
        const unsubscribeInvoices = onSnapshot(invoicesColRef, (snapshot) => {
            let pending = 0;
            let paid = 0;
            snapshot.forEach(doc => {
                const invoice = doc.data();
                if (invoice.status === 'Pendente') {
                    pending++;
                } else if (invoice.status === 'Pago') {
                    paid++;
                }
            });
            setPendingInvoicesCount(pending);
            setPaidInvoicesCount(paid);
        }, (error) => {
            console.error("Erro ao carregar contagem de faturas:", error);
        });

        return () => {
            unsubscribeAssociates();
            unsubscribeInvoices();
        };
    }, [db, userId]);

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
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

// Componente de Gerenciamento de Hidrômetros Gerais
const GeneralHydrometers = () => {
    const { db, userId } = useAppContext();
    const [generalReadings, setGeneralReadings] = useState([]);
    const [generalHydrometersList, setGeneralHydrometersList] = useState([]);
    const [periods, setPeriods] = useState([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [selectedGeneralHydrometerId, setSelectedGeneralHydrometerId] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [editableReadings, setEditableReadings] = useState({});

    useEffect(() => {
        if (!db || !userId) return;

        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().generalHydrometers) {
                setGeneralHydrometersList(docSnap.data().generalHydrometers);
                if (docSnap.data().generalHydrometers.length > 0 && !selectedGeneralHydrometerId) {
                    setSelectedGeneralHydrometerId(docSnap.data().generalHydrometers[0]);
                }
            } else {
                setGeneralHydrometersList([
                    '#2 Geral Centro', '#3 Giacomin Industrial', '#4 Hortência Buset',
                    '#5 Hortência Industrial', '#6 Osmar Buset', '#7 Macari Buset',
                    '#8 Picada Estorta Centro', '#9 Jair Vila Rica', '#10 Edino Vila Rica',
                    '#11 Mussoi Vila Rica', '#12 Tchicão Vila Rica', '#13 Vila Gaio São Vitor',
                    'Consumo da Rede'
                ]);
            }
        }, (error) => {
            console.error("Erro ao carregar hidrômetros gerais das configurações:", error);
        });

        const generalReadingsColRef = collection(db, getCollectionPath('generalReadings', userId));
        const unsubscribeGeneralReadings = onSnapshot(generalReadingsColRef, (snapshot) => {
            setGeneralReadings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Erro ao carregar leituras gerais:", error);
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível carregar as leituras gerais. Por favor, tente novamente.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        });

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubscribePeriods = onSnapshot(periodsColRef, (snapshot) => {
            const periodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPeriods(periodsData.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate)));
            if (periodsData.length > 0 && !selectedPeriodId) {
                setSelectedPeriodId(periodsData[0].id);
            }
        }, (error) => {
            console.error("Erro ao carregar períodos:", error);
        });

        return () => {
            unsubscribeSettings();
            unsubscribeGeneralReadings();
            unsubscribePeriods();
        };
    }, [db, userId, selectedPeriodId, selectedGeneralHydrometerId]);

    const getReadingsForGeneralHydrometerAndPeriod = (hydrometerName, periodId) => {
        const period = periods.find(p => p.id === periodId);
        if (!period) return { currentReading: null, previousReading: null, currentReadingDoc: null, consumption: 0 };

        const previousReadingDoc = generalReadings
            .filter(r => r.generalHydrometerName === hydrometerName && new Date(r.date) < new Date(period.readingDate))
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

        const prevReadingValue = previousReadingDoc ? previousReadingDoc.currentReading : 0;

        const currentReadingDoc = generalReadings
            .filter(r => r.generalHydrometerName === hydrometerName && r.periodId === periodId)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

        const currReadingValue = currentReadingDoc ? currentReadingDoc.currentReading : 0;
        const calculatedConsumption = currReadingValue - prevReadingValue;

        return {
            currentReading: currentReadingDoc ? currentReadingDoc.currentReading : null,
            previousReading: prevReadingValue,
            currentReadingDoc: currentReadingDoc,
            consumption: calculatedConsumption,
        };
    };

    const handleCurrentReadingChange = (hydrometerName, value) => {
        setEditableReadings(prev => ({
            ...prev,
            [hydrometerName]: value
        }));
    };

    const handleSaveReading = async (hydrometerName) => {
        const value = editableReadings[hydrometerName];
        if (value === undefined || value === null || value === '') {
            setModalContent({
                title: 'Campo Vazio',
                message: 'A leitura atual não pode ser vazia.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const { currentReadingDoc, previousReading } = getReadingsForGeneralHydrometerAndPeriod(hydrometerName, selectedPeriodId);
        const parsedValue = parseFloat(value);

        if (parsedValue < previousReading) {
            setModalContent({
                title: 'Leitura Inválida',
                message: 'A leitura atual não pode ser menor que a leitura anterior.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        try {
            const calculatedConsumption = parsedValue - previousReading;

            if (currentReadingDoc) {
                const readingRef = doc(db, getCollectionPath('generalReadings', userId), currentReadingDoc.id);
                await updateDoc(readingRef, {
                    currentReading: parsedValue,
                    previousReading: previousReading, // Store previous reading as requested
                    consumption: calculatedConsumption,
                    date: new Date().toISOString().split('T')[0]
                });
            } else {
                const period = periods.find(p => p.id === selectedPeriodId);
                if (!period) {
                    setModalContent({
                        title: 'Erro',
                        message: 'Período selecionado não encontrado.',
                        type: 'danger',
                        onConfirm: () => setShowModal(false)
                    });
                    setShowModal(true);
                    return;
                }
                await addDoc(collection(db, getCollectionPath('generalReadings', userId)), {
                    generalHydrometerName: hydrometerName,
                    date: new Date().toISOString().split('T')[0],
                    currentReading: parsedValue,
                    previousReading: previousReading,
                    periodId: selectedPeriodId,
                    consumption: calculatedConsumption,
                });
            }
            setEditableReadings(prev => {
                const newEditable = { ...prev };
                delete newEditable[hydrometerName];
                return newEditable;
            });
            setSuccessMessage('Leitura geral salva com sucesso!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (e) {
            console.error("Erro ao salvar leitura geral: ", e);
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar a leitura geral. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const filteredGeneralHydrometers = generalHydrometersList.filter(hydrometer =>
        hydrometer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Gerenciar Leituras de Hidrômetros Gerais</h2>

            {successMessage && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative mb-6 shadow-sm" role="alert">
                    <span className="block sm:inline">{successMessage}</span>
                </div>
            )}

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 flex flex-col md:flex-row gap-4 items-center shadow-sm">
                <div className="flex-grow w-full">
                    <LabeledInput
                        label={null}
                        type="text"
                        placeholder="Buscar hidrômetro geral..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                    />
                </div>
                <div className="w-full md:w-auto">
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
            </div>

            <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Leituras por Hidrômetro Geral no Período Selecionado</h3>
                {!selectedPeriodId ? (
                    <p className="text-gray-600 p-4 bg-gray-50 rounded-lg">Por favor, selecione um período para visualizar as leituras.</p>
                ) : filteredGeneralHydrometers.length === 0 ? (
                    <p className="text-gray-600 p-4 bg-gray-50 rounded-lg">Nenhum hidrômetro geral encontrado com os critérios de busca para o período selecionado.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl shadow-md border border-gray-200">
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tl-xl">Hidrômetro Geral</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Leitura Anterior (m³)</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Leitura Atual (m³)</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Consumo (m³)</th>
                                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tr-xl">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredGeneralHydrometers.map((hydrometerName) => {
                                    const { currentReading, previousReading, consumption } = getReadingsForGeneralHydrometerAndPeriod(hydrometerName, selectedPeriodId);
                                    const displayCurrentReading = editableReadings[hydrometerName] !== undefined ? editableReadings[hydrometerName] : (currentReading !== null ? currentReading.toFixed(2) : '');

                                    return (
                                        <tr key={hydrometerName} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition duration-100">
                                            <td className="py-3 px-4 text-gray-800 font-semibold text-sm">{hydrometerName}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{previousReading.toFixed(2)}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">
                                                <LabeledInput
                                                    key={`${hydrometerName}-${selectedPeriodId}-currentReading`}
                                                    type="number"
                                                    step="0.01"
                                                    value={displayCurrentReading}
                                                    onChange={(e) => handleCurrentReadingChange(hydrometerName, e.target.value)}
                                                    onBlur={() => handleSaveReading(hydrometerName)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleSaveReading(hydrometerName);
                                                            e.target.blur();
                                                        }
                                                    }}
                                                    className="w-28 text-sm"
                                                    placeholder="Nova leitura"
                                                    label={null}
                                                />
                                            </td>
                                            <td className="py-3 px-4 text-gray-800 font-semibold text-sm">{consumption.toFixed(2)}</td>
                                            <td className="py-3 px-4 text-sm">
                                                <Button
                                                    onClick={() => handleSaveReading(hydrometerName)}
                                                    variant="primary"
                                                    size="xs"
                                                    className="px-3 py-1"
                                                >
                                                    Salvar Leitura
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};


// Componente de Configurações
const Settings = () => {
    const { db, userId } = useAppContext();
    
    const defaultTariffConfig = {
        fixedFee: 0.00,
        standardMeters: 0,
        freeConsumption: 0,
        basicTariff: 0.00,
        excessTariff: 0.00,
    };

    const initialDefaultSettings = {
        tariffs: {
            Associado: { ...defaultTariffConfig, fixedFee: 20.00, standardMeters: 10, freeConsumption: 5, basicTariff: 3.00, excessTariff: 7.00 },
            Entidade: { ...defaultTariffConfig, fixedMeters: 30.00, standardMeters: 15, freeConsumption: 7, basicTariff: 4.00, excessTariff: 9.00 },
            Outro: { ...defaultTariffConfig, fixedFee: 25.00, standardMeters: 12, freeConsumption: 6, basicTariff: 3.50, excessTariff: 8.00 },
        },
        regions: ['Centro', 'Industrial', 'Buset', 'Vila Rica', 'São Vitor'],
        generalHydrometers: [
            '#2 Geral Centro', '#3 Giacomin Industrial', '#4 Hortência Buset',
            '#5 Hortência Industrial', '#6 Osmar Buset', '#7 Macari Buset',
            '#8 Picada Estorta Centro', '#9 Jair Vila Rica', '#10 Edino Vila Rica',
            '#11 Mussoi Vila Rica', '#12 Tchicão Vila Rica', '#13 Vila Gaio São Vitor',
            'Consumo da Rede'
        ],
        nextSequentialId: 1,
        acajuviName: 'ACAJUVI - Associação dos Consumidores de Água de Juventude e Vila Rica',
        acajuviCnpj: 'XX.XXX.XXX/XXXX-XX',
        acajuviAddress: 'Rua Principal, 123 - Juventude, RS',
        acajuviPhone: '(XX) XXXX-XXXX',
        acajuviEmail: 'contato@acajuvi.org.br',
        bankName: 'Banco Exemplo',
        bankAccountNumber: '12345-6',
        bankAgency: '0001',
        pixKey: 'suachavepix@email.com'
    };

    const [settings, setSettings] = useState(initialDefaultSettings); // Initialize with default settings
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
    const [isGeneratingPeriods, setIsGeneratingPeriods] = useState(false);

    const [newPeriodStartDate, setNewPeriodStartDate] = useState('');
    const [periods, setPeriods] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const csvHeaders = {
        associates: ['name', 'address', 'contact', 'documentNumber', 'type', 'region', 'generalHydrometerId', 'sequentialId', 'isActive', 'observations'],
        readings: ['associateId', 'date', 'currentReading', 'previousReading', 'periodId', 'consumption', 'amountDue'], // Added previousReading
        invoices: ['associateId', 'periodId', 'period', 'consumption', 'amountDue', 'invoiceDate', 'status', 'latestReadingId', 'previousReadingValue'],
        periods: ['code', 'billingPeriodName', 'billingDueDate', 'readingDate', 'consumptionPeriodName', 'consumptionStartDate', 'consumptionEndDate', 'createdAt'],
        generalReadings: ['generalHydrometerName', 'date', 'currentReading', 'previousReading', 'periodId', 'consumption'],
    };

    const generatePeriodData = (readingDateInput) => {
        const parts = readingDateInput.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);

        const readingDate = new Date(year, month, day);
        readingDate.setHours(0, 0, 0, 0);

        const readingMonthIndex = readingDate.getMonth();

        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        const billingPeriodStart = new Date(year, readingMonthIndex, 1);
        
        let secondMonthOfBillingPeriodIndex = readingMonthIndex + 1;
        let secondMonthOfBillingPeriodYear = year;
        if (secondMonthOfBillingPeriodIndex >= 12) {
            secondMonthOfBillingPeriodIndex %= 12;
            secondMonthOfBillingPeriodYear++;
        }

        const billingPeriodName = `Período de ${monthNames[readingMonthIndex]} a ${monthNames[secondMonthOfBillingPeriodIndex]} de ${secondMonthOfBillingPeriodYear}`;
        const code = `${String(readingMonthIndex + 1).padStart(2, '0')}/${year}`;

        const billingDueDate = new Date(year, readingMonthIndex, 15);

        const consumptionStartDate = new Date(year, readingMonthIndex - 2, 1);
        const consumptionEndDate = new Date(year, readingMonthIndex, 0);

        const consumptionPeriodName = `Leitura de ${monthNames[consumptionStartDate.getMonth()]} a ${monthNames[consumptionEndDate.getMonth()]} de ${consumptionStartDate.getFullYear()}`;

        return {
            code: code,
            billingPeriodName: billingPeriodName,
            billingDueDate: billingDueDate.toISOString().split('T')[0],
            readingDate: readingDate.toISOString().split('T')[0],
            consumptionPeriodName: consumptionPeriodName,
            consumptionStartDate: consumptionStartDate.toISOString().split('T')[0],
            consumptionEndDate: consumptionEndDate.toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
        };
    };

    const generateMissingPeriods = async () => {
        if (!db || !userId) return;

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const initialPeriodStart = new Date(2023, 9, 1);
        initialPeriodStart.setHours(0, 0, 0, 0);

        let currentBimesterStart = new Date(initialPeriodStart);

        const targetDateForGeneration = new Date(today);
        targetDateForGeneration.setMonth(targetDateForGeneration.getMonth() + 2);
        targetDateForGeneration.setHours(0,0,0,0);

        const existingPeriodsSnapshot = await getDocs(periodsColRef);
        const existingPeriodCodes = new Set(existingPeriodsSnapshot.docs.map(doc => doc.data().code));

        while (currentBimesterStart <= targetDateForGeneration) {
            const periodData = generatePeriodData(currentBimesterStart.toISOString().split('T')[0]);

            if (!existingPeriodCodes.has(periodData.code)) {
                try {
                    await addDoc(periodsColRef, periodData);
                    console.log(`Período ${periodData.code} adicionado automaticamente.`);
                } catch (error) {
                    console.error(`Erro ao adicionar período ${periodData.code}:`, error);
                }
            }

            currentBimesterStart.setMonth(currentBimesterStart.getMonth() + 2);
        }
    };


    useEffect(() => {
        if (!db || !userId) return;

        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const loadedSettings = docSnap.data();
                const mergedTariffs = { ...initialDefaultSettings.tariffs };
                for (const type of Object.keys(mergedTariffs)) {
                    mergedTariffs[type] = { ...mergedTariffs[type], ...(loadedSettings.tariffs && loadedSettings.tariffs[type]) };
                }
                const mergedRegions = loadedSettings.regions || initialDefaultSettings.regions;
                const mergedGeneralHydrometers = loadedSettings.generalHydrometers || initialDefaultSettings.generalHydrometers;
                const mergedNextSequentialId = loadedSettings.nextSequentialId !== undefined ? loadedSettings.nextSequentialId : initialDefaultSettings.nextSequentialId;
                
                // Merge ACAJUVI info with defaults
                const mergedAcajuviInfo = {
                    acajuviName: loadedSettings.acajuviName || initialDefaultSettings.acajuviName,
                    acajuviCnpj: loadedSettings.acajuviCnpj || initialDefaultSettings.acajuviCnpj,
                    acajuviAddress: loadedSettings.acajuviAddress || initialDefaultSettings.acajuviAddress,
                    acajuviPhone: loadedSettings.acajuviPhone || initialDefaultSettings.acajuviPhone,
                    acajuviEmail: loadedSettings.acajuviEmail || initialDefaultSettings.acajuviEmail,
                    bankName: loadedSettings.bankName || initialDefaultSettings.bankName,
                    bankAccountNumber: loadedSettings.bankAccountNumber || initialDefaultSettings.bankAccountNumber,
                    bankAgency: loadedSettings.bankAgency || initialDefaultSettings.bankAgency,
                    pixKey: loadedSettings.pixKey || initialDefaultSettings.pixKey,
                };


                setSettings({ 
                    ...loadedSettings, 
                    tariffs: mergedTariffs, 
                    regions: mergedRegions, 
                    generalHydrometers: mergedGeneralHydrometers, 
                    nextSequentialId: mergedNextSequentialId,
                    ...mergedAcajuviInfo // Add merged ACAJUVI info
                });
            } else {
                setSettings(initialDefaultSettings);
            }
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar configurações:", error);
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível carregar as configurações. Por favor, tente novamente.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            setLoading(false);
        });

        const periodsColRef = collection(db, getCollectionPath('periods', userId));
        const unsubscribePeriods = onSnapshot(periodsColRef, (snapshot) => {
            const periodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPeriods(periodsData.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate)));
        }, (error) => {
            console.error("Erro ao carregar períodos:", error);
        });

        const triggerPeriodGeneration = async () => {
            if (!loading && !isGeneratingPeriods) {
                setIsGeneratingPeriods(true);
                await generateMissingPeriods();
                setIsGeneratingPeriods(false);
            }
        };

        if (!loading) {
            triggerPeriodGeneration();
        }

        return () => {
            unsubscribeSettings();
            unsubscribePeriods();
        };
    }, [db, userId, loading]);

    const handleSaveSettings = async () => {
        if (!settings) {
            return;
        }
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, settings);
            setModalContent({
                title: 'Sucesso',
                message: 'Configurações salvas com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } catch (e) {
            console.error("Erro ao salvar configurações: ", e);
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar as configurações. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const handleTariffFieldChange = (type, field, value) => {
        setSettings(prev => ({
            ...prev,
            tariffs: {
                ...prev.tariffs,
                [type]: {
                    ...prev.tariffs[type],
                    [field]: parseFloat(value) || 0
                }
            }
        }));
    };

    const handleRegionsChange = (e) => {
        const newRegions = e.target.value.split('\n').map(r => r.trim()).filter(r => r !== '');
        setSettings(prev => ({
            ...prev,
            regions: newRegions
        }));
    };

    const handleGeneralHydrometersChange = (e) => {
        const newGeneralHydrometers = e.target.value.split('\n').map(r => r.trim()).filter(r => r !== '');
        setSettings(prev => ({
            ...prev,
            generalHydrometers: newGeneralHydrometers
        }));
    };

    const handleAcajuviInfoChange = (field, value) => {
        setSettings(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleAddPeriod = async () => {
        if (!newPeriodStartDate) {
            setModalContent({
                title: 'Campo Obrigatório',
                message: 'Por favor, preencha a Data de Início da Leitura para adicionar um novo período.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const periodData = generatePeriodData(newPeriodStartDate);

        try {
            const periodsColRef = collection(db, getCollectionPath('periods', userId));
            const q = query(periodsColRef, where('code', '==', periodData.code));
            const existingPeriod = await getDocs(q);

            if (!existingPeriod.empty) {
                setModalContent({
                    title: 'Período Duplicado',
                    message: 'Já existe um período com o mesmo código (mês/ano de faturamento). Por favor, insira um período único.',
                    type: 'info',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
                return;
            }

            await addDoc(periodsColRef, periodData);

            setNewPeriodStartDate('');
            setModalContent({
                title: 'Sucesso',
                message: 'Período adicionado com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } catch (e) {
            console.error("Erro ao adicionar período: ", e);
            setModalContent({
                title: 'Erro',
                message: `Não foi possível adicionar o período. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const handleDeletePeriod = (periodId) => {
        setModalContent({
            title: 'Confirmar Exclusão',
            message: 'Tem certeza que deseja excluir este período? Esta ação é irreversível.',
            type: 'confirm',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, getCollectionPath('periods', userId), periodId));
                    setModalContent({
                        title: 'Sucesso',
                        message: 'Período excluído com sucesso!',
                        type: 'info',
                        onConfirm: () => setShowModal(false)
                    });
                    setShowModal(true);
                } catch (e) {
                    console.error("Erro ao excluir período: ", e);
                    setModalContent({
                        title: 'Erro',
                        message: 'Não foi possível excluir o período. Por favor, tente novamente.',
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

    const exportToCsv = async (collectionName, filename) => {
        if (!db || !userId) {
            setModalContent({
                title: 'Erro de Exportação',
                message: 'Dados de usuário não disponíveis para exportação.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }
        try {
            const colRef = collection(db, getCollectionPath(collectionName, userId));
            const snapshot = await getDocs(colRef);
            let csvContent = '';
            let headers = [];

            if (snapshot.empty) {
                setModalContent({
                    title: 'Nenhum Dado',
                    message: `Não há dados para exportar na coleção "${collectionName}".`,
                    type: 'info',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
                return;
            }

            const allKeys = new Set();
            snapshot.forEach(doc => {
                Object.keys(doc.data()).forEach(key => allKeys.add(key));
            });
            headers = Array.from(allKeys).sort();

            csvContent += headers.join(',') + '\n';

            snapshot.forEach(doc => {
                const row = headers.map(header => {
                    let value = doc.data()[header];
                    if (typeof value === 'object' && value !== null) {
                        value = JSON.stringify(value);
                    }
                    if (value === undefined || value === null) {
                        value = '';
                    }
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',');
                csvContent += row + '\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setModalContent({
                title: 'Exportação Concluída',
                message: `Os dados de "${collectionName}" foram exportados para "${filename}.csv".`,
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);

        } catch (error) {
            console.error(`Erro ao exportar ${collectionName}:`, error);
            setModalContent({
                title: 'Erro de Exportação',
                message: `Não foi possível exportar os dados de "${collectionName}". Erro: ${error.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const downloadCsvTemplate = (collectionName, filename) => {
        const headers = csvHeaders[collectionName];
        if (!headers) {
            setModalContent({
                title: 'Erro de Modelo',
                message: `Modelo de CSV não encontrado para a coleção "${collectionName}".`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const csvContent = headers.join(',') + '\n';
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}_template.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setModalContent({
            title: 'Modelo CSV Baixado',
            message: `O modelo CSV para "${collectionName}" foi baixado como "${filename}_template.csv".`,
            type: 'info',
            onConfirm: () => setShowModal(false)
        });
        setShowModal(true);
    };


    const importFromCsv = async (collectionName, event) => {
        const file = event.target.files[0];
        if (!file) {
            setModalContent({
                title: 'Nenhum Arquivo',
                message: 'Por favor, selecione um arquivo CSV para importar.',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        if (!db || !userId) {
            setModalContent({
                title: 'Erro de Importação',
                message: 'Dados de usuário não disponíveis para importação.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                setModalContent({
                    title: 'Formato Inválido',
                    message: 'O arquivo CSV deve conter pelo menos um cabeçalho e uma linha de dados.',
                    type: 'danger',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const dataToImport = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                if (values.length !== headers.length) {
                    console.warn(`Linha ${i + 1} ignorada devido a número inconsistente de colunas.`);
                    continue;
                }
                let rowObject = {};
                headers.forEach((header, index) => {
                    let value = values[index];
                    if (!isNaN(value) && value !== '') {
                        rowObject[header] = parseFloat(value);
                    } else if (value.toLowerCase() === 'true') {
                        rowObject[header] = true;
                    } else if (value.toLowerCase() === 'false') {
                        rowObject[header] = false;
                    } else if (header === 'tariffs' && value.startsWith('{') && value.endsWith('}')) {
                        try {
                            rowObject[header] = JSON.parse(value);
                        } catch (e) {
                            rowObject[header] = value;
                        }
                    } else {
                        rowObject[header] = value;
                    }
                });
                dataToImport.push(rowObject);
            }

            try {
                const colRef = collection(db, getCollectionPath(collectionName, userId));
                let importedCount = 0;
                for (const data of dataToImport) {
                    if (collectionName === 'associates') {
                        let exists = false;
                        if (data.sequentialId) {
                            const qSequential = query(colRef, where('sequentialId', '==', data.sequentialId));
                            const existingDocsSequential = await getDocs(qSequential);
                            if (!existingDocsSequential.empty) {
                                console.warn(`Associado com ID Sequencial ${data.sequentialId} já existe. Ignorando importação.`);
                                exists = true;
                            }
                        }
                        if (exists) continue;
                    }
                    if (collectionName === 'invoices' && data.associateId && data.periodId) {
                        const q = query(colRef, where('associateId', '==', data.associateId), where('periodId', '==', data.periodId));
                        const existingDocs = await getDocs(q);
                        if (!existingDocs.empty) {
                            console.warn(`Fatura para associado ${data.associateId} e período ${data.periodId} já existe. Ignorando importação.`);
                            continue;
                        }
                    }
                    if (collectionName === 'periods' && data.code) {
                        const q = query(colRef, where('code', '==', data.code));
                        const existingDocs = await getDocs(q);
                        if (!existingDocs.empty) {
                            console.warn(`Período com código ${data.code} já existe. Ignorando importação.`);
                            continue;
                        }
                    }
                    if (collectionName === 'generalReadings' && data.generalHydrometerName && data.periodId) {
                        const q = query(colRef, where('generalHydrometerName', '==', data.generalHydrometerName), where('periodId', '==', data.periodId));
                        const existingDocs = await getDocs(q);
                        if (!existingDocs.empty) {
                            console.warn(`Leitura geral para hidrômetro ${data.generalHydrometerName} e período ${data.periodId} já existe. Ignorando importação.`);
                            continue;
                        }
                    }

                    await addDoc(colRef, data);
                    importedCount++;
                }
                setModalContent({
                    title: 'Importação Concluída',
                    message: `${importedCount} registros importados com sucesso para "${collectionName}".`,
                    type: 'info',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
            } catch (error) {
                console.error(`Erro ao importar para ${collectionName}:`, error);
                setModalContent({
                    title: 'Erro de Importação',
                    message: `Não foi possível importar os dados para "${collectionName}". Erro: ${error.message}`,
                    type: 'danger',
                    onConfirm: () => setShowModal(false)
                });
                setShowModal(true);
            }
        };
        reader.readAsText(file);
    };


    if (loading || isGeneratingPeriods) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
                <div className="text-xl font-semibold text-gray-700">Carregando configurações e períodos...</div>
            </div>
        );
    }

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-4xl mx-auto my-8 font-inter">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">Configurações</h2>

            {settings && (
                <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">Configurações de Tarifas por Tipo de Associado</h3>
                    {Object.keys(settings.tariffs).map(type => (
                        <div key={type} className="mb-6 p-4 border border-gray-300 rounded-xl bg-white shadow-sm">
                            <h4 className="text-lg font-bold text-gray-800 mb-3">{type}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Taxa Fixa (R$):</label>
                                    <LabeledInput
                                        label={null}
                                        type="number"
                                        step="0.01"
                                        value={settings.tariffs[type].fixedFee}
                                        onChange={(e) => handleTariffFieldChange(type, 'fixedFee', e.target.value)}
                                        className="p-3"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Metros Padrão (m³):</label>
                                    <LabeledInput
                                        label={null}
                                        type="number"
                                        step="1"
                                        value={settings.tariffs[type].standardMeters}
                                        onChange={(e) => handleTariffFieldChange(type, 'standardMeters', e.target.value)}
                                        className="p-3"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Consumo Livre (m³):</label>
                                    <LabeledInput
                                        label={null}
                                        type="number"
                                        step="1"
                                        value={settings.tariffs[type].freeConsumption}
                                        onChange={(e) => handleTariffFieldChange(type, 'freeConsumption', e.target.value)}
                                        className="p-3"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Tarifa Básica (R$/m³):</label>
                                    <LabeledInput
                                        label={null}
                                        type="number"
                                        step="0.01"
                                        value={settings.tariffs[type].basicTariff}
                                        onChange={(e) => handleTariffFieldChange(type, 'basicTariff', e.target.value)}
                                        className="p-3"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Tarifa Excedente (R$/m³):</label>
                                    <LabeledInput
                                        label={null}
                                        type="number"
                                        step="0.01"
                                        value={settings.tariffs[type].excessTariff}
                                        onChange={(e) => handleTariffFieldChange(type, 'excessTariff', e.target.value)}
                                        className="p-3"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    <Button
                        onClick={handleSaveSettings}
                        variant="primary"
                        className="mt-6 w-full py-3"
                    >
                        Salvar Configurações
                    </Button>
                </div>
            )}

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerenciar Regiões dos Associados</h3>
                <p className="text-sm text-gray-600 mb-2">Digite cada região em uma nova linha. Estas regiões aparecerão nos menus suspensos de associados.</p>
                <textarea
                    value={settings.regions ? settings.regions.join('\n') : ''}
                    onChange={handleRegionsChange}
                    rows="5"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                    placeholder="Ex: Centro&#10;Industrial&#10;Buset"
                ></textarea>
                <Button
                    onClick={handleSaveRegions}
                    variant="primary"
                    className="mt-4 w-full py-3"
                >
                    Salvar Regiões
                </Button>
            </div>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Gerenciar Hidrômetros Gerais</h3>
                <p className="text-sm text-gray-600 mb-2">Digite cada nome de hidrômetro geral em uma nova linha. Estes nomes aparecerão nos menus suspensos de associados e leituras gerais.</p>
                <textarea
                    value={settings.generalHydrometers ? settings.generalHydrometers.join('\n') : ''}
                    onChange={handleGeneralHydrometersChange}
                    rows="5"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                    placeholder="Ex: #2 Geral Centro&#10;#3 Giacomin Industrial"
                ></textarea>
                <Button
                    onClick={handleSaveGeneralHydrometers}
                    variant="primary"
                    className="mt-4 w-full py-3"
                >
                    Salvar Hidrômetros Gerais
                </Button>
            </div>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-bold text-gray-700 mb-4">Gerenciar Períodos Bimestrais</h3>

                <div className="mb-6 p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Adicionar Novo Período Manualmente</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="flex flex-col col-span-full">
                            <label className="text-gray-700 text-sm font-medium mb-1">Data de Início da Leitura (primeiro dia do bimestre de faturamento):</label>
                            <LabeledInput
                                label={null}
                                type="date"
                                value={newPeriodStartDate}
                                onChange={(e) => setNewPeriodStartDate(e.target.value)}
                                className="p-3"
                            />
                        </div>
                        {newPeriodStartDate && (
                            <>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Nome do Período de Faturamento (Automático):</label>
                                    <LabeledInput
                                        label={null}
                                        type="text"
                                        value={generatePeriodData(newPeriodStartDate).billingPeriodName}
                                        className="p-3 bg-gray-100 cursor-not-allowed text-gray-700"
                                        readOnly
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Data de Vencimento da Fatura (Automático):</label>
                                    <LabeledInput
                                        label={null}
                                        type="text"
                                        value={formatDate(generatePeriodData(newPeriodStartDate).billingDueDate)}
                                        className="p-3 bg-gray-100 cursor-not-allowed text-gray-700"
                                        readOnly
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Período de Consumo (Automático):</label>
                                    <LabeledInput
                                        label={null}
                                        type="text"
                                        value={generatePeriodData(newPeriodStartDate).consumptionPeriodName}
                                        className="p-3 bg-gray-100 cursor-not-allowed text-gray-700"
                                        readOnly
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Data de Início do Consumo (Automático):</label>
                                    <LabeledInput
                                        label={null}
                                        type="text"
                                        value={formatDate(generatePeriodData(newPeriodStartDate).consumptionStartDate)}
                                        className="p-3 bg-gray-100 cursor-not-allowed text-gray-700"
                                        readOnly
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-700 text-sm font-medium mb-1">Data de Fim do Consumo (Automático):</label>
                                    <LabeledInput
                                        label={null}
                                        type="text"
                                        value={formatDate(generatePeriodData(newPeriodStartDate).consumptionEndDate)}
                                        className="p-3 bg-gray-100 cursor-not-allowed text-gray-700"
                                        readOnly
                                    />
                                </div>
                            </>
                        )}
                    </div>
                    <Button
                        onClick={handleAddPeriod}
                        variant="primary"
                        className="w-full py-3"
                    >
                        Adicionar Período
                    </Button>
                </div>

                <div className="mb-6 p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Períodos Existentes</h4>
                    <LabeledInput
                        label={null}
                        type="text"
                        placeholder="Buscar por código ou nome do período..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full mb-4"
                    />
                    {periods.length === 0 ? (
                        <p className="text-gray-600 p-4 bg-gray-50 rounded-lg">Nenhum período encontrado.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl shadow-md border border-gray-200">
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-100 border-b border-gray-200">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tl-xl">Código Faturamento</th>
                                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Período Faturamento</th>
                                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data Leitura</th>
                                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Vencimento Fatura</th>
                                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fim Consumo</th>
                                        <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tr-xl">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periods.filter(period =>
                                        period.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        period.billingPeriodName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        period.consumptionPeriodName.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).map((period) => (
                                        <tr key={period.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition duration-100">
                                            <td className="py-3 px-4 text-gray-800 text-sm">{period.code}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{period.billingPeriodName}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{formatDate(period.readingDate)}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{formatDate(period.billingDueDate)}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{period.consumptionPeriodName}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{formatDate(period.consumptionStartDate)}</td>
                                            <td className="py-3 px-4 text-gray-800 text-sm">{formatDate(period.consumptionEndDate)}</td>
                                            <td className="py-3 px-4 text-sm">
                                            <Button
                                                onClick={() => handleDeletePeriod(period ? period.id : undefined)}
                                                variant="danger"
                                                size="xs"
                                                className="px-3 py-1"
                                            >
                                                Excluir
                                            </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Importar / Exportar Dados (CSV)</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 border border-gray-300 rounded-xl bg-white shadow-sm">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Exportar Dados Existentes</h4>
                        <Button
                            onClick={() => exportToCsv('associates', 'associados_export')}
                            variant="secondary"
                            className="w-full py-2 mb-3"
                        >
                            Exportar Associados
                        </Button>
                        <Button
                            onClick={() => exportToCsv('readings', 'leituras_export')}
                            variant="secondary"
                            className="w-full py-2 mb-3"
                        >
                            Exportar Leituras Associados
                        </Button>
                        <Button
                            onClick={() => exportToCsv('generalReadings', 'leituras_gerais_export')}
                            variant="secondary"
                            className="w-full py-2 mb-3"
                        >
                            Exportar Leituras (Gerais)
                        </Button>
                        <Button
                            onClick={() => exportToCsv('invoices', 'faturas_export')}
                            variant="secondary"
                            className="w-full py-2 mb-3"
                        >
                            Exportar Faturas
                        </Button>
                        <Button
                            onClick={() => exportToCsv('periods', 'periodos_export')}
                            variant="secondary"
                            className="w-full py-2"
                        >
                            Exportar Períodos
                        </Button>
                    </div>

                    <div className="p-4 border border-gray-300 rounded-xl bg-white shadow-sm">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Importar Novos Dados</h4>
                        <p className="text-sm text-gray-600 mb-4">
                            Atenção: A importação adicionará novos registros. Registros com IDs de hidrômetro (para associados) ou período/associado (para faturas/leituras) duplicados serão ignorados.
                        </p>
                        <h5 className="text-md font-semibold text-gray-700 mb-3">Baixar Modelos CSV:</h5>
                        <Button
                            onClick={() => downloadCsvTemplate('associates', 'associados')}
                            variant="primary"
                            className="w-full py-2 mb-3"
                        >
                            Modelo CSV Associados
                        </Button>
                        <Button
                            onClick={() => downloadCsvTemplate('readings', 'leituras')}
                            variant="primary"
                            className="w-full py-2 mb-3"
                        >
                            Modelo CSV Leituras (Associados)
                        </Button>
                        <Button
                            onClick={() => downloadCsvTemplate('generalReadings', 'leituras_gerais')}
                            variant="primary"
                            className="w-full py-2 mb-3"
                        >
                            Modelo CSV Leituras (Gerais)
                        </Button>
                        <Button
                            onClick={() => downloadCsvTemplate('invoices', 'faturas')}
                            variant="primary"
                            className="w-full py-2 mb-3"
                        >
                            Modelo CSV Faturas
                        </Button>
                        <Button
                            onClick={() => downloadCsvTemplate('periods', 'periodos')}
                            variant="primary"
                            className="w-full py-2 mb-6"
                        >
                            Modelo CSV Períodos
                        </Button>

                        <h5 className="text-md font-semibold text-gray-700 mb-3">Carregar Arquivos CSV:</h5>
                        <label className="block text-gray-700 text-sm font-medium mb-2">Importar Associados:</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => importFromCsv('associates', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
                        />
                         <label className="block text-gray-700 text-sm font-medium mb-2">Importar Leituras (Associados):</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => importFromCsv('readings', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
                        />
                        <label className="block text-gray-700 text-sm font-medium mb-2">Importar Leituras (Gerais):</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => importFromCsv('generalReadings', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
                        />
                         <label className="block text-gray-700 text-sm font-medium mb-2">Importar Faturas:</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => importFromCsv('invoices', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4"
                        />
                        <label className="block text-gray-700 text-sm font-medium mb-2">Importar Períodos:</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => importFromCsv('periods', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>
                </div>
            </div>
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};

// Novo Componente: Home/Dashboard
const Home = () => {
    const { db, userId } = useAppContext();
    const [associatesCount, setAssociatesCount] = useState(0);
    const [activeAssociatesCount, setActiveAssociatesCount] = useState(0);
    const [inactiveAssociatesCount, setInactiveAssociatesCount] = useState(0);
    const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
    const [paidInvoicesCount, setPaidInvoicesCount] = useState(0);
    const [totalConsumptionData, setTotalConsumptionData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
    const [periods, setPeriods] = useState([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState('');
    const [generalReadings, setGeneralReadings] = useState([]);

    useEffect(() => {
        if (!db || !userId) return;

        const unsubscribeAssociates = onSnapshot(collection(db, getCollectionPath('associates', userId)), (snapshot) => {
            const associatesData = snapshot.docs.map(doc => doc.data());
            setAssociatesCount(associatesData.length);
            setActiveAssociatesCount(associatesData.filter(a => a.isActive).length);
            setInactiveAssociatesCount(associatesData.filter(a => !a.isActive).length);
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar associados para dashboard:", error);
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível carregar os dados de associados para o dashboard.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            setLoading(false);
        });

        const unsubscribeInvoices = onSnapshot(collection(db, getCollectionPath('invoices', userId)), (snapshot) => {
            let pending = 0;
            let paid = 0;
            snapshot.forEach(doc => {
                const invoice = doc.data();
                if (invoice.status === 'Pendente') {
                    pending++;
                } else if (invoice.status === 'Pago') {
                    paid++;
                }
            });
            setPendingInvoicesCount(pending);
            setPaidInvoicesCount(paid);
        }, (error) => {
            console.error("Erro ao carregar faturas para dashboard:", error);
        });

        const unsubscribePeriods = onSnapshot(collection(db, getCollectionPath('periods', userId)), (snapshot) => {
            const periodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPeriods(periodsData.sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate)));
            if (periodsData.length > 0 && !selectedPeriodId) {
                setSelectedPeriodId(periodsData[0].id);
            }
        }, (error) => {
            console.error("Erro ao carregar períodos para dashboard:", error);
        });

        const unsubscribeGeneralReadings = onSnapshot(collection(db, getCollectionPath('generalReadings', userId)), (snapshot) => {
            setGeneralReadings(snapshot.docs.map(doc => doc.data()));
        }, (error) => {
            console.error("Erro ao carregar leituras gerais para dashboard:", error);
        });

        return () => {
            unsubscribeAssociates();
            unsubscribeInvoices();
            unsubscribePeriods();
            unsubscribeGeneralReadings();
        };
    }, [db, userId, selectedPeriodId]);

    useEffect(() => {
        if (selectedPeriodId && generalReadings.length > 0) {
            const consumptionByHydrometer = {};
            generalReadings.filter(r => r.periodId === selectedPeriodId).forEach(reading => {
                const hydrometerName = reading.generalHydrometerName;
                if (consumptionByHydrometer[hydrometerName]) {
                    consumptionByHydrometer[hydrometerName] += reading.consumption;
                } else {
                    consumptionByHydrometer[hydrometerName] = reading.consumption;
                }
            });

            const chartData = Object.keys(consumptionByHydrometer).map(name => ({
                name: name,
                consumption: parseFloat(consumptionByHydrometer[name].toFixed(2))
            }));
            setTotalConsumptionData(chartData);
        } else {
            setTotalConsumptionData([]);
        }
    }, [selectedPeriodId, generalReadings]);

    const invoiceStatusData = [
        { name: 'Faturas Pagas', value: paidInvoicesCount, color: '#4CAF50' },
        { name: 'Faturas Pendentes', value: pendingInvoicesCount, color: '#F44336' },
    ];

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
                <div className="text-xl font-semibold text-gray-700">Carregando dados do dashboard...</div>
            </div>
        );
    }

    // Handlers para salvar regiões e hidrômetros gerais
    const handleSaveRegions = async () => {
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, {Settings, regions: Settings.regions });
            setModalContent({
                title: 'Sucesso',
                message: 'Regiões salvas com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } catch (e) {
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar as regiões. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const handleSaveGeneralHydrometers = async () => {
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, {Settings, generalHydrometers: Settings.generalHydrometers });
            setModalContent({
                title: 'Sucesso',
                message: 'Hidrômetros gerais salvos com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } catch (e) {
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar os hidrômetros gerais. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-6xl mx-auto my-8 font-inter">
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
                            <BarChart
                                data={totalConsumptionData}
                                margin={{
                                    top: 5,
                                    right: 30,
                                    left: 20,
                                    bottom: 5,
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-30} textAnchor="end" height={60} interval={0} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="consumption" fill="#82ca9d" name="Consumo (m³)" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-gray-600 text-center">Nenhum dado de consumo para o período selecionado.</p>
                    )}
                </div>
            </div>
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};


// Novo Componente: Profile
const Profile = () => {
    const { currentUser, handleLogout, db, userId, auth } = useAppContext();
    const [acajuviInfo, setAcajuviInfo] = useState({
        acajuviName: '',
        acajuviCnpj: '',
        acajuviAddress: '',
        acajuviPhone: '',
        acajuviEmail: '',
        bankName: '',
        bankAccountNumber: '',
        bankAgency: '',
        pixKey: ''
    });
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db || !userId) return;

        const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
        const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setAcajuviInfo({
                    acajuviName: data.acajuviName || '',
                    acajuviCnpj: data.acajuviCnpj || '',
                    acajuviAddress: data.acajuviAddress || '',
                    acajuviPhone: data.acajuviPhone || '',
                    acajuviEmail: data.acajuviEmail || '',
                    bankName: data.bankName || '',
                    bankAccountNumber: data.bankAccountNumber || '',
                    bankAgency: data.bankAgency || '',
                    pixKey: data.pixKey || ''
                });
            }
            setLoading(false);
        }, (error) => {
            console.error("Erro ao carregar informações da ACAJUVI:", error);
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível carregar as informações da ACAJUVI.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId]);

    const handleAcajuviInfoChange = (e) => {
        const { name, value } = e.target;
        setAcajuviInfo(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveAcajuviInfo = async () => {
        if (!db || !userId) return;
        try {
            const settingsDocRef = doc(db, getCollectionPath('settings', userId), 'config');
            await setDoc(settingsDocRef, acajuviInfo, { merge: true });
            setModalContent({
                title: 'Sucesso',
                message: 'Informações da ACAJUVI salvas com sucesso!',
                type: 'info',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        } catch (e) {
            console.error("Erro ao salvar informações da ACAJUVI: ", e);
            setModalContent({
                title: 'Erro',
                message: `Não foi possível salvar as informações da ACAJUVI. Erro: ${e.message}`,
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
        }
    };

    const handleChangePassword = async () => {
        if (!currentUser || !currentUser.email) {
            setModalContent({
                title: 'Erro',
                message: 'Não foi possível enviar o e-mail de redefinição de senha. Usuário não logado ou e-mail não disponível.',
                type: 'danger',
                onConfirm: () => setShowModal(false)
            });
            setShowModal(true);
            return;
        }

        setModalContent({
            title: 'Confirmar Redefinição de Senha',
            message: `Um e-mail será enviado para ${currentUser.email} com um link para redefinir sua senha. Deseja continuar?`,
            type: 'confirm',
            onConfirm: async () => {
                try {
                    await sendPasswordResetEmail(auth, currentUser.email);
                    setModalContent({
                        title: 'E-mail Enviado',
                        message: 'Um e-mail com as instruções para redefinir sua senha foi enviado para o seu endereço de e-mail cadastrado. Por favor, verifique sua caixa de entrada (e spam).',
                        type: 'info',
                        onConfirm: () => setShowModal(false)
                    });
                } catch (error) {
                    console.error("Erro ao enviar e-mail de redefinição de senha:", error);
                    setModalContent({
                        title: 'Erro no Envio',
                        message: `Não foi possível enviar o e-mail de redefinição de senha. Erro: ${error.message}`,
                        type: 'danger',
                        onConfirm: () => setShowModal(false)
                    });
                } finally {
                    setShowModal(true);
                }
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
                <div className="text-xl font-semibold text-gray-700">Carregando informações do perfil...</div>
            </div>
        );
    }

    return (
        <div className="p-8 bg-white rounded-xl shadow-lg max-w-3xl mx-auto my-8 font-inter text-center">
            <h2 className="text-3xl font-bold text-gray-800 mb-8">Perfil do Usuário e Informações da ACAJUVI</h2>

            <div className="mb-8 p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Informações do Usuário</h3>
                <p className="text-lg text-gray-800 mb-2">
                    <span className="font-semibold">E-mail:</span> {currentUser?.email || 'Não disponível'}
                </p>
                <p className="text-lg text-gray-800 mb-4">
                    <span className="font-semibold">ID de Usuário (UID):</span> {currentUser?.uid || 'Não disponível'}
                </p>
                <button
                    onClick={handleChangePassword}
                    className="px-6 py-3 rounded-lg font-semibold bg-yellow-500 text-white hover:bg-yellow-600 transition duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-75 mr-4"
                >
                    Alterar Senha
                </button>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Informações da ACAJUVI</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-left">
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Nome da Associação:</label>
                        <input
                            type="text"
                            name="acajuviName"
                            value={acajuviInfo.acajuviName}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">CNPJ:</label>
                        <input
                            type="text"
                            name="acajuviCnpj"
                            value={acajuviInfo.acajuviCnpj}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col col-span-full">
                        <label className="text-gray-700 text-sm font-medium mb-1">Endereço:</label>
                        <input
                            type="text"
                            name="acajuviAddress"
                            value={acajuviInfo.acajuviAddress}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Telefone:</label>
                        <input
                            type="text"
                            name="acajuviPhone"
                            value={acajuviInfo.acajuviPhone}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Email:</label>
                        <input
                            type="email"
                            name="acajuviEmail"
                            value={acajuviInfo.acajuviEmail}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Nome do Banco:</label>
                        <input
                            type="text"
                            name="bankName"
                            value={acajuviInfo.bankName}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Número da Conta Bancária:</label>
                        <input
                            type="text"
                            name="bankAccountNumber"
                            value={acajuviInfo.bankAccountNumber}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Agência Bancária:</label>
                        <input
                            type="text"
                            name="bankAgency"
                            value={acajuviInfo.bankAgency}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-gray-700 text-sm font-medium mb-1">Chave PIX:</label>
                        <input
                            type="text"
                            name="pixKey"
                            value={acajuviInfo.pixKey}
                            onChange={handleAcajuviInfoChange}
                            className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                </div>
                <button
                    onClick={handleSaveAcajuviInfo}
                    className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 shadow-md"
                >
                    Salvar Informações da ACAJUVI
                </button>
            </div>
            <Modal {...modalContent} show={showModal} />
        </div>
    );
};


// Componente para carregar scripts externos
const ExternalScripts = () => {
    useEffect(() => {
        const loadScript = (src, id) => {
            if (!document.getElementById(id)) {
                const script = document.createElement('script');
                script.src = src;
                script.id = id;
                script.async = true;
                document.body.appendChild(script);
            }
        };

        // Carrega Tailwind CSS
        loadScript('https://cdn.tailwindcss.com', 'tailwind-script');
        // Carrega html2canvas e jspdf
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas-script');
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf-script');
        // Recharts is now loaded via a direct script tag in the HTML wrapper for Canvas compatibility.
        // No need to load it dynamically here.
    }, []);

    return null; // Este componente não renderiza nada visível
};

// Componente principal da aplicação
const App = () => {
    const { currentUser, userId, handleLogout } = useAppContext();
    const [currentPage, setCurrentPage] = useState('home');
    const [associateToEdit, setAssociateToEdit] = useState(null);
    const [viewingAssociateDetails, setViewingAssociateDetails] = useState(null);

    const renderPage = () => {
        if (associateToEdit) {
            return <AssociateForm associateToEdit={associateToEdit} onSave={() => { setAssociateToEdit(null); setCurrentPage('associates'); }} onCancel={() => setAssociateToEdit(null)} />;
        }
        if (viewingAssociateDetails) {
            return <AssociateDetails associate={viewingAssociateDetails} onBack={() => setViewingAssociateDetails(null)} onSaveObservations={(updatedObservations) => {
                setViewingAssociateDetails(prev => ({ ...prev, observations: updatedObservations }));
            }} />;
        }

        switch (currentPage) {
            case 'home':
                return <Home />;
            case 'associates':
                return <Associates onAddAssociate={() => setAssociateToEdit({})} onEditAssociate={setAssociateToEdit} onViewAssociateDetails={setViewingAssociateDetails} />;
            case 'readings':
                return <Readings onViewAssociateDetails={setViewingAssociateDetails} />;
            case 'generalHydrometers':
                return <GeneralHydrometers />;
            case 'invoices':
                return <Invoices />;
            case 'reports':
                return <Reports />;
            case 'settings':
                return <Settings />;
            case 'profile':
                return <Profile />;
            default:
                return <Home />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-inter">
            <ExternalScripts />
            <nav className="bg-blue-700 p-4 shadow-lg">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
                    <h1 className="text-white text-3xl font-bold mb-4 md:mb-0">Sistema de Água Potável</h1>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button
                            onClick={() => setCurrentPage('home')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'home' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Início (Dashboard)
                        </button>
                        <button
                            onClick={() => setCurrentPage('associates')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'associates' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Associados
                        </button>
                        <button
                            onClick={() => setCurrentPage('readings')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'readings' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Leituras
                        </button>
                        <button
                            onClick={() => setCurrentPage('generalHydrometers')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'generalHydrometers' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Hidrômetros Gerais
                        </button>
                        <button
                            onClick={() => setCurrentPage('invoices')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'invoices' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Faturas
                        </button>
                        <button
                            onClick={() => setCurrentPage('reports')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'reports' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Relatórios
                        </button>
                        <button
                            onClick={() => setCurrentPage('settings')}
                            className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'settings' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                        >
                            Configurações
                        </button>
                        {currentUser && (
                            <button
                                onClick={() => setCurrentPage('profile')}
                                className={`px-5 py-2 rounded-lg font-semibold transition duration-200 ${currentPage === 'profile' ? 'bg-blue-800 text-white shadow-md' : 'text-blue-100 hover:bg-blue-600'}`}
                            >
                                Perfil/Usuário
                            </button>
                        )}
                    </div>
                </div>
            </nav>
            <main className="container mx-auto p-4">
                {renderPage()}
            </main>
        </div>
    );
};