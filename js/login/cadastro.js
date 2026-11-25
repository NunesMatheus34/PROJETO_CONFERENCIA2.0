/* =====================================================================
   CADASTRO DO USUÁRIO NO FIRESTORE — coleção usuarios/{uid}
   Campos: nome, login (o e-mail interno, ex.: fulano.de.tal@conferencia.local),
   papel ("usuario" ou "adm"), status ("aguardando", "liberado", "bloqueado"),
   criadoEm e ultimoAcesso.
   O "nome" é o que a pessoa digitou; o "login" é a prova de quem ela é:
   as regras exigem que ele seja o e-mail da conta do Firebase, então
   ninguém cria cadastro com nome de outra pessoa sem o adm perceber.
   A tela de adm (próxima etapa) deve mostrar o login ao lado do nome.
   Conta nova nasce papel "usuario" e status "aguardando"; só o adm muda
   papel e status. As regras do firestore.rules garantem isso no servidor:
   o que este arquivo faz é só o caminho certo, não a trava.
   Nada de planilha, boleto, fornecedor ou valor é gravado aqui.
   ===================================================================== */

const COLECAO_USUARIOS = 'usuarios';

// Nomes e cores dos status do cadastro: os mesmos na tela de entrada e no Perfil.
const STATUS_CADASTRO = {
  aguardando: { nome: 'Aguardando liberação', classe: 'aviso' },
  liberado:   { nome: 'Liberado',             classe: 'ok' },
  bloqueado:  { nome: 'Bloqueado',            classe: 'alerta' },
};

// Endereço do cadastro de um usuário no Firestore.
function refCadastro(uid){
  return firebaseConectado().db.collection(COLECAO_USUARIOS).doc(uid);
}

// Monta os dados de um cadastro novo: sempre "usuario" e "aguardando", com o login
// (e-mail interno da conta) e as duas datas iguais a "agora". Separada do Firebase
// para os testes conferirem exatamente o que vai ser gravado.
function dadosCadastroNovo(nome, login, agora){
  return { nome, login, papel: 'usuario', status: 'aguardando', criadoEm: agora, ultimoAcesso: agora };
}

// Cria o cadastro de quem acabou de criar a conta, com o login = e-mail da conta no
// Firebase e as datas do relógio do servidor (as regras recusam qualquer outra coisa).
function criaCadastro(uid, nome, login){
  return refCadastro(uid).set(dadosCadastroNovo(nome, login, firebase.firestore.FieldValue.serverTimestamp()));
}

// Grava a hora desta entrada (ultimoAcesso: é o que a pessoa pode mudar sozinha).
// Cadastro antigo, de antes do campo "login": grava o login junto, uma vez só
// (as regras só aceitam se for o e-mail da própria conta).
function marcaUltimoAcesso(uid, cadastro, login){
  const dados = { ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp() };
  if(!cadastro.login) dados.login = login;
  return refCadastro(uid).update(dados);
}

// Lê o cadastro uma vez; devolve os dados ou null se ainda não existe.
async function leCadastro(uid){
  const doc = await refCadastro(uid).get();
  return doc.exists ? doc.data() : null;
}

// Acompanha o cadastro ao vivo: se o adm liberar ou bloquear, a tela muda na hora.
// Devolve a função que para de acompanhar.
function acompanhaCadastro(uid, aoMudar, aoFalhar){
  return refCadastro(uid).onSnapshot(doc => aoMudar(doc.exists ? doc.data() : null), aoFalhar);
}
