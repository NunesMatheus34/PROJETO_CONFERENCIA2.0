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
   Trocar a empresa NÃO apaga os arquivos: as checagens são refeitas com a
   empresa nova. Nada na tela é editável; dado de arquivo vai por textContent.
   ===================================================================== */

// Atalho para os elementos da tela.
const elRet = id => document.getElementById(id);

// Estado da tela: empresa escolhida, modelo lido, DDA lido.
// pedido: número da última leitura pedida por caixa (leitura antiga que termina depois é descartada).
const telaRet = { empresa:null, modelo:null, dda:null, pedido:{ modelo:0, dda:0 } };

// Põe no seletor só as empresas com Itaú (com "Escolha a empresa" no começo).
function preencheEmpresasRet(){
  const vazia = cria('option', '', 'Escolha a empresa'); vazia.value = '';
  elRet('retEmpresa').replaceChildren(vazia, ...empresasRet().map(e => {
    const o = cria('option', '', `${e.nome} (${e.cnpj})`); o.value = e.id; return o;
  }));
}

// Empresa trocada: com empresa, destrava as caixas (mantendo os arquivos já lidos);
// sem empresa, trava e esvazia as duas.
function trocaEmpresaRet(){
  telaRet.empresa = EMPRESAS.find(e => e.id === elRet('retEmpresa').value) || null;
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

// DDA escolhido: PDF pelo pdf.js, Excel pelo SheetJS (o tipo sai da extensão do arquivo).
async function recebeDdaRet(arquivo){
  const meu = ++telaRet.pedido.dda;
  telaRet.dda = null; mostraChecagensRet();
  let dda;
  try{
    if(/\.pdf$/i.test(arquivo.name)) dda = { tipo:'pdf', pdf: await lerPalavrasPdf(arquivo) };
    else if(/\.xlsx?$/i.test(arquivo.name)) dda = { tipo:'excel', ...(await lerMatrizComTexto(arquivo)) };
    else dda = { erro:'Envie o DDA em Excel (.xlsx ou .xls) ou em PDF.' };
  }catch(err){ dda = { erro:'Não consegui ler o arquivo: ' + (err.message || err) }; }
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
// boleto (sub-etapa 3), a lista vermelha "Fora do arquivo" e a tabela só de leitura.
function mostraLeituraRet(pronto){
  telaRet.leitura = pronto ? leituraDdaRet(telaRet.dda) : null;
  const l = telaRet.leitura;
  elRet('retLeitura').hidden = !l;
  telaRet.travas = l ? travasDdaRet(l.boletos) : null;
  if(!l){ ['retContagem', 'retTravas', 'retFora', 'retTabela'].forEach(id => elRet(id).replaceChildren()); return; }
  const checagens = [{ tipo: l.contagem.ok ? 'ok' : 'alerta', titulo: l.contagem.ok ? 'Contagem dos boletos' : 'Contagem não fecha',
                       texto: l.contagem.texto, itens: l.contagem.onde }];
  l.observacoes.forEach(o => checagens.push({ tipo:'aviso', ...o }));
  elRet('retContagem').replaceChildren(...checagensDom(checagens));
  const t = telaRet.travas;
  elRet('retTravas').replaceChildren(...checagensDom(checagensTravasRet(t)));
  elRet('retFora').replaceChildren(...(t.fora.length ? [listaForaRet(t)] : []));
  elRet('retInfo').textContent = `${l.boletos.length} boleto(s) lido(s) · total "Até Venc." ${brl(l.total)} · ` +
    `${t.noArquivo.length} no arquivo (${brl(t.totalNoArquivo)}) · ${t.fora.length} fora do arquivo (${brl(t.totalFora)}) · tabela só de leitura.`;
  elRet('retTabela').replaceChildren(tabelaLeituraRet(l.boletos, l.total, t));
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
    itens: t.comAviso.map(i => `${origemRet(i.boleto)}: ${i.boleto.beneficiario} · ${brl(i.boleto.valor)} · Venc. no DDA ${i.boleto.venc}, no código ${vencDoCodigoRet(i.boleto)}`) });
  return lista;
}

// Vencimento gravado no código (fator), só para mostrar no aviso ('sem vencimento' se o fator é 0000).
function vencDoCodigoRet(b){
  return decodifica(soDigitos(b.codigoTexto)).venc || 'sem vencimento';
}

// De onde o boleto veio no arquivo do banco: "página N" (PDF) ou "linha N" (Excel).
function origemRet(b){
  return b.pagina ? `página ${b.pagina}` : `linha ${b.linhaExcel}`;
}

// Lista vermelha "Fora do arquivo": uma linha por boleto reprovado, com TODOS os motivos.
function listaForaRet(t){
  const cab = ['Origem', 'Beneficiário', 'CPF/CNPJ', 'Venc.', 'Até Venc.', 'Código de barras (como veio)', 'Motivo'];
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(c => cria('th', c === 'Até Venc.' ? 'num' : '', c)))]));
  tabela.append(criaCom('tbody', '', t.fora.map(i => criaCom('tr', 'linha-alerta', [
    cria('td', 'sem-quebra', origemRet(i.boleto)), cria('td', '', i.boleto.beneficiario), cria('td', 'mono sem-quebra', i.boleto.cnpj),
    cria('td', 'mono sem-quebra', i.boleto.venc), cria('td', 'num', brl(i.boleto.valor)), cria('td', 'mono codigo', i.boleto.codigoTexto),
    criaCom('td', '', i.motivos.map(m => cria('span', 'motivo-fora', m))),
  ]))));
  return criaCom('div', 'lista-fora', [cria('h2', 'lista-fora-titulo', `Fora do arquivo (${t.fora.length})`),
    criaCom('div', 'tabela-caixa tabela-solta', [tabela])]);
}

// Tabela só de leitura dos boletos lidos, na ordem do DDA, com a situação de cada um
// (no arquivo / fora do arquivo, com o motivo) e o total no rodapé. Linha vermelha = fora;
// borda amarela = no arquivo com aviso. Tudo por textContent (cria); o código aparece
// exatamente como veio no arquivo.
function tabelaLeituraRet(boletos, total, travas){
  const cab = ['#', 'Situação', 'Beneficiário', 'CPF/CNPJ', 'Venc.', 'Nº Doc.', 'Até Venc.', 'A Pagar', 'Banco', 'Código de barras', 'Origem'];
  const num = new Set(['#', 'Até Venc.', 'A Pagar']);
  const situacao = new Map([...travas.noArquivo, ...travas.fora].map(i => [i.boleto, i]));
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(t => cria('th', num.has(t) ? 'num' : '', t)))]));
  tabela.append(criaCom('tbody', '', boletos.map((b, i) => {
    const s = situacao.get(b);
    const classe = !s.ok ? 'linha-alerta' : s.avisos.length ? 'linha-aviso' : '';
    return criaCom('tr', classe, [
      cria('td', 'num', String(i + 1)),
      cria('td', 'sem-quebra', s.ok ? (s.avisos.length ? '⚠ No arquivo' : '✓ No arquivo') : '✗ Fora do arquivo'),
      cria('td', '', b.beneficiario), cria('td', 'mono sem-quebra', b.cnpj),
      cria('td', 'mono sem-quebra', b.venc), cria('td', 'mono', b.doc), cria('td', 'num', brl(b.valor)),
      cria('td', 'num', brl(b.valorAPagar)), cria('td', 'mono', b.banco), cria('td', 'mono codigo', b.codigoTexto),
      cria('td', 'sem-quebra', origemRet(b)),
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

// Liga o seletor, as duas caixas e o botão Recomeçar. Chamada uma vez pelo js/app.js.
function iniciaTelaRet(){
  preencheEmpresasRet();
  elRet('retEmpresa').addEventListener('change', trocaEmpresaRet);
  ligaCaixaEnvio(elRet('retCaixaModelo'), recebeModeloRet);
  ligaCaixaEnvio(elRet('retCaixaDda'), recebeDdaRet);
  elRet('retNova').addEventListener('click', () => { elRet('retEmpresa').value = ''; telaRet.empresa = null; esvaziaRet(); });
  esvaziaRet();
}
