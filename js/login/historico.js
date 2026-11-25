/* =====================================================================
   HISTÓRICO DE USO — coleção historico/{id} no Firestore
   Cada conferência feita (e cada .RET baixado) vira UM registro curto:
     uid, login, nome  → quem;
     quando            → hora do servidor;
     tela, banco, empresa (e empresa2 na conferência entre dois relatórios);
     abas              → { idDaAba: quantidade } (só números inteiros).
   NUNCA vai para cá: nome de fornecedor, código de barras, linha
   digitável, valor ou total em R$ (decisão do dono do projeto: um total
   de aba com 1 boleto seria o valor do boleto). montaRegistroUso só copia
   os campos da lista acima e só aceita quantidades inteiras; as regras do
   firestore.rules recusam qualquer outro campo, aba desconhecida, valor que
   não seja inteiro, tela ou empresa sem permissão, e não deixam ninguém
   editar nem apagar registro.
   Gravar o histórico nunca trava a conferência: se o Firebase recusar
   (sem internet, sem permissão), a conferência na tela continua igual.
   ===================================================================== */

const COLECAO_HISTORICO = 'historico';

// Ids das abas que podem ir para o histórico (todas as telas juntas), com o nome para a tela do adm.
// Os mesmos ids da lista abasValidas do firestore.rules: aba nova precisa entrar nos dois.
const ABAS_HISTORICO = {
  ok: 'Conferidos / com boleto', data: 'Datas divergentes', nome: 'Nome divergente',
  banco: 'Só no banco', sis: 'Só no sistema',
  valor: 'Divergência de valor', dup: 'Duplicados',
  mesmo: 'Mesmo boleto nas duas empresas', duplo: 'Mesmo fornecedor e valor', linha: 'Mesma linha nos dois relatórios',
  verif: 'Verificação', sem: 'Sem boleto', dda: 'DDA sem título no sistema',
  noArquivo: 'No arquivo .RET', fora: 'Fora do arquivo', atencao: 'Atenção',
};
const QTD_MAXIMA_HISTORICO = 100000;   // a regra recusa acima disso (nenhum arquivo chega perto)
const BANCOS_HISTORICO = ['santander', 'itau', 'bradesco', ''];
const NOMES_BANCO_HISTORICO = { santander: 'Santander', itau: 'Itaú', bradesco: 'Bradesco', '': '—' };

// Conta as linhas de cada aba de um resultado: status = [{ id }], linhasPorStatus = { id: [linhas] }.
// Devolve { id: quantidade }; só a QUANTIDADE sai daqui, nunca a linha.
function quantidadesPorAba(status, linhasPorStatus){
  const abas = {};
  status.forEach(st => { abas[st.id] = (linhasPorStatus[st.id] || []).length; });
  return abas;
}

// Monta o registro que vai para o Firestore, copiando SÓ os campos permitidos.
// pedido = { tela, banco, empresa, empresa2?, abas }; quem = { uid, login, nome }.
// Devolve { registro } (sem o "quando", que é a hora do servidor) ou { erro }.
function montaRegistroUso(pedido, quem){
  if(!quem || !quem.uid || !quem.login) return { erro: 'Sem usuário.' };
  if(!TELAS_COM_PERMISSAO.some(t => t.tela === pedido.tela)) return { erro: 'Tela desconhecida.' };
  if(!BANCOS_HISTORICO.includes(pedido.banco || '')) return { erro: 'Banco desconhecido.' };
  const idEmpresa = e => (e && typeof e === 'object') ? e.id : e;
  const empresa = idEmpresa(pedido.empresa);
  if(!EMPRESAS.some(e => e.id === empresa)) return { erro: 'Empresa desconhecida.' };
  const abas = {};
  for(const [id, qtd] of Object.entries(pedido.abas || {})){
    if(!(id in ABAS_HISTORICO)) return { erro: 'Aba desconhecida: ' + id };
    if(!Number.isInteger(qtd) || qtd < 0 || qtd > QTD_MAXIMA_HISTORICO) return { erro: 'Quantidade inválida na aba ' + id };
    abas[id] = qtd;
  }
  const registro = { uid: quem.uid, login: quem.login, nome: quem.nome || '', tela: pedido.tela,
                     banco: pedido.banco || '', empresa, abas };
  if(pedido.empresa2){
    const empresa2 = idEmpresa(pedido.empresa2);
    if(!EMPRESAS.some(e => e.id === empresa2)) return { erro: 'Empresa desconhecida.' };
    registro.empresa2 = empresa2;
  }
  return { registro };
}

// Grava o uso no histórico, sem esperar e sem atrapalhar a tela: erro só vai para o console.
// Chamada pelas telas logo depois de mostrar o resultado (ou de baixar o .RET).
function registraUso(pedido){
  try{
    if(typeof firebaseConectado !== 'function' || !firebaseConectado()) return;
    const usuario = firebaseConectado().auth.currentUser;
    const cad = cadastroComPermissoes;
    if(!usuario || !cad) return;
    const r = montaRegistroUso(pedido, { uid: usuario.uid, login: usuario.email, nome: cad.nome });
    if(r.erro){ console.warn('Histórico não gravado:', r.erro); return; }
    r.registro.quando = firebase.firestore.FieldValue.serverTimestamp();
    firebaseConectado().db.collection(COLECAO_HISTORICO).add(r.registro)
      .catch(err => console.warn('Histórico não gravado:', err && err.code));
  }catch(err){ console.warn('Histórico não gravado:', err && err.message); }
}

// Acompanha os últimos registros (só o adm consegue ler), do mais novo para o mais velho.
// Devolve a função que para de acompanhar.
function acompanhaHistorico(limite, aoMudar, aoFalhar){
  return firebaseConectado().db.collection(COLECAO_HISTORICO).orderBy('quando', 'desc').limit(limite)
    .onSnapshot(snap => aoMudar(snap.docs.map(d => ({ id: d.id, ...d.data() }))), aoFalhar);
}

// Texto das quantidades para a tela do adm: "Conferidos / com boleto 12 · Só no banco 3".
function textoAbasHistorico(abas){
  return Object.keys(ABAS_HISTORICO).filter(id => abas && Number.isInteger(abas[id]))
    .map(id => `${ABAS_HISTORICO[id]} ${abas[id]}`).join(' · ');
}
