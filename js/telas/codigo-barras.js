/* =====================================================================
   TELA: CÓDIGO DE BARRAS
   Só desenha e reage aos cliques. Duas conferências, escolhidas pelas
   abas do topo da tela:
     A) Um relatório: envia o relatório com código de barras, Conferir,
        cartões/abas/tabela e o Excel (regras em js/conferencias/codigo-barras.js).
     B) Relatório contra relatório: uma empresa e um relatório em cada caixa;
        cada arquivo é conferido ao ser enviado (empresa da 1ª linha, as
        duas empresas diferentes); Conferir mostra os grupos e o Excel
        (regras em js/conferencias/relatorio-contra-relatorio.js).
   Dado de arquivo vai para a tela sempre com textContent (função cria).
   ===================================================================== */

// Atalho para os elementos da tela.
const elCb = id => document.getElementById(id);

// Estado da conferência A: arquivo escolhido, resultado e o desenho do resultado.
// pedido: número da última leitura pedida (leitura antiga que termina depois é descartada).
const telaCb = { arquivo:null, resultado:null, empresa:null, desenho:null, pedido:0 };

// Estado da conferência B, um lado para cada caixa ('a' e 'b'):
// empresa escolhida, títulos lidos do relatório, alerta do arquivo e número da leitura.
const telaRr = {
  lados: { a: { empresa:null, titulos:null, alerta:'', pedido:0 }, b: { empresa:null, titulos:null, alerta:'', pedido:0 } },
  resultado:null, desenho:null, empresas:null,
};

/* ---------- Abas do topo ---------- */

// Mostra a conferência escolhida ('um' ou 'dois') e marca a aba dela.
function trocaModoCb(modo){
  elCb('cbModoUm').hidden = modo !== 'um';
  elCb('cbModoDois').hidden = modo !== 'dois';
  elCb('cbModoUmAba').setAttribute('aria-selected', String(modo === 'um'));
  elCb('cbModoDoisAba').setAttribute('aria-selected', String(modo === 'dois'));
}

/* ---------- A) Um relatório ---------- */

// Volta a conferência A ao começo: caixa vazia, sem alerta, sem resultado.
function recomecaCb(){
  telaCb.pedido++;
  Object.assign(telaCb, { arquivo:null, resultado:null, empresa:null });
  preparaCaixaEnvio(elCb('cbCaixa'), false, 'Nenhum arquivo escolhido');
  limpaMensagem(elCb('cbAlerta')); limpaMensagem(elCb('cbAviso'));
  elCb('cbResultado').hidden = true;
  if(telaCb.desenho) telaCb.desenho.limpa();
  elCb('cbConferir').disabled = true;
  elCb('cbBaixar').disabled = true;
}

// Arquivo escolhido: guarda e libera o Conferir (a leitura é feita no Conferir, como no antigo).
function recebeArquivoCb(arquivo){
  telaCb.pedido++;
  Object.assign(telaCb, { arquivo, resultado:null });
  limpaMensagem(elCb('cbAlerta')); limpaMensagem(elCb('cbAviso'));
  elCb('cbResultado').hidden = true;
  elCb('cbConferir').disabled = false;
  elCb('cbBaixar').disabled = true;
}

// Conferir: lê o relatório no navegador, roda a conferência e desenha o resultado.
async function confereCb(){
  if(!telaCb.arquivo) return;
  const meu = ++telaCb.pedido;
  limpaMensagem(elCb('cbAlerta')); limpaMensagem(elCb('cbAviso'));
  let leitura;
  try{ leitura = await lerMatrizComTexto(telaCb.arquivo); }
  catch(err){
    if(meu !== telaCb.pedido) return;
    mostraErro(elCb('cbAlerta'), 'Não consegui ler o relatório: ' + (err.message || err));
    recusaCaixaEnvio(elCb('cbCaixa'));
    return;
  }
  if(meu !== telaCb.pedido) return;
  const r = conferirCodigoBarras(leitura);
  if(r.erro){ mostraErro(elCb('cbAlerta'), r.erro); recusaCaixaEnvio(elCb('cbCaixa')); return; }
  telaCb.resultado = r;
  telaCb.empresa = identificaEmpresa(leitura.matriz);
  mostraResultadoCb();
}

// Desenha cartões, abas e tabela da conferência A, a linha de informação e o aviso
// dos códigos ilegíveis (gravados como número pelo Excel: ficaram de fora).
function mostraResultadoCb(){
  const r = telaCb.resultado;
  elCb('cbInfo').textContent = `Relatório: ${telaCb.empresa ? telaCb.empresa.nome : 'empresa não reconhecida pela 1ª linha'} · ` +
    `${r.titulos.length} ${r.titulos.length === 1 ? 'título' : 'títulos'} com código de barras (40+ dígitos) e saldo`;
  if(r.ilegiveis.length){
    const linhas = r.ilegiveis.map(x => x.linha).join(', ');
    mostraMensagem(elCb('cbAviso'), 'alerta', `${r.ilegiveis.length === 1 ? '1 título ficou' : r.ilegiveis.length + ' títulos ficaram'} de fora: ` +
      `o código de barras foi gravado como NÚMERO no Excel e pode ter perdido dígitos (linha${r.ilegiveis.length === 1 ? '' : 's'} ${linhas} do Excel). ` +
      'Confira o código no sistema; não pague por ele.');
  }
  telaCb.desenho = ligaResultado({
    area: elCb('cbArea'), status: STATUS_CB, colunas: COLUNAS_TELA_CB,
    soma: somaValores, busca: buscaCasa, vazio: MSG_VAZIO_CB,
  });
  telaCb.desenho.mostra(linhasCodigoBarras(r));
  elCb('cbResultado').hidden = false;
  elCb('cbBaixar').disabled = false;
}

// Texto da tabela quando a aba não tem nenhum título.
const MSG_VAZIO_CB = {
  ok:    'Nenhum título com o valor do código igual ao saldo.',
  valor: 'Nenhuma divergência: o valor de todos os códigos bate com o saldo lançado.',
  dup:   'Nenhum código de barras repetido.',
};

// Colunas da tabela da conferência A (o saldo fica por último: é o total do rodapé).
const COLUNAS_TELA_CB = [
  { cab:'Situação', celula: l => {
    // etiqueta do status do valor e, se o código se repete, a do grupo de duplicados embaixo
    const caixa = cria('div', 'lista-celula');
    const etiquetaEmLinha = (st, texto) => { const s = cria('span'); s.append(cria('span', 'etiqueta st-' + st.cor, texto)); caixa.append(s); };
    const st = STATUS_CB.find(s => s.id === (l.diff === null ? 'ok' : 'valor'));
    etiquetaEmLinha(st, st.nome);
    if(l.dup){ const dup = STATUS_CB.find(s => s.id === 'dup'); etiquetaEmLinha(dup, `${dup.nome} · grupo ${l.dup}`); }
    return caixa;
  }},
  { cab:'Vencimento', classe:'mono', celula: l => dataBR(l.titulo.venc) },
  { cab:'Fornecedor', celula: l => l.titulo.nome || '—' },
  { cab:'Duplicata', classe:'mono', celula: l => l.titulo.duplicata || '—' },
  { cab:'Código de barras', classe:'mono codigo', celula: l => l.titulo.codigo },
  { cab:'Valor no código', classe:'num', celula: l => brl(l.titulo.valorCodigo) },
  { cab:'Diferença', classe:'num', celula: l => l.diff === null ? '—' : `${l.diff >= 0 ? '+' : ''}${brl(l.diff)}` },
  { cab:'Saldo lançado', classe:'num', celula: l => brl(l.titulo.saldo) },
];

// Baixa o Excel da conferência A (Divergência de valor e Duplicados, como no antigo).
async function baixaExcelCb(){
  if(!telaCb.resultado) return;
  const conteudo = await montaExcel(abasExcelCodigoBarras(telaCb.resultado));
  baixaArquivo(conteudo, `conferencia-codigo-barras${telaCb.empresa ? '-' + telaCb.empresa.id : ''}.xlsx`);
}

/* ---------- B) Relatório contra relatório ---------- */

// Elementos de um lado ('a' ou 'b'): seletor da empresa e caixa do arquivo.
function elementosLadoRr(lado){
  return lado === 'a' ? { seletor: elCb('rrEmpresaA'), caixa: elCb('rrCaixaA') } : { seletor: elCb('rrEmpresaB'), caixa: elCb('rrCaixaB') };
}

// Põe as 4 empresas nos dois seletores (com "Escolha a empresa" no começo).
function preencheEmpresasRr(){
  ['a', 'b'].forEach(lado => {
    const sel = elementosLadoRr(lado).seletor;
    const vazia = cria('option', '', 'Escolha a empresa'); vazia.value = '';
    sel.replaceChildren(vazia, ...EMPRESAS.map(e => { const o = cria('option', '', e.nome); o.value = e.id; return o; }));
  });
}

// Volta um lado ao começo com a empresa escolhida no seletor: caixa vazia
// (travada sem empresa), sem títulos e sem alerta. Apaga o resultado.
function recomecaLadoRr(lado){
  const s = telaRr.lados[lado];
  const { seletor, caixa } = elementosLadoRr(lado);
  s.pedido++;
  s.empresa = EMPRESAS.find(e => e.id === seletor.value) || null;
  s.titulos = null; s.alerta = '';
  preparaCaixaEnvio(caixa, !s.empresa, s.empresa ? 'Nenhum arquivo escolhido' : 'Escolha a empresa primeiro');
  apagaResultadoRr();
}

// Apaga o resultado da conferência B (algo mudou nos arquivos ou nas empresas).
function apagaResultadoRr(){
  telaRr.resultado = null;
  elCb('rrResultado').hidden = true;
  if(telaRr.desenho) telaRr.desenho.limpa();
  mostraAlertasRr();
}

// Volta a conferência B inteira ao começo (seletores e caixas).
function recomecaRr(){
  elCb('rrEmpresaA').value = ''; elCb('rrEmpresaB').value = '';
  recomecaLadoRr('a'); recomecaLadoRr('b');
}

// Relatório enviado num lado: lê no navegador, confere a empresa da 1ª linha e lê os títulos.
// Se a empresa do lado ou o arquivo mudarem durante a leitura, o resultado é descartado.
async function recebeRelatorioRr(lado, arquivo){
  const s = telaRr.lados[lado];
  const meu = ++s.pedido;
  const empresa = s.empresa;
  s.titulos = null; s.alerta = '';
  apagaResultadoRr();
  let alerta = '', titulos = null;
  try{
    const leitura = await lerMatrizComTexto(arquivo);
    alerta = checaRelatorioCruzado(empresa, leitura.matriz);
    if(!alerta){ const t = extraiTitulosRelatorio(leitura); alerta = t.erro; titulos = t.titulos; }
  }catch(err){ alerta = 'Não consegui ler o relatório: ' + (err.message || err); }
  if(meu !== s.pedido || s.empresa !== empresa) return;
  if(alerta){ s.alerta = alerta; recusaArquivoRr(elementosLadoRr(lado).caixa); }
  else s.titulos = titulos;
  mostraAlertasRr();
}

// Marca a caixa como recusada e troca o ✓ do nome do arquivo por ✗.
function recusaArquivoRr(caixa){
  recusaCaixaEnvio(caixa);
  const nome = caixa.querySelector('.caixa-envio-arquivo');
  nome.textContent = nome.textContent.replace(/^✓/, '✗');
}

// Mostra os alertas do momento (arquivo de outra empresa, as duas empresas iguais...)
// e libera o Conferir só com os dois relatórios aprovados e de empresas diferentes.
function mostraAlertasRr(){
  const { a, b } = telaRr.lados;
  const alertas = [];
  if(a.alerta) alertas.push('1º relatório: ' + a.alerta);
  if(b.alerta) alertas.push('2º relatório: ' + b.alerta);
  const iguais = alertaEmpresasIguais(a.empresa, b.empresa);
  if(iguais) alertas.push(iguais);
  const caixa = elCb('rrAlerta');
  if(alertas.length){
    caixa.replaceChildren(...alertas.map(t => cria('p', '', '⚠ ' + t)));
    caixa.hidden = false;
  }else limpaMensagem(caixa);
  elCb('rrConferir').disabled = !(a.titulos && b.titulos && !iguais);
  elCb('rrBaixar').disabled = !telaRr.resultado;
}

// Conferir: cruza os títulos dos dois relatórios e desenha os grupos.
function confereRr(){
  const { a, b } = telaRr.lados;
  if(!a.titulos || !b.titulos || alertaEmpresasIguais(a.empresa, b.empresa)) return;
  telaRr.resultado = conferirRelatorios(a.titulos, b.titulos);
  telaRr.empresas = { a: a.empresa, b: b.empresa };
  const comCodigo = lista => lista.filter(t => t.codigo).length;
  const r = telaRr.resultado;
  const grupos = n => n === 1 ? '1 grupo' : `${n} grupos`;
  elCb('rrInfo').textContent = `${a.empresa.nome}: ${a.titulos.length} títulos (${comCodigo(a.titulos)} com código de barras) · ` +
    `${b.empresa.nome}: ${b.titulos.length} títulos (${comCodigo(b.titulos)} com código de barras) · ` +
    `${grupos(r.mesmo.length + r.duplo.length)} com o mesmo fornecedor e valor nas duas empresas` +
    (r.linha.length ? ` · ${r.linha.length} ${r.linha.length === 1 ? 'título é a mesma linha' : 'títulos são a mesma linha'} nos dois relatórios (fora da conferência)` : '');
  telaRr.desenho = ligaResultado({
    area: elCb('rrArea'), status: STATUS_RR, colunas: colunasTelaRr(a.empresa, b.empresa),
    soma: somaValores, busca: buscaCasa, vazio: MSG_VAZIO_RR,
    qtd: (n, st) => st.id === 'linha' ? qtdTitulos(n) : grupos(n),
    classeLinha: l => l.mesmoBoleto ? 'linha-alerta' : '',
  });
  telaRr.desenho.mostra(linhasRelatorios(r));
  elCb('rrResultado').hidden = false;
  mostraAlertasRr();
}

// Texto da tabela quando a aba não tem nenhum grupo.
const MSG_VAZIO_RR = {
  mesmo: 'Nenhum código de barras lançado nas duas empresas.',
  duplo: 'Nenhum título com o mesmo fornecedor e o mesmo valor nas duas empresas.',
  linha: 'Nenhuma linha igual nos dois relatórios.',
};

// Uma célula com vários textos, um embaixo do outro (um por título da empresa no grupo).
// destaque = códigos (chave) que aparecem nas duas empresas: ficam em vermelho.
function celulaListaRr(lista, campo, classe, destaque){
  const caixa = cria('div', 'lista-celula' + (classe ? ' ' + classe : ''));
  const textos = textosDoLadoRR(lista, campo);
  lista.forEach((t, i) => caixa.append(cria('span', destaque && t.chave && destaque.has(t.chave) ? 'codigo-igual' : '', textos[i])));
  return caixa;
}

// Colunas da tabela da conferência B (as mesmas do Excel, na mesma ordem).
function colunasTelaRr(empresaA, empresaB){
  return [
    { cab:'Fornecedor', celula: l => { const c = cria('div', 'lista-celula'); nomesDoGrupoRR(l.grupo).forEach(n => c.append(cria('span', '', n))); return c; } },
    { cab:`NF ${empresaA.nome}`, classe:'mono', celula: l => celulaListaRr(l.grupo.a, 'nf') },
    { cab:`Venc. ${empresaA.nome}`, classe:'mono', celula: l => celulaListaRr(l.grupo.a, 'venc') },
    { cab:`Código de barras ${empresaA.nome}`, classe:'mono codigo', celula: l => celulaListaRr(l.grupo.a, 'codigo', '', l.grupo.codigosIguais) },
    { cab:`NF ${empresaB.nome}`, classe:'mono', celula: l => celulaListaRr(l.grupo.b, 'nf') },
    { cab:`Venc. ${empresaB.nome}`, classe:'mono', celula: l => celulaListaRr(l.grupo.b, 'venc') },
    { cab:`Código de barras ${empresaB.nome}`, classe:'mono codigo', celula: l => celulaListaRr(l.grupo.b, 'codigo', '', l.grupo.codigosIguais) },
    { cab:'Avisos', celula: l => {
      const caixa = cria('div', 'lista-celula');
      avisosGrupoRR(l).forEach(a => {
        const linha = cria('span');
        linha.append(cria('span', 'etiqueta ' + (a.startsWith('mesmo boleto') ? 'st-alerta' : 'st-neutro'), a));
        caixa.append(linha);
      });
      return caixa;
    }},
    { cab:'Valor', classe:'num', celula: l => brl(l.valor) },
  ];
}

// Baixa o Excel da conferência B (as mesmas abas e colunas da tela).
async function baixaExcelRr(){
  if(!telaRr.resultado) return;
  const { a, b } = telaRr.empresas;
  const conteudo = await montaExcel(abasExcelRelatorios(telaRr.resultado, a, b));
  baixaArquivo(conteudo, `relatorio-contra-relatorio-${a.id}-${b.id}.xlsx`);
}

/* ---------- Ajuda ---------- */

// Legendas da Ajuda montadas dos próprios status (mesmo nome e cor da tela e do Excel).
function legendasAjudaCb(){
  [['ajudaStatusCb', STATUS_CB], ['ajudaStatusRr', STATUS_RR]].forEach(([id, status]) => {
    const lista = elCb(id);
    if(!lista) return;
    lista.replaceChildren(...status.map(st => {
      const li = cria('li');
      li.append(cria('span', 'etiqueta st-' + st.cor, st.nome), cria('span', '', ' ' + st.ajuda));
      return li;
    }));
  });
}

// Liga as abas, as caixas, os seletores e os botões das duas conferências.
function iniciaTelaCodigoBarras(){
  elCb('cbModoUmAba').addEventListener('click', () => trocaModoCb('um'));
  elCb('cbModoDoisAba').addEventListener('click', () => trocaModoCb('dois'));

  ligaCaixaEnvio(elCb('cbCaixa'), recebeArquivoCb);
  elCb('cbConferir').addEventListener('click', confereCb);
  elCb('cbBaixar').addEventListener('click', baixaExcelCb);
  elCb('cbNova').addEventListener('click', recomecaCb);

  preencheEmpresasRr();
  ['a', 'b'].forEach(lado => {
    const { seletor, caixa } = elementosLadoRr(lado);
    seletor.addEventListener('change', () => recomecaLadoRr(lado));
    ligaCaixaEnvio(caixa, arquivo => recebeRelatorioRr(lado, arquivo));
  });
  elCb('rrConferir').addEventListener('click', confereRr);
  elCb('rrBaixar').addEventListener('click', baixaExcelRr);
  elCb('rrNova').addEventListener('click', recomecaRr);

  legendasAjudaCb();
  trocaModoCb('um');
  recomecaCb();
  recomecaRr();
}
