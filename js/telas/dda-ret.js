/* =====================================================================
   TELA: DDA → .RET
   Só desenha e reage aos cliques; as regras ficam em
   js/conferencias/dda-ret.js e a leitura do .RET em js/leitura/ret.js.
   Passos (sub-etapa 1, entradas): escolher a empresa pagadora (só CRV
   Matriz e CRV Filial), enviar o modelo .RET e o DDA do Itaú (Excel ou
   PDF). Cada arquivo é lido no navegador assim que é escolhido, e as
   checagens aparecem embaixo (verde, amarelo ou vermelho).
   Sub-etapa 2: com as entradas certas, mostra a contagem dos boletos lidos
   e a tabela SÓ DE LEITURA (nenhum campo editável).
   Sub-etapa 3: o resultado das travas de cada boleto (quantos vão para o
   arquivo), a lista vermelha "Fora do arquivo" com os motivos e a coluna
   Situação na tabela.
   Sub-etapa 4: a lista amarela "Atenção antes de importar" (alertas de
   fraude) e a lista de fornecedores novos, com "Confirmei com o fornecedor".
   A memória de fornecedores é lida e gravada SÓ por js/memoria-fornecedores.js.
   Sub-etapa 5: o NSA (único campo digitável da tela), "Gerar teste (3
   boletos)" e "Gerar completo". Os botões ficam travados se a contagem
   não fecha, se nenhum boleto passou nas travas ou se o NSA não serve.
   Sub-etapa 6: depois de gerar, os bytes do arquivo são relidos por um
   leitor independente (provaRetGerado, js/conferencias/confere-ret.js) e
   o SHA-256 do .RET e do DDA de origem aparecem na tela. Só com TODOS os
   itens da prova verdes aparecem "Baixar .RET" (que marca o NSA como
   usado) e "Baixar Excel de conferência". O "Verificar um .RET" fica em
   js/telas/verifica-ret.js.
   Trocar a empresa NÃO apaga os arquivos: as checagens são refeitas com a
   empresa nova. Nada na tela é editável; dado de arquivo vai por textContent.
   ===================================================================== */

// Atalho para os elementos da tela.
const elRet = id => document.getElementById(id);

// Estado da tela: empresa escolhida, modelo lido, DDA lido e a memória de fornecedores.
// pedido: número da última leitura pedida por caixa (leitura antiga que termina depois é descartada).
// fechaConfirmacao: fecha a confirmação "Você vai gravar..." aberta (só uma por vez).
// controleNsa: os NSAs já usados (js/controle-nsa.js); gerado: o último arquivo montado, com os
// bytes, a prova e o SHA-256 (liberado = pode baixar; baixado = o .RET já foi baixado).
const telaRet = { empresa:null, modelo:null, dda:null, memoria:null, fechaConfirmacao:null, controleNsa:null, gerado:null,
                  pedido:{ modelo:0, dda:0, gerar:0 } };

// Põe no seletor só as empresas com Itaú que a pessoa pode usar (js/login/permissoes.js),
// com "Escolha a empresa" no começo. A sessão chama de novo depois do login.
function preencheEmpresasRet(){
  const vazia = cria('option', '', 'Escolha a empresa'); vazia.value = '';
  elRet('retEmpresa').replaceChildren(vazia, ...empresasRet().filter(empresaPermitida).map(e => {
    const o = cria('option', '', `${e.nome} (${e.cnpj})`); o.value = e.id; return o;
  }));
}

// Empresa trocada: com empresa, destrava as caixas (mantendo os arquivos já lidos);
// sem empresa, trava e esvazia as duas.
function trocaEmpresaRet(){
  telaRet.empresa = EMPRESAS.find(e => e.id === elRet('retEmpresa').value && empresaPermitida(e)) || null;
  if(!telaRet.empresa){ esvaziaRet(); return; }
  ['retCaixaModelo', 'retCaixaDda'].forEach(id => {
    const caixa = elRet(id);
    caixa.classList.remove('travada');
    caixa.querySelector('input[type=file]').disabled = false;
    if(!caixa.classList.contains('escolhido') && !caixa.classList.contains('recusado'))
      caixa.querySelector('.caixa-envio-arquivo').textContent = 'Nenhum arquivo escolhido';
  });
  mostraChecagensRet();
}

// Volta ao começo: sem arquivos, caixas travadas se não há empresa.
function esvaziaRet(){
  telaRet.pedido.modelo++; telaRet.pedido.dda++;
  telaRet.modelo = null; telaRet.dda = null;
  const texto = telaRet.empresa ? 'Nenhum arquivo escolhido' : 'Escolha a empresa primeiro';
  preparaCaixaEnvio(elRet('retCaixaModelo'), !telaRet.empresa, texto);
  preparaCaixaEnvio(elRet('retCaixaDda'), !telaRet.empresa, texto);
  mostraChecagensRet();
}

// Modelo .RET escolhido: lê no navegador e refaz as checagens.
async function recebeModeloRet(arquivo){
  const meu = ++telaRet.pedido.modelo;
  telaRet.modelo = null; mostraChecagensRet();
  let modelo;
  try{ modelo = await lerModeloRet(arquivo); }
  catch(err){ modelo = { erro:'Não consegui ler o arquivo: ' + (err.message || err) }; }
  if(meu !== telaRet.pedido.modelo) return;
  telaRet.modelo = modelo;
  mostraChecagensRet();
}

// Lê um arquivo de DDA do Itaú: PDF pelo pdf.js, Excel pelo SheetJS (o tipo sai da extensão).
// Junta o nome e o SHA-256 dos bytes do arquivo (erroSha se o navegador não calcular).
// Usada aqui e no "Verificar um .RET" (js/telas/verifica-ret.js).
async function leArquivoDdaRet(arquivo){
  let dda;
  try{
    if(/\.pdf$/i.test(arquivo.name)) dda = { tipo:'pdf', pdf: await lerPalavrasPdf(arquivo) };
    else if(/\.xlsx?$/i.test(arquivo.name)) dda = { tipo:'excel', ...(await lerMatrizComTexto(arquivo)) };
    else return { erro:'Envie o DDA em Excel (.xlsx ou .xls) ou em PDF.' };
  }catch(err){ return { erro:'Não consegui ler o arquivo: ' + (err.message || err) }; }
  dda.nome = arquivo.name;
  try{ dda.sha256 = await sha256DoArquivo(arquivo); }
  catch(err){ dda.erroSha = err.message || String(err); }
  return dda;
}

// DDA escolhido: lê (leArquivoDdaRet) e refaz as checagens.
async function recebeDdaRet(arquivo){
  const meu = ++telaRet.pedido.dda;
  telaRet.dda = null; mostraChecagensRet();
  const dda = await leArquivoDdaRet(arquivo);
  if(meu !== telaRet.pedido.dda) return;
  telaRet.dda = dda;
  mostraChecagensRet();
}

// Desenha as checagens das entradas e a mensagem de "pronto", e pinta cada caixa:
// vermelha se o arquivo dela foi recusado, normal se foi aceito. Sem arquivo, a área fica vazia.
function mostraChecagensRet(){
  const { lista, pronto } = checagensEntradasRet(telaRet);
  elRet('retChecagens').replaceChildren(...checagensDom(lista));
  const recusado = titulos => lista.some(c => c.tipo === 'alerta' && titulos.includes(c.titulo));
  pintaCaixaRet('retCaixaModelo', telaRet.modelo, recusado(['Modelo .RET recusado', 'Empresa fora do modelo']));
  pintaCaixaRet('retCaixaDda', telaRet.dda, recusado(['DDA recusado']));
  if(pronto) mostraMensagem(elRet('retPronto'), 'ok', 'Entradas conferidas: modelo, empresa e DDA.');
  else limpaMensagem(elRet('retPronto'));
  mostraLeituraRet(pronto);
}

// Leitura dos boletos (só com as entradas certas): a contagem (verde ou vermelha, com as
// páginas/linhas que não fecham), a observação do formato, o resultado das travas de cada
// boleto (sub-etapa 3), a lista vermelha "Fora do arquivo", os alertas (sub-etapa 4) e a
// tabela só de leitura.
function mostraLeituraRet(pronto){
  telaRet.leitura = pronto ? leituraDdaRet(telaRet.dda) : null;
  const l = telaRet.leitura;
  elRet('retLeitura').hidden = !l;
  telaRet.travas = l ? travasDdaRet(l.boletos) : null;
  limpaGeradoRet();
  atualizaGerarRet();
  if(!l){
    telaRet.alertas = null;
    ['retContagem', 'retTravas', 'retFora', 'retAtencao', 'retNovos', 'retTabela'].forEach(id => elRet(id).replaceChildren());
    return;
  }
  const checagens = [{ tipo: l.contagem.ok ? 'ok' : 'alerta', titulo: l.contagem.ok ? 'Contagem dos boletos' : 'Contagem não fecha',
                       texto: l.contagem.texto, itens: l.contagem.onde }];
  l.observacoes.forEach(o => checagens.push({ tipo:'aviso', ...o }));
  elRet('retContagem').replaceChildren(...checagensDom(checagens));
  const t = telaRet.travas;
  elRet('retTravas').replaceChildren(...checagensDom(checagensTravasRet(t)));
  elRet('retFora').replaceChildren(...(t.fora.length ? [listaForaRet(t)] : []));
  elRet('retInfo').textContent = `${l.boletos.length} boleto(s) lido(s) · total "Até Venc." ${brl(l.total)} · ` +
    `${t.noArquivo.length} no arquivo (${brl(t.totalNoArquivo)}) · ${t.fora.length} fora do arquivo (${brl(t.totalFora)}) · tabela só de leitura.`;
  mostraAlertasRet();
}

// Refaz os alertas de fraude com a memória do momento e redesenha a lista amarela, a lista
// de fornecedores novos e a tabela (a coluna Situação mostra os alertas de cada boleto).
// Chamada depois das travas e de novo a cada "Confirmei com o fornecedor".
function mostraAlertasRet(){
  const l = telaRet.leitura, t = telaRet.travas;
  if(!l || !t) return;
  const a = telaRet.alertas = alertasDdaRet(t.noArquivo, telaRet.memoria || memoriaVazia());
  elRet('retAtencao').replaceChildren(listaAtencaoRet(a));
  elRet('retNovos').replaceChildren(...(a.novos.length ? [listaNovosRet(a)] : []));
  elRet('retTabela').replaceChildren(tabelaLeituraRet(l.boletos, l.total, t, a));
  mostraResumoMemoriaRet();
}

// Linha com quantos fornecedores a memória tem e quando ela foi gravada pela última vez.
function mostraResumoMemoriaRet(){
  elRet('retMemoriaStatus').textContent = 'Memória de fornecedores: ' + resumoMemoriaFornecedores(telaRet.memoria || memoriaVazia()) + '.';
}

// Lista amarela "Atenção antes de importar": a contagem de cada tipo e uma linha por alerta,
// com o que conferir. Alerta de mudança de banco/CNPJ tem o botão "Confirmei com o fornecedor".
// Sem alertas: uma caixa verde dizendo isso.
function listaAtencaoRet(a){
  if(!a.atencao.length) return criaCom('div', 'checagens', checagensDom([{ tipo:'ok', titulo:'Atenção antes de importar: nenhum alerta',
    texto:'Nenhum boleto do arquivo é de factoring/fundo/instituição de pagamento, mudou de banco ou CNPJ, está duplicado ou tem desconto.' }]));
  const resumo = TIPOS_ATENCAO_RET.map(tp => `${tp.nome}: ${a.porTipo[tp.id]}`).join(' · ');
  const cab = ['Alerta', 'Origem', 'Beneficiário', 'CPF/CNPJ', 'Banco', 'Venc.', 'Até Venc.', 'O que conferir', ''];
  const nomeTipo = Object.fromEntries(TIPOS_ATENCAO_RET.map(tp => [tp.id, tp.nome]));
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(c => cria('th', c === 'Até Venc.' ? 'num' : '', c)))]));
  tabela.append(criaCom('tbody', '', a.atencao.map(al => {
    const b = al.boleto, acao = cria('td', 'sem-quebra');
    if(al.confirmar) acao.append(botaoConfirmaRet('Confirmei com o fornecedor', [al.confirmar]));
    return criaCom('tr', 'linha-aviso', [
      cria('td', 'sem-quebra atencao-tipo', nomeTipo[al.tipo]), cria('td', 'sem-quebra', origemBoletoRet(b)), cria('td', '', b.beneficiario),
      cria('td', 'mono sem-quebra', b.cnpj), cria('td', 'mono', b.banco), cria('td', 'mono sem-quebra', b.venc),
      cria('td', 'num', brl(b.valor)), cria('td', '', al.texto), acao,
    ]);
  })));
  return criaCom('div', 'lista-atencao', [
    cria('h2', 'lista-atencao-titulo', `⚠ Atenção antes de importar (${a.atencao.length})`),
    cria('p', 'lista-atencao-resumo', resumo + '. Estes boletos vão para o arquivo: confira cada um antes de importar e de pagar.'),
    criaCom('div', 'tabela-caixa tabela-solta', [tabela]),
  ]);
}

// Lista (fechada) dos fornecedores que ainda não estão na memória: um por CPF/CNPJ, com os
// alertas dos boletos dele e o botão "Confirmei com o fornecedor". Em cima, o botão que
// confirma de uma vez SÓ os novos sem nenhum alerta; os com alerta ficam só um por um.
// Fornecedor novo não é alerta: só deixa de ser "novo" depois de confirmado.
function listaNovosRet(a){
  const qtdBoletos = a.novos.reduce((s, n) => s + n.boletos.length, 0);
  const semAlerta = novosSemAlerta(a.novos), comAlerta = a.novos.length - semAlerta.length;
  const cab = ['Beneficiário', 'CPF/CNPJ', 'Banco(s)', 'Boletos', 'Alertas', ''];
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(c => cria('th', c === 'Boletos' ? 'num' : '', c)))]));
  tabela.append(criaCom('tbody', '', a.novos.map(n => criaCom('tr', n.alertas.length ? 'linha-aviso' : '', [
    cria('td', '', n.nome), cria('td', 'mono sem-quebra', n.documento), cria('td', 'mono', n.bancos.join(', ')),
    cria('td', 'num', String(n.boletos.length)),
    n.alertas.length ? criaCom('td', '', n.alertas.map(al => cria('span', 'atencao-tipo bloco-linha', '⚠ ' + al))) : cria('td', '', '—'),
    criaCom('td', 'sem-quebra', [botaoConfirmaRet('Confirmei com o fornecedor', confirmacoesDosNovos([n]))]),
  ]))));
  const todos = botaoConfirmaRet(`Confirmei todos os ${semAlerta.length} novos sem alerta`, confirmacoesDosNovos(semAlerta));
  if(!semAlerta.length) todos.disabled = true;
  const caixa = cria('details', 'lista-novos');
  caixa.append(cria('summary', 'lista-novos-titulo', `Fornecedores novos (ainda não estão na memória): ${a.novos.length} CPF/CNPJ · ${qtdBoletos} boleto(s)`),
    cria('p', 'lista-novos-texto', 'A memória guarda o CPF/CNPJ, o nome e os bancos de cada fornecedor confirmado, só neste computador. ' +
      'Com ela, um fornecedor conhecido que aparecer por outro banco, ou um nome conhecido com outro CNPJ, vira alerta. Nada entra na memória sem o seu clique.' +
      (comAlerta ? ` ${comAlerta} fornecedor(es) com alerta (factoring/fundo, duplicado, desconto ou vencimento diferente) não entram no "Confirmei todos": confira e confirme um por um.` : '')),
    criaCom('div', 'acoes', [todos]),
    criaCom('div', 'tabela-caixa tabela-solta', [tabela]));
  return caixa;
}

// Quantos fornecedores (CPF/CNPJ diferentes) uma lista de confirmações grava.
function qtdFornecedoresRet(confirmacoes){
  return new Set(confirmacoes.map(c => chaveFornecedor(c.documento))).size;
}

// Botão que pede a gravação na memória das confirmações da lista ({ documento, nome, banco }).
// O clique NÃO grava: abre, no lugar do botão, a confirmação na própria tela (Cancelar /
// Confirmar). Só o Confirmar grava; a gravação é a ÚNICA forma de algo entrar na memória.
function botaoConfirmaRet(texto, confirmacoes){
  const botao = cria('button', 'botao', texto);
  botao.type = 'button';
  botao.addEventListener('click', () => abreConfirmacaoMemoriaRet(botao, confirmacoes));
  return botao;
}

// Mostra, logo depois do botão clicado, o aviso "Você vai gravar N fornecedores na memória..."
// com Cancelar e Confirmar (sem alert/confirm do navegador). Só uma confirmação aberta por vez:
// abrir outra fecha a anterior. Cancelar volta o botão; Confirmar grava e refaz os alertas.
function abreConfirmacaoMemoriaRet(botao, confirmacoes){
  if(telaRet.fechaConfirmacao) telaRet.fechaConfirmacao();
  const n = qtdFornecedoresRet(confirmacoes);
  const painel = cria('div', 'confirma-memoria');
  painel.setAttribute('role', 'group');
  const cancelar = cria('button', 'botao', 'Cancelar'), confirmar = cria('button', 'botao botao-principal', 'Confirmar');
  cancelar.type = confirmar.type = 'button';
  painel.append(cria('p', 'confirma-memoria-texto', `Você vai gravar ${n === 1 ? '1 fornecedor' : n + ' fornecedores'} na memória. ` +
    'Faça isso só com um DDA que você já conferiu e pagou.'), criaCom('div', 'acoes', [cancelar, confirmar]));
  const fecha = () => { painel.remove(); botao.hidden = false; telaRet.fechaConfirmacao = null; };
  telaRet.fechaConfirmacao = fecha;
  botao.hidden = true;
  botao.after(painel);
  cancelar.addEventListener('click', () => { fecha(); botao.focus(); });
  confirmar.addEventListener('click', async () => {
    cancelar.disabled = confirmar.disabled = true;
    await gravaConfirmacoesRet(confirmacoes);
  });
  confirmar.focus();
}

// Grava as confirmações na memória (pela gravarMemoriaFornecedores) e redesenha os alertas.
// Se o navegador não deixar gravar, a confirmação vale só nesta página, e a tela avisa.
async function gravaConfirmacoesRet(confirmacoes){
  const nova = confirmaFornecedores(telaRet.memoria || memoriaVazia(), confirmacoes);
  const gravada = await gravarMemoriaFornecedores(nova);
  telaRet.memoria = gravada || nova;
  telaRet.fechaConfirmacao = null;
  mostraAlertasRet();
  if(!gravada) mostraMensagem(elRet('retMemoriaAviso'), 'aviso', 'Não consegui guardar a memória neste navegador: a confirmação vale só até fechar a página.');
}

// As checagens das travas, para checagensDom: verde com quantos passaram, vermelha com
// quantos ficaram fora (a lista com os motivos vem logo abaixo, em listaForaRet) e amarela
// com os boletos do arquivo cujo vencimento do código é diferente do "Venc." do DDA.
function checagensTravasRet(t){
  const lista = [{ tipo:'ok', titulo:`No arquivo: ${t.noArquivo.length} boleto(s) · ${brl(t.totalNoArquivo)}`,
    texto:'Passaram em todas as travas: código com 44 dígitos, DV geral, banco, valor ao centavo, ida e volta pela linha digitável e CPF/CNPJ do beneficiário.' }];
  if(t.fora.length) lista.push({ tipo:'alerta', titulo:`Fora do arquivo: ${t.fora.length} boleto(s) · ${brl(t.totalFora)}`,
    texto:'Estes boletos NÃO vão para o .RET: alguma trava não fechou (motivos na lista abaixo). Confira cada um direto no banco antes de pagar.' });
  if(t.comAviso.length) lista.push({ tipo:'aviso', titulo:`Vencimento do código diferente do DDA: ${t.comAviso.length} boleto(s)`,
    texto:'Vão para o arquivo, mas confira: o vencimento gravado no código não é o "Venc." do DDA (boleto prorrogado?).',
    itens: t.comAviso.map(i => `${origemBoletoRet(i.boleto)}: ${i.boleto.beneficiario} · ${brl(i.boleto.valor)} · Venc. no DDA ${i.boleto.venc}, no código ${vencDoCodigoRet(i.boleto)}`) });
  return lista;
}

// Vencimento gravado no código (fator), só para mostrar no aviso ('sem vencimento' se o fator é 0000).
function vencDoCodigoRet(b){
  return decodifica(soDigitos(b.codigoTexto)).venc || 'sem vencimento';
}

// Lista vermelha "Fora do arquivo": uma linha por boleto reprovado, com TODOS os motivos.
function listaForaRet(t){
  const cab = ['Origem', 'Beneficiário', 'CPF/CNPJ', 'Venc.', 'Até Venc.', 'Código de barras (como veio)', 'Motivo'];
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(c => cria('th', c === 'Até Venc.' ? 'num' : '', c)))]));
  tabela.append(criaCom('tbody', '', t.fora.map(i => criaCom('tr', 'linha-alerta', [
    cria('td', 'sem-quebra', origemBoletoRet(i.boleto)), cria('td', '', i.boleto.beneficiario), cria('td', 'mono sem-quebra', i.boleto.cnpj),
    cria('td', 'mono sem-quebra', i.boleto.venc), cria('td', 'num', brl(i.boleto.valor)), cria('td', 'mono codigo', i.boleto.codigoTexto),
    criaCom('td', '', i.motivos.map(m => cria('span', 'motivo-fora', m))),
  ]))));
  return criaCom('div', 'lista-fora', [cria('h2', 'lista-fora-titulo', `Fora do arquivo (${t.fora.length})`),
    criaCom('div', 'tabela-caixa tabela-solta', [tabela])]);
}

// Tabela só de leitura dos boletos lidos, na ordem do DDA, com a situação de cada um
// (no arquivo / fora do arquivo; embaixo, os alertas do boleto) e o total no rodapé.
// Linha vermelha = fora; borda amarela = no arquivo com aviso ou alerta. Tudo por
// textContent (cria); o código aparece exatamente como veio no arquivo.
function tabelaLeituraRet(boletos, total, travas, alertas){
  const cab = ['#', 'Situação', 'Beneficiário', 'CPF/CNPJ', 'Venc.', 'Nº Doc.', 'Até Venc.', 'A Pagar', 'Banco', 'Código de barras', 'Origem'];
  const num = new Set(['#', 'Até Venc.', 'A Pagar']);
  const situacao = new Map([...travas.noArquivo, ...travas.fora].map(i => [i.boleto, i]));
  const nomeTipo = Object.fromEntries(TIPOS_ATENCAO_RET.map(tp => [tp.id, tp.nome]));
  const doBoleto = new Map();
  alertas.atencao.forEach(al => doBoleto.set(al.boleto, [...(doBoleto.get(al.boleto) || []), nomeTipo[al.tipo]]));
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(t => cria('th', num.has(t) ? 'num' : '', t)))]));
  tabela.append(criaCom('tbody', '', boletos.map((b, i) => {
    const s = situacao.get(b), al = doBoleto.get(b) || [];
    const atencao = s.avisos.length || al.length;
    const classe = !s.ok ? 'linha-alerta' : atencao ? 'linha-aviso' : '';
    return criaCom('tr', classe, [
      cria('td', 'num', String(i + 1)),
      criaCom('td', 'sem-quebra', [cria('span', '', s.ok ? (atencao ? '⚠ No arquivo' : '✓ No arquivo') : '✗ Fora do arquivo'),
        ...al.map(nome => cria('span', 'sub', nome))]),
      cria('td', '', b.beneficiario), cria('td', 'mono sem-quebra', b.cnpj),
      cria('td', 'mono sem-quebra', b.venc), cria('td', 'mono', b.doc), cria('td', 'num', brl(b.valor)),
      cria('td', 'num', brl(b.valorAPagar)), cria('td', 'mono', b.banco), cria('td', 'mono codigo', b.codigoTexto),
      cria('td', 'sem-quebra', origemBoletoRet(b)),
    ]);
  })));
  const pe = cria('tr');
  const vazio = n => { const td = cria('td', '', ''); td.colSpan = n; return td; };
  pe.append(vazio(2), cria('td', '', `${boletos.length} boleto(s)`), vazio(3), cria('td', 'num', brl(total)), vazio(4));
  tabela.append(criaCom('tfoot', '', [pe]));
  return tabela;
}

// Pinta uma caixa de envio que já tem arquivo lido: recusada (vermelha) ou aceita.
function pintaCaixaRet(id, lido, recusado){
  if(!lido) return;
  const caixa = elRet(id);
  if(recusado) recusaCaixaEnvio(caixa);
  else { caixa.classList.remove('recusado'); caixa.classList.add('escolhido'); }
}

// Trava ou destrava "Gerar teste" e "Gerar completo" e diz por quê: precisa da contagem
// fechada, de pelo menos um boleto aprovado nas travas (podeGerarRet) e de um NSA que sirva.
function atualizaGerarRet(){
  const pode = podeGerarRet(telaRet.leitura, telaRet.travas);
  const nsa = checaNsa(elRet('retNsa').value, telaRet.controleNsa || controleNsaVazio());
  const ok = pode.ok && nsa.ok;
  elRet('retGerarTeste').disabled = elRet('retGerarCompleto').disabled = !ok;
  if(ok) limpaMensagem(elRet('retGerarAviso'));
  else mostraMensagem(elRet('retGerarAviso'), pode.ok ? 'aviso' : 'alerta', 'Geração travada: ' + (pode.ok ? nsa.motivo : pode.motivo));
}

// Esquece o arquivo montado (empresa, DDA, NSA ou leitura mudaram): some a prova e os downloads.
function limpaGeradoRet(){
  telaRet.pedido.gerar++;
  telaRet.gerado = null;
  elRet('retGerado').replaceChildren();
}

// Monta o .RET (teste = só os 3 primeiros boletos aprovados), relê os BYTES que vão ser
// baixados com o leitor independente (provaRetGerado) e calcula o SHA-256 do .RET.
// Só libera os downloads se todos os itens da prova passarem e os dois SHA-256 existirem.
async function gerarRet(teste){
  const nsa = checaNsa(elRet('retNsa').value, telaRet.controleNsa || controleNsaVazio());
  if(!nsa.ok){ atualizaGerarRet(); return; }
  limpaGeradoRet();
  limpaMensagem(elRet('retGerarAviso'));
  const meu = telaRet.pedido.gerar;
  const agora = new Date();
  const r = geraRet({ modelo: telaRet.modelo, empresa: telaRet.empresa, leitura: telaRet.leitura, travas: telaRet.travas,
                      nsa: nsa.nsa, agora, teste });
  if(r.bloqueio){ mostraMensagem(elRet('retGerarAviso'), 'alerta', r.bloqueio); return; }
  let bytes = null, prova, sha = '', erroSha = '';
  try{
    bytes = bytesAsciiDoTexto(r.texto);
    prova = provaRetGerado(bytes, { modelo: telaRet.modelo, empresa: telaRet.empresa, nsa: nsa.nsa, boletos: r.boletos });
  }catch(err){
    prova = { ok:false, itens:[{ ok:false, titulo:'Releitura do arquivo', texto:'Não consegui reler o arquivo: ' + (err.message || err), itens:[] }] };
  }
  if(bytes){
    try{ sha = await sha256Hex(bytes); }catch(err){ erroSha = err.message || String(err); }
  }
  if(meu !== telaRet.pedido.gerar) return;
  const dda = telaRet.dda;
  const liberado = prova.ok && !!sha && !!dda.sha256;
  telaRet.gerado = { ...r, bytes, prova, sha, erroSha, nsa: nsa.nsa, agora, teste, empresa: telaRet.empresa, liberado, baixado:false };
  mostraGeradoRet();
}

// Desenha o arquivo montado: o veredito, cada item da prova (verde ou vermelho), os dois
// SHA-256, os botões de download (só se liberado) e o texto do arquivo.
function mostraGeradoRet(){
  const g = telaRet.gerado, dda = telaRet.dda;
  const nsa6 = String(g.nsa).padStart(6, '0');
  const resumo = `${g.nomeArquivo} · ${g.qtdBoletos} boleto(s) · total "Até Venc." ${brl(g.total)} · ${g.linhas.length} linhas de 240 caracteres · NSA ${nsa6}`;
  const semSha = !g.sha ? `Não deu para calcular o SHA-256 do .RET (${g.erroSha || 'erro desconhecido'}).` :
                 !dda.sha256 ? `Não deu para calcular o SHA-256 do DDA (${dda.erroSha || 'erro desconhecido'}).` : '';
  const veredito = g.liberado
    ? { tipo:'ok', titulo: (g.teste ? 'Arquivo de teste' : 'Arquivo completo') + ' conferido: download liberado', texto: resumo }
    : { tipo:'alerta', titulo:'Download BLOQUEADO', texto: (g.prova.ok ? semSha : 'O arquivo lido de volta não passou em todos os itens abaixo. Nada foi baixado e o NSA não foi gasto.') + ' ' + resumo };
  const itens = g.prova.itens.map(i => ({ tipo: i.ok ? 'ok' : 'alerta', titulo: i.titulo, texto: i.texto, itens: i.itens }));
  const linhaSha = (rotulo, valor) => criaCom('p', 'sha-linha', [cria('span', 'sha-rotulo', rotulo), cria('span', 'mono sha-valor', valor || '—')]);
  const filhos = [
    ...checagensDom([veredito]),
    criaCom('div', 'checagens', checagensDom(itens)),
    criaCom('div', 'sha-caixa', [
      cria('p', 'sha-titulo', 'SHA-256 (impressão digital: qualquer alteração no arquivo muda este número)'),
      linhaSha(`.RET (${g.nomeArquivo})`, g.sha),
      linhaSha(`DDA de origem (${dda.nome})`, dda.sha256),
    ]),
  ];
  if(g.liberado){
    const baixarRet = cria('button', 'botao botao-principal', g.baixado ? '✓ .RET baixado' : 'Baixar .RET');
    const baixarExcel = cria('button', 'botao', 'Baixar Excel de conferência');
    baixarRet.type = baixarExcel.type = 'button';
    baixarRet.id = 'retBaixarRet'; baixarExcel.id = 'retBaixarExcel';
    baixarRet.disabled = g.baixado;
    baixarRet.addEventListener('click', baixaRetGerado);
    baixarExcel.addEventListener('click', baixaExcelRet);
    filhos.push(criaCom('div', 'acoes', [baixarRet, baixarExcel]),
      cria('p', 'lista-novos-texto', `Baixar o .RET marca o NSA ${nsa6} como usado neste computador. Guarde o Excel de conferência: a aba Controle tem os dois SHA-256.`));
  }
  const aviso = cria('div', 'mensagem'); aviso.id = 'retBaixarAviso'; aviso.setAttribute('role', 'status'); aviso.hidden = true;
  filhos.push(aviso, cria('pre', 'arquivo-gerado-previa mono', g.linhas.join('\n')));
  elRet('retGerado').replaceChildren(criaCom('div', 'arquivo-gerado', filhos));
}

// Baixa o .RET: confere de novo que o NSA não foi usado (outra aba pode ter baixado) e que os
// bytes são os mesmos do SHA-256 mostrado, marca o NSA como usado e só então baixa.
// Se não der para marcar o NSA, NÃO baixa (o número poderia se repetir).
async function baixaRetGerado(){
  const g = telaRet.gerado;
  if(!g || !g.liberado || g.baixado) return;
  const botao = elRet('retBaixarRet'), aviso = elRet('retBaixarAviso');
  botao.disabled = true;
  const nsa = checaNsa(String(g.nsa), await lerControleNsa());
  if(telaRet.gerado !== g) return;
  if(!nsa.ok){ mostraMensagem(aviso, 'alerta', nsa.motivo + ' Gere o arquivo de novo com outro NSA.'); return; }
  if(await sha256Hex(g.bytes) !== g.sha){ mostraMensagem(aviso, 'alerta', 'O arquivo na memória não tem mais o SHA-256 mostrado: gere de novo.'); return; }
  const gravado = await gravarNsaUsado(g.nsa);
  if(!gravado){
    mostraMensagem(aviso, 'alerta', 'Não consegui marcar o NSA como usado neste navegador: download bloqueado (o NSA poderia se repetir).');
    botao.disabled = false;
    return;
  }
  telaRet.controleNsa = gravado;
  baixaArquivo(g.bytes, g.nomeArquivo, 'application/octet-stream');
  g.baixado = true;
  botao.textContent = '✓ .RET baixado';
  elRet('retNsa').value = String(proximoNsa(gravado));
  atualizaGerarRet();
  mostraMensagem(aviso, 'ok', `${g.nomeArquivo} baixado. NSA ${String(g.nsa).padStart(6, '0')} marcado como usado; o próximo sugerido é ${proximoNsa(gravado)}.`);
  // histórico: um registro por .RET baixado, só com as quantidades (nada do arquivo)
  registraUso({ tela: 'dda-ret', banco: 'itau', empresa: g.empresa, abas: {
    noArquivo: g.qtdBoletos,
    fora: telaRet.travas ? telaRet.travas.fora.length : 0,
    atencao: telaRet.alertas && telaRet.alertas.atencao ? telaRet.alertas.atencao.length : 0,
  }});
}

// Baixa o Excel de conferência (4 abas), depois de lê-lo de volta (excelRetConferido).
async function baixaExcelRet(){
  const g = telaRet.gerado;
  if(!g || !g.liberado) return;
  const aviso = elRet('retBaixarAviso');
  const abas = abasExcelRet({ gerado: g, travas: telaRet.travas, alertas: telaRet.alertas, empresa: g.empresa, nsa: g.nsa,
                              agora: g.agora, shaRet: g.sha, dda: { nome: telaRet.dda.nome, sha256: telaRet.dda.sha256 }, leitura: telaRet.leitura });
  const r = await excelRetConferido(abas);
  if(telaRet.gerado !== g) return;
  if(r.erros){ mostraMensagem(aviso, 'alerta', 'O Excel lido de volta não bate com a tela; download bloqueado: ' + r.erros.slice(0, 3).join(' · ')); return; }
  baixaArquivo(r.conteudo, g.nomeArquivo.replace(/\.RET$/, '_CONFERENCIA.xlsx'));
}

// Liga o seletor, as duas caixas e o botão Recomeçar, e lê a memória de fornecedores.
// Chamada uma vez pelo js/app.js.
function iniciaTelaRet(){
  preencheEmpresasRet();
  telaRet.memoria = memoriaVazia();
  lerMemoriaFornecedores().then(m => { telaRet.memoria = m; mostraResumoMemoriaRet(); mostraAlertasRet(); });
  elRet('retNsa').addEventListener('input', () => { limpaGeradoRet(); atualizaGerarRet(); });
  elRet('retGerarTeste').addEventListener('click', () => gerarRet(true));
  elRet('retGerarCompleto').addEventListener('click', () => gerarRet(false));
  lerControleNsa().then(c => {
    telaRet.controleNsa = c;
    if(!elRet('retNsa').value) elRet('retNsa').value = String(proximoNsa(c));
    atualizaGerarRet();
  });
  elRet('retEmpresa').addEventListener('change', trocaEmpresaRet);
  ligaCaixaEnvio(elRet('retCaixaModelo'), recebeModeloRet);
  ligaCaixaEnvio(elRet('retCaixaDda'), recebeDdaRet);
  elRet('retNova').addEventListener('click', () => { elRet('retEmpresa').value = ''; telaRet.empresa = null; esvaziaRet(); });
  esvaziaRet();
}
