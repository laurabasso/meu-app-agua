import React, { useState, useEffect } from 'react';

const AssociatesFilterModal = ({ show, onClose, filters, onApplyFilters, regions, generalHydrometers }) => {
    const [tempFilters, setTempFilters] = useState(filters);

    useEffect(() => {
        setTempFilters(filters);
    }, [filters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setTempFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleApply = () => {
        onApplyFilters(tempFilters);
        onClose();
    };

    const handleClear = () => {
        setTempFilters({ type: 'Todos', region: 'Todas', generalHydrometer: 'Todos' });
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
                <h3 className="text-2xl font-bold mb-4 text-gray-900">Filtrar Associados</h3>
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-1">Tipo de Associado:</label>
                    <select
                        name="type"
                        value={tempFilters.type}
                        onChange={handleFilterChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150 bg-white"
                    >
                        <option value="Todos">Todos os Tipos</option>
                        <option value="Associado">Associado</option>
                        <option value="Entidade">Entidade</option>
                        <option value="Outro">Outro</option>
                    </select>
                </div>
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-1">Região:</label>
                    <select
                        name="region"
                        value={tempFilters.region}
                        onChange={handleFilterChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150 bg-white"
                    >
                        <option value="Todas">Todas as Regiões</option>
                        {regions.map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
                <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-medium mb-1">Hidrômetro Geral:</label>
                    <select
                        name="generalHydrometer"
                        value={tempFilters.generalHydrometer}
                        onChange={handleFilterChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150 bg-white"
                    >
                        <option value="Todos">Todos os Hidrômetros</option>
                        {generalHydrometers.map(h => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 rounded-lg font-semibold bg-gray-300 text-gray-800 hover:bg-gray-400 transition duration-200"
                    >
                        Limpar Filtros
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg font-semibold bg-gray-300 text-gray-800 hover:bg-gray-400 transition duration-200"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition duration-200"
                    >
                        Aplicar Filtros
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssociatesFilterModal;
