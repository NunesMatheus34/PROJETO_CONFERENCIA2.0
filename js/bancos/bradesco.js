/* =====================================================================
   LEITOR DO DDA DO BRADESCO (PDF "Boletos de Cobrança Registrados/DDA")
   Recebe as palavras do PDF com posição (js/leitura/pdf.js) e devolve
   os boletos, como o ler_pdf do projeto antigo (_referencia/brad.py):
     - a tabela começa depois da linha "... Pagamento" do cabeçalho e
       acaba na linha do "SAC" (rodapé do banco);
     - palavras com o mesmo top (±2,5) formam uma linha;
     - cada boleto termina na linha do status ("A PAGAR");
     - 4 colunas pela posição x: datas e status | pagador, CNPJ e Nº Doc. |
       beneficiário, CNPJ e banco | valor.
   Diferença do antigo: os limites das colunas saem do cabeçalho da tabela
   (cada PDF do banco pode vir com as colunas deslocadas; com limites fixos
   o nome do beneficiário caía na coluna do pagador). No PDF "normal" eles
   ficam iguais aos do antigo: ~150 | ~350 | ~530.
   Nada aqui completa ou corrige um campo: o que faltar vira erro.
   Precisa de js/leitura/formatos.js.
   ===================================================================== */

// Formatos do PDF do Bradesco (o CNPJ vem com 3 dígitos no 1º bloco: 003.347.747/0001-09).
const DATA_BRADESCO  = /^\d{2}\/\d{2}\/\d{4}$/;
const CNPJ_BRADESCO  = /^\d{3}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const VALOR_BRADESCO = /^\d{1,3}(\.\d{3})*,\d{2}$/;
const STATUS_BRADESCO = /^[A-ZÇÃÕÉÍ]+$/;
const TITULO_DDA_BRADESCO = 'Boletos de Cobrança Registrados/DDA';

// Distância máxima (em pontos) entre o top das palavras de uma mesma linha.
const TOLERANCIA_LINHA = 2.5;

// Junta as palavras em linhas: ordena por página, top e x (como o antigo) e põe na mesma
// linha as palavras da mesma página com top a até 2,5 pontos do top da 1ª palavra da linha.
// Devolve [{ pagina, top, palavras:[...] }].
function linhasDoPdf(palavras){
  const ordem = [...palavras].sort((a, b) => a.pagina - b.pagina || a.top - b.top || a.x - b.x);
  const linhas = [];
  ordem.forEach(p => {
    const ultima = linhas[linhas.length - 1];
    if(ultima && ultima.pagina === p.pagina && Math.abs(ultima.top - p.top) <= TOLERANCIA_LINHA) ultima.palavras.push(p);
    else linhas.push({ pagina: p.pagina, top: p.top, palavras: [p] });
  });
  return linhas;
}

// Texto de uma linha, com as palavras da esquerda para a direita.
function textoDaLinha(linha){
  return [...linha.palavras].sort((a, b) => a.x - b.x).map(p => p.texto).join(' ');
}

// Dados do topo da 1ª página: se é o DDA do Bradesco, empresa (nome e CNPJ),
// data/hora da operação e período de vencimento da consulta. O PDF não traz total impresso.
function topoBradesco(linhas){
  const textos = linhas.filter(l => l.pagina === 0).map(textoDaLinha);
  const tudo = textos.join('\n');
  const empresa = textos.map(t => t.match(/^(.+?)\s*\|\s*([\d./-]{18,20})$/)).find(Boolean);
  const operacao = tudo.match(/Data da operação\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2})h(\d{2})/);
  const periodo = tudo.match(/Data de Vencimento:\s*(\d{2}\/\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{2}\/\d{4})/);
  return {
    ehDda: tudo.includes(TITULO_DDA_BRADESCO),
    empresa: empresa ? { nome: empresa[1].trim(), cnpj: empresa[2] } : null,
    operacao: operacao ? `${operacao[1]} ${operacao[2]}:${operacao[3]}` : '',
    periodo: periodo ? [periodo[1], periodo[2]] : null,
  };
}

// Limites das 4 colunas, tirados do cabeçalho da tabela na 1ª página:
// coluna 2 começa 30 pt antes de "Pagador,", a 3 5 pt antes de "Beneficiário,",
// a 4 10 pt antes de "Valor". Devolve null se o cabeçalho não estiver lá.
function limitesColunasBradesco(palavras){
  const x = texto => { const p = palavras.find(w => w.pagina === 0 && w.texto === texto); return p ? p.x : null; };
  const pagador = x('Pagador,'), beneficiario = x('Beneficiário,'), valor = x('Valor');
  if(pagador === null || beneficiario === null || valor === null) return null;
  return [pagador - 30, beneficiario - 5, valor - 10];
}

// Coluna (1 a 4) de uma palavra pela posição x.
function colunaBradesco(x, limites){
  if(x < limites[0]) return 1;
  if(x < limites[1]) return 2;
  if(x < limites[2]) return 3;
  return 4;
}

// Separa as linhas de uma coluna em: o que vem antes do CNPJ, o CNPJ e o que vem depois.
// Pagador: nome | CNPJ | Nº Doc.  Beneficiário: nome | CNPJ | banco.
function parteColuna(linhas){
  const i = linhas.findIndex(t => CNPJ_BRADESCO.test(t));
  if(i < 0) return [linhas.join(' '), '', ''];
  return [linhas.slice(0, i).join(' '), linhas[i], linhas.slice(i + 1).join(' ')];
}

// Lê os boletos do PDF do Bradesco. palavrasPdf = o que lerPalavrasPdf devolve.
// Devolve { arquivo, ehDda, empresa, operacao, periodo, boletos, qtdRS, total, erros }.
// Cada boleto: { n, venc, limite, pagador, pagadorCnpj, docTexto, doc, beneficiario,
//   cnpj, banco, status, valor, arquivo }. doc = null quando o Nº Doc. é só asteriscos.
// erros: o que impede a "Leitura OK" (campo faltando, valores "R$" ≠ boletos lidos...).
function leitorBradesco(palavrasPdf, arquivo){
  const todas = palavrasPdf.palavras;
  const linhas = linhasDoPdf(todas);
  const info = { arquivo, ...topoBradesco(linhas), boletos: [], qtdRS: 0, total: 0, erros: [] };
  if(!info.ehDda){ info.erros.push(`não é o DDA do Bradesco (falta o título "${TITULO_DDA_BRADESCO}")`); return info; }

  const limites = limitesColunasBradesco(todas);
  const ini = linhas.findIndex(l => l.pagina === 0 && l.palavras.some(p => p.texto === 'Pagamento'));
  if(!limites || ini < 0){ info.erros.push('não achei o cabeçalho da tabela de boletos'); return info; }
  let fim = linhas.findIndex((l, i) => i > ini && l.palavras.some(p => p.texto === 'SAC' || p.texto === 'Ouvidoria'));
  if(fim < 0) fim = linhas.length;
  const tabela = linhas.slice(ini + 1, fim);

  // cada boleto: as linhas até a linha do status (palavras da coluna 1 que não são data, todas maiúsculas)
  const blocos = [];
  let atual = [];
  tabela.forEach(l => {
    atual.push(l);
    const status = l.palavras.filter(p => p.x < limites[0] && !DATA_BRADESCO.test(p.texto)).sort((a, b) => a.x - b.x).map(p => p.texto);
    if(status.length && status.every(s => STATUS_BRADESCO.test(s))){ blocos.push({ status: status.join(' '), linhas: atual }); atual = []; }
  });
  if(atual.some(l => l.palavras.some(p => p.x >= limites[0]))) info.erros.push('sobrou texto depois do último boleto (boleto sem status?)');

  blocos.forEach((bloco, k) => {
    const col = { 1: [], 2: [], 3: [], 4: [] };
    bloco.linhas.forEach(l => {
      [1, 2, 3, 4].forEach(c => {
        const ps = l.palavras.filter(p => colunaBradesco(p.x, limites) === c).sort((a, b) => a.x - b.x);
        if(ps.length) col[c].push(ps.map(p => p.texto).join(' '));
      });
    });
    const datas = col[1].filter(t => DATA_BRADESCO.test(t));
    const [pagador, pagadorCnpj, docTexto] = parteColuna(col[2]);
    const [beneficiario, cnpj, banco] = parteColuna(col[3]);
    const valores = col[4].join(' ').replace(/R\$/g, ' ').split(/\s+/).filter(t => VALOR_BRADESCO.test(t));
    const b = {
      n: k + 1, venc: datas[0] || '', limite: datas[1] || '', pagador, pagadorCnpj, docTexto,
      doc: (!docTexto || /^\*+$/.test(docTexto)) ? null : docTexto,
      beneficiario, cnpj, banco, status: bloco.status,
      valor: valores.length === 1 ? paraNumero(valores[0]) : null, arquivo,
    };
    const falta = [['venc', 'vencimento'], ['limite', 'limite de pagamento'], ['pagador', 'pagador'], ['pagadorCnpj', 'CNPJ do pagador'],
                   ['docTexto', 'Nº Doc.'], ['beneficiario', 'beneficiário'], ['cnpj', 'CNPJ do beneficiário'], ['banco', 'banco'], ['valor', 'valor']]
      .filter(([campo]) => b[campo] === null || b[campo] === '').map(([, nome]) => nome);
    if(falta.length) info.erros.push(`boleto ${b.n} (${beneficiario || '?'}): faltou ${falta.join(', ')}`);
    info.boletos.push(b);
  });

  info.qtdRS = tabela.reduce((s, l) => s + l.palavras.filter(p => p.texto === 'R$').length, 0);
  info.total = Math.round(info.boletos.reduce((s, b) => s + Math.round((b.valor || 0) * 100), 0)) / 100;
  if(info.qtdRS !== info.boletos.length) info.erros.push(`${info.qtdRS} valores (R$) no PDF, mas ${info.boletos.length} boletos lidos`);
  if(!info.boletos.length) info.erros.push('nenhum boleto encontrado no PDF');
  return info;
}

// CNPJ do Bradesco (15 dígitos, com um 0 a mais na frente) nos 14 dígitos de sempre,
// para comparar com o CNPJ da empresa. Outro tamanho volta só com os dígitos.
function cnpjBradescoParaComparar(texto){
  const d = apenasDigitos(texto);
  return d.length === 15 && d[0] === '0' ? d.slice(1) : d;
}
