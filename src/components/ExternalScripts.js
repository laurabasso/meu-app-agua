import { useEffect } from 'react';

// NOVO: Componente para carregar scripts externos essenciais para a aplicação.
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

        // Carrega as bibliotecas necessárias para funcionalidades como a geração de PDF.
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas-script');
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf-script');
    }, []);

    return null; // Este componente não renderiza nada na tela.
};

export default ExternalScripts;
