import React from 'react';

const Modal = ({ show, title, message, onConfirm, onCancel, type = 'info' }) => {
    if (!show) return null;

    const buttonClasses = "px-4 py-2 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-opacity-75 transition duration-200";
    const primaryButtonClass = "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-md";
    const dangerButtonClass = "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-md";
    const secondaryButtonClass = "bg-gray-300 text-gray-800 hover:bg-gray-400 focus:ring-gray-500 shadow-md";

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
                <h3 className="text-2xl font-bold mb-4 text-gray-900">{title}</h3>
                <p className="text-gray-700 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    {type === 'confirm' && (
                        <button onClick={onCancel} className={`${buttonClasses} ${secondaryButtonClass}`}>
                            Cancelar
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        className={`${buttonClasses} ${type === 'danger' ? dangerButtonClass : primaryButtonClass}`}
                    >
                        {type === 'confirm' ? 'Confirmar' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
