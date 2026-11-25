/* =====================================================================
   SESSÃO: decide o que a pessoa vê
   Sem login → tela de entrada. Com login → lê o cadastro usuarios/{uid}
   (cria se ainda não existe), grava o ultimoAcesso e acompanha o cadastro
   ao vivo:
     liberado   → abre o site (menu e telas) com o nome no rodapé;
     aguardando → só "Aguardando liberação do administrador";
     bloqueado  → só "Acesso bloqueado".
   Se o adm bloquear alguém com o site aberto, a página recarrega e a
   pessoa cai na mensagem, sem sobrar nada na memória.
   ATENÇÃO: esconder as telas aqui é só o caminho certo, não a trava. O
   código do site é público (GitHub Pages); o que o login protege de
   verdade são os dados do Firebase, pelas regras do firestore.rules.
   ===================================================================== */

let pararDeAcompanharCadastro = null;
let siteLiberado = false;
let avisoParaEntrada = '';   // aparece no formulário Entrar na próxima vez que ele for mostrado
let permissoesAbertas = '';  // papel + permissões com que o site foi aberto (para notar mudança)

// Esconde o menu e as telas (estado do começo da página).
function travaSite(){
  document.body.classList.add('travado');
}

// Papel e permissões do cadastro num texto só, para comparar com o de quando o site abriu.
function marcaPermissoes(cadastro){
  return JSON.stringify([cadastro.papel, cadastro.permissoes || null]);
}

// Abre o site para quem está liberado: some a entrada, aparece o menu com o nome no rodapé,
// só com as telas e empresas que a pessoa pode usar (js/login/permissoes.js).
// Se o adm mudar o papel ou as permissões com o site aberto, a página recarrega
// (como no bloqueio): nada do que estava aberto sobra com a permissão antiga.
function liberaSite(cadastro){
  if(siteLiberado && marcaPermissoes(cadastro) !== permissoesAbertas){ location.reload(); return; }
  const primeiraVez = !siteLiberado;
  siteLiberado = true;
  permissoesAbertas = marcaPermissoes(cadastro);
  defineCadastroPermissoes(cadastro);
  if(primeiraVez){
    // os seletores foram montados antes do login (sem empresa nenhuma): monta de novo
    preencheEmpresasBol(); preencheEmpresasRr(); preencheEmpresasRet(); trocaBancoDda();
    if(telaPermitida('dda-ret')) carregaControleNsaRet();   // NSAs usados no Firestore (só depois do login)
    aplicaPermissoesMenu();
  }
  document.getElementById('usuarioNome').textContent = cadastro.nome || '';
  mostraPerfil(cadastro);
  ajustaTelaUsuarios(cadastro, firebaseConectado().auth.currentUser.uid);   // só o adm vê a Administração
  ajustaTelaHistorico(cadastro);
  ajustaTelaControleRet(cadastro);
  escondeEntrada();
  document.body.classList.remove('travado');
}

// Mostra o que o cadastro manda: o site, a espera ou o bloqueio.
function aplicaCadastro(cadastro){
  const liberado = !!cadastro && cadastro.status === 'liberado';
  // estava usando o site e perdeu a liberação: recarrega para limpar a memória da página
  if(siteLiberado && !liberado){ location.reload(); return; }
  if(liberado){ liberaSite(cadastro); return; }
  travaSite();
  const nome = cadastro && cadastro.nome;
  if(!cadastro) mostraEntradaEspera('', 'Seu cadastro não foi encontrado. Fale com o administrador.', 'alerta');
  else if(cadastro.status === 'aguardando') mostraEntradaEspera(nome, 'Aguardando liberação do administrador.', 'aviso');
  else if(cadastro.status === 'bloqueado') mostraEntradaEspera(nome, 'Acesso bloqueado. Fale com o administrador.', 'alerta');
  else mostraEntradaEspera(nome, 'Situação do cadastro desconhecida. Fale com o administrador.', 'alerta');
}

// Chamada pelo Firebase sempre que alguém entra ou sai (e ao abrir a página com login salvo).
async function aoMudarLogin(usuario){
  if(pararDeAcompanharCadastro){ pararDeAcompanharCadastro(); pararDeAcompanharCadastro = null; }
  if(!usuario){
    travaSite();
    mostraEntradaFormularios(avisoParaEntrada);
    avisoParaEntrada = '';
    return;
  }
  mostraEntradaCarregando('Abrindo o seu cadastro…');
  try{
    const cadastro = await leCadastro(usuario.uid);
    // o login gravado é sempre o e-mail que o Firebase confirmou (usuario.email), não o digitado
    if(cadastro) await marcaUltimoAcesso(usuario.uid, cadastro, usuario.email);
    else if(nomeDaEntrada) await criaCadastro(usuario.uid, nomeDaEntrada, usuario.email);   // conta nova (já nasce com ultimoAcesso)
    else {
      // login salvo de uma conta sem cadastro: sem o nome digitado não dá para criar; pede para entrar de novo
      avisoParaEntrada = 'Entre de novo com o seu nome e senha para terminar o cadastro.';
      await firebaseConectado().auth.signOut();
      return;
    }
    pararDeAcompanharCadastro = acompanhaCadastro(usuario.uid, aplicaCadastro,
      err => { travaSite(); mostraEntradaEspera('', mensagemErroConta(err), 'alerta'); });
  }catch(err){
    travaSite();
    mostraEntradaEspera('', mensagemErroConta(err), 'alerta');
  }
}

// Começo de tudo: liga a entrada, o Perfil e o Sair, e passa a ouvir o login do Firebase.
function iniciaSessao(){
  iniciaTelaEntrada();
  iniciaTelaPerfil();
  iniciaTelaUsuarios();
  document.getElementById('menuSair').addEventListener('click', saiDaConta);
  const fb = firebaseConectado();
  if(!fb){
    mostraEntradaErro('Não foi possível carregar o login. Verifique a internet e recarregue a página.');
    return;
  }
  mostraEntradaCarregando();
  fb.auth.onAuthStateChanged(aoMudarLogin);
}

iniciaSessao();
