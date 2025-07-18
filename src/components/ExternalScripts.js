import { useEffect } from 'react';

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

        // CORREÇÃO: Apenas o html2canvas é necessário aqui, pois o jsPDF e o jspdf-autotable
        // já estão sendo importados diretamente nos componentes que os utilizam.
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas-script');

    }, []);

    return null;
};

export default ExternalScripts;
