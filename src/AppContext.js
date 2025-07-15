import React, { createContext, useContext } from 'react';

// O contexto do app será criado no App.js, mas exportamos o hook para uso nos componentes
const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

export default AppContext;
