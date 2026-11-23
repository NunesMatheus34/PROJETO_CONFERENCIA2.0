/* =====================================================================
   EXCEL DE RESULTADO
   Grava as abas que uma conferência montou (js/conferencias/) num .xlsx
   e baixa no computador. Tudo no navegador (ExcelJS), nada vai para
   servidor. Cada aba tem, na linha 1, o título com a cor do status (as
   mesmas cores de css/base.css) e, na linha 2, o cabeçalho.
   Precisa do ExcelJS carregado antes, pelo index.html.
   ===================================================================== */

// Cores de cada status, iguais às variáveis --*-texto e --*-fundo de css/base.css.
const CORES_STATUS = {
  ok:        { texto:'FF17653B', fundo:'FFE3F3E9' },
  aviso:     { texto:'FF7A4F00', fundo:'FFFCF1D6' },
  alerta:    { texto:'FF9A2A1C', fundo:'FFFBE5E2' },
  confirmar: { texto:'FF4B3A8C', fundo:'FFECE7F8' },
  neutro:    { texto:'FF46544F', fundo:'FFEDF0EF' },
};
const BORDA_FINA = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };

// Escreve uma aba: título (linha 1, fundo da cor do status), cabeçalho (linha 2) e as linhas.
// aba = { nome, titulo, cor, colunas:[{cab, w, fmt}], linhas:[[...valores]] }.
// Coluna com fmt '@' é gravada como texto; as de dinheiro ficam alinhadas à direita.
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
      if(!c.fmt) return;
      r.getCell(i+1).numFmt = c.fmt;
      if(c.fmt !== '@') r.getCell(i+1).alignment = { horizontal:'right' };
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

// Baixa o conteúdo como arquivo .xlsx com o nome dado (sem passar por servidor).
function baixaArquivo(conteudo, nomeArquivo){
  const blob = new Blob([conteudo], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
