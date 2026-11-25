/* =====================================================================
   TELA: CONFERÊNCIA DE BOLETOS (DDA do Itaú × "Duplicatas em Aberto Modelo A")
   Só desenha e reage aos cliques; as regras ficam em
   js/conferencias/boletos.js e o Excel em js/excel.js.
   Passos: escolher a empresa (só CRV Matriz e CRV Filial, que têm Itaú),
   enviar o DDA do Itaú e o relatório do sistema, Conferir. Relatório de
   outra empresa ou DDA de outro banco/conta mostra o alerta e não confere.
   O resultado tem as checagens dos arquivos (data, período, empresa),
   4 cartões e abas, busca e a tabela. A busca mostra o bloco inteiro de um
   boleto agrupado; com busca, as faixas de data somem.
   Ao lado de cada linha digitável: banco, valor e vencimento LIDOS DO
   CÓDIGO e o botão Copiar (só pela área de transferência). Nada é editável.
   Dado de arquivo vai para a tela sempre com textContent (cria/criaCom).
   ===================================================================== */

// Atalho para os elementos da tela.
const elBol = id => document.getElementById(id);

// Estado da tela: empresa escolhida, arquivos, último resultado, aba ativa e busca.
// pedido: número da última conferência pedida (leitura antiga que termina depois é descartada).
const telaBol = { empresa:null, arquivoDda:null, arquivoSistema:null, resultado:null, aba:'ok', busca:'', pedido:0 };

// Texto da tabela quando a aba não tem nenhuma linha.
const MSG_VAZIO_BOL = {
  ok:    'Nenhum título com boleto sem pendência. Veja a Verificação.',
  verif: 'Nada para verificar.',
  sem:   'Todo título do sistema tem boleto ou código.',
  dda:   'Todo boleto do DDA casou com um título do sistema.',
};

/* ---------- Escolha da empresa e arquivos ---------- */

// Põe no seletor só as empresas com Itaú que a pessoa pode usar (js/login/permissoes.js),
// com "Escolha a empresa" no começo. A sessão chama de novo depois do login.
function preencheEmpresasBol(){
  const vazia = cria('option', '', 'Escolha a empresa'); vazia.value = '';
  elBol('bolEmpresa').replaceChildren(vazia, ...empresasBoletos().filter(empresaPermitida).map(e => {
    const o = cria('option', '', `${e.nome} (${e.cnpj})`); o.value = e.id; return o;
  }));
}

// Volta ao começo com a empresa do seletor: caixas vazias (travadas sem empresa), sem resultado.
function recomecaBol(){
  telaBol.pedido++;
  telaBol.empresa = EMPRESAS.find(e => e.id === elBol('bolEmpresa').value && empresaPermitida(e)) || null;
  Object.assign(telaBol, { arquivoDda:null, arquivoSistema:null });
  const texto = telaBol.empresa ? 'Nenhum arquivo escolhido' : 'Escolha a empresa primeiro';
  preparaCaixaEnvio(elBol('bolCaixaDda'), !telaBol.empresa, texto);
  preparaCaixaEnvio(elBol('bolCaixaSistema'), !telaBol.empresa, texto);
  apagaResultadoBol();
}

// Apaga o resultado e as mensagens (algo mudou nos arquivos ou na empresa).
function apagaResultadoBol(){
  telaBol.resultado = null;
  limpaMensagem(elBol('bolAlerta')); limpaMensagem(elBol('bolAviso'));
  elBol('bolChecagens').replaceChildren();
  elBol('bolResultado').hidden = true;
  elBol('bolBaixar').disabled = true;
  elBol('bolConferir').disabled = !(telaBol.empresa && telaBol.arquivoDda && telaBol.arquivoSistema);
}

// Arquivo escolhido numa caixa: guarda (a leitura é feita no Conferir, como no antigo).
function recebeArquivoBol(qual, arquivo){
  telaBol.pedido++;
  if(qual === 'dda') telaBol.arquivoDda = arquivo; else telaBol.arquivoSistema = arquivo;
  apagaResultadoBol();
}

// Conferir: lê os dois arquivos no navegador, confere a empresa e roda a conferência.
async function confereBol(){
  const { empresa, arquivoDda, arquivoSistema } = telaBol;
  if(!empresa || !arquivoDda || !arquivoSistema) return;
  const meu = ++telaBol.pedido;
  apagaResultadoBol();
  let r;
  try{
    const [lDda, lSis] = await Promise.all([lerMatrizComTexto(arquivoDda), lerMatrizComTexto(arquivoSistema)]);
    r = conferenciaBoletos(empresa, lDda, lSis);
  }catch(err){
    r = { erro: 'Não consegui ler os arquivos: ' + (err.message || err) };
  }
  if(meu !== telaBol.pedido) return;
  if(r.erro){
    mostraErro(elBol('bolAlerta'), r.erro);
    if(r.onde) recusaCaixaEnvio(elBol(r.onde === 'dda' ? 'bolCaixaDda' : 'bolCaixaSistema'));
    return;
  }
  telaBol.resultado = r;
  telaBol.aba = 'ok'; telaBol.busca = '';
  mostraResultadoBol();
  // histórico: quantos títulos em cada aba (as mesmas contas dos cartões; sem total em R$)
  const qtd = {};
  ABAS_BOL.forEach(a => { qtd[a.id] = resumoAba(r.abas[a.id]).qtd; });
  registraUso({ tela: 'conferencia-boletos', banco: 'itau', empresa, abas: qtd });
}

/* ---------- Resultado ---------- */

// As checagens dos arquivos (mesma data, período, mesma empresa) como caixas de mensagem.
// Os textos trazem nomes vindos dos arquivos: tudo por textContent.
function checagensDom(lista){
  return lista.map(c => {
    const caixa = cria('div', `mensagem mensagem-${c.tipo} checagem`);
    if(c.tipo === 'alerta'){ caixa.classList.add('mensagem-grande'); caixa.setAttribute('role', 'alert'); }
    caixa.append(cria('p', 'checagem-titulo', `${ICONE_MENSAGEM[c.tipo]} ${c.titulo}`), cria('p', 'checagem-texto', c.texto));
    if(c.itens && c.itens.length){
      caixa.append(criaCom('details', 'checagem-lista', [cria('summary', '', 'Ver a lista'),
        criaCom('ul', '', c.itens.map(i => cria('li', '', i)))]));
    }
    return caixa;
  });
}

// Mostra tudo depois do Conferir: aviso da trava, checagens, linha de informação, cartões e tabela.
function mostraResultadoBol(){
  const r = telaBol.resultado;
  if(r.aviso) mostraMensagem(elBol('bolAviso'), 'aviso', r.aviso);
  elBol('bolChecagens').replaceChildren(...checagensDom(r.checagens));
  elBol('bolInfo').replaceChildren(
    document.createTextNode('Consulta no Itaú: '),
    cria('b', '', r.consulta || 'data/hora não encontrada no arquivo'),
    document.createTextNode(` · ${r.nDda} boletos no DDA · ${r.nTitulos} títulos no sistema ` +
      `(${r.comCodigo} já com código de barras; ${r.abas.jaConferidos} desses códigos conferem com o DDA e ficam fora das abas)`));
  montaAreaBol();
  elBol('bolResultado').hidden = false;
  elBol('bolBaixar').disabled = false;
}

// Monta cartões, abas, busca e tabela (vazia) na área do resultado e desenha a aba ativa.
function montaAreaBol(){
  const area = elBol('bolArea');
  const abas = telaBol.resultado.abas;
  const cartoes = criaCom('div', 'cartoes', ABAS_BOL.map(a => {
    const res = resumoAba(abas[a.id]);
    const c = cria('button', 'cartao st-' + a.cor);
    c.type = 'button'; c.dataset.aba = a.id;
    c.append(cria('span', 'cartao-nome', a.nome), cria('span', 'cartao-qtd', String(res.qtd)), cria('span', 'cartao-total', brl(res.total)));
    c.addEventListener('click', () => escolheAbaBol(a.id));
    return c;
  }));
  const abasEl = criaCom('div', 'abas', ABAS_BOL.map(a => {
    const b = cria('button', 'aba st-' + a.cor, a.nome);
    b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.aba = a.id;
    b.append(cria('span', 'aba-qtd', String(resumoAba(abas[a.id]).qtd)));
    b.addEventListener('click', () => escolheAbaBol(a.id));
    return b;
  }));
  abasEl.setAttribute('role', 'tablist');
  const campo = cria('input', 'campo-busca');
  campo.type = 'search'; campo.placeholder = 'Buscar fornecedor, NF, valor, data ou linha digitável';
  campo.setAttribute('aria-label', 'Buscar na aba');
  campo.addEventListener('input', () => { telaBol.busca = campo.value; desenhaAbaBol(); });
  const tabela = criaCom('table', 'tabela tabela-boletos', [cria('thead'), cria('tbody'), cria('tfoot')]);
  area.replaceChildren(cartoes, abasEl, criaCom('div', 'barra-busca', [campo]), criaCom('div', 'tabela-caixa', [tabela]));
  desenhaAbaBol();
}

// Troca a aba visível (pelo cartão ou pela aba).
function escolheAbaBol(id){ telaBol.aba = id; desenhaAbaBol(); }

// Célula da linha digitável: a linha no formato impresso, banco, valor e vencimento
// LIDOS DO CÓDIGO e o botão Copiar. Sem linha (bloqueado ou NF de agrupado): "—".
function celulaLinhaDigitavel(r){
  const td = cria('td', 'cod-bol');
  if(!r.linha){
    if(r.status === 'compoe') td.appendChild(cria('span', 'sub', 'compõe o boleto acima'));
    else td.textContent = '—';
    return td;
  }
  const d = r.dec;
  td.appendChild(cria('span', 'mono linha-dig', formataLinha(r.linha)));
  td.appendChild(cria('span', 'sub mono', `Banco ${d.banco} · ${brl(d.valor)} · venc. ${d.venc || 'sem vencimento'}`));
  const btn = cria('button', 'botao botao-copiar', 'Copiar');
  btn.type = 'button';
  btn.dataset.linha = r.linha;
  td.appendChild(btn);
  return td;
}

// Uma linha da tabela (<tr>): faixa de data, subtotal ou uma linha de título/boleto.
// A etiqueta do status aparece onde a aba mistura status (Verificação sempre; nas
// outras, só o que é diferente do status da aba).
function linhaAbaTr(r, aba, cols){
  const tr = cria('tr', 'bol-' + r.status);
  if(r.status === 'faixa'){
    const td = cria('td', 'faixa-data', r.fornecedor);
    td.colSpan = cols.length;
    tr.appendChild(td);
    return tr;
  }
  if(r.status === 'subtotal'){
    const td = cria('td', '', r.fornecedor); td.colSpan = 3; tr.appendChild(td);
    tr.appendChild(cria('td', 'num', brl(r.valor)));
    if(cols.length > 4){ const resto = cria('td'); resto.colSpan = cols.length - 4; tr.appendChild(resto); }
    return tr;
  }
  const st = STATUS_BOL[r.status];
  tr.classList.add('st-' + st.cor);
  const mostraMarca = aba === 'verif' || (aba === 'sem' && r.status !== 'sem') || (aba === 'dda' && r.status !== 'dda');
  cols.forEach(c => {
    if(c.id === 'fornecedor'){
      tr.appendChild(criaCom('td', 'forn', [
        mostraMarca && cria('span', 'etiqueta st-' + st.cor, st.nome),
        cria('span', 'forn-nome', r.fornecedor),
        ...r.obs.map(o => cria('span', 'sub', o)),
      ]));
    }else if(c.id === 'valor') tr.appendChild(cria('td', 'num', brl(r.valor)));
    else if(c.id === 'cb') tr.appendChild(cria('td', 'mono codigo', r.cb || '—'));
    else if(c.id === 'linha') tr.appendChild(celulaLinhaDigitavel(r));
    else if(c.id === 'verificar') tr.appendChild(cria('td', 'verificar', r.verificar));
    else tr.appendChild(cria('td', 'mono', r[c.id] || '—'));
  });
  return tr;
}

// Desenha a aba ativa: cabeçalho, linhas (filtradas pela busca) e total no rodapé.
// A busca mostra o bloco inteiro (boleto agrupado + suas NFs) quando qualquer linha
// dele casa; com busca, as faixas de data e os subtotais somem.
function desenhaAbaBol(){
  const abas = telaBol.resultado && telaBol.resultado.abas;
  if(!abas) return;
  const aba = telaBol.aba, cols = colunasAbaBol(aba);
  const todas = abas[aba];
  const busca = telaBol.busca.trim();
  const blocos = new Set(todas.filter(r => !ehFaixa(r) && buscaCasa(r, telaBol.busca)).map(r => r.bloco));
  const visiveis = todas.filter(r => busca ? blocos.has(r.bloco) && !ehFaixa(r) : true);
  const tabela = elBol('bolArea').querySelector('.tabela-boletos');

  const trCab = cria('tr');
  cols.forEach(c => trCab.appendChild(cria('th', c.id === 'valor' ? 'num' : '', c.cab)));
  tabela.tHead.replaceChildren(trCab);

  const corpo = tabela.tBodies[0];
  if(visiveis.length) corpo.replaceChildren(...visiveis.map(r => linhaAbaTr(r, aba, cols)));
  else{
    const td = cria('td', 'vazio', busca ? `Nada encontrado para “${busca}” nesta aba.` : MSG_VAZIO_BOL[aba]);
    td.colSpan = cols.length;
    corpo.replaceChildren(criaCom('tr', '', [td]));
  }

  const res = resumoAba(visiveis);
  const tdTot = cria('td', '', `Total${abas.porData && !busca ? ' geral' : ''} · ${res.qtd === 1 ? '1 item' : res.qtd + ' itens'}`);
  tdTot.colSpan = 3;
  const trTot = criaCom('tr', '', [tdTot, cria('td', 'num', brl(res.total))]);
  if(cols.length > 4){ const resto = cria('td'); resto.colSpan = cols.length - 4; trTot.appendChild(resto); }
  tabela.tFoot.replaceChildren(trTot);

  elBol('bolArea').querySelectorAll('.cartao').forEach(c => c.classList.toggle('ativo', c.dataset.aba === aba));
  elBol('bolArea').querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
}

// Copiar: só pela área de transferência do navegador (nada de seleção manual).
// O texto copiado é a linha digitável conferida (47 dígitos), guardada no botão.
async function copiaLinhaBol(e){
  const btn = e.target.closest('.botao-copiar');
  if(!btn) return;
  const volta = texto => { btn.textContent = texto; setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copiado', 'falhou'); }, 2000); };
  try{
    if(!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('sem acesso');
    await navigator.clipboard.writeText(btn.dataset.linha);
    btn.classList.add('copiado'); volta('Copiado ✓');
  }catch(err){
    btn.classList.add('falhou'); volta('Não copiou');
  }
}

// Baixar Excel: gera, lê de volta e só baixa se cada linha digitável for igual à da tela.
async function baixaExcelBol(){
  const r = telaBol.resultado;
  if(!r) return;
  limpaMensagem(elBol('bolAlerta'));
  try{
    const x = await excelBoletosConferido(r.abas);
    if(x.erros){
      mostraErro(elBol('bolAlerta'), `O Excel gerado não confere com a tela, então o download foi cancelado. ${x.erros.slice(0, 3).join(' · ')}` +
        (x.erros.length > 3 ? ` (e mais ${x.erros.length - 3})` : ''));
      return;
    }
    baixaArquivo(x.conteudo, `conferencia-boletos-${telaBol.empresa.id}.xlsx`);
  }catch(err){
    mostraErro(elBol('bolAlerta'), 'Não consegui gerar o Excel: ' + (err.message || err));
  }
}

// Legenda dos status na Ajuda (vem de STATUS_BOL: mesmo nome e cor da tela e do Excel).
function legendaAjudaBol(){
  const lista = elBol('ajudaStatusBol');
  if(!lista) return;
  lista.replaceChildren(...Object.values(STATUS_BOL).map(st =>
    criaCom('li', '', [cria('span', 'etiqueta st-' + st.cor, st.nome), cria('span', '', ' ' + st.ajuda)])));
}

// Liga a tela: seletor da empresa, caixas, botões, Copiar e a legenda da Ajuda.
function iniciaTelaBoletos(){
  preencheEmpresasBol();
  elBol('bolEmpresa').addEventListener('change', recomecaBol);
  ligaCaixaEnvio(elBol('bolCaixaDda'), arquivo => recebeArquivoBol('dda', arquivo));
  ligaCaixaEnvio(elBol('bolCaixaSistema'), arquivo => recebeArquivoBol('sistema', arquivo));
  elBol('bolConferir').addEventListener('click', confereBol);
  elBol('bolBaixar').addEventListener('click', baixaExcelBol);
  elBol('bolNova').addEventListener('click', () => { elBol('bolEmpresa').value = ''; recomecaBol(); });
  elBol('bolArea').addEventListener('click', copiaLinhaBol);
  legendaAjudaBol();
  recomecaBol();
}
