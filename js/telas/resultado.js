/* =====================================================================
   DESENHO DO RESULTADO (cartões, abas, busca e tabela)
   Peça de tela reaproveitável pelas conferências: recebe os status
   (nome, cor), as linhas já separadas por status e como desenhar cada
   coluna. Só desenha: não muda o resultado nem o Excel.
   Todo texto vindo de arquivo entra com textContent (função cria).
   ===================================================================== */

// Cria um elemento com classe e texto (textContent, nunca HTML).
function cria(tag, classe, texto){
  const el = document.createElement(tag);
  if(classe) el.className = classe;
  if(texto !== undefined && texto !== null) el.textContent = texto;
  return el;
}

// "1 título" ou "N títulos", para o rodapé da tabela.
function qtdTitulos(n){ return n === 1 ? '1 título' : `${n} títulos`; }

// Liga um resultado a uma área da tela e devolve { mostra(linhasPorStatus), limpa() }.
// opcoes = {
//   area:    elemento onde ficam cartões, abas, busca e tabela,
//   status:  [{ id, nome, cor, ajuda, semTotal }] na ordem das abas
//            (semTotal: o cartão e o rodapé mostram só a quantidade, sem somar valor),
//   colunas: [{ cab, classe, celula(linha) -> texto | elemento }],
//   soma(linhas) -> número, busca(linha, texto) -> bool, vazio: { status: texto },
//   classeLinha(linha) -> classe da <tr> (opcional, ex.: destaque vermelho),
//   qtd(n, status) -> rótulo da quantidade no rodapé (opcional; padrão "N títulos")
// }
function ligaResultado(opcoes){
  const { area, status, soma, busca } = opcoes;
  let linhasPorStatus = null, abaAtiva = status[0].id, textoBusca = '';

  area.replaceChildren();
  const cartoes = cria('div', 'cartoes');
  const abas = cria('div', 'abas'); abas.setAttribute('role', 'tablist');
  const barra = cria('div', 'barra-busca');
  const campo = cria('input', 'campo-busca');
  campo.type = 'search'; campo.placeholder = 'Buscar fornecedor, NF, CNPJ, valor ou data';
  campo.setAttribute('aria-label', 'Buscar na aba');
  barra.append(campo);
  const caixaTabela = cria('div', 'tabela-caixa');
  const tabela = cria('table', 'tabela');
  const thead = cria('thead'), tbody = cria('tbody'), tfoot = cria('tfoot');
  tabela.append(thead, tbody, tfoot);
  caixaTabela.append(tabela);
  area.append(cartoes, abas, barra, caixaTabela);

  campo.addEventListener('input', () => { textoBusca = campo.value; desenhaTabela(); });

  // troca a aba visível (pelo cartão ou pela aba)
  function escolhe(id){ abaAtiva = id; desenhaAbas(); desenhaTabela(); }

  // cartões: um por status, com quantidade e total (só quantidade se semTotal); clicar abre a aba
  function desenhaCartoes(){
    cartoes.replaceChildren(...status.map(st => {
      const linhas = linhasPorStatus[st.id];
      const c = cria('button', 'cartao st-' + st.cor);
      c.type = 'button'; c.title = st.ajuda || ''; c.dataset.status = st.id;
      c.append(cria('span', 'cartao-nome', st.nome), cria('span', 'cartao-qtd', String(linhas.length)));
      if(!st.semTotal) c.append(cria('span', 'cartao-total', brl(soma(linhas))));
      c.addEventListener('click', () => escolhe(st.id));
      return c;
    }));
  }

  // abas: uma por status, com a quantidade
  function desenhaAbas(){
    abas.replaceChildren(...status.map(st => {
      const a = cria('button', 'aba st-' + st.cor, st.nome);
      a.type = 'button'; a.setAttribute('role', 'tab'); a.dataset.status = st.id;
      a.setAttribute('aria-selected', String(st.id === abaAtiva));
      a.append(cria('span', 'aba-qtd', String(linhasPorStatus[st.id].length)));
      a.addEventListener('click', () => escolhe(st.id));
      return a;
    }));
    cartoes.querySelectorAll('.cartao').forEach(c => c.classList.toggle('ativo', c.dataset.status === abaAtiva));
  }

  // tabela da aba ativa, filtrada pela busca, com o total no rodapé
  function desenhaTabela(){
    const st = status.find(s => s.id === abaAtiva);
    const visiveis = linhasPorStatus[abaAtiva].filter(l => busca(l, textoBusca));
    const tr = cria('tr');
    opcoes.colunas.forEach(c => tr.append(cria('th', c.classe || '', c.cab)));
    thead.replaceChildren(tr);

    tbody.replaceChildren(...(visiveis.length ? visiveis.map(l => {
      const linha = cria('tr', opcoes.classeLinha ? opcoes.classeLinha(l) : '');
      opcoes.colunas.forEach(c => {
        const td = cria('td', c.classe || '');
        const conteudo = c.celula(l);
        if(conteudo instanceof Node) td.append(conteudo); else td.textContent = conteudo;
        linha.append(td);
      });
      return linha;
    }) : [(() => {
      const vazia = cria('tr'), td = cria('td', 'vazio');
      td.colSpan = opcoes.colunas.length;
      td.textContent = textoBusca.trim() ? `Nada encontrado para “${textoBusca.trim()}” em ${st.nome}.` : opcoes.vazio[abaAtiva];
      vazia.append(td);
      return vazia;
    })()]));

    const rodape = cria('tr');
    const rotulo = (opcoes.qtd || qtdTitulos)(visiveis.length, st);
    if(st.semTotal){
      const rot = cria('td', '', rotulo);
      rot.colSpan = opcoes.colunas.length;
      rodape.append(rot);
    }else{
      const rot = cria('td', '', `Total · ${rotulo}`);
      rot.colSpan = opcoes.colunas.length - 1;
      rodape.append(rot, cria('td', 'num', brl(soma(visiveis))));
    }
    tfoot.replaceChildren(rodape);
  }

  return {
    // mostra um resultado novo (mantém a aba e a busca escolhidas)
    mostra(novas){ linhasPorStatus = novas; desenhaCartoes(); desenhaAbas(); desenhaTabela(); },
    // volta ao começo: sem resultado, primeira aba, busca vazia
    limpa(){ linhasPorStatus = null; abaAtiva = status[0].id; textoBusca = ''; campo.value = '';
             cartoes.replaceChildren(); abas.replaceChildren(); thead.replaceChildren(); tbody.replaceChildren(); tfoot.replaceChildren(); },
  };
}

// Texto principal com uma linha menor embaixo (ex.: nome do banco + "No sistema: ...").
// Devolve um elemento; sub vazio = só o principal.
function textoComSub(principal, sub, classe){
  const caixa = cria('div', classe || '');
  caixa.append(cria('span', '', principal));
  if(sub) caixa.append(cria('span', 'sub', sub));
  return caixa;
}
