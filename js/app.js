/* =====================================================================
   APP: menu lateral, caminho do topo e troca de telas
   O menu é montado a partir da lista MENU abaixo (grupos com título,
   ícone e telas). Cada tela é uma <section id="tela-NOME"> do index.html;
   o #NOME do endereço diz qual aparece, então dá para abrir uma tela
   direto pelo link e o botão Voltar funciona.
   Os grupos abrem e fecham pela seta, e o navegador lembra quais estão
   abertos (localStorage, só a lista de grupos: nenhum dado de arquivo).
   No celular o menu vira uma gaveta que abre pelo botão ☰ e fecha ao
   escolher uma tela, ao tocar fora ou com Esc.
   Este arquivo não tem regra de conferência: elas ficam em js/conferencias/.
   ===================================================================== */

/* ---------------------------------------------------------------------
   LISTA DO MENU — é aqui que se acrescenta uma tela nova.

   Para uma tela nova num grupo que já existe:
     1. acrescente UMA linha em "telas" do grupo, por exemplo
          { tela: 'conciliacao', titulo: 'Conciliação' },
     2. crie no index.html a <section class="tela" id="tela-conciliacao" hidden>
        (copie uma tela "chega numa próxima etapa" como modelo).
   O menu, o caminho do topo ("Grupo › Tela") e a lista da tela Início
   saem sozinhos desta lista.

   Para um grupo novo: acrescente um objeto { id, grupo, icone, telas: [...] }.
   Grupo ainda sem telas (telas: []) aparece fechado, com a etiqueta "em breve".
   Tela solta, fora de grupo (como Início): { tela, titulo, icone }.
   Grupo com soAdm: true só aparece para o adm (classe "so-adm"; o CSS esconde
   quando o body não tem "eh-adm"). Isso é só o caminho: quem protege os
   dados do adm são as regras do firestore.rules.
   O ícone é o id de um <symbol> do topo do index.html.
   --------------------------------------------------------------------- */
const MENU = [
  { tela: 'inicio', titulo: 'Início', icone: 'i-inicio' },
  { id: 'conferencias', grupo: 'Conferências', icone: 'i-conferencias', telas: [
    { tela: 'conferencia-dda',     titulo: 'Conferência DDA' },
    { tela: 'codigo-barras',       titulo: 'Código de barras' },
    { tela: 'conferencia-boletos', titulo: 'Conferência de boletos' },
  ]},
  { id: 'arquivos', grupo: 'Arquivos bancários', icone: 'i-ret', telas: [
    { tela: 'dda-ret', titulo: 'DDA → .RET' },
  ]},
  { id: 'caixa',      grupo: 'Caixa',      icone: 'i-caixa',      telas: [] },
  { id: 'relatorios', grupo: 'Relatórios', icone: 'i-relatorios', telas: [] },
  { id: 'adm', grupo: 'Administração', icone: 'i-adm', soAdm: true, telas: [
    { tela: 'usuarios', titulo: 'Usuários' },
  ]},
];

// Telas do rodapé do menu, separadas da lista principal. O Perfil abre pelo nome do usuário.
const MENU_RODAPE = [
  { tela: 'ajuda', titulo: 'Ajuda', icone: 'i-ajuda' },
];
const TELA_PERFIL = { tela: 'perfil', titulo: 'Perfil' };

// Grupos abertos na primeira visita (antes de o navegador lembrar alguma escolha).
const GRUPOS_ABERTOS_PADRAO = ['conferencias', 'arquivos', 'adm'];
const CHAVE_GRUPOS_ABERTOS = 'central-financeira.menu.grupos-abertos';

// Lista plana de todas as telas, com o grupo de cada uma (para o caminho do topo).
// A primeira (Início) é a que abre quando o # do endereço é desconhecido.
function listaTelas(){
  const telas = [];
  MENU.forEach(item => {
    if(item.telas) item.telas.forEach(t => telas.push({ ...t, grupo: item.grupo, idGrupo: item.id }));
    else telas.push(item);
  });
  MENU_RODAPE.forEach(t => telas.push(t));
  telas.push(TELA_PERFIL);
  return telas;
}
const TELAS = listaTelas();

// Lê do navegador quais grupos estavam abertos; sem nada salvo (ou ilegível), usa o padrão.
function leGruposAbertos(){
  try{
    const salvo = JSON.parse(localStorage.getItem(CHAVE_GRUPOS_ABERTOS));
    if(Array.isArray(salvo)) return salvo.filter(id => typeof id === 'string');
  }catch(e){ /* localStorage bloqueado ou valor estranho: segue com o padrão */ }
  return GRUPOS_ABERTOS_PADRAO.slice();
}

// Salva no navegador quais grupos estão abertos agora.
function salvaGruposAbertos(){
  const abertos = [...document.querySelectorAll('.menu-grupo-botao[aria-expanded="true"]')]
    .map(b => b.dataset.grupo);
  try{ localStorage.setItem(CHAVE_GRUPOS_ABERTOS, JSON.stringify(abertos)); }catch(e){ /* sem localStorage: só não lembra */ }
}

// Cria um <svg> com o ícone pedido (um <symbol> do index.html).
function criaIcone(id, classe){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe || 'ico');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

// Cria o link de uma tela no menu (com ícone se tiver; telas de grupo vêm sem ícone, recuadas).
function criaItemMenu(t){
  const a = document.createElement('a');
  a.href = '#' + t.tela;
  a.className = 'menu-item' + (t.icone ? '' : ' menu-subitem');
  a.dataset.tela = t.tela;
  if(t.icone) a.appendChild(criaIcone(t.icone));
  const nome = document.createElement('span');
  nome.textContent = t.titulo;
  a.appendChild(nome);
  return a;
}

// Cria um grupo do menu: botão com ícone, título e seta, e a lista das telas embaixo.
// Grupo sem telas fica fechado, travado e com a etiqueta "em breve".
function criaGrupoMenu(g, abertos){
  const caixa = document.createElement('div');
  caixa.className = 'menu-grupo' + (g.soAdm ? ' so-adm' : '');

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'menu-grupo-botao';
  botao.dataset.grupo = g.id;
  botao.appendChild(criaIcone(g.icone));
  const titulo = document.createElement('span');
  titulo.className = 'menu-grupo-titulo';
  titulo.textContent = g.grupo;
  botao.appendChild(titulo);
  caixa.appendChild(botao);

  if(g.telas.length === 0){
    botao.disabled = true;
    const etiqueta = document.createElement('span');
    etiqueta.className = 'etiqueta-em-breve';
    etiqueta.textContent = 'em breve';
    botao.appendChild(etiqueta);
    return caixa;
  }

  botao.appendChild(criaIcone('i-seta', 'ico menu-seta'));
  const lista = document.createElement('div');
  lista.className = 'menu-grupo-telas';
  lista.id = 'menu-grupo-' + g.id;
  g.telas.forEach(t => lista.appendChild(criaItemMenu(t)));
  caixa.appendChild(lista);

  botao.setAttribute('aria-controls', lista.id);
  abreGrupo(botao, abertos.includes(g.id));
  botao.addEventListener('click', () => {
    abreGrupo(botao, botao.getAttribute('aria-expanded') !== 'true');
    salvaGruposAbertos();
  });
  return caixa;
}

// Abre ou fecha um grupo (a seta gira pelo CSS a partir do aria-expanded).
// A lista é achada pelo grupo do botão, porque na montagem o grupo ainda não está na página.
function abreGrupo(botao, abrir){
  botao.setAttribute('aria-expanded', String(abrir));
  botao.parentElement.querySelector('.menu-grupo-telas').hidden = !abrir;
}

// Monta o menu lateral inteiro a partir de MENU e MENU_RODAPE.
function montaMenu(){
  const abertos = leGruposAbertos();
  const lista = document.getElementById('menuLista');
  MENU.forEach(item => lista.appendChild(item.telas ? criaGrupoMenu(item, abertos) : criaItemMenu(item)));
  const rodape = document.getElementById('menuRodape');
  MENU_RODAPE.forEach(t => rodape.insertBefore(criaItemMenu(t), rodape.firstChild));
}

// Monta na tela Início a lista dos grupos e das telas, também a partir de MENU.
function montaInicio(){
  const area = document.getElementById('inicioGrupos');
  MENU.filter(item => item.telas).forEach(g => {
    const cartao = document.createElement('div');
    cartao.className = 'bloco inicio-grupo' + (g.soAdm ? ' so-adm' : '');
    const titulo = document.createElement('h2');
    titulo.appendChild(criaIcone(g.icone));
    const nome = document.createElement('span');
    nome.textContent = g.grupo;
    titulo.appendChild(nome);
    cartao.appendChild(titulo);
    if(g.telas.length === 0){
      const p = document.createElement('p');
      p.className = 'etiqueta-em-breve';
      p.textContent = 'em breve';
      cartao.appendChild(p);
    } else {
      const ul = document.createElement('ul');
      g.telas.forEach(t => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + t.tela;
        a.textContent = t.titulo;
        li.appendChild(a);
        ul.appendChild(li);
      });
      cartao.appendChild(ul);
    }
    area.appendChild(cartao);
  });
}

// Escreve no topo o caminho da tela: "Grupo › Tela", ou só "Tela" se ela não tem grupo.
function mostraCaminho(t){
  const caminho = document.getElementById('caminho');
  caminho.replaceChildren();
  const partes = t.grupo ? [t.grupo, t.titulo] : [t.titulo];
  partes.forEach((texto, i) => {
    if(i > 0){
      const sep = document.createElement('span');
      sep.className = 'caminho-separador';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '›';
      caminho.appendChild(sep);
    }
    const parte = document.createElement('span');
    parte.className = i === partes.length - 1 ? 'caminho-atual' : 'caminho-grupo';
    parte.textContent = texto;
    if(i === partes.length - 1) parte.setAttribute('aria-current', 'page');
    caminho.appendChild(parte);
  });
}

// Mostra só a tela pedida, marca o item do menu dela como ativo, abre o grupo dela
// (para o item ativo ficar à vista) e escreve o caminho no topo.
function mostraTela(nome){
  document.querySelectorAll('section.tela').forEach(s => { s.hidden = s.id !== 'tela-' + nome; });
  document.querySelectorAll('.menu [data-tela]').forEach(item => {
    const ativo = item.dataset.tela === nome;
    item.classList.toggle('ativo', ativo);
    if(ativo) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  const t = TELAS.find(x => x.tela === nome);
  if(t.idGrupo){
    const botao = document.querySelector('.menu-grupo-botao[data-grupo="' + t.idGrupo + '"]');
    if(botao && botao.getAttribute('aria-expanded') !== 'true'){ abreGrupo(botao, true); salvaGruposAbertos(); }
  }
  mostraCaminho(t);
}

// Nome da tela que está no endereço (#nome), ou a primeira (Início) se o # for desconhecido
// ou se a pessoa não tem permissão para ela (js/login/permissoes.js). Antes do login
// ninguém está no site (tudo travado), então o # fica como veio, para o link direto valer depois.
function telaDoEndereco(){
  const nome = location.hash.replace('#', '');
  const conhecida = TELAS.some(t => t.tela === nome);
  const liberada = !cadastroComPermissoes || telaPermitida(nome);
  return conhecida && liberada ? nome : TELAS[0].tela;
}

// Esconde do menu e da Início as telas que a pessoa não pode abrir, e o grupo que ficar
// sem nenhuma tela. Sem nenhuma tela liberada, a Início avisa. Chamada pela sessão
// depois do login; em seguida acerta a tela do endereço (que pode ter sido proibida).
function aplicaPermissoesMenu(){
  document.querySelectorAll('.menu [data-tela], #inicioGrupos a').forEach(item => {
    const tela = item.dataset.tela || item.getAttribute('href').replace('#', '');
    const alvo = item.closest('li') || item;
    alvo.hidden = !telaPermitida(tela);
  });
  document.querySelectorAll('.menu-grupo, .inicio-grupo').forEach(grupo => {
    const itens = grupo.querySelectorAll('.menu-grupo-telas [data-tela], li');
    if(itens.length) grupo.hidden = [...itens].every(i => (i.closest('li') || i).hidden);
  });
  const algumaTela = TELAS_COM_PERMISSAO.some(t => telaPermitida(t.tela));
  document.getElementById('inicioSemTelas').hidden = algumaTela;
  sincronizaTela();
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

// Monta o menu e a Início, liga o menu, o endereço e as telas que já existem no index.html.
function iniciaApp(){
  montaMenu();
  montaInicio();
  document.getElementById('menuAbrir').addEventListener('click', () =>
    abreMenuCelular(!document.body.classList.contains('menu-aberto')));
  document.getElementById('menuFundo').addEventListener('click', fechaMenuCelular);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') fechaMenuCelular(); });
  window.addEventListener('hashchange', sincronizaTela);

  // cada tela liga os seus próprios botões e caixas (js/telas/)
  iniciaTelaDda();
  iniciaTelaCodigoBarras();
  iniciaTelaBoletos();
  iniciaTelaRet();
  iniciaVerificacaoRet();

  sincronizaTela();
}

iniciaApp();
