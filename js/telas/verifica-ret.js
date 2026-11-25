/* =====================================================================
   TELA: VERIFICAR UM .RET (bloco no fim da tela DDA → .RET)
   A pessoa envia um .RET (gerado pelo site ou vindo do banco) e, se
   quiser, o DDA de origem. O site refaz todas as conferências (estrutura,
   travas de cada código, totais, sacador/avalista e, com o DDA, cada
   boleto igual ao DDA) e mostra o SHA-256 dos dois arquivos, para comparar
   com o da aba Controle do Excel de conferência: abrir e editar o .RET
   muda o SHA-256 e, quase sempre, quebra os DVs ou os totais.
   Só desenha: as regras ficam em js/conferencias/confere-ret.js
   (verificaRet, ddaParaVerificacao). Nada é editável; dado de arquivo vai
   por textContent. Os arquivos ficam só na memória desta tela.
   Precisa de js/telas/dda-ret.js (leArquivoDdaRet, elRet) e js/leitura/sha256.js.
   ===================================================================== */

// Estado do bloco: o .RET (nome, bytes, sha256) e o DDA lido (ou null).
// pedido: número da última leitura de cada caixa (leitura antiga que termina depois é descartada).
const telaVer = { ret:null, dda:null, pedido:{ ret:0, dda:0 } };

// .RET escolhido: guarda os bytes e o SHA-256 e refaz a verificação.
async function recebeRetVer(arquivo){
  const meu = ++telaVer.pedido.ret;
  telaVer.ret = null; mostraVerificacao();
  let ret;
  try{
    const bytes = await bytesDoArquivo(arquivo);
    ret = { nome: arquivo.name, bytes };
    try{ ret.sha256 = await sha256Hex(bytes); }catch(err){ ret.erroSha = err.message || String(err); }
  }catch(err){ ret = { nome: arquivo.name, erro:'Não consegui ler o arquivo: ' + (err.message || err) }; }
  if(meu !== telaVer.pedido.ret) return;
  telaVer.ret = ret;
  mostraVerificacao();
}

// DDA escolhido (opcional): lê como na geração (leArquivoDdaRet) e refaz a verificação.
async function recebeDdaVer(arquivo){
  const meu = ++telaVer.pedido.dda;
  telaVer.dda = null; mostraVerificacao();
  const dda = await leArquivoDdaRet(arquivo);
  if(meu !== telaVer.pedido.dda) return;
  telaVer.dda = dda;
  mostraVerificacao();
}

// CPF/CNPJ do G como 000.000.000-00 ou 00.000.000/0000-00 (os 15 dígitos se não fechar).
function documentoDoGFormatado(b){
  const d = documentoDoG(b);
  if(d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  if(d.length === 14) return cnpjDoRetFormatado('0' + d);
  return b.doc15;
}

// Refaz a verificação com o que já foi escolhido e desenha: SHA-256, veredito, checagens e
// a tabela só de leitura dos boletos do .RET. Sem .RET, a área fica vazia.
function mostraVerificacao(){
  const area = elRet('verResultado');
  const ret = telaVer.ret;
  if(!ret){ area.replaceChildren(); return; }
  if(ret.erro){ area.replaceChildren(...checagensDom([{ tipo:'alerta', titulo:'.RET não lido', texto: ret.erro }])); return; }

  const ddaPrep = telaVer.dda ? ddaParaVerificacao(telaVer.dda) : null;
  const r = verificaRet(ret.bytes, ddaPrep && !ddaPrep.erro ? ddaPrep : null);
  const checagens = [];
  if(ddaPrep && ddaPrep.erro) recusaCaixaEnvio(elRet('verCaixaDda'));
  if(ddaPrep && ddaPrep.erro) checagens.push({ tipo:'alerta', titulo:'DDA recusado: comparação não feita', texto: ddaPrep.erro });
  if(!ret.sha256) checagens.push({ tipo:'alerta', titulo:'SHA-256 não calculado', texto: ret.erroSha || 'erro desconhecido' });
  const ok = r.ok && !!ret.sha256 && !(ddaPrep && ddaPrep.erro);
  const lotes = r.lotes.map(l => { const e = empresaDoLoteRet(l.cnpj); return e ? e.nome : cnpjDoRetFormatado(l.cnpj); }).join(', ');
  const resumo = `${ret.nome} · ${r.qtd} boleto(s) · ${brl(r.total)} · lote(s): ${lotes || 'nenhum'}` +
    (r.comparou ? ' · comparado com o DDA' : telaVer.dda ? '' : ' · sem DDA para comparar (opcional)');
  const veredito = ok
    ? { tipo:'ok', titulo:'Nenhum sinal de alteração', texto: resumo + '. Compare o SHA-256 abaixo com o da aba Controle do Excel de conferência: tem que ser igual.' }
    : { tipo:'alerta', titulo:'NÃO importe este arquivo sem conferir', texto: resumo + '. Veja os itens em vermelho.' };
  const linhaSha = (rotulo, valor) => criaCom('p', 'sha-linha', [cria('span', 'sha-rotulo', rotulo), cria('span', 'mono sha-valor', valor || '—')]);
  const shas = [linhaSha(`.RET (${ret.nome})`, ret.sha256)];
  if(telaVer.dda && !telaVer.dda.erro) shas.push(linhaSha(`DDA (${telaVer.dda.nome})`, telaVer.dda.sha256));
  area.replaceChildren(
    ...checagensDom([veredito]),
    criaCom('div', 'sha-caixa', [cria('p', 'sha-titulo', 'SHA-256 (impressão digital: qualquer alteração no arquivo muda este número)'), ...shas]),
    criaCom('div', 'checagens', checagensDom([...checagens, ...r.itens])),
    r.boletos.length ? criaCom('div', 'tabela-caixa tabela-solta', [tabelaVerificacao(r, r.lotes.length > 1)]) : null,
  );
}

// Tabela só de leitura dos boletos do .RET: linha do arquivo, situação (travas e sacador),
// beneficiário, CPF/CNPJ, vencimento, valor, Nº Doc. e código. Coluna Lote só com mais de um.
function tabelaVerificacao(r, comLote){
  const cab = ['Linha', ...(comLote ? ['Lote'] : []), 'Situação', 'Beneficiário', 'CPF/CNPJ', 'Venc.', 'Valor', 'Nº Doc.', 'Código de barras'];
  const tabela = cria('table', 'tabela');
  tabela.append(criaCom('thead', '', [criaCom('tr', '', cab.map(c => cria('th', c === 'Valor' || c === 'Linha' ? 'num' : '', c)))]));
  tabela.append(criaCom('tbody', '', r.boletos.map(b => {
    const ok = b.travas.ok, atencao = b.alertaSacador || b.travas.avisos.length;
    const situacao = criaCom('td', 'sem-quebra', [cria('span', '', ok ? (atencao ? '⚠ Confere' : '✓ Confere') : '✗ Não passa'),
      ...b.travas.motivos.map(m => cria('span', 'sub', m)),
      b.alertaSacador ? cria('span', 'sub', `Sacador ${cnpjDoRetFormatado(b.sacador.doc15)}`) : null,
      ...b.travas.avisos.map(a => cria('span', 'sub', a))].filter(Boolean));
    return criaCom('tr', !ok ? 'linha-alerta' : atencao ? 'linha-aviso' : '', [
      cria('td', 'num', String(b.linhaG)),
      comLote ? cria('td', 'mono sem-quebra', cnpjDoRetFormatado(b.cnpjLote)) : null,
      situacao, cria('td', '', b.nome), cria('td', 'mono sem-quebra', documentoDoGFormatado(b)),
      cria('td', 'mono sem-quebra', b.venc || b.vencBruto), cria('td', 'num', brl((b.valorCentavos || 0) / 100)),
      cria('td', 'mono', b.numDoc), cria('td', 'mono codigo', b.codigo),
    ]);
  })));
  return tabela;
}

// Liga as duas caixas e o botão Limpar do bloco. Chamada uma vez pelo js/app.js.
function iniciaVerificacaoRet(){
  ligaCaixaEnvio(elRet('verCaixaRet'), recebeRetVer);
  ligaCaixaEnvio(elRet('verCaixaDda'), recebeDdaVer);
  elRet('verLimpar').addEventListener('click', () => {
    telaVer.pedido.ret++; telaVer.pedido.dda++;
    telaVer.ret = null; telaVer.dda = null;
    preparaCaixaEnvio(elRet('verCaixaRet'), false, 'Nenhum arquivo escolhido');
    preparaCaixaEnvio(elRet('verCaixaDda'), false, 'Nenhum arquivo escolhido (opcional)');
    mostraVerificacao();
  });
}
