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

        // Carrega o JSZip para a funcionalidade de baixar arquivos .zip
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'jszip-script');
        
    }, []);

    return null;
};

export default ExternalScripts;
