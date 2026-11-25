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
// páginas/linhas que não fecham), a observação do formato e a tabela só de leitura.
function mostraLeituraRet(pronto){
  telaRet.leitura = pronto ? leituraDdaRet(telaRet.dda) : null;
  const l = telaRet.leitura;
  elRet('retLeitura').hidden = !l;
  if(!l){ elRet('retContagem').replaceChildren(); elRet('retTabela').replaceChildren(); return; }
  const checagens = [{ tipo: l.contagem.ok ? 'ok' : 'alerta', titulo: l.contagem.ok ? 'Contagem dos boletos' : 'Contagem não fecha',
                       texto: l.contagem.texto, itens: l.contagem.onde }];
  l.observacoes.forEach(o => checagens.push({ tipo:'aviso', ...o }));
  elRet('retContagem').replaceChildren(...checagensDom(checagens));
  elRet('retInfo').textContent = `${l.boletos.length} boleto(s) lido(s) · total "Até Venc." ${brl(l.total)} · ` +
    'tabela só de leitura: os boletos ainda não foram conferidos (travas na próxima sub-etapa).';
  elRet('retTabela').replaceChildren(tabelaLeituraRet(l.boletos, l.total));
}

// Tabela só de leitura dos boletos lidos, na ordem do DDA, com o total no rodapé.
// Tudo por textContent (cria); o código aparece exatamente como veio no arquivo.
function tabelaLeituraRet(boletos, total){
  const cab = ['#', 'Beneficiário', 'CPF/CNPJ', 'Venc.', 'Nº Doc.', 'Até Venc.', 'A Pagar', 'Banco', 'Código de barras', 'Origem'];
  const num = new Set(['#', 'Até Venc.', 'A Pagar']);
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(t => cria('th', num.has(t) ? 'num' : '', t)))]));
  tabela.append(criaCom('tbody', '', boletos.map((b, i) => criaCom('tr', '', [
    cria('td', 'num', String(i + 1)), cria('td', '', b.beneficiario), cria('td', 'mono sem-quebra', b.cnpj),
    cria('td', 'mono sem-quebra', b.venc), cria('td', 'mono', b.doc), cria('td', 'num', brl(b.valor)),
    cria('td', 'num', brl(b.valorAPagar)), cria('td', 'mono', b.banco), cria('td', 'mono codigo', b.codigoTexto),
    cria('td', 'sem-quebra', b.pagina ? `página ${b.pagina}` : `linha ${b.linhaExcel}`),
  ]))));
  const pe = cria('tr');
  pe.append(cria('td', '', ''), cria('td', '', `${boletos.length} boleto(s)`));
  const totalTd = cria('td', 'num', brl(total)); totalTd.colSpan = 4;
  pe.append(totalTd, cria('td', '', '')); pe.lastChild.colSpan = 4;
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
