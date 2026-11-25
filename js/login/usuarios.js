/* =====================================================================
   USUÁRIOS (área do adm): lista, liberar, bloquear e editar o nome
   Lê a coleção usuarios/{uid} inteira (só o adm consegue: as regras do
   firestore.rules recusam para os outros) e grava as mudanças que o adm
   faz. O adm muda só nome e status (e o papel, numa função seguinte); o
   login (e-mail interno da conta), criadoEm e ultimoAcesso ficam como
   estão: as regras recusam qualquer outra coisa.
   As funções sem Firebase (conferir a mudança, ordenar a lista, avisar
   que o adm vai tirar o próprio acesso) ficam separadas para os testes.
   Nada de planilha, boleto, fornecedor ou valor passa por aqui.
   ===================================================================== */

// Ordem da lista: quem espera liberação primeiro, depois liberados, depois bloqueados.
const ORDEM_STATUS = { aguardando: 0, liberado: 1, bloqueado: 2 };

// Ordena a lista de usuários: pela situação (aguardando primeiro) e, dentro dela, pelo nome.
// Recebe [{ uid, nome, login, papel, status, ... }] e devolve uma cópia ordenada.
function ordenaUsuarios(lista){
  const ordem = u => (u.status in ORDEM_STATUS ? ORDEM_STATUS[u.status] : 9);
  return lista.slice().sort((a, b) =>
    ordem(a) - ordem(b) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

// Confere a mudança que o adm quer fazer num cadastro e devolve { dados } (só os campos
// que mudam, prontos para gravar) ou { erro } com a frase da tela.
// Aceita só nome (3 a 60 caracteres, limpo como na entrada) e status conhecido: o login
// nunca entra aqui, então a tela não consegue trocar a identidade de ninguém.
function mudancaUsuario(cadastro, pedido){
  const dados = {};
  if('nome' in pedido){
    const nome = limpaNome(pedido.nome);
    if(nome.length < NOME_MINIMO) return { erro: `O nome precisa ter pelo menos ${NOME_MINIMO} letras.` };
    if(nome.length > NOME_MAXIMO) return { erro: `O nome pode ter no máximo ${NOME_MAXIMO} caracteres.` };
    if(nome !== cadastro.nome) dados.nome = nome;
  }
  if('status' in pedido){
    if(!(pedido.status in STATUS_CADASTRO)) return { erro: 'Situação desconhecida.' };
    if(pedido.status !== cadastro.status) dados.status = pedido.status;
  }
  const sobra = Object.keys(pedido).filter(c => c !== 'nome' && c !== 'status');
  if(sobra.length) return { erro: 'Campo que o adm não muda por aqui: ' + sobra.join(', ') + '.' };
  if(!Object.keys(dados).length) return { erro: 'Nada mudou.' };
  return { dados };
}

// Diz se a mudança tira do adm o PRÓPRIO acesso de adm (ele mesmo bloqueado, ou deixando
// de ser adm). A tela pede confirmação antes, para o sistema não ficar sem adm.
function tiraProprioAdm(uidAlvo, uidQuemMuda, dados){
  if(uidAlvo !== uidQuemMuda) return false;
  return ('status' in dados && dados.status !== 'liberado') || ('papel' in dados && dados.papel !== 'adm');
}

// Acompanha a lista de todos os usuários ao vivo (o adm vê na hora quem acabou de criar conta).
// aoMudar recebe a lista ordenada; devolve a função que para de acompanhar.
function acompanhaUsuarios(aoMudar, aoFalhar){
  return firebaseConectado().db.collection(COLECAO_USUARIOS).onSnapshot(
    snap => aoMudar(ordenaUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })))),
    aoFalhar);
}

// Grava a mudança já conferida (só os campos de "dados"). Quem recusa de verdade são as regras.
function gravaMudancaUsuario(uid, dados){
  return refCadastro(uid).update(dados);
}
