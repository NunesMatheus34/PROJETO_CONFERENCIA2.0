/* =====================================================================
   TELA DE ENTRADA (antes de tudo)
   Desenha o que aparece antes do site: "Conectando…", as abas Entrar /
   Criar conta (só NOME e SENHA), a espera ("Aguardando liberação do
   administrador", "Bloqueado") e o erro de quando o login não carrega.
   Quem decide qual delas aparece é o js/login/sessao.js; quem fala com o
   Firebase é o js/login/conta.js. Tudo vai para a tela por textContent.
   ===================================================================== */

// Mostra só uma das partes da entrada: 'carregando', 'formularios', 'espera' ou 'erro'.
function mostraParteEntrada(parte){
  document.getElementById('entrada').hidden = false;
  document.getElementById('entradaCarregando').hidden = parte !== 'carregando';
  document.getElementById('entradaFormularios').hidden = parte !== 'formularios';
  document.getElementById('entradaEspera').hidden = parte !== 'espera';
  document.getElementById('entradaErro').hidden = parte !== 'erro';
}

// "Conectando…" (ou outro texto curto) enquanto o Firebase responde.
function mostraEntradaCarregando(texto){
  document.getElementById('entradaCarregando').textContent = texto || 'Conectando…';
  mostraParteEntrada('carregando');
}

// As abas Entrar / Criar conta, com os botões destravados e, se houver, um aviso no Entrar.
function mostraEntradaFormularios(aviso){
  document.querySelectorAll('.entrada-form button[type="submit"]').forEach(b => { b.disabled = false; });
  if(aviso){ escolheAbaEntrada('entrar'); mostraErroFormulario(document.getElementById('formEntrar'), aviso); }
  mostraParteEntrada('formularios');
}

// Conta que entrou mas não pode usar o site: o nome, a mensagem (com a cor do status) e o Sair.
// tipo: 'aviso' (amarelo) ou 'alerta' (vermelho).
function mostraEntradaEspera(nome, texto, tipo){
  document.getElementById('entradaOla').textContent = nome ? 'Olá, ' + nome + '.' : '';
  const msg = document.getElementById('entradaEsperaTexto');
  msg.className = 'mensagem mensagem-' + (tipo || 'aviso');
  msg.textContent = texto;
  mostraParteEntrada('espera');
}

// Erro sem conta (o SDK do Firebase não carregou): só a mensagem, o site não abre.
function mostraEntradaErro(texto){
  document.getElementById('entradaErro').textContent = texto;
  mostraParteEntrada('erro');
}

// Esconde a entrada inteira (o site foi liberado).
function escondeEntrada(){
  document.getElementById('entrada').hidden = true;
}

// Troca entre as abas 'entrar' e 'criar', limpando o erro da aba que aparece.
function escolheAbaEntrada(qual){
  [['entrar', 'abaEntrar', 'formEntrar'], ['criar', 'abaCriar', 'formCriar']].forEach(([nome, aba, form]) => {
    const ativa = nome === qual;
    document.getElementById(aba).setAttribute('aria-selected', String(ativa));
    document.getElementById(form).hidden = !ativa;
  });
  const form = document.getElementById(qual === 'criar' ? 'formCriar' : 'formEntrar');
  mostraErroFormulario(form, '');
}

// Escreve (ou apaga, com texto vazio) a mensagem de erro de um formulário.
function mostraErroFormulario(form, texto){
  const p = form.querySelector('[data-erro]');
  p.textContent = texto;
  p.hidden = !texto;
}

// Liga um formulário: no envio, trava o botão, chama a ação (que devolve '' ou o erro)
// e mostra o erro. Se deu certo, a senha é apagada e a sessão troca a tela sozinha.
function ligaFormularioEntrada(form, acao, textoEsperando){
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    const textoBotao = botao.textContent;
    botao.disabled = true;
    botao.textContent = textoEsperando;
    mostraErroFormulario(form, '');
    const erro = await acao(form.elements);
    botao.textContent = textoBotao;
    form.querySelectorAll('input[type="password"]').forEach(i => { i.value = ''; });
    if(erro){ botao.disabled = false; mostraErroFormulario(form, erro); }
  });
}

// Liga as abas, os dois formulários e o Sair da espera. Chamada uma vez pela sessão.
function iniciaTelaEntrada(){
  document.getElementById('abaEntrar').addEventListener('click', () => escolheAbaEntrada('entrar'));
  document.getElementById('abaCriar').addEventListener('click', () => escolheAbaEntrada('criar'));
  ligaFormularioEntrada(document.getElementById('formEntrar'),
    c => entraNaConta(c.nome.value, c.senha.value), 'Entrando…');
  ligaFormularioEntrada(document.getElementById('formCriar'),
    c => criaConta(c.nome.value, c.senha.value, c.confirmacao.value), 'Criando…');
  document.getElementById('entradaSair').addEventListener('click', saiDaConta);
}
