/* =====================================================================
   CONTA: entrar, criar conta, sair e trocar a senha (Firebase Authentication)
   A pessoa digita NOME e SENHA; o nome vira o e-mail interno
   (js/login/nome-email.js) e é ele que vai para o Firebase. As mensagens
   de erro falam em "nome", nunca mostram o e-mail.
   O cadastro no Firestore (usuarios/{uid}) é criado pelo js/login/sessao.js
   logo depois da conta, com o nome guardado em nomeDaEntrada.
   ===================================================================== */

// Nome digitado na última tentativa de entrar ou criar conta. A sessão usa para criar o
// cadastro quando ele ainda não existe (conta nova, ou conta criada sem internet no meio).
let nomeDaEntrada = '';

// Traduz o código de erro do Firebase para uma frase da tela (sem mostrar o e-mail interno).
function mensagemErroConta(err){
  const codigo = (err && err.code) || '';
  const frases = {
    'auth/email-already-in-use': 'Esse nome já existe. Escolha outro, ou use "Entrar" se a conta é sua.',
    'auth/invalid-credential': 'Nome ou senha incorretos.',
    'auth/invalid-login-credentials': 'Nome ou senha incorretos.',
    'auth/wrong-password': 'Nome ou senha incorretos.',
    'auth/user-not-found': 'Nome ou senha incorretos.',
    'auth/invalid-email': 'Esse nome não pode ser usado no login.',
    'auth/weak-password': `Senha fraca: use no mínimo ${SENHA_MINIMA} caracteres.`,
    'auth/password-does-not-meet-requirements': 'A senha não atende às regras do login. Use uma senha mais longa.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com o login. Verifique a internet e tente de novo.',
    'auth/user-disabled': 'Esta conta foi desativada. Fale com o administrador.',
    'auth/operation-not-allowed': 'O login por nome e senha ainda não foi ativado no Firebase.',
    'permission-denied': 'O Firebase recusou o acesso ao cadastro. As regras do Firestore foram coladas no console?',
    'unavailable': 'Sem conexão com o Firebase. Verifique a internet e tente de novo.',
  };
  return frases[codigo] || 'Não foi possível concluir' + (codigo ? ` (${codigo}).` : '.');
}

// Entra com nome e senha. Devolve '' se deu certo ou a mensagem de erro.
async function entraNaConta(nomeDigitado, senha){
  const login = nomeParaLogin(nomeDigitado);
  if(login.erro) return login.erro;
  if(!senha) return 'Digite a senha.';
  nomeDaEntrada = login.nome;
  try{
    await firebaseConectado().auth.signInWithEmailAndPassword(login.email, senha);
    return '';
  }catch(err){ return mensagemErroConta(err); }
}

// Cria a conta com nome e senha (mínimo de 8 caracteres e confirmação igual).
// Devolve '' se deu certo ou a mensagem de erro. Nome repetido = "esse nome já existe".
async function criaConta(nomeDigitado, senha, confirmacao){
  const login = nomeParaLogin(nomeDigitado);
  if(login.erro) return login.erro;
  const erroSenha = confereSenhaNova(senha, confirmacao);
  if(erroSenha) return erroSenha;
  nomeDaEntrada = login.nome;
  try{
    await firebaseConectado().auth.createUserWithEmailAndPassword(login.email, senha);
    return '';
  }catch(err){ return mensagemErroConta(err); }
}

// Sai da conta e recarrega a página, para não sobrar na memória nenhum arquivo
// ou resultado de conferência da pessoa que saiu.
async function saiDaConta(){
  try{ await firebaseConectado().auth.signOut(); }
  finally{ location.reload(); }
}

// Troca a senha: confirma a senha atual com o Firebase (reautenticação) e grava a nova.
// Devolve '' se deu certo ou a mensagem de erro.
async function trocaSenha(atual, nova, confirmacao){
  if(!atual) return 'Digite a senha atual.';
  const erroSenha = confereSenhaNova(nova, confirmacao);
  if(erroSenha) return erroSenha;
  if(nova === atual) return 'A senha nova tem que ser diferente da atual.';
  const usuario = firebaseConectado().auth.currentUser;
  if(!usuario) return 'Você não está mais conectado. Entre de novo.';
  try{
    const credencial = firebase.auth.EmailAuthProvider.credential(usuario.email, atual);
    await usuario.reauthenticateWithCredential(credencial);
  }catch(err){
    const c = err && err.code;
    if(c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/invalid-login-credentials')
      return 'A senha atual está incorreta.';
    return mensagemErroConta(err);
  }
  try{
    await usuario.updatePassword(nova);
    return '';
  }catch(err){ return mensagemErroConta(err); }
}
