/* =====================================================================
   CONEXÃO COM O FIREBASE
   O Firebase é o ÚNICO serviço externo do site, e só para login,
   permissões e histórico resumido. Nenhum dado de planilha, PDF ou
   boleto passa por aqui.
   O SDK vem do CDN do Google (www.gstatic.com) com versão fixa e integrity
   (SRI) no index.html; usamos a versão "compat", que são scripts comuns
   e por isso aceitam o integrity (os módulos ES do Firebase importam
   outros arquivos que o SRI não cobriria).
   A configuração abaixo NÃO é senha: ela só diz qual projeto usar e vai
   para qualquer navegador que abre o site. Quem protege os dados são as
   regras do firestore.rules (coladas no console do Firebase).
   ===================================================================== */

const CONFIG_FIREBASE = {
  apiKey: 'AIzaSyBpyWBreYbzzsyJKosBnnUHmWWbvOgHeZU',
  authDomain: 'central-financeira-70660.firebaseapp.com',
  projectId: 'central-financeira-70660',
  storageBucket: 'central-financeira-70660.firebasestorage.app',
  messagingSenderId: '894293794732',
  appId: '1:894293794732:web:e009e885b6e5b7b196a409',
};

// Liga o Firebase uma vez e devolve { auth, db }; devolve null se o SDK não carregou
// (sem internet, CDN fora do ar ou integrity recusado) — aí o site mostra o erro e não abre.
let conexaoFirebase;
function firebaseConectado(){
  if(conexaoFirebase !== undefined) return conexaoFirebase;
  if(typeof firebase === 'undefined' || !firebase.auth || !firebase.firestore){
    conexaoFirebase = null;
    return null;
  }
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CONFIG_FIREBASE);
  conexaoFirebase = { auth: app.auth(), db: app.firestore() };
  return conexaoFirebase;
}
