import { createContext, useContext } from 'react';

// CORREÇÃO: Exportando 'AppContext' e 'useAppContext' para que possam ser importados
// corretamente em outros arquivos, em vez de usar 'export default'.
export const AppContext = createContext(null);

export const useAppContext = () => useContext(AppContext);
