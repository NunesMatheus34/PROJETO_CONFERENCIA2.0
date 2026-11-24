/* =====================================================================
   APP: menu lateral e troca de telas
   Cada tela é uma <section id="tela-NOME"> do index.html. O #NOME do
   endereço diz qual aparece; o menu só troca o #, então dá para abrir uma
   tela direto pelo link e o botão Voltar funciona.
   No celular o menu vira uma gaveta que abre pelo botão ☰ e fecha ao
   escolher uma tela, ao tocar fora ou com Esc.
   Este arquivo não tem regra de conferência: elas ficam em js/conferencias/.
   ===================================================================== */

// Telas que existem; qualquer outro # abre a primeira.
const TELAS = ['conferencia-dda', 'codigo-barras', 'conferencia-boletos', 'dda-ret', 'ajuda', 'perfil'];

// Mostra só a tela pedida e marca o item do menu dela como ativo.
function mostraTela(nome){
  document.querySelectorAll('section.tela').forEach(s => { s.hidden = s.id !== 'tela-' + nome; });
  document.querySelectorAll('.menu-item[data-tela]').forEach(item => {
    const ativo = item.dataset.tela === nome;
    item.classList.toggle('ativo', ativo);
    if(ativo) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
}

// Nome da tela que está no endereço (#nome), ou a primeira se o # for desconhecido.
function telaDoEndereco(){
  const nome = location.hash.replace('#', '');
  return TELAS.includes(nome) ? nome : TELAS[0];
}

// Acerta a tela com o endereço. Endereço sem # ou com # desconhecido é trocado
// pelo da primeira tela sem criar entrada nova no histórico.
function sincronizaTela(){
  const nome = telaDoEndereco();
  if(location.hash !== '#' + nome){ location.replace('#' + nome); return; }
  mostraTela(nome);
  fechaMenuCelular();
}

// Abre ou fecha a gaveta do menu no celular e atualiza o botão ☰ para leitores de tela.
function abreMenuCelular(abrir){
  document.body.classList.toggle('menu-aberto', abrir);
  const botao = document.getElementById('menuAbrir');
  botao.setAttribute('aria-expanded', String(abrir));
  botao.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
}

// Fecha a gaveta do menu (no computador não faz diferença).
function fechaMenuCelular(){ abreMenuCelular(false); }

// Liga o menu, o endereço e as telas que já existem no index.html.
function iniciaApp(){
  document.getElementById('menuAbrir').addEventListener('click', () =>
    abreMenuCelular(!document.body.classList.contains('menu-aberto')));
  document.getElementById('menuFundo').addEventListener('click', fechaMenuCelular);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') fechaMenuCelular(); });
  window.addEventListener('hashchange', sincronizaTela);

  // cada tela liga os seus próprios botões e caixas (js/telas/)
  iniciaTelaDda();
  iniciaTelaCodigoBarras();

  sincronizaTela();
}

iniciaApp();
