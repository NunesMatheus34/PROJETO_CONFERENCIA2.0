/* =====================================================================
   TELA PERFIL (link no rodapé do menu)
   Mostra o nome, o papel e a situação de quem entrou, e troca a senha
   (pede a senha atual; a conferência dela é do js/login/conta.js).
   Os dados vêm do cadastro no Firestore e vão para a tela por textContent.
   ===================================================================== */

// Nome do papel para a tela.
const PAPEIS = { usuario: 'Usuário', adm: 'Administrador' };

// Escreve na tela o cadastro de quem entrou (chamada pela sessão a cada mudança do cadastro).
function mostraPerfil(cadastro){
  document.getElementById('perfilNome').textContent = cadastro.nome || '';
  document.getElementById('perfilPapel').textContent = PAPEIS[cadastro.papel] || String(cadastro.papel || '');
  const st = STATUS_CADASTRO[cadastro.status];
  const etiqueta = document.getElementById('perfilStatus');
  etiqueta.className = 'etiqueta st-' + (st ? st.classe : 'neutro');
  etiqueta.textContent = st ? st.nome : String(cadastro.status || '');
  // só para o gerenciador de senhas do navegador: é o nome que a pessoa digita para entrar
  document.getElementById('perfilUsuarioOculto').value = cadastro.nome || '';
}

// Liga o formulário de trocar a senha. Chamada uma vez pela sessão.
function iniciaTelaPerfil(){
  const form = document.getElementById('formSenha');
  const msg = form.querySelector('[data-erro]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    msg.hidden = true;
    const c = form.elements;
    const erro = await trocaSenha(c.atual.value, c.nova.value, c.confirmacao.value);
    form.querySelectorAll('input[type="password"]').forEach(i => { i.value = ''; });
    botao.disabled = false;
    msg.className = 'mensagem ' + (erro ? 'mensagem-alerta' : 'mensagem-ok');
    msg.textContent = erro || 'Senha trocada. Use a senha nova da próxima vez que entrar.';
    msg.hidden = false;
  });
}
