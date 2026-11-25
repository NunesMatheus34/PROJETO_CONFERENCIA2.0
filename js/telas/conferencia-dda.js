/* =====================================================================
   TELA: CONFERÊNCIA DDA (Santander, Itaú e Bradesco)
   Só desenha e reage aos cliques: banco e empresa no topo, as caixas
   de arquivo, os alertas, o resultado (cartões, abas, busca, tabela) e o
   botão do Excel. As regras ficam em js/conferencias/dda.js.
   Ordem: banco + empresa destravam as caixas -> cada arquivo é conferido
   ao ser enviado (empresa, banco, conta) -> Conferir.
   Santander e Itaú: duas caixas lado a lado. Bradesco: 2 passos (PDFs e
   depois o relatório), desenhados por js/telas/dda-bradesco.js.
   Dado de arquivo vai para a tela sempre com textContent.
   ===================================================================== */

// Estado da tela: o que foi escolhido e o que foi lido (nada sai do navegador).
const telaDda = {
  leituraDda: null, matrizSistema: null,     // arquivos lidos e aprovados nas travas
  alertaDda: '', alertaSistema: '',          // por que um arquivo foi recusado
  avisoDda: '',                              // algo para olhar que não impede conferir
  boletos: null, sistema: null, consulta: '',// prontos para conferir (depois do Conferir)
  resultado: null, desenho: null,
  // número da última leitura pedida em cada caixa. Ler o Excel demora; se nesse meio-tempo
  // a pessoa trocar banco/empresa, clicar em Nova conferência ou mandar outro arquivo, a
  // leitura antiga é descartada ao terminar (senão um arquivo aprovado para uma empresa
  // ficaria valendo para outra).
  pedido: { dda:0, sistema:0, pdfs:0 },
  // Bradesco (js/telas/dda-bradesco.js): pdfs, lendoPdfs, filaPdfs, passo2Livre, infoBradesco
};

// Atalho para os elementos da tela.
const elDda = id => document.getElementById(id);

// Banco ('santander' | 'itau' | 'bradesco' | '') e empresa (da tabela EMPRESAS ou null) escolhidos no topo.
function escolhaDda(){
  const banco = elDda('ddaBanco').value;
  const empresa = EMPRESAS.find(e => e.id === elDda('ddaEmpresa').value && empresaPermitida(e)) || null;
  return { banco, empresa };
}

// Ao trocar o banco: a lista de empresas mostra só as que têm aquele banco e que a
// pessoa pode usar (js/login/permissoes.js). A sessão chama de novo depois do login.
// O Itaú mostra também o filtro de unidade do pagador.
function trocaBancoDda(){
  const { banco } = escolhaDda();
  const sel = elDda('ddaEmpresa');
  const anterior = sel.value;
  sel.replaceChildren();
  const primeira = document.createElement('option');
  primeira.value = ''; primeira.textContent = banco ? 'Escolha a empresa' : 'Escolha o banco primeiro';
  sel.append(primeira);
  if(banco){
    EMPRESAS.filter(e => e.bancos.includes(NOMES_BANCO[banco]) && empresaPermitida(e)).forEach(e => {
      const op = document.createElement('option');
      op.value = e.id; op.textContent = `${e.nome} · ${e.cnpj}`;
      sel.append(op);
    });
  }
  sel.disabled = !banco;
  if([...sel.options].some(o => o.value === anterior)) sel.value = anterior;
  elDda('ddaCampoUnidade').hidden = banco !== 'itau';
  elDda('ddaUnidade').value = 'todas';
  elDda('ddaEnviosPadrao').hidden = banco === 'bradesco';
  elDda('ddaPassosBradesco').hidden = banco !== 'bradesco';
  recomecaDda();
}

// Volta ao começo mantendo banco e empresa: esvazia as caixas (travadas se faltar
// banco ou empresa), apaga alertas e resultado.
function recomecaDda(){
  const { banco, empresa } = escolhaDda();
  const travada = !(banco && empresa);
  const texto = travada ? 'Escolha o banco e a empresa primeiro' : 'Nenhum arquivo escolhido';
  preparaCaixaEnvio(elDda('ddaCaixaBanco'), travada, texto);
  preparaCaixaEnvio(elDda('ddaCaixaSistema'), travada, texto);
  recomecaBradesco(travada);
  telaDda.pedido.dda++; telaDda.pedido.sistema++;   // descarta leituras ainda em andamento
  Object.assign(telaDda, { leituraDda:null, matrizSistema:null, alertaDda:'', alertaSistema:'', avisoDda:'',
                           boletos:null, sistema:null, consulta:'', resultado:null });
  elDda('ddaResultado').hidden = true;
  if(telaDda.desenho) telaDda.desenho.limpa();
  mostraAlertasDda();
}

// Mostra os alertas (vermelho, grande) e o aviso (amarelo) do momento e
// libera o Conferir só com os dois lados aprovados (Bradesco: PDFs com Leitura OK).
function mostraAlertasDda(){
  const alertas = [telaDda.alertaDda, telaDda.alertaSistema].filter(Boolean);
  const caixa = elDda('ddaAlerta');
  if(alertas.length){
    caixa.replaceChildren(...alertas.map(t => cria('p', '', '⚠ ' + t)));
    caixa.hidden = false;
  }else limpaMensagem(caixa);
  if(telaDda.avisoDda) mostraMensagem(elDda('ddaAviso'), 'aviso', telaDda.avisoDda);
  else limpaMensagem(elDda('ddaAviso'));
  const bancoPronto = escolhaDda().banco === 'bradesco' ? pdfsBradescoProntos() : !!telaDda.leituraDda;
  elDda('ddaConferir').disabled = !(bancoPronto && telaDda.matrizSistema);
  elDda('ddaBaixar').disabled = !telaDda.resultado;
}

// Recusa o arquivo de uma caixa: marca em vermelho e troca o ✓ por ✗.
function recusaArquivoDda(caixa){
  recusaCaixaEnvio(caixa);
  const nome = caixa.querySelector('.caixa-envio-arquivo');
  nome.textContent = nome.textContent.replace(/^✓/, '✗');
}

// true quando a leitura de número "meu" da caixa ainda vale: é a última pedida nela
// e banco e empresa continuam os mesmos de quando o arquivo foi enviado.
function leituraAindaValeDda(caixa, meu, banco, empresa){
  const agora = escolhaDda();
  return telaDda.pedido[caixa] === meu && agora.banco === banco && agora.empresa === empresa;
}

// DDA enviado: lê e confere se é do banco e da conta da empresa escolhidos.
// Se banco, empresa ou arquivo mudarem durante a leitura, o resultado é descartado.
async function recebeDdaDda(arquivo){
  const { banco, empresa } = escolhaDda();
  const meu = ++telaDda.pedido.dda;
  telaDda.leituraDda = null; telaDda.alertaDda = ''; telaDda.avisoDda = ''; telaDda.resultado = null;
  elDda('ddaResultado').hidden = true;
  mostraAlertasDda();                       // trava o Conferir enquanto lê
  try{
    const leitura = await lerMatrizComTexto(arquivo);
    if(!leituraAindaValeDda('dda', meu, banco, empresa)) return;
    const { bloqueio, aviso } = checaDda(banco, empresa, leitura.matriz);
    if(bloqueio){ telaDda.alertaDda = bloqueio; recusaArquivoDda(elDda('ddaCaixaBanco')); }
    else{ telaDda.leituraDda = leitura; telaDda.avisoDda = aviso; }
  }catch(err){
    if(!leituraAindaValeDda('dda', meu, banco, empresa)) return;
    telaDda.alertaDda = 'Não consegui ler o DDA: ' + (err.message || err);
    recusaArquivoDda(elDda('ddaCaixaBanco'));
  }
  mostraAlertasDda();
}

// Relatório enviado: lê e confere pela 1ª linha se é da empresa escolhida
// (no Bradesco, também se tem as colunas do relatório Rubi). caixa = de onde veio
// (Santander/Itaú: ddaCaixaSistema; Bradesco: a do passo 2).
// Se banco, empresa ou arquivo mudarem durante a leitura, o resultado é descartado.
async function recebeSistemaDda(arquivo, caixa){
  caixa = caixa || elDda('ddaCaixaSistema');
  const { banco, empresa } = escolhaDda();
  const meu = ++telaDda.pedido.sistema;
  telaDda.matrizSistema = null; telaDda.alertaSistema = ''; telaDda.resultado = null;
  elDda('ddaResultado').hidden = true;
  mostraAlertasDda();                       // trava o Conferir enquanto lê
  try{
    const { matriz } = await lerMatrizComTexto(arquivo);
    if(!leituraAindaValeDda('sistema', meu, banco, empresa)) return;
    const alerta = checaRelatorioDda(empresa, matriz) || (banco === 'bradesco' ? extraiSistemaBradesco(matriz).erro : '');
    if(alerta){ telaDda.alertaSistema = alerta; recusaArquivoDda(caixa); }
    else telaDda.matrizSistema = matriz;
  }catch(err){
    if(!leituraAindaValeDda('sistema', meu, banco, empresa)) return;
    telaDda.alertaSistema = 'Não consegui ler o relatório: ' + (err.message || err);
    recusaArquivoDda(caixa);
  }
  mostraAlertasDda();
}

// Botão Conferir: lê os boletos e os títulos e mostra o resultado.
function confereDda(){
  const { banco } = escolhaDda();
  if(banco === 'bradesco'){
    if(telaDda.matrizSistema && preparaConferenciaBradesco()) mostraResultadoDda();
    return;
  }
  if(!telaDda.leituraDda || !telaDda.matrizSistema) return;
  const m = telaDda.leituraDda.matriz;
  const boletos = banco === 'itau' ? leitorItau(telaDda.leituraDda) : leitorSantander(m);
  const sistema = extraiSistema(telaDda.matrizSistema);
  if(!boletos.length){
    telaDda.alertaDda = banco === 'itau'
      ? 'Não encontrei boletos no arquivo do Itaú. Confira se os valores estão na coluna "Até Venc.".'
      : 'Não encontrei valores no arquivo do banco. Confira se o cabeçalho está na linha 5 e os valores na coluna E.';
    return mostraAlertasDda();
  }
  if(!sistema.length){
    telaDda.alertaSistema = 'Não encontrei saldos no arquivo do sistema. Confira se os nomes estão na coluna C e o saldo na coluna P.';
    return mostraAlertasDda();
  }
  telaDda.boletos = boletos;
  telaDda.sistema = sistema;
  telaDda.consulta = banco === 'itau' ? dataHoraConsultaItau(m) : '';
  mostraResultadoDda();
}

// Roda a conferência (com a unidade escolhida, no Itaú) e desenha o resultado.
// Trocar a unidade depois de conferir chama de novo, como no antigo.
// O Bradesco tem regra própria (conferirBradesco) e linha de informação própria.
function mostraResultadoDda(){
  const { banco } = escolhaDda();
  const unidade = banco === 'itau' ? elDda('ddaUnidade').value : 'todas';
  const boletos = boletosDaUnidade(telaDda.boletos, unidade);
  telaDda.resultado = banco === 'bradesco' ? conferirBradesco(telaDda.boletos, telaDda.sistema) : conferir(boletos, telaDda.sistema);

  // linha de informação do Itaú (consulta, boletos por unidade, descontos) e do Bradesco (PDFs, boletos)
  const info = elDda('ddaInfo');
  if(banco === 'bradesco') infoResultadoBradesco(telaDda.resultado);
  else if(banco === 'itau'){
    const porUnidade = { 'sem-capinopolis':0, capinopolis:0 };
    telaDda.boletos.forEach(b => porUnidade[unidadeDoPagador(b.pagador)]++);
    const comDesconto = boletos.filter(b => b.comDesconto).length;
    info.textContent = `Consulta no Itaú: ${telaDda.consulta || 'data/hora não encontrada no arquivo'} · ` +
      `${telaDda.boletos.length} boletos no arquivo (${NOMES_UNIDADE['sem-capinopolis']}: ${porUnidade['sem-capinopolis']} · ` +
      `${NOMES_UNIDADE.capinopolis}: ${porUnidade.capinopolis}) · ` +
      `conferindo ${unidade === 'todas' ? 'todas as unidades' : NOMES_UNIDADE[unidade]}: ${boletos.length} boletos` +
      (comDesconto ? `, ${comDesconto} com desconto` : '');
    info.hidden = false;
  }else info.hidden = true;

  telaDda.desenho = ligaResultado({
    area: elDda('ddaArea'), status: STATUS_DDA, colunas: colunasTelaDda(banco),
    soma: somaValores, busca: buscaCasa, vazio: MSG_VAZIO_DDA,
  });
  telaDda.desenho.mostra(linhasDda(telaDda.resultado));
  elDda('ddaResultado').hidden = false;
  mostraAlertasDda();
}

// Texto da tabela quando a aba não tem nenhum título.
const MSG_VAZIO_DDA = {
  nome:  'Nenhum boleto com nome diferente. Tudo que bateu no valor também bateu no nome do fornecedor.',
  data:  'Nenhum vencimento diferente. As datas batem em tudo que foi encontrado.',
  banco: 'Nenhum boleto do banco ficou de fora: todos foram achados no sistema.',
  sis:   'Nenhum título do sistema ficou de fora: todos foram achados no banco.',
  ok:    'Nenhum título conferido. Veja as outras abas.',
};

// Colunas da tabela. Santander: vencimento, fornecedor e valor.
// Itaú: também Nº Doc./NF, CNPJ, banco emissor e código de barras.
// Bradesco: as de colunasTelaBradesco (NF do sistema, Nº Doc. do Bradesco, avisos).
function colunasTelaDda(banco){
  if(banco === 'bradesco') return colunasTelaBradesco();
  const vencimento = { cab:'Vencimento', classe:'mono', celula: l => {
    const b = l.banco, s = l.sistema;
    return textoComSub(dataBR(b ? b.venc : s.venc), l.status === 'data' ? 'Sistema: ' + dataBR(s.venc) : '');
  }};
  const fornecedor = { cab:'Fornecedor', celula: l => {
    const b = l.banco, s = l.sistema;
    return textoComSub(b ? b.nome : s.nome, l.status === 'nome' ? 'No sistema: ' + s.nome : '');
  }};
  const valor = { cab:'Valor', classe:'num', celula: l => {
    const b = l.banco, s = l.sistema;
    const subs = [];
    if(b && s){
      const diff = Math.round((b.valor - s.valor)*100)/100;
      if(diff !== 0) subs.push(`Sistema: ${brl(s.valor)} (dif. ${diff>0?'+':''}${brl(diff)})`);
    }
    if(banco === 'itau' && b && b.comDesconto) subs.push(`com desconto · a pagar ${brl(b.valorAPagar)}`);
    return textoComSub(brl(l.valor), subs.join(' · '));
  }};
  if(banco !== 'itau') return [vencimento, fornecedor, valor];

  const docNf = { cab:'Nº Doc./NF', classe:'mono', celula: l => {
    const b = l.banco, s = l.sistema;
    return textoComSub(b && b.doc ? b.doc : '—', s && s.doc ? 'NF no sistema: ' + s.doc : '');
  }};
  const cnpj = { cab:'CNPJ', classe:'mono sem-quebra', celula: l => l.banco && l.banco.cnpj ? l.banco.cnpj : '—' };
  const bancoEmissor = { cab:'Banco', classe:'mono', celula: l => l.banco && l.banco.banco ? l.banco.banco : '—' };
  const codigo = { cab:'Código de barras', classe:'mono codigo', celula: l => l.banco ? (codigoParaMostrar(l.banco) || '—') : '—' };
  return [vencimento, fornecedor, docNf, cnpj, bancoEmissor, codigo, valor];
}

// Botão Baixar Excel: as 5 abas da tela, com o nome do banco e da empresa no arquivo.
async function baixaExcelDda(){
  if(!telaDda.resultado) return;
  const { banco, empresa } = escolhaDda();
  const unidade = banco === 'itau' ? elDda('ddaUnidade').value : 'todas';
  const abas = banco === 'bradesco' ? abasExcelBradesco(telaDda.resultado) : abasExcelDda(telaDda.resultado, banco, unidade);
  const conteudo = await montaExcel(abas);
  baixaArquivo(conteudo, `conferencia-dda-${banco}-${empresa.id}.xlsx`);
}

// Legenda dos status na Ajuda (mesmo nome, cor e explicação da tela).
function legendaAjudaDda(){
  const lista = elDda('ajudaStatusDda');
  if(!lista) return;
  lista.replaceChildren(...STATUS_DDA.map(st => {
    const li = cria('li');
    li.append(cria('span', 'etiqueta st-' + st.cor, st.nome), cria('span', '', ' ' + st.ajuda));
    return li;
  }));
}

// Liga a tela: escolhas do topo, caixas, botões e a legenda da Ajuda.
function iniciaTelaDda(){
  elDda('ddaBanco').addEventListener('change', trocaBancoDda);
  elDda('ddaEmpresa').addEventListener('change', recomecaDda);
  elDda('ddaUnidade').addEventListener('change', () => { if(telaDda.resultado) mostraResultadoDda(); });
  ligaCaixaEnvio(elDda('ddaCaixaBanco'), recebeDdaDda);
  ligaCaixaEnvio(elDda('ddaCaixaSistema'), arquivo => recebeSistemaDda(arquivo, elDda('ddaCaixaSistema')));
  iniciaPassosBradesco();
  elDda('ddaConferir').addEventListener('click', confereDda);
  elDda('ddaBaixar').addEventListener('click', baixaExcelDda);
  elDda('ddaNova').addEventListener('click', recomecaDda);
  legendaAjudaDda();
  trocaBancoDda();
}
