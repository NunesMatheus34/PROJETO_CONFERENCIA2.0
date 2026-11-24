/* =====================================================================
   TELA: CONFERÊNCIA DDA — PASSOS DO BRADESCO
   Só desenha e reage aos arquivos do Bradesco, dentro da tela da
   Conferência DDA (js/telas/conferencia-dda.js, que guarda o estado em
   telaDda e tem o Conferir, o resultado e o Excel):
     Passo 1: a caixa aceita VÁRIOS PDFs; cada um é lido, avaliado e
              aparece numa lista (arquivo, boletos, total, ok/erro).
     Passo 2: a caixa do relatório só destrava quando todos os PDFs
              estão com Leitura OK.
   As regras ficam em js/bancos/bradesco.js e js/conferencias/dda.js.
   Dado de arquivo vai para a tela sempre com textContent (função cria).
   ===================================================================== */

// Estado do passo 1 dentro de telaDda: lista de PDFs { leitura, situacao, erros, repetidoDe },
// quantos ainda estão sendo lidos, a fila de leitura (um PDF por vez, na ordem de envio)
// e se a caixa do passo 2 está destravada.
function zeraEstadoBradesco(){
  Object.assign(telaDda, { pdfs: [], lendoPdfs: 0, filaPdfs: Promise.resolve(), passo2Livre: false, infoBradesco: null });
}

// Situação do passo 1: 'vazio' (nenhum PDF ok), 'erro' (algum PDF com erro) ou 'ok'.
function situacaoPdfsBradesco(){
  if(telaDda.pdfs.some(p => p.situacao === 'erro')) return 'erro';
  return telaDda.pdfs.some(p => p.situacao === 'ok') ? 'ok' : 'vazio';
}

// true quando dá para conferir pelo lado do banco: Leitura OK e nada sendo lido.
function pdfsBradescoProntos(){
  return situacaoPdfsBradesco() === 'ok' && telaDda.lendoPdfs === 0;
}

// Volta os 2 passos ao começo: caixas vazias (a do passo 1 travada sem banco/empresa),
// lista de PDFs apagada, passo 2 travado.
function recomecaBradesco(travada){
  telaDda.pedido.pdfs = (telaDda.pedido.pdfs || 0) + 1;   // descarta leituras em andamento
  zeraEstadoBradesco();
  preparaCaixaEnvio(elDda('ddaCaixaPdfs'), travada, travada ? 'Escolha o banco e a empresa primeiro' : 'Nenhum arquivo escolhido');
  preparaCaixaEnvio(elDda('ddaCaixaSistemaBradesco'), true, 'Libera depois da Leitura OK do passo 1');
  elDda('ddaLeituraPdfs').replaceChildren();
  elDda('ddaLeituraPdfs').hidden = true;
  limpaMensagem(elDda('ddaLeituraResumo'));
}

// PDFs escolhidos no passo 1: entram na fila e são lidos um por vez, na ordem.
// Cada um é avaliado (Leitura OK, erro ou repetido) e aparece na lista.
// Se banco, empresa ou a conferência mudarem durante a leitura, o resultado é descartado.
function recebePdfsBradesco(arquivos){
  const { banco, empresa } = escolhaDda();
  const geracao = telaDda.pedido.pdfs;
  const vale = () => telaDda.pedido.pdfs === geracao && escolhaDda().banco === banco && escolhaDda().empresa === empresa;
  telaDda.resultado = null;
  elDda('ddaResultado').hidden = true;
  telaDda.lendoPdfs += arquivos.length;
  atualizaPassosBradesco();
  telaDda.filaPdfs = telaDda.filaPdfs.then(async () => {
    for(const arquivo of arquivos){
      if(!vale()) return;
      let leitura;
      try{
        leitura = leitorBradesco(await lerPalavrasPdf(arquivo), arquivo.name);
      }catch(err){
        leitura = { arquivo: arquivo.name, ehDda: false, empresa: null, operacao: '', periodo: null, boletos: [], qtdRS: 0, total: 0,
                    erros: ['não consegui ler o PDF: ' + (err && err.message || err)] };
      }
      if(!vale()) return;
      telaDda.pdfs.push({ leitura, ...avaliaPdfBradesco(leitura, empresa, telaDda.pdfs) });
      telaDda.lendoPdfs--;
      atualizaPassosBradesco();
    }
  });
}

// Redesenha o passo 1 (lista e resumo) e trava/destrava o passo 2.
// Passo 2 travado de novo (ex.: chegou um PDF com erro) apaga o relatório já enviado.
function atualizaPassosBradesco(){
  desenhaLeituraPdfs();
  const situacao = situacaoPdfsBradesco();
  const resumo = elDda('ddaLeituraResumo');
  const ok = telaDda.pdfs.filter(p => p.situacao === 'ok');
  if(telaDda.lendoPdfs > 0) mostraMensagem(resumo, 'aviso', `Lendo ${telaDda.lendoPdfs === 1 ? '1 PDF' : telaDda.lendoPdfs + ' PDFs'}…`);
  else if(situacao === 'erro') mostraMensagem(resumo, 'alerta', 'Leitura com erro: veja o PDF marcado em vermelho. A conferência não pode ser feita com ele. Clique em Nova conferência e envie os PDFs certos.');
  else if(situacao === 'ok'){
    const qtd = ok.reduce((s, p) => s + p.leitura.boletos.length, 0);
    const total = ok.reduce((s, p) => s + Math.round(p.leitura.total * 100), 0) / 100;
    mostraMensagem(resumo, 'ok', `Leitura OK: ${ok.length === 1 ? '1 PDF' : ok.length + ' PDFs'}, ${qtd} boletos, ${brl(total)}. Agora envie o relatório do sistema (passo 2).`);
  }else limpaMensagem(resumo);

  const nome = elDda('ddaCaixaPdfs').querySelector('.caixa-envio-arquivo');
  if(telaDda.pdfs.length) nome.textContent = `${situacao === 'erro' ? '✗' : '✓'} ${telaDda.pdfs.length === 1 ? '1 PDF enviado' : telaDda.pdfs.length + ' PDFs enviados'} (pode soltar mais)`;
  elDda('ddaCaixaPdfs').classList.toggle('recusado', situacao === 'erro');
  elDda('ddaCaixaPdfs').classList.toggle('escolhido', situacao === 'ok');

  const caixa2 = elDda('ddaCaixaSistemaBradesco');
  if(situacao === 'ok' && !telaDda.passo2Livre){
    telaDda.passo2Livre = true;
    preparaCaixaEnvio(caixa2, false, 'Nenhum arquivo escolhido');
  }else if(situacao !== 'ok' && telaDda.passo2Livre){
    telaDda.passo2Livre = false;
    telaDda.pedido.sistema++;
    telaDda.matrizSistema = null; telaDda.alertaSistema = '';
    preparaCaixaEnvio(caixa2, true, 'Libera depois da Leitura OK do passo 1');
  }
  mostraAlertasDda();
}

// Lista dos PDFs do passo 1: arquivo, período, boletos, valores "R$", total e a situação
// (Leitura OK / Erro / Repetido), com os erros embaixo.
function desenhaLeituraPdfs(){
  const caixa = elDda('ddaLeituraPdfs');
  if(!telaDda.pdfs.length){ caixa.replaceChildren(); caixa.hidden = true; return; }
  const tabela = cria('table', 'tabela');
  const cab = cria('tr');
  [['Arquivo', ''], ['Período', 'mono'], ['Boletos', 'num'], ['Valores "R$"', 'num'], ['Total', 'num'], ['Leitura', '']]
    .forEach(([t, c]) => cab.append(cria('th', c, t)));
  const corpo = cria('tbody');
  telaDda.pdfs.forEach(p => {
    const l = p.leitura;
    const tr = cria('tr');
    const etiqueta = { ok: ['st-ok', 'Leitura OK'], erro: ['st-alerta', 'Erro'], repetido: ['st-neutro', 'Repetido: ignorado'] }[p.situacao];
    const situacao = cria('div');
    situacao.append(cria('span', 'etiqueta ' + etiqueta[0], etiqueta[1]));
    if(p.situacao === 'repetido') situacao.append(cria('span', 'sub', `mesmos boletos de ${p.repetidoDe}`));
    p.erros.forEach(e => situacao.append(cria('span', 'sub', '⚠ ' + e)));
    tr.append(cria('td', '', l.arquivo), cria('td', 'mono', l.periodo ? `${l.periodo[0]} a ${l.periodo[1]}` : '—'),
              cria('td', 'num', String(l.boletos.length)), cria('td', 'num', String(l.qtdRS)), cria('td', 'num', brl(l.total)));
    const td = cria('td'); td.append(situacao); tr.append(td);
    corpo.append(tr);
  });
  const thead = cria('thead'); thead.append(cab);
  tabela.append(thead, corpo);
  caixa.replaceChildren(tabela);
  caixa.hidden = false;
}

// Conferir do Bradesco: junta os boletos dos PDFs com Leitura OK, lê os títulos do relatório
// e guarda tudo em telaDda para o mostraResultadoDda. Devolve false se algo impediu.
function preparaConferenciaBradesco(){
  if(!pdfsBradescoProntos()) return false;
  const aceitos = telaDda.pdfs.filter(p => p.situacao === 'ok').map(p => p.leitura);
  const { boletos, repetidos } = boletosDosPdfsBradesco(aceitos);
  const { titulos, erro } = extraiSistemaBradesco(telaDda.matrizSistema);
  if(erro){ telaDda.alertaSistema = erro; mostraAlertasDda(); return false; }
  const periodos = [...new Set(aceitos.filter(l => l.periodo).map(l => `${l.periodo[0]} a ${l.periodo[1]}`))];
  telaDda.boletos = boletos;
  telaDda.sistema = titulos;
  telaDda.infoBradesco = { pdfs: aceitos.length, ignorados: telaDda.pdfs.filter(p => p.situacao === 'repetido').length, repetidos, periodos };
  return true;
}

// Linha de informação acima do resultado do Bradesco e o aviso dos boletos fora das datas
// do relatório (eles não vão para nenhuma aba, então precisam aparecer aqui).
function infoResultadoBradesco(r){
  const i = telaDda.infoBradesco;
  elDda('ddaInfo').textContent = `Bradesco: ${i.pdfs === 1 ? '1 PDF' : i.pdfs + ' PDFs'} com Leitura OK` +
    (i.ignorados ? ` (${i.ignorados} repetido${i.ignorados > 1 ? 's' : ''} ignorado${i.ignorados > 1 ? 's' : ''})` : '') +
    ` · ${telaDda.boletos.length} boletos` +
    (i.repetidos ? ` (${i.repetidos} que apareciam em mais de um PDF contado${i.repetidos > 1 ? 's' : ''} uma vez só)` : '') +
    ` · vencimento no DDA: ${i.periodos.join(', ') || 'não encontrado'} · ${telaDda.sistema.length} títulos no relatório`;
  elDda('ddaInfo').hidden = false;
  const fora = r.foraDoPeriodo;
  telaDda.avisoDda = fora.length
    ? `${fora.length === 1 ? '1 boleto vence' : fora.length + ' boletos vencem'} fora das datas do relatório (${brl(fora.reduce((s, b) => s + b.valor, 0))}) ` +
      'e não entra' + (fora.length === 1 ? '' : 'm') + ' em nenhuma aba. Confira se o relatório cobre o mesmo período do DDA.'
    : '';
}

// Colunas da tabela do Bradesco: vencimento, fornecedor, NF do sistema, Nº Doc. do Bradesco,
// CNPJ, banco emissor, valor e avisos (factoring, sem Nº Doc.).
function colunasTelaBradesco(){
  return [
    { cab:'Vencimento', classe:'mono', celula: l => {
      const b = l.banco, s = l.sistema;
      return textoComSub(dataBR(b ? b.venc : s.venc), l.status === 'data' ? 'Sistema: ' + dataBR(s.venc) : '');
    }},
    { cab:'Fornecedor', celula: l => {
      const b = l.banco, s = l.sistema;
      return textoComSub(b ? b.beneficiario : s.nome, b && s && l.status !== 'ok' ? 'No sistema: ' + s.nome : '');
    }},
    { cab:'NF (sistema)', classe:'mono', celula: l => l.sistema && l.sistema.doc ? l.sistema.doc : '—' },
    { cab:'Nº Doc. (Bradesco)', classe:'mono', celula: l => l.banco ? (l.banco.doc || 'sem Nº Doc.') : '—' },
    { cab:'CNPJ', classe:'mono sem-quebra', celula: l => l.banco && l.banco.cnpj ? l.banco.cnpj : '—' },
    { cab:'Banco', celula: l => l.banco && l.banco.banco ? l.banco.banco : '—' },
    { cab:'Valor', classe:'num', celula: l => brl(l.valor) },
    { cab:'Avisos', celula: l => {
      const caixa = cria('div');
      if(l.banco) avisosBoletoBradesco(l.banco, l.sistema).forEach(a =>
        caixa.append(cria('span', 'etiqueta ' + (a.tipo === 'factoring' ? 'st-confirmar' : 'st-aviso'), a.texto)));
      return caixa;
    }},
  ];
}

// Liga as caixas dos 2 passos do Bradesco.
function iniciaPassosBradesco(){
  zeraEstadoBradesco();
  ligaCaixaEnvio(elDda('ddaCaixaPdfs'), recebePdfsBradesco, { varios: true });
  ligaCaixaEnvio(elDda('ddaCaixaSistemaBradesco'), arquivo => recebeSistemaDda(arquivo, elDda('ddaCaixaSistemaBradesco')));
}
