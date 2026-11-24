/* =====================================================================
   LEITOR DO DDA DO BRADESCO (PDF "Boletos de Cobrança Registrados/DDA")
   Recebe as palavras do PDF com posição (js/leitura/pdf.js) e devolve
   os boletos, como o ler_pdf do projeto antigo (_referencia/brad.py):
     - a tabela começa depois do cabeçalho da tabela da 1ª página e
       acaba na linha do "SAC" (rodapé do banco);
     - palavras com o mesmo top (±2,5) formam uma linha;
     - cada boleto termina na linha do status ("A PAGAR");
     - 4 colunas pela posição x: datas e status | pagador, CNPJ e Nº Doc. |
       beneficiário, CNPJ e banco | valor.
   Diferença do antigo: nada de limites fixos. Cada PDF do banco pode vir
   com as colunas deslocadas, e o cabeçalho às vezes vem quebrado em linhas
   ou com palavras grudadas ("DestinatárioValor"). Por isso:
     - o cabeçalho é a FAIXA de linhas que começa no "Pagador," (até ~15 pt
       abaixo) e tem "Pagador,", "Beneficiário," e uma palavra que CONTENHA
       "Valor" (pode vir grudada);
     - os limites do pagador e do beneficiário saem do x de "Pagador," e
       "Beneficiário," do cabeçalho da página (página sem cabeçalho usa o da
       última página que tinha);
     - o limite da coluna do valor sai do x dos "R$" dos boletos da própria
       página (página sem "R$" usa o da página mais perto que tem).
   Nos PDFs antigos o "R$" fica no mesmo x da palavra "Valor": os limites
   ficam iguais aos de antes.
   A empresa do PDF vem só do cabeçalho do topo da página 1; a coluna
   Pagador de cada boleto é só lida (pode trazer outro nome e CNPJ).
   Nada aqui completa ou corrige um campo: o que faltar vira erro.
   Precisa de js/leitura/formatos.js e js/leitura/pdf.js (linhasDoPdf, textoDaLinha).
   ===================================================================== */

// Formatos do PDF do Bradesco (o CNPJ vem com 3 dígitos no 1º bloco: 003.347.747/0001-09).
const DATA_BRADESCO  = /^\d{2}\/\d{2}\/\d{4}$/;
const CNPJ_BRADESCO  = /^\d{3}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const VALOR_BRADESCO = /^\d{1,3}(\.\d{3})*,\d{2}$/;
const STATUS_BRADESCO = /^[A-ZÇÃÕÉÍ]+$/;
const TITULO_DDA_BRADESCO = 'Boletos de Cobrança Registrados/DDA';

// As linhas do PDF (linhasDoPdf, textoDaLinha) vêm de js/leitura/pdf.js: o Itaú usa as mesmas.

// Dados do topo da 1ª página: se é o DDA do Bradesco, empresa (nome e CNPJ),
// data/hora da operação e período de vencimento da consulta. O PDF não traz total impresso.
// A empresa sai SÓ do cabeçalho do topo ("NOME | 003.347.747/0001-09"): procura nas linhas
// da página 1 que vêm antes da 1ª linha com "Pagador" (filtro "Pagador:" da consulta ou
// cabeçalho "Pagador," da tabela). Assim nada da coluna Pagador dos boletos vira a empresa.
function topoBradesco(linhas){
  const textos = linhas.filter(l => l.pagina === 0).map(textoDaLinha);
  const tudo = textos.join('\n');
  const fimTopo = textos.findIndex(t => /(^|\s)Pagador[,:]/.test(t));
  const topo = fimTopo < 0 ? textos : textos.slice(0, fimTopo);
  const empresa = topo.map(t => t.match(/^(.+?)\s*\|\s*([\d./-]{18,20})$/)).find(Boolean);
  const operacao = tudo.match(/Data da operação\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2})h(\d{2})/);
  const periodo = tudo.match(/Data de Vencimento:\s*(\d{2}\/\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{2}\/\d{4})/);
  return {
    ehDda: tudo.includes(TITULO_DDA_BRADESCO),
    empresa: empresa ? { nome: empresa[1].trim(), cnpj: empresa[2] } : null,
    operacao: operacao ? `${operacao[1]} ${operacao[2]}:${operacao[3]}` : '',
    periodo: periodo ? [periodo[1], periodo[2]] : null,
  };
}

// Altura da faixa do cabeçalho da tabela, a partir do top de "Pagador,": no PDF do banco
// o cabeçalho tem 3 a 4 linhas ("Pagador, CPF/CNPJ e" ... "Débito e Limite de Pagamento"),
// em ~15 pt; o 1º boleto começa ~37 pt abaixo do "Pagador,".
const FAIXA_CABECALHO_ACIMA = 10;
const FAIXA_CABECALHO_ABAIXO = 18;

// Cabeçalho da tabela de cada página: procura "Pagador," e olha a faixa de linhas em volta.
// Só vale se a faixa tiver "Pagador,", "Beneficiário," e alguma palavra que CONTENHA "Valor"
// (no PDF ela pode vir grudada: "DestinatárioValor"). A palavra "Valor" não dá posição nenhuma.
// Devolve { pagina: { pagador, beneficiario, topo, fundo } } (x das palavras e a faixa em top).
function cabecalhosBradesco(palavras){
  const cabecalhos = {};
  palavras.filter(p => p.texto === 'Pagador,').forEach(pag => {
    if(cabecalhos[pag.pagina]) return;
    const topo = pag.top - FAIXA_CABECALHO_ACIMA, fundo = pag.top + FAIXA_CABECALHO_ABAIXO;
    const faixa = palavras.filter(p => p.pagina === pag.pagina && p.top >= topo && p.top <= fundo);
    const benef = faixa.find(p => p.texto === 'Beneficiário,');
    if(!benef || !faixa.some(p => p.texto.includes('Valor'))) return;
    cabecalhos[pag.pagina] = { pagador: pag.x, beneficiario: benef.x, topo, fundo };
  });
  return cabecalhos;
}

// Limites das 4 colunas de cada página (lista com um item por página):
// coluna 2 começa 30 pt antes de "Pagador,", a 3 5 pt antes de "Beneficiário," (do cabeçalho
// da página, ou da última página que tinha cabeçalho) e a 4 10 pt antes do "R$" mais à
// esquerda dos boletos da página (página sem "R$": a mais perto que tem, olhando primeiro
// para trás). Só conta "R$" à direita do "Beneficiário,": nada da coluna do beneficiário.
// Devolve { limites, erro } (erro = texto quando não dá para montar os limites).
function limitesColunasBradesco(palavras, paginas, cabecalhos){
  const porPagina = [];
  let cab = null;
  for(let pg = 0; pg < paginas; pg++){
    if(cabecalhos[pg]) cab = cabecalhos[pg];
    if(!cab){ porPagina.push(null); continue; }
    const rs = palavras.filter(p => p.pagina === pg && p.texto === 'R$' && p.x > cab.beneficiario).map(p => p.x);
    porPagina.push({ cab, valor: rs.length ? Math.min(...rs) : null });
  }
  const comValor = porPagina.map((p, i) => p && p.valor !== null ? i : -1).filter(i => i >= 0);
  if(!comValor.length) return { limites: null, erro: 'não achei nenhum valor "R$" na tabela de boletos' };
  const limites = porPagina.map((p, pg) => {
    if(!p) return null;
    const perto = [...comValor].sort((a, b) => Math.abs(a - pg) - Math.abs(b - pg) || a - b)[0];
    return [p.cab.pagador - 30, p.cab.beneficiario - 5, porPagina[perto].valor - 10];
  });
  const ruim = limites.findIndex(l => l && !(l[0] < l[1] && l[1] < l[2]));
  if(ruim >= 0) return { limites: null, erro: `colunas fora de ordem na página ${ruim + 1} (o "R$" está antes do beneficiário)` };
  return { limites, erro: '' };
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

  const cabecalhos = cabecalhosBradesco(todas);
  const cab1 = cabecalhos[0];
  if(!cab1){ info.erros.push('não achei o cabeçalho da tabela de boletos (linha com "Pagador,", "Beneficiário," e "Valor")'); return info; }
  const paginas = palavrasPdf.paginas || (Math.max(...todas.map(p => p.pagina)) + 1);
  const { limites: limitesPagina, erro } = limitesColunasBradesco(todas, paginas, cabecalhos);
  if(erro){ info.erros.push(erro); return info; }
  // a tabela começa na 1ª linha da página 1 abaixo da faixa do cabeçalho
  const ini = linhas.findIndex(l => l.pagina === 0 && l.top > cab1.fundo);
  if(ini < 0){ info.erros.push('não achei os boletos depois do cabeçalho da tabela'); return info; }
  let fim = linhas.findIndex((l, i) => i > ini && l.palavras.some(p => p.texto === 'SAC' || p.texto === 'Ouvidoria'));
  if(fim < 0) fim = linhas.length;
  // cabeçalho repetido numa página seguinte fica fora da tabela
  const noCabecalho = l => { const c = cabecalhos[l.pagina]; return l.pagina > 0 && c && l.top >= c.topo && l.top <= c.fundo; };
  const tabela = linhas.slice(ini, fim).filter(l => !noCabecalho(l));
  const limitesDa = l => limitesPagina[l.pagina];

  // cada boleto: as linhas até a linha do status (palavras da coluna 1 que não são data, todas maiúsculas)
  const blocos = [];
  let atual = [];
  tabela.forEach(l => {
    atual.push(l);
    const status = l.palavras.filter(p => p.x < limitesDa(l)[0] && !DATA_BRADESCO.test(p.texto)).sort((a, b) => a.x - b.x).map(p => p.texto);
    if(status.length && status.every(s => STATUS_BRADESCO.test(s))){ blocos.push({ status: status.join(' '), linhas: atual }); atual = []; }
  });
  if(atual.some(l => l.palavras.some(p => p.x >= limitesDa(l)[0]))) info.erros.push('sobrou texto depois do último boleto (boleto sem status?)');

  blocos.forEach((bloco, k) => {
    const col = { 1: [], 2: [], 3: [], 4: [] };
    bloco.linhas.forEach(l => {
      [1, 2, 3, 4].forEach(c => {
        const ps = l.palavras.filter(p => colunaBradesco(p.x, limitesDa(l)) === c).sort((a, b) => a.x - b.x);
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
    // pagador e CNPJ do pagador não são obrigatórios: a coluna Pagador não trava nada
    // (a empresa vem do cabeçalho do topo). O Nº Doc. continua obrigatório.
    const falta = [['venc', 'vencimento'], ['limite', 'limite de pagamento'], ['docTexto', 'Nº Doc.'], ['beneficiario', 'beneficiário'], ['cnpj', 'CNPJ do beneficiário'], ['banco', 'banco'], ['valor', 'valor']]
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
