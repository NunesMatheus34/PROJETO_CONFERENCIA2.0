/* =====================================================================
   DDA → .RET: REGRAS
   Transforma o DDA do Itaú (Excel ou PDF) num .RET CNAB 240 de DDA para
   o sistema importar os boletos. Estes dados vão PAGAR fornecedores:
   aqui nada é criado, digitado ou corrigido. O site só copia o que veio
   do banco, confere e bloqueia o que não fechar.
   Sub-etapa 1 (entradas): a empresa vem do seletor (só CRV Matriz e CRV
   Filial, que têm Itaú); o CNPJ dela tem que existir num header de lote
   do modelo .RET; o DDA tem que ser do Itaú (Excel da conta da empresa
   escolhida, ou PDF "Boletos Recebidos (DDA)", que não traz o CNPJ).
   Sub-etapa 2 (leitura): lê os boletos do Excel ou do PDF e confere a
   contagem (nenhum boleto pode sumir); se não fechar, bloqueia.
   Só regras: a tela fica em js/telas/dda-ret.js.
   Precisa de js/empresas.js, js/leitura/ret.js, js/bancos/itau.js,
   js/conferencias/dda.js (checaDda) e js/conferencias/boletos.js (empresasBoletos).
   ===================================================================== */

// Empresas que podem gerar o .RET: as que têm conta no Itaú (as mesmas da Conferência de boletos).
function empresasRet(){
  return empresasBoletos();
}

// CNPJ da empresa como fica no .RET: 15 dígitos, com zero à esquerda (03.937.452/0001-92 -> 003937452000192).
function cnpjDaEmpresaNoRet(empresa){
  return apenasDigitos(empresa.cnpj).padStart(15, '0');
}

// O header de lote do modelo .RET que é da empresa escolhida (CNPJ nas posições 19-33).
// Devolve { lote } ou { bloqueio } quando o modelo não tem lote desse CNPJ: sem ele o
// arquivo sairia com o lote de outra empresa, e os boletos cairiam na empresa errada.
function loteDaEmpresa(modelo, empresa){
  const cnpj = cnpjDaEmpresaNoRet(empresa);
  const lote = modelo.lotes.find(l => l.cnpj === cnpj);
  if(lote) return { lote };
  const tem = modelo.lotes.map(l => cnpjDoRetFormatado(l.cnpj)).join(', ');
  return { bloqueio:`O modelo .RET não tem lote da ${empresa.nome} (${empresa.cnpj}). ` +
                    `CNPJs no modelo: ${tem}. Use um .RET de DDA desta empresa como modelo.` };
}

// Confere o DDA enviado contra a empresa escolhida.
// dda = { tipo:'excel', matriz } (de lerMatrizComTexto) ou { tipo:'pdf', pdf } (de lerPalavrasPdf).
// Excel: tem que ser do Itaú e da conta (CNPJ do topo) da empresa: mesmas travas da
// Conferência DDA (checaDda); e, só aqui, Excel SEM o CNPJ no topo também bloqueia (na
// Conferência DDA é só aviso), porque o lote do .RET diz em que empresa os boletos entram. PDF: tem que ser o "Boletos Recebidos (DDA)"; ele não
// traz o CNPJ, então vale a empresa do seletor (e o aviso diz isso).
// Devolve { bloqueio, aviso, descricao }: descricao = o que foi reconhecido, para mostrar.
function checaDdaRet(empresa, dda){
  if(dda.tipo === 'pdf'){
    const pdf = reconhecePdfItau(dda.pdf);
    if(pdf.erro) return { bloqueio: pdf.erro, aviso:'', descricao:'' };
    return { bloqueio:'', descricao:`PDF do Itaú, ${dda.pdf.paginas} página(s), ${pdf.total} boleto(s) segundo o próprio PDF` +
               (pdf.emitido ? `, emitido em ${pdf.emitido}` : '') + '.',
             aviso:`O PDF não traz o CNPJ da conta: o arquivo vai sair no lote da ${empresa.nome}, escolhida no seletor. Confira se o PDF é desta empresa.` };
  }
  const trava = checaDda('itau', empresa, dda.matriz);
  if(!trava.bloqueio && !cnpjDaContaDda(dda.matriz))
    return { bloqueio:'Não achei o CNPJ da conta no topo do Excel do Itaú (linha "CPF/CNPJ:"). Sem ele não dá para garantir que o DDA é da ' +
                      `${empresa.nome}. Baixe de novo o Excel "Boletos Recebidos" do internet banking, sem apagar as linhas do topo.`, aviso:'', descricao:'' };
  const consulta = dataHoraConsultaItau(dda.matriz);
  return { ...trava, descricao: trava.bloqueio ? '' : 'Excel do Itaú da conta ' + empresa.cnpj + (consulta ? `, consulta de ${consulta}` : '') + '.' };
}

// As checagens das entradas, na ordem da tela: modelo, empresa no modelo e DDA.
// Cada uma { tipo:'ok'|'aviso'|'alerta', titulo, texto } (desenhadas por checagensDom).
// pronto = true só quando nada bloqueia (empresa, modelo e DDA presentes e aprovados).
function checagensEntradasRet({ empresa, modelo, dda }){
  const lista = [];
  if(modelo){
    if(modelo.erro) lista.push({ tipo:'alerta', titulo:'Modelo .RET recusado', texto: modelo.erro });
    else {
      lista.push({ tipo:'ok', titulo:'Modelo .RET do Itaú', texto:
        `${modelo.qtdLinhas} linhas, ${modelo.qtdBoletos} boleto(s), gerado pelo banco em ${modelo.data || 'data não informada'}${modelo.hora ? ' às ' + modelo.hora : ''}, NSA ${modelo.nsa}. ` +
        `Lotes: ${modelo.lotes.map(l => cnpjDoRetFormatado(l.cnpj)).join(', ')}. Só o header de arquivo e o header de lote são copiados.` });
      if(empresa){
        const r = loteDaEmpresa(modelo, empresa);
        lista.push(r.bloqueio ? { tipo:'alerta', titulo:'Empresa fora do modelo', texto: r.bloqueio }
                              : { tipo:'ok', titulo:'Empresa no modelo', texto:`O modelo tem o lote da ${empresa.nome} (${empresa.cnpj}).` });
      }
    }
  }
  if(dda && empresa){
    if(dda.erro) lista.push({ tipo:'alerta', titulo:'DDA recusado', texto: dda.erro });
    else {
      const r = checaDdaRet(empresa, dda);
      if(r.bloqueio) lista.push({ tipo:'alerta', titulo:'DDA recusado', texto: r.bloqueio });
      else {
        lista.push({ tipo:'ok', titulo:'DDA do Itaú', texto: r.descricao });
        if(r.aviso) lista.push({ tipo:'aviso', titulo:'Confira a empresa', texto: r.aviso });
      }
    }
  }
  const pronto = !!(empresa && modelo && dda) && !lista.some(c => c.tipo === 'alerta');
  return { lista, pronto };
}

/* ---------------------------------------------------------------------
   Sub-etapa 2: LEITURA DOS BOLETOS, SEM ALTERAR NADA
   Excel pelo leitor que já existia (leitorItau, código SEMPRE pelo texto
   da célula); PDF pelo leitorItauPdf (colunas pela posição do cabeçalho
   de cada página). Antes de qualquer coisa, a CONTAGEM: nenhum boleto
   pode sumir na leitura. Se a contagem não fechar, a geração fica
   bloqueada e a tela diz onde (páginas do PDF ou linhas do Excel).
   --------------------------------------------------------------------- */

// Linhas de boleto do Excel do Itaú que a leitura deixou de fora: depois do cabeçalho,
// linha com beneficiário, CPF/CNPJ ou código de barras mas sem "Até Venc." legível.
// Devolve os números das linhas no Excel (para mostrar).
function linhasExcelSemLeitura(leitura){
  const m = leitura.matriz;
  const cab = achaCabecalhoItau(m);
  if(cab < 0) return [];
  const c = colunasItau(m[cab]);
  const tem = v => v !== null && v !== undefined && String(v).trim() !== '';
  const fora = [];
  for(let i = cab + 1; i < m.length; i++){
    const l = m[i] || [];
    if((tem(l[c.benef]) || tem(l[c.cnpj]) || tem(l[c.codigo])) && paraNumero(l[c.ateVenc]) === null) fora.push(leitura.linhaExcel(i));
  }
  return fora;
}

// Lê os boletos do DDA (dda = { tipo:'excel', matriz, textoDe, linhaExcel } ou { tipo:'pdf', pdf })
// e confere a contagem. Devolve { boletos, total, contagem: { ok, texto, onde: [...] }, observacoes }:
//   PDF: ok só se o número lido = "NNN boleto(s) recebidos" do topo E cada página fecha a
//        própria conta (um valor e duas metades de código por CNPJ); onde = páginas com diferença.
//   Excel: ok só se nenhuma linha com dado de boleto ficou sem leitura; onde = linhas do Excel.
//   observacoes = avisos do que o PDF não consegue trazer igual ao banco (observacoesPdfRet).
function leituraDdaRet(dda){
  if(dda.tipo === 'pdf'){
    const declarado = reconhecePdfItau(dda.pdf).total;
    const { boletos, paginas } = leitorItauPdf(dda.pdf);
    const ruins = paginas.filter(p => p.problema);
    const onde = ruins.map(p => `Página ${p.pagina}: ${p.problema}.`);
    const bate = boletos.length === declarado;
    if(!bate) onde.unshift(`O PDF diz ${declarado} boleto(s) recebidos, mas foram lidos ${boletos.length}.`);
    const ok = bate && !ruins.length;
    return { boletos, total: somaAteVenc(boletos), contagem: { ok, onde,
      texto: ok ? `${boletos.length} boleto(s) lidos, igual ao que o PDF diz ("${declarado} boleto(s) recebidos"), e todas as ${paginas.length} páginas fecham.`
                : 'A contagem do PDF não fecha: a geração do .RET fica bloqueada. Baixe o PDF de novo ou use o Excel.' },
      observacoes: observacoesPdfRet(boletos) };
  }
  const boletos = leitorItau(dda);
  const fora = linhasExcelSemLeitura(dda);
  const ok = fora.length === 0 && boletos.length > 0;
  return { boletos, total: somaAteVenc(boletos), observacoes: [], contagem: { ok,
    onde: fora.length ? [`Linha(s) do Excel com boleto mas sem "Até Venc." legível: ${fora.join(', ')}.`] : [],
    texto: ok ? `${boletos.length} boleto(s) lidos do Excel; nenhuma linha de boleto ficou de fora.`
         : boletos.length ? 'Há linhas de boleto que não puderam ser lidas: a geração do .RET fica bloqueada.'
                          : 'Não encontrei boletos no Excel (coluna "Até Venc." vazia).' } };
}

// Avisos da leitura pelo PDF (amarelos, não bloqueiam), cada um { titulo, texto, itens }:
// o geral (espaços repetidos perdidos; Excel recomendado) e a lista dos boletos com o
// Nº Doc. em mais de uma linha (página e beneficiário), para a pessoa conferir: a quebra
// é juntada sem espaço, e o PDF não diz se ali havia espaço ou não.
function observacoesPdfRet(boletos){
  const item = b => `Página ${b.pagina}: ${b.beneficiario} (Nº Doc. "${b.doc}")`;
  const docs = boletos.filter(b => b.linhasDoc > 1);
  const lista = [{ titulo:'Leitura pelo PDF', itens: [], texto:
    'O PDF não mostra espaços repetidos (um Nº Doc. do banco com dois espaços seguidos aparece com um só) e eles não são recuperados. ' +
    'Quebras de linha do Nº Doc. são juntadas sem espaço, e as do nome com um espaço. Código, CNPJ, vencimento e valores não mudam. O recomendado é usar o Excel.' }];
  if(docs.length) lista.push({ titulo:`Nº Doc. em mais de uma linha: ${docs.length} boleto(s)`, itens: docs.map(item),
    texto:'Confira o Nº Doc. destes boletos: as linhas foram juntadas sem espaço, e o documento do banco pode ter um espaço ali.' });
  return lista;
}

// Soma do "Até Venc." em centavos inteiros (sem erro de arredondamento), devolvida em reais.
function somaAteVenc(boletos){
  return boletos.reduce((s, b) => s + Math.round((b.valor || 0) * 100), 0) / 100;
}
