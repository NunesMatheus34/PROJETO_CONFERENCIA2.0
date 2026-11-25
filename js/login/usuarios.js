/* =====================================================================
   USUÁRIOS (área do adm): lista, liberar, bloquear, editar o nome e
   resetar o acesso ("esqueci a senha")
   Lê a coleção usuarios/{uid} inteira (só o adm consegue: as regras do
   firestore.rules recusam para os outros) e grava as mudanças que o adm
   faz. O adm muda só nome e status (e o papel, numa função seguinte); o
   login (e-mail interno da conta), criadoEm e ultimoAcesso ficam como
   estão: as regras recusam qualquer outra coisa.
   As funções sem Firebase (conferir a mudança, ordenar a lista, avisar
   que o adm vai tirar o próprio acesso) ficam separadas para os testes.
   RESETAR ACESSO (plano Spark, sem Cloud Functions, então o site não
   apaga conta do Firebase Authentication):
     1. o adm clica "Resetar acesso": o cadastro fica "bloqueado" com
        resetPedido: true, e a tela mostra o passo a passo para o adm
        excluir a conta daquele login no console do Firebase;
     2. a pessoa cria a conta de novo com o MESMO nome (mesmo login, uid
        novo): nasce um cadastro "aguardando" como qualquer conta nova;
     3. a lista acha o par (cadastro novo aguardando + cadastro antigo com
        resetPedido e o mesmo login) e marca o novo com "pedido de reset";
     4. "Liberar" no novo, num lote só: libera o novo com o papel do antigo
        e apaga o antigo (as regras só deixam apagar cadastro com
        resetPedido e bloqueado).
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
    // liberar de novo um cadastro com reset pedido = desistir do reset: a marca sai
    if(pedido.status === 'liberado' && cadastro.resetPedido === true) dados.resetPedido = false;
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

// Endereço da lista de contas do Firebase Authentication no console (Authentication › Usuários),
// onde o adm exclui a conta. Só o adm do projeto consegue abrir.
function linkConsoleContas(projectId){
  return 'https://console.firebase.google.com/project/' + encodeURIComponent(projectId) + '/authentication/users';
}

// Confere o "Resetar acesso" e devolve { dados } prontos para gravar ou { erro }.
// Não reseta o próprio acesso (quem esqueceu a senha não está logado; e o sistema
// ficaria sem esse adm) nem cadastro sem login (o adm não saberia qual conta excluir).
function pedidoDeReset(cadastro, uidQuemPede){
  if(cadastro.uid === uidQuemPede) return { erro: 'Você não pode resetar o seu próprio acesso. Troque a senha pelo Perfil.' };
  if(!cadastro.login) return { erro: 'Este cadastro não tem login gravado: não dá para saber qual conta excluir no console.' };
  if(cadastro.resetPedido === true) return { erro: 'O reset deste usuário já foi pedido.' };
  return { dados: { status: 'bloqueado', resetPedido: true } };
}

// Acha, para cada cadastro novo "aguardando", o cadastro antigo com reset pedido e o MESMO
// login (a mesma pessoa criando a conta de novo). Devolve { uidNovo: cadastroAntigo }.
// Só o login conta: o nome digitado pode ser parecido, mas o login é a conta de verdade.
function paresDeReset(lista){
  const pares = {};
  lista.forEach(novo => {
    if(novo.status !== 'aguardando' || novo.resetPedido === true || !novo.login) return;
    const antigo = lista.find(o => o.uid !== novo.uid && o.resetPedido === true && o.status === 'bloqueado' && o.login === novo.login);
    if(antigo) pares[novo.uid] = antigo;
  });
  return pares;
}

// Confere o "Liberar" do cadastro novo de um reset e devolve { libera, apaga } ou { erro }:
// libera = o que gravar no novo (status liberado e o papel que a pessoa tinha);
// apaga = uid do cadastro antigo, que sai da lista.
function conclusaoDeReset(novo, antigo){
  if(!antigo || antigo.resetPedido !== true || antigo.status !== 'bloqueado') return { erro: 'O cadastro antigo deste reset não foi achado.' };
  if(!novo.login || novo.login !== antigo.login) return { erro: 'O login do cadastro novo não é o mesmo do antigo.' };
  if(novo.status !== 'aguardando') return { erro: 'O cadastro novo não está aguardando liberação.' };
  if(novo.uid === antigo.uid) return { erro: 'Cadastro novo e antigo são o mesmo.' };
  const papel = antigo.papel === 'adm' ? 'adm' : 'usuario';
  const libera = { status: 'liberado' };
  if(papel !== novo.papel) libera.papel = papel;
  if(antigo.permissoes) libera.permissoes = antigo.permissoes;   // volta com as mesmas telas e empresas
  return { libera, apaga: antigo.uid };
}

// Grava o pedido de reset (status bloqueado + resetPedido).
function gravaPedidoDeReset(uid, dados){
  return refCadastro(uid).update(dados);
}

// Conclui o reset num lote só (tudo ou nada): libera o novo e apaga o antigo.
function gravaConclusaoDeReset(uidNovo, conclusao){
  const lote = firebaseConectado().db.batch();
  lote.update(refCadastro(uidNovo), conclusao.libera);
  lote.delete(refCadastro(conclusao.apaga));
  return lote.commit();
}
