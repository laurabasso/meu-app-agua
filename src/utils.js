// Função utilitária para caminhos do Firestore
// Recebe o nome da coleção e o userId
// O appId é obtido da variável global __app_id ou um valor padrão
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
export const getCollectionPath = (collectionName, userId) => {
    return `artifacts/${appId}/users/${userId}/${collectionName}`;
};
