/* =====================================================================
   EXCEL DE RESULTADO
   Grava as abas que uma conferência montou (js/conferencias/) num .xlsx
   e baixa no computador. Tudo no navegador (ExcelJS), nada vai para
   servidor. Cada aba tem, na linha 1, o título com a cor do status (as
   mesmas cores de css/base.css) e, na linha 2, o cabeçalho.
   A Conferência de Boletos tem um Excel próprio (no fim do arquivo), com o
   mesmo desenho do projeto antigo: cabeçalho na linha 1, faixas por data,
   cada linha com a cor do status, e a releitura do arquivo gerado antes de
   liberar o download.
   Precisa do ExcelJS carregado antes, pelo index.html.
   ===================================================================== */

// Cores de cada status, iguais às variáveis --*-texto e --*-fundo de css/base.css.
const CORES_STATUS = {
  ok:        { texto:'FF17653B', fundo:'FFE3F3E9' },
  aviso:     { texto:'FF7A4F00', fundo:'FFFCF1D6' },
  alerta:    { texto:'FF9A2A1C', fundo:'FFFBE5E2' },
  confirmar: { texto:'FF4B3A8C', fundo:'FFECE7F8' },
  neutro:    { texto:'FF46544F', fundo:'FFEDF0EF' },
  grupo:     { texto:'FF1F4E8C', fundo:'FFDCE8F7' },   // azul: boleto agrupado (Conferência de Boletos)
  compoe:    { texto:'FF1F4E8C', fundo:'FFF1F6FC' },   // azul claro: NF que compõe o boleto agrupado
};
const BORDA_FINA = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };

// Escreve uma aba: título (linha 1, fundo da cor do status), cabeçalho (linha 2) e as linhas.
// aba = { nome, titulo, cor, colunas:[{cab, w, fmt}], linhas:[[...valores]] }.
// Coluna com fmt '@' é gravada como texto; as de dinheiro ficam alinhadas à direita.
// Coluna com quebra:true mostra cada linha do texto (separadas por \n) uma embaixo da outra.
function escreveAba(wb, aba){
  const ws = wb.addWorksheet(aba.nome);
  const cor = CORES_STATUS[aba.cor] || CORES_STATUS.neutro;
  ws.columns = aba.colunas.map(c => ({ width:c.w }));
  const ultimaCol = String.fromCharCode(64 + aba.colunas.length);

  ws.mergeCells(`A1:${ultimaCol}1`);
  const t = ws.getCell('A1');
  t.value = aba.titulo;
  t.font = { bold:true, size:13, color:{argb:'FFFFFFFF'} };
  t.fill = { type:'pattern', pattern:'solid', fgColor:{argb:cor.texto} };
  t.alignment = { vertical:'middle', horizontal:'left', indent:1 };
  ws.getRow(1).height = 22;

  const cab = ws.getRow(2);
  cab.values = aba.colunas.map(c => c.cab);
  cab.eachCell(c => {
    c.font = { bold:true, color:{argb:cor.texto} };
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:cor.fundo} };
    c.alignment = { vertical:'middle', horizontal:'center' };
    c.border = BORDA_FINA;
  });
  cab.height = 18;

  aba.linhas.forEach(vals => {
    const r = ws.addRow(vals);
    r.eachCell({ includeEmpty:true }, c => { c.border = BORDA_FINA; });
    aba.colunas.forEach((c, i) => {
      if(c.fmt) r.getCell(i+1).numFmt = c.fmt;
      const alinha = {};
      if(c.fmt && c.fmt !== '@') alinha.horizontal = 'right';
      if(c.quebra){ alinha.wrapText = true; alinha.vertical = 'top'; }
      if(Object.keys(alinha).length) r.getCell(i+1).alignment = alinha;
    });
  });

  if(aba.linhas.length === 0){
    ws.mergeCells(`A3:${ultimaCol}3`);
    ws.getCell('A3').value = 'Nenhum registro nesta categoria.';
    ws.getCell('A3').font = { italic:true, color:{argb:'FF5C6B66'} };
  }
  return ws;
}

// Monta o arquivo com todas as abas (na ordem recebida) e devolve o conteúdo (ArrayBuffer).
async function montaExcel(abas){
  const wb = new ExcelJS.Workbook();
  abas.forEach(aba => escreveAba(wb, aba));
  return wb.xlsx.writeBuffer();
}

// Baixa o conteúdo como arquivo com o nome dado (sem passar por servidor).
// tipo = o tipo do arquivo; sem ele, .xlsx. O .RET vai como bytes ('application/octet-stream').
function baixaArquivo(conteudo, nomeArquivo, tipo){
  const blob = new Blob([conteudo], { type: tipo || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------
   EXCEL DA CONFERÊNCIA DE BOLETOS (trazido do projeto antigo sem mudar)
   As 4 abas, com as mesmas colunas, faixas e cores da tela. NF, código de
   barras e linha digitável vão como TEXTO (string + numFmt '@'), para não
   perder zero nem dígito. Antes de liberar o download, o arquivo gerado é
   lido de volta e cada linha digitável é comparada com a da tela.
   As abas vêm de montaAbasBol (js/conferencias/boletos.js).
   --------------------------------------------------------------------- */
const ARIAL = { name:'Arial', size:10 };
// faixas por data e subtotais: não são status, só formatação (verde-petróleo do destaque)
const ESTILO_FAIXA_BOL = { faixa:{ fundo:'FFE3F0EE', texto:'FF0A443E' }, subtotal:{ fundo:'FFF9FAFA', texto:'FF0A443E' } };
const COR_CABECALHO_BOL = 'FF0F5C53';

// Monta o arquivo (ExcelJS.Workbook) com as 4 abas da Conferência de Boletos.
function planilhaBoletos(abas){
  const wb = new ExcelJS.Workbook();
  ABAS_BOL.forEach(a => {
    const cols = colunasAbaBol(a.id);
    const ws = wb.addWorksheet(a.planilha, { views:[{ state:'frozen', ySplit:1 }] });
    ws.columns = cols.map(c => ({ width:c.w }));
    const cab = ws.getRow(1);
    cab.values = cols.map(c => c.cab);
    cab.eachCell(c => {
      c.font = { ...ARIAL, bold:true, color:{ argb:'FFFFFFFF' } };
      c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:COR_CABECALHO_BOL } };
      c.alignment = { vertical:'middle', horizontal:'center' };
      c.border = BORDA_FINA;
    });
    cab.height = 20;
    abas[a.id].forEach(r => {
      const faixa = ehFaixa(r);
      const valores = cols.map((c, i) => {
        if(faixa) return i === 0 ? r.fornecedor : (c.id === 'valor' && r.valor !== null ? r.valor : '');
        if(c.id === 'valor') return r.valor;
        if(c.id === 'fornecedor') return r.status === 'consumo' ? `${r.fornecedor} — conta de consumo` : r.fornecedor;
        return String(r[c.id] || '');
      });
      const row = ws.addRow(valores);
      const st = faixa ? ESTILO_FAIXA_BOL[r.status] : CORES_STATUS[STATUS_BOL[r.status].cor];
      cols.forEach((c, i) => {
        const cel = row.getCell(i + 1);
        cel.font = { ...ARIAL, bold: r.status === 'grupo' || faixa, color:{ argb: st.texto } };
        cel.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: st.fundo } };
        cel.border = BORDA_FINA;
        cel.alignment = { vertical:'top', wrapText: !faixa && (c.id === 'verificar' || c.id === 'fornecedor') };
        if(c.texto && !(faixa && i === 0)) cel.numFmt = '@';
        if(c.id === 'valor'){ cel.numFmt = FMT_REAL; cel.alignment = { vertical:'top', horizontal:'right' }; }
      });
    });
    const res = resumoAba(abas[a.id]);
    const rotulo = `Total${abas.porData ? ' geral' : ''} · ${res.qtd} ${res.qtd === 1 ? 'item' : 'itens'}`;
    const tot = ws.addRow(cols.map((c, i) => i === 0 ? rotulo : c.id === 'valor' ? res.total : ''));
    tot.eachCell({ includeEmpty:true }, (cel, i) => {
      cel.font = { ...ARIAL, bold:true };
      cel.border = BORDA_FINA;
      if(cols[i - 1] && cols[i - 1].id === 'valor') cel.numFmt = FMT_REAL;
    });
  });
  return wb;
}

// Lê de volta o Excel gerado e compara, aba por aba e linha por linha, a linha
// digitável e o código de barras com os da tela. Devolve a lista de diferenças
// (vazia = pode baixar).
async function confereExcelBoletos(buffer, abas){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const erros = [];
  ABAS_BOL.forEach(a => {
    const ws = wb.getWorksheet(a.planilha);
    if(!ws){ erros.push(`a aba "${a.planilha}" não está no arquivo`); return; }
    const cols = colunasAbaBol(a.id);
    const iLinha = cols.findIndex(c => c.id === 'linha') + 1, iCb = cols.findIndex(c => c.id === 'cb') + 1;
    abas[a.id].forEach((r, k) => {
      const row = ws.getRow(k + 2);
      const lido = i => { const v = row.getCell(i).value; return v === null || v === undefined ? '' : v; };
      if(iLinha && (lido(iLinha) !== r.linha || (r.linha && typeof lido(iLinha) !== 'string')))
        erros.push(`${a.nome}, linha ${k + 2}: linha digitável no Excel "${lido(iLinha)}" ≠ tela "${r.linha}"`);
      if(iCb && (lido(iCb) !== r.cb || (r.cb && typeof lido(iCb) !== 'string')))
        erros.push(`${a.nome}, linha ${k + 2}: código de barras no Excel ≠ tela`);
    });
    if(ws.rowCount !== abas[a.id].length + 2) erros.push(`${a.nome}: o Excel tem ${ws.rowCount - 2} linhas e a tela ${abas[a.id].length}`);
  });
  return erros;
}

// Gera o Excel da Conferência de Boletos e confere com a tela.
// Devolve { conteudo } para baixar, ou { erros } (e aí o download NÃO pode acontecer).
async function excelBoletosConferido(abas){
  const conteudo = await planilhaBoletos(abas).xlsx.writeBuffer();
  const erros = await confereExcelBoletos(conteudo, abas);
  return erros.length ? { erros } : { conteudo };
}

/* ---------------------------------------------------------------------
   EXCEL DE CONFERÊNCIA DO DDA → .RET
   As abas vêm de abasExcelRet (js/conferencias/excel-ret.js). Antes de
   liberar o download, o arquivo gerado é lido de volta: cada aba tem que
   estar lá, e cada célula de TEXTO (código, linha digitável, CPF/CNPJ,
   SHA-256...) tem que voltar igual e como texto.
   --------------------------------------------------------------------- */

// Lê de volta o Excel gerado e compara as células de texto (fmt '@') com as abas.
// Devolve a lista de diferenças (vazia = pode baixar).
async function confereExcelRet(buffer, abas){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const erros = [];
  abas.forEach(aba => {
    const ws = wb.getWorksheet(aba.nome);
    if(!ws){ erros.push(`a aba "${aba.nome}" não está no arquivo`); return; }
    aba.linhas.forEach((vals, k) => {
      const row = ws.getRow(k + 3);
      aba.colunas.forEach((c, i) => {
        if(c.fmt !== '@' || vals[i] === '' || vals[i] === null || vals[i] === undefined) return;
        const lido = row.getCell(i + 1).value;
        if(lido !== vals[i]) erros.push(`${aba.nome}, linha ${k + 3}, ${c.cab}: no Excel "${lido}" ≠ "${vals[i]}"`);
      });
    });
  });
  return erros;
}

// Gera o Excel de conferência do .RET e confere com as abas.
// Devolve { conteudo } para baixar, ou { erros } (e aí o download NÃO pode acontecer).
async function excelRetConferido(abas){
  const conteudo = await montaExcel(abas);
  const erros = await confereExcelRet(conteudo, abas);
  return erros.length ? { erros } : { conteudo };
}
