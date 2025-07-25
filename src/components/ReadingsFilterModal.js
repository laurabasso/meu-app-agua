import React, { useState } from 'react';
import Button from './Button';

// Novo componente de modal para os filtros avançados da tela de Leituras.
const ReadingsFilterModal = ({ filter, onFilterChange, onClose, options }) => {
    const [localFilter, setLocalFilter] = useState(filter);

    const handleChange = (key, value) => {
        setLocalFilter(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        onFilterChange(localFilter);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6">Filtros de Leituras</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Status do Associado</label>
                        <select value={localFilter.status} onChange={e => handleChange('status', e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                            <option value="all">Todos</option>
                            <option value="active">Ativos</option>
                            <option value="inactive">Inativos</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Região</label>
                        <select value={localFilter.region} onChange={e => handleChange('region', e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                            <option value="all">Todas</option>
                            {options.regions.map(region => <option key={region} value={region}>{region}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Hidrômetro Geral</label>
                        <select value={localFilter.generalHydrometerId} onChange={e => handleChange('generalHydrometerId', e.target.value)} className="w-full p-2 border rounded-lg mt-1">
                            <option value="all">Todos</option>
                            {options.generalHydrometers.map(hydro => <option key={hydro} value={hydro}>{hydro}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                    <Button onClick={onClose} variant="secondary">Cancelar</Button>
                    <Button onClick={handleApply} variant="primary">Aplicar Filtros</Button>
                </div>
            </div>
        </div>
    );
};

export default ReadingsFilterModal;
