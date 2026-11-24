/* =====================================================================
   LEITOR DO DDA DO ITAÚ ("Consulta Boletos Recebidos" do internet banking)
   Recebe a leitura do Excel (de lerMatrizComTexto) e devolve a lista de
   boletos no formato comum que a conferência usa:
     { venc, beneficiario, cnpj, doc, valor, valorAPagar, codigoBarras,
       pagador, banco, comDesconto, codigoTexto, codigoSuspeito, linhaExcel }
   Trazido do projeto antigo sem mudar a regra. Única diferença: o código
   de barras vem SEMPRE do texto da célula (no antigo, nesta tela, vinha do
   número e podia perder dígitos). Ele só aparece na tela e no Excel; não
   entra na conta da conferência.
   Também tem o filtro por unidade do pagador, a data/hora da consulta e o
   reconhecimento do PDF "Boletos Recebidos (DDA)" (tela DDA → .RET).
   Precisa de js/leitura/formatos.js e js/leitura/planilha.js.
   ===================================================================== */

// Linha do cabeçalho: a que tem "Beneficiário" e "Código de barras" (achada pelo
// conteúdo, porque antes dela vêm linhas com os dados da conta). -1 se não achar.
function achaCabecalhoItau(m){
  for(let i=0; i<m.length; i++){
    const cels = (m[i] || []).map(normaliza);
    if(cels.some(c => c.includes('BENEFICIARIO')) &&
       cels.some(c => c.includes('CODIGO') && c.includes('BARRA'))) return i;
  }
  return -1;
}

// Acha cada coluna pelo texto do cabeçalho; se não achar, usa a posição padrão:
// A=Pagador/Agregado B=Beneficiário C=CPF/CNPJ D=Venc. E=Nº Doc. F=Até Venc.
// G=A Pagar H=Tipo de Boleto I=Banco J=Observações K=Código de barras
function colunasItau(linhaCab){
  const cab = (linhaCab || []).map(normaliza);
  const acha = (teste, padrao) => { const i = cab.findIndex(teste); return i>=0 ? i : padrao; };
  return {
    pagador: acha(c => c.startsWith('PAGADOR'), 0),
    benef:   acha(c => c.includes('BENEFICIARIO'), 1),
    cnpj:    acha(c => c.includes('CNPJ'), 2),
    venc:    acha(c => c.startsWith('VENC'), 3),
    doc:     acha(c => c.includes('DOC'), 4),
    ateVenc: acha(c => c.startsWith('ATE VENC'), 5),
    aPagar:  acha(c => c === 'A PAGAR', 6),
    banco:   acha(c => c === 'BANCO', 8),
    codigo:  acha(c => c.includes('CODIGO') && c.includes('BARRA'), 10),
  };
}

// Lê os boletos (leitura = resultado de lerMatrizComTexto).
// "Até Venc." é o valor comparado com o sistema; "A Pagar" fica em valorAPagar.
// Quando os dois são diferentes, o boleto é marcado "com desconto".
// Linha sem "Até Venc." é ignorada.
function leitorItau(leitura){
  const m = leitura.matriz;
  const cab = achaCabecalhoItau(m);
  if(cab<0) return [];
  const c = colunasItau(m[cab]);
  const texto = v => v!=null ? String(v).trim() : '';
  const out = [];
  for(let i=cab+1; i<m.length; i++){
    const linha = m[i] || [];
    const valor = paraNumero(linha[c.ateVenc]);
    if(valor===null) continue;
    const valorAPagar = paraNumero(linha[c.aPagar]);
    const cod = codigoBarrasDaCelula(leitura, i, c.codigo);
    out.push({
      venc: formatData(linha[c.venc]),
      beneficiario: texto(linha[c.benef]),
      cnpj: texto(linha[c.cnpj]),
      doc: texto(linha[c.doc]),
      valor,
      valorAPagar,
      codigoBarras: cod.digitos,
      pagador: texto(linha[c.pagador]),
      banco: texto(linha[c.banco]),
      comDesconto: valorAPagar!==null && valorAPagar!==valor,
      codigoTexto: leitura.textoDe(i, c.codigo).texto,
      codigoSuspeito: cod.suspeito,
      linhaExcel: leitura.linhaExcel(i),
    });
  }
  return out;
}

// Data e hora da consulta, que o Itaú escreve antes do cabeçalho:
// "Data/Hora: 15/10/2026 às 10:39:21" -> "15/10/2026 às 10:39:21" ('' se não achar).
function dataHoraConsultaItau(m){
  const cab = achaCabecalhoItau(m);
  const fim = cab>=0 ? cab : m.length;
  for(let i=0; i<fim; i++){
    for(const cel of (m[i] || [])){
      const achou = cel!=null && String(cel).match(/data\s*\/\s*hora\s*:?\s*(.+)/i);
      if(achou) return achou[1].trim();
    }
  }
  return '';
}

// Unidades do pagador dentro do mesmo DDA. O Pagador vem escrito de vários jeitos
// (CRV INDUSTRIAL LTDA, Crv Industrial..., CRV IND LTDA/MG): quem tem "CAPINOPOLIS"
// (com ou sem acento/espaço) é a Unidade Capinópolis; o resto é "CRV Industrial (sem Capinópolis)".
// No projeto antigo este grupo se chamava "Matriz"; o nome mudou para não confundir com a
// empresa CRV Matriz: nos exemplos, as duas unidades são da conta da CRV Filial.
const NOMES_UNIDADE = { 'sem-capinopolis':'CRV Industrial (sem Capinópolis)', capinopolis:'Unidade Capinópolis' };

// Unidade de um boleto pelo texto do Pagador: 'capinopolis' ou 'sem-capinopolis'.
function unidadeDoPagador(p){
  return normaliza(p).replace(/\s+/g,'').includes('CAPINOPOLIS') ? 'capinopolis' : 'sem-capinopolis';
}

/* ---------------------------------------------------------------------
   PDF "Boletos Recebidos (DDA)" do Itaú
   O PDF não traz o CNPJ da conta: a empresa vem do seletor da tela.
   No topo da página 1: "Emitido em 19/11/2026 às 16:00:37 via Internet -
   311 boleto(s) recebidos". Os boletos são lidos pelas colunas do
   cabeçalho de cada página (leitorItauPdf), usado pela tela DDA → .RET.
   --------------------------------------------------------------------- */

// Reconhece o PDF do DDA do Itaú pelas palavras da página 1 (de lerPalavrasPdf).
// Devolve { total, emitido } (total = quantos boletos o próprio PDF diz ter) ou { erro }.
function reconhecePdfItau(leituraPdf){
  const texto = normaliza(leituraPdf.palavras.filter(p => p.pagina === 0).map(p => p.texto).join(' '));
  if(!texto.includes('BOLETOS RECEBIDOS (DDA)'))
    return { erro:'Não reconheci o PDF: falta o título "Boletos Recebidos (DDA)" do Itaú na 1ª página.' };
  const qtd = texto.match(/(\d+)\s*BOLETO\(S\)\s*RECEBIDOS/);
  if(!qtd) return { erro:'Não achei no topo do PDF quantos boletos ele tem ("NNN boleto(s) recebidos").' };
  const emitido = texto.match(/EMITIDO EM (\d{2}\/\d{2}\/\d{4})(?: AS (\d{2}:\d{2}:\d{2}))?/);
  return { total: Number(qtd[1]), emitido: emitido ? emitido[1] + (emitido[2] ? ' às ' + emitido[2] : '') : '' };
}

// CNPJ (00.000.000/0000-00) ou CPF (000.000.000-00) do beneficiário, como o PDF escreve.
const DOC_BENEFICIARIO_ITAU = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;

// Distância (pontos) para uma palavra ainda contar como da linha do CNPJ, e para uma
// metade do código contar como "logo acima" ou "logo abaixo" dela (no PDF: 3,9 pt).
const TOLERANCIA_ANCORA_ITAU = 2.5;
const DISTANCIA_METADE_ITAU = 6;

// Folga (pontos) à esquerda do início de uma coluna: palavra que começa até 3 pt antes
// do título da coluna ainda é dela.
const FOLGA_COLUNA_ITAU = 3;

// Colunas de uma página pela linha do cabeçalho ("Cod. Barras", "Pagador/Agregado",
// "Beneficiário", "CPF/CNPJ", "Venc.", "Nº Doc.", "Até Venc.", "A Pagar", "Tipo de Boleto",
// "Banco", "Observações"). Devolve { nome: x de início } ou null se faltar alguma coluna.
function colunasPdfItau(linha){
  const ws = [...linha.palavras].sort((a, b) => a.x - b.x);
  const n = ws.map(w => normaliza(w.texto));
  const col = {};
  n.forEach((t, i) => {
    if(t === 'COD.') col.codigo = ws[i].x;
    else if(t === 'PAGADOR/AGREGADO') col.pagador = ws[i].x;
    else if(t === 'BENEFICIARIO') col.benef = ws[i].x;
    else if(t === 'CPF/CNPJ') col.cnpj = ws[i].x;
    else if(t === 'VENC.' && n[i - 1] !== 'ATE') col.venc = ws[i].x;
    else if(t === 'DOC.') col.doc = (i > 0 && n[i - 1].startsWith('N')) ? ws[i - 1].x : ws[i].x;
    else if(t === 'ATE' && n[i + 1] === 'VENC.') col.ateVenc = ws[i].x;
    else if(t === 'A' && n[i + 1] === 'PAGAR') col.aPagar = ws[i].x;
    else if(t === 'TIPO') col.tipo = ws[i].x;
    else if(t === 'BANCO') col.banco = ws[i].x;
    else if(t === 'OBSERVACOES') col.obs = ws[i].x;
  });
  const precisa = ['codigo', 'pagador', 'benef', 'cnpj', 'venc', 'doc', 'ateVenc', 'aPagar', 'tipo', 'banco', 'obs'];
  return precisa.every(k => typeof col[k] === 'number') ? col : null;
}

// Nome da coluna de uma palavra pelo x: a coluna de início mais à direita que ainda fica
// à esquerda da palavra (com a folga).
function colunaPdfItau(x, colunas){
  let achou = null, inicio = -Infinity;
  for(const [nome, xc] of Object.entries(colunas)){
    if(xc <= x + FOLGA_COLUNA_ITAU && xc > inicio){ achou = nome; inicio = xc; }
  }
  return achou;
}

// Texto das palavras de um bloco numa coluna: palavras da mesma linha separadas por
// espaço; linhas diferentes juntadas com "juntaLinhas" (espaço no nome, nada no Nº Doc.).
function textoColunaItau(palavras, juntaLinhas){
  return linhasDoPdf(palavras).map(textoDaLinha).join(juntaLinhas);
}

// Lê os boletos do PDF "Boletos Recebidos (DDA)" do Itaú (palavras de lerPalavrasPdf).
// Cada página acha as colunas pelo próprio cabeçalho; o rodapé que começa com "Dúvidas"
// é ignorado. Cada boleto é ancorado na palavra de CNPJ/CPF da coluna CPF/CNPJ; as outras
// palavras da página vão para o boleto de CNPJ mais próximo (pela altura). O código de
// barras são as duas metades da coluna "Cod. Barras" logo acima e logo abaixo da linha do
// CNPJ, juntadas de cima para baixo. Nada é completado: metade faltando deixa o código
// com menos dígitos, e a conferência do boleto bloqueia.
// Devolve { boletos, paginas: [{ pagina, boletos, valores, metades, problema }], erro }
// (pagina começa em 1; problema = texto quando a página não fecha a própria contagem).
function leitorItauPdf(leituraPdf){
  const boletos = [], paginas = [];
  for(let p = 0; p < leituraPdf.paginas; p++){
    const linhas = linhasDoPdf(leituraPdf.palavras.filter(w => w.pagina === p));
    const iCab = linhas.findIndex(l => colunasPdfItau(l));
    const iRodape = linhas.findIndex(l => normaliza(textoDaLinha(l)).startsWith('DUVIDAS'));
    const fim = iRodape >= 0 ? iRodape : linhas.length;
    if(iCab < 0){
      // página sem cabeçalho: só aceita se não tiver nada além do topo/rodapé
      const sobra = linhas.slice(0, fim).filter(l => !/BOLETOS RECEBIDOS|EMITIDO EM/.test(normaliza(textoDaLinha(l))));
      paginas.push({ pagina: p + 1, boletos: 0, valores: 0, metades: 0, problema: sobra.length ? 'página sem o cabeçalho das colunas' : '' });
      continue;
    }
    const colunas = colunasPdfItau(linhas[iCab]);
    const corpo = linhas.slice(iCab + 1, fim).flatMap(l => l.palavras).map(w => ({ ...w, coluna: colunaPdfItau(w.x, colunas) }));
    const ancoras = corpo.filter(w => w.coluna === 'cnpj' && DOC_BENEFICIARIO_ITAU.test(w.texto)).sort((a, b) => a.top - b.top);

    // cada palavra vai para o boleto (âncora) mais próximo pela altura
    const blocos = ancoras.map(a => ({ ancora: a, palavras: [] }));
    corpo.forEach(w => {
      if(!blocos.length) return;
      let melhor = blocos[0];
      blocos.forEach(b => { if(Math.abs(b.ancora.top - w.top) < Math.abs(melhor.ancora.top - w.top)) melhor = b; });
      melhor.palavras.push(w);
    });

    blocos.forEach(({ ancora, palavras }) => {
      const naColuna = c => palavras.filter(w => w.coluna === c);
      const naLinha = c => naColuna(c).filter(w => Math.abs(w.top - ancora.top) <= TOLERANCIA_ANCORA_ITAU);
      const semRS = ws => ws.filter(w => w.texto !== 'R$').map(w => w.texto).join(' ');
      const metades = naColuna('codigo').filter(w => Math.abs(w.top - ancora.top) <= DISTANCIA_METADE_ITAU).sort((a, b) => a.top - b.top);
      const codigoTexto = metades.map(w => w.texto).join('');
      const valor = paraNumero(semRS(naLinha('ateVenc')));
      const valorAPagar = paraNumero(semRS(naLinha('aPagar')));
      boletos.push({
        venc: naLinha('venc').map(w => w.texto).join(' '),
        beneficiario: textoColunaItau(naColuna('benef'), ' '),
        cnpj: ancora.texto,
        doc: textoColunaItau(naColuna('doc'), ''),
        valor,
        valorAPagar,
        codigoBarras: apenasDigitos(codigoTexto),
        pagador: textoColunaItau(naColuna('pagador'), ' '),
        banco: naLinha('banco').map(w => w.texto).join(' '),
        comDesconto: valorAPagar !== null && valor !== null && valorAPagar !== valor,
        codigoTexto,
        codigoSuspeito: false,
        pagina: p + 1,
      });
    });

    // contagem da própria página: um "R$" de Até Venc. e duas metades de código por boleto
    const valores = corpo.filter(w => w.coluna === 'ateVenc' && w.texto === 'R$').length;
    const nMetades = corpo.filter(w => w.coluna === 'codigo' && /^\d+$/.test(w.texto)).length;
    const problemas = [];
    if(valores !== ancoras.length) problemas.push(`${ancoras.length} CNPJ/CPF de beneficiário e ${valores} valores "Até Venc."`);
    if(nMetades !== 2 * ancoras.length) problemas.push(`${nMetades} metades de código de barras para ${ancoras.length} boleto(s) (o certo é 2 por boleto)`);
    paginas.push({ pagina: p + 1, boletos: ancoras.length, valores, metades: nMetades, problema: problemas.join('; ') });
  }
  return { boletos, paginas };
}
