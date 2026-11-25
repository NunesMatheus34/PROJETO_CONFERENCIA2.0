/* =====================================================================
   DDA → .RET: PROVA DE QUE O ARQUIVO NÃO FOI ALTERADO (sub-etapa 6)
   Leitor INDEPENDENTE do gerador (js/conferencias/gera-ret.js): parte dos
   BYTES do arquivo (o que vai ser baixado, ou o .RET que a pessoa enviou
   no "Verificar um .RET") e confere tudo de novo, sem usar nenhuma função
   que montou o arquivo:
     - estrutura: CRLF em todas as linhas (inclusive a última), 240
       caracteres ASCII, header de arquivo, lotes (header, G/H em sequência,
       trailer) e trailer de arquivo;
     - travas de cada boleto (as da sub-etapa 3 que o .RET permite refazer):
       44 dígitos, DV geral, valor do código = valor do G ao centavo, ida e
       volta pela linha digitável e CPF/CNPJ com DVs válidos;
     - totais: registros e soma de cada trailer de lote, lotes e linhas do
       trailer de arquivo;
     - cada boleto igual ao do DDA (código, CPF/CNPJ, vencimento e valor).
   Antes do download, qualquer item que falhe BLOQUEIA o download.
   Também o alerta de sacador/avalista com CNPJ diferente do beneficiário
   (H 18 diferente de "0" e H 19-33 diferente do G 63-77): só o .RET do
   banco traz isso; o DDA (Excel/PDF) não mostra.
   Posições contadas a partir de 1, como no manual.
   Só regras: as telas ficam em js/telas/dda-ret.js e js/telas/verifica-ret.js.
   Precisa de js/leitura/ret.js (campoCnab, TAMANHO_LINHA_CNAB, cnpjDoRetFormatado,
   dataDoRet), js/boleto.js (validaEstrutura, decodifica, soDigitos),
   js/cpf-cnpj.js (documentoSemPontuacao, cpfCnpjValido), js/leitura/formatos.js
   (formatData, brl, apenasDigitos), js/empresas.js (EMPRESAS) e, para o DDA do
   "Verificar", js/bancos/itau.js (reconhecePdfItau), js/bancos/detecta.js
   (cnpjDaContaDda) e js/conferencias/dda-ret.js (empresasRet, checaDdaRet, leituraDdaRet).
   ===================================================================== */

// Separa os bytes do .RET em linhas, EXIGINDO CRLF: cada linha termina em \r\n, inclusive
// a última. Devolve { linhas } ou { erro }. Os bytes viram caracteres um a um (latin1),
// para o tamanho da linha ser o número de bytes.
function linhasCrlfDoRet(bytes){
  const texto = new TextDecoder('latin1').decode(bytes);
  if(!texto) return { erro:'o arquivo está vazio' };
  if(!texto.endsWith('\r\n')) return { erro:'a última linha não termina em CRLF (quebra de linha do Windows)' };
  const linhas = texto.slice(0, -2).split('\r\n');
  const solta = linhas.findIndex(l => /[\r\n]/.test(l));
  if(solta >= 0) return { erro:`a linha ${solta + 1} tem quebra de linha sozinha (sem CRLF)`, linhas };
  return { linhas };
}

// Lê os campos de um segmento G (boleto) e do H que vem logo depois.
function camposGeHRet(g, h){
  const c = (l, a, b) => campoCnab(l, a, b);
  return {
    codigo: c(g, 18, 61), tipoDoc: c(g, 62, 62), doc15: c(g, 63, 77), nome: c(g, 78, 107).trim(),
    venc: dataDoRet(c(g, 108, 115)), vencBruto: c(g, 108, 115), valorCentavos: /^\d{15}$/.test(c(g, 116, 130)) ? Number(c(g, 116, 130)) : null,
    numDoc: c(g, 148, 157).trim(), movimento: c(g, 16, 17),
    sacador: h ? { tipo: c(h, 18, 18), doc15: c(h, 19, 33), nome: c(h, 34, 73).trim() } : null,
  };
}

// Lê a estrutura do .RET e confere linhas, registros, sequências e totais.
// Devolve { erros: [...], linhas, header, lotes: [{ numero, cnpj, header, boletos, trailer }], boletos }.
// boletos (de todos os lotes) = [{ lote, cnpjLote, seq, linhaG, g, h, ...camposGeHRet }].
// Não para no primeiro erro: junta tudo para a pessoa ver de uma vez (até 30 itens).
function leEstruturaRet(bytes){
  const erros = [];
  const erro = t => { if(erros.length < 30) erros.push(t); };
  const r = linhasCrlfDoRet(bytes);
  if(r.erro) erro(r.erro);
  const linhas = r.linhas || [];
  const vazio = { erros, linhas, header:null, lotes:[], boletos:[] };
  if(!linhas.length) return vazio;

  linhas.forEach((l, i) => {
    if(l.length !== TAMANHO_LINHA_CNAB) erro(`linha ${i + 1}: tem ${l.length} caracteres (o certo é 240)`);
    else if(!/^[\x20-\x7E]*$/.test(l)) erro(`linha ${i + 1}: tem caractere fora do ASCII (acento ou controle)`);
  });
  const tipo = l => campoCnab(l, 8, 8), lote = l => campoCnab(l, 4, 7);
  const header = linhas[0];
  if(campoCnab(header, 1, 3) !== '341' || tipo(header) !== '0' || lote(header) !== '0000') erro('linha 1: não é o header de arquivo do Itaú (341, lote 0000, registro 0)');
  linhas.forEach((l, i) => { if(campoCnab(l, 1, 3) !== '341') erro(`linha ${i + 1}: banco "${campoCnab(l, 1, 3)}" (o certo é 341)`); });

  const lotes = [], boletos = [];
  let i = 1;
  while(i < linhas.length && tipo(linhas[i]) === '1'){
    const numero = lotes.length + 1, num4 = String(numero).padStart(4, '0');
    const lt = { numero, cnpj: campoCnab(linhas[i], 19, 33), header: linhas[i], boletos: [], trailer: null };
    if(lote(linhas[i]) !== num4) erro(`linha ${i + 1}: header de lote com número ${lote(linhas[i])} (o certo é ${num4})`);
    i++;
    let seq = 1, soma = 0;
    while(i < linhas.length && tipo(linhas[i]) === '3'){
      const g = linhas[i], h = linhas[i + 1];
      if(lote(g) !== num4) erro(`linha ${i + 1}: detalhe com lote ${lote(g)} (o certo é ${num4})`);
      if(campoCnab(g, 14, 14) !== 'G'){ erro(`linha ${i + 1}: esperava um segmento G e veio "${campoCnab(g, 14, 14)}"`); i++; continue; }
      if(campoCnab(g, 9, 13) !== String(seq).padStart(5, '0')) erro(`linha ${i + 1}: sequencial ${campoCnab(g, 9, 13)} no G (o certo é ${String(seq).padStart(5, '0')})`);
      const temH = h && tipo(h) === '3' && campoCnab(h, 14, 14) === 'H';
      if(!temH) erro(`linha ${i + 1}: o G não tem um segmento H logo depois`);
      else {
        if(campoCnab(h, 9, 13) !== String(seq + 1).padStart(5, '0')) erro(`linha ${i + 2}: sequencial ${campoCnab(h, 9, 13)} no H (o certo é ${String(seq + 1).padStart(5, '0')}, o do G + 1)`);
        if(lote(h) !== num4) erro(`linha ${i + 2}: detalhe com lote ${lote(h)} (o certo é ${num4})`);
      }
      const b = { lote: numero, cnpjLote: lt.cnpj, seq, linhaG: i + 1, g, h: temH ? h : null, ...camposGeHRet(g, temH ? h : null) };
      if(b.valorCentavos === null) erro(`linha ${i + 1}: valor do G (116-130) não é um número de 15 dígitos`);
      else soma += b.valorCentavos;
      lt.boletos.push(b); boletos.push(b);
      seq += temH ? 2 : 1; i += temH ? 2 : 1;
    }
    const t = linhas[i];
    if(!t || tipo(t) !== '5'){ erro(`linha ${i + 1}: esperava o trailer do lote ${num4}`); lotes.push(lt); break; }
    lt.trailer = t;
    const registros = lt.boletos.length * 2 + 2;
    if(lote(t) !== num4) erro(`linha ${i + 1}: trailer de lote com número ${lote(t)} (o certo é ${num4})`);
    if(campoCnab(t, 18, 23) !== String(registros).padStart(6, '0')) erro(`linha ${i + 1}: o trailer do lote ${num4} diz ${campoCnab(t, 18, 23)} registros, e o lote tem ${registros}`);
    if(campoCnab(t, 24, 41) !== String(soma).padStart(18, '0')) erro(`linha ${i + 1}: o trailer do lote ${num4} diz soma ${campoCnab(t, 24, 41)} e os boletos somam ${String(soma).padStart(18, '0')} (centavos)`);
    lotes.push(lt);
    i++;
  }
  if(!lotes.length) erro('linha 2: não há header de lote');
  const ultima = linhas[linhas.length - 1];
  if(i !== linhas.length - 1) erro(`linha ${i + 1}: registro fora de ordem (depois dos lotes só pode vir o trailer de arquivo, na última linha)`);
  if(tipo(ultima) !== '9' || lote(ultima) !== '9999') erro(`linha ${linhas.length}: a última linha não é o trailer de arquivo (lote 9999, registro 9)`);
  else {
    if(campoCnab(ultima, 18, 23) !== String(lotes.length).padStart(6, '0')) erro(`trailer de arquivo: diz ${campoCnab(ultima, 18, 23)} lote(s), e o arquivo tem ${lotes.length}`);
    if(campoCnab(ultima, 24, 29) !== String(linhas.length).padStart(6, '0')) erro(`trailer de arquivo: diz ${campoCnab(ultima, 24, 29)} linhas, e o arquivo tem ${linhas.length}`);
  }
  return { erros, linhas, header, lotes, boletos };
}

// CPF/CNPJ do G (62 tipo, 63-77 com 15 dígitos) como documento: CPF = 11 últimos dígitos,
// CNPJ = 14 últimos; o que sobra à esquerda tem que ser zero. '' se o tipo ou os zeros não fecham.
function documentoDoG(b){
  if(!/^\d{15}$/.test(b.doc15)) return '';
  const tam = b.tipoDoc === '1' ? 11 : b.tipoDoc === '2' ? 14 : 0;
  if(!tam || /[^0]/.test(b.doc15.slice(0, 15 - tam))) return '';
  return b.doc15.slice(15 - tam);
}

// Refaz, num boleto lido do .RET, as travas da sub-etapa 3 que o arquivo permite:
// a) 44 dígitos, b) DV geral, d) valor do código = valor do G ao centavo, e) ida e volta pela
// linha digitável e f) CPF/CNPJ com DVs válidos. (c, o banco, só existe no DDA: é conferida na
// comparação com ele, pelo código inteiro.) Devolve { ok, motivos, avisos, linha }.
// Vencimento do código diferente do G 108-115 não bloqueia: vira aviso.
function travasBoletoDoRet(b){
  const motivos = [], avisos = [];
  let linha = '';
  if(!/^\d{44}$/.test(b.codigo)) motivos.push('o código de barras (G 18-61) não tem 44 dígitos');
  else {
    const e = validaEstrutura(b.codigo);
    if(!e.ok) motivos.push(e.motivo);
    else {
      linha = e.linha;
      const dec = decodifica(b.codigo);
      if(b.valorCentavos !== null && Math.round(dec.valor * 100) !== b.valorCentavos)
        motivos.push(`valor do código (${brl(dec.valor)}) diferente do valor do arquivo (${brl(b.valorCentavos / 100)})`);
      if(dec.venc !== b.venc) avisos.push(`vencimento do código (${dec.venc || 'sem vencimento'}) diferente do arquivo (${b.venc || b.vencBruto})`);
    }
  }
  const doc = documentoDoG(b);
  if(!doc) motivos.push(`CPF/CNPJ do beneficiário (G 62-77 "${b.tipoDoc}${b.doc15}") fora do padrão`);
  else if(!cpfCnpjValido(doc)) motivos.push(`CPF/CNPJ do beneficiário (${doc}) com dígito verificador inválido`);
  return { ok: motivos.length === 0, motivos, avisos, linha };
}

// Alerta de sacador/avalista: o H diz que há sacador (18 diferente de "0") com CPF/CNPJ
// (19-33) diferente do beneficiário (G 63-77). Devolve o texto do alerta ou ''.
// No .RET real de 23/11, 7 de 339 boletos tinham isso. O DDA (Excel/PDF) não mostra.
function alertaSacadorRet(b){
  if(!b.sacador || b.sacador.tipo === '0' || b.sacador.doc15 === b.doc15) return '';
  return `Boleto com outro sacador/avalista: ${cnpjDoRetFormatado(b.sacador.doc15)}${b.sacador.nome ? ' ' + b.sacador.nome : ''} ` +
         `(o beneficiário é ${cnpjDoRetFormatado(b.doc15)}). Confirme com o fornecedor antes de pagar.`;
}

// Chave de um boleto do DDA para comparar com o .RET: código (44), CPF/CNPJ com 15 dígitos,
// vencimento DDMMAAAA e valor em centavos.
function chaveDdaParaRet(b){
  return { codigo: soDigitos(b.codigoTexto) || '', doc15: documentoSemPontuacao(b.cnpj).padStart(15, '0'),
           venc: formatData(b.venc).replace(/\//g, ''), valorCentavos: Math.round((b.valor || 0) * 100) };
}

// Diferenças entre um boleto do .RET e o boleto do DDA com o mesmo código (lista de textos, vazia = igual).
function diferencasDoDda(b, d){
  const k = chaveDdaParaRet(d), dif = [];
  if(b.codigo !== k.codigo) dif.push('código de barras');
  if(b.doc15 !== k.doc15) dif.push(`CPF/CNPJ (arquivo ${b.doc15}, DDA ${k.doc15})`);
  if(b.vencBruto !== k.venc) dif.push(`vencimento (arquivo ${b.venc || b.vencBruto}, DDA ${d.venc})`);
  if(b.valorCentavos !== k.valorCentavos) dif.push(`valor (arquivo ${brl((b.valorCentavos || 0) / 100)}, DDA ${brl(d.valor)})`);
  return dif;
}

// Compara os boletos do .RET com os do DDA, pelo código de barras.
// Devolve { erros, semNoRet }: erros = boleto do .RET que não está no DDA ou que difere dele;
// semNoRet = boletos do DDA que não estão no .RET (reprovados nas travas, arquivo de teste...).
function comparaRetComDda(boletosRet, boletosDda){
  const porCodigo = new Map();
  boletosDda.forEach(d => { const k = soDigitos(d.codigoTexto) || ''; porCodigo.set(k, [...(porCodigo.get(k) || []), d]); });
  const erros = [], usados = new Set();
  boletosRet.forEach(b => {
    const achados = porCodigo.get(b.codigo) || [];
    if(!achados.length){ erros.push(`linha ${b.linhaG}: o código ${b.codigo} não está no DDA`); return; }
    const igual = achados.find(d => !diferencasDoDda(b, d).length);
    if(igual){ usados.add(igual); return; }
    erros.push(`linha ${b.linhaG}: diferente do DDA em ${diferencasDoDda(b, achados[0]).join(', ')}`);
    usados.add(achados[0]);
  });
  return { erros, semNoRet: boletosDda.filter(d => !usados.has(d)) };
}

/* ---------------------------------------------------------------------
   ANTES DO DOWNLOAD: a prova do arquivo gerado pelo site
   --------------------------------------------------------------------- */

// Confere os bytes do arquivo gerado ANTES de liberar o download.
// ctx = { modelo, empresa, nsa, boletos } (boletos = os do DDA que DEVERIAM estar no arquivo,
// na ordem). Devolve { ok, itens: [{ ok, titulo, texto, itens }] }: ok só se TODOS passarem.
function provaRetGerado(bytes, ctx){
  const e = leEstruturaRet(bytes);
  const itens = [];
  const item = (ok, titulo, texto, lista) => itens.push({ ok, titulo, texto, itens: lista || [] });
  item(!e.erros.length, 'Estrutura do arquivo', e.erros.length ? 'O arquivo lido de volta não fecha:' :
    `${e.linhas.length} linhas de 240 caracteres ASCII com CRLF; cada G tem o seu H com o sequencial seguinte; trailers de lote e de arquivo batem.`, e.erros);

  const cnpj = apenasDigitos(ctx.empresa.cnpj).padStart(15, '0');
  const loteModelo = (ctx.modelo.lotes.find(l => l.cnpj === cnpj) || {}).linha || '';
  const hm = ctx.modelo.headerArquivo || '';
  const errosCab = [];
  if(e.lotes.length !== 1) errosCab.push(`o arquivo tem ${e.lotes.length} lote(s) (o certo é 1)`);
  else if(e.lotes[0].cnpj !== cnpj) errosCab.push(`o lote é do CNPJ ${cnpjDoRetFormatado(e.lotes[0].cnpj)}, e a empresa escolhida é ${ctx.empresa.cnpj}`);
  if(e.header && (e.header.slice(0, 143) !== hm.slice(0, 143) || e.header.slice(163) !== hm.slice(163))) errosCab.push('o header de arquivo não é o do modelo (fora data, hora e NSA)');
  if(e.header && campoCnab(e.header, 158, 163) !== String(ctx.nsa).padStart(6, '0')) errosCab.push(`o NSA do header (${campoCnab(e.header, 158, 163)}) não é o escolhido (${ctx.nsa})`);
  if(e.lotes[0] && e.lotes[0].header !== loteModelo.slice(0, 3) + '0001' + loteModelo.slice(7)) errosCab.push('o header de lote não é o do modelo desta empresa');
  item(!errosCab.length, 'Empresa, headers e NSA', errosCab.length ? 'Os headers não conferem:' :
    `Lote da ${ctx.empresa.nome} (${ctx.empresa.cnpj}); headers iguais aos do modelo; NSA ${String(ctx.nsa).padStart(6, '0')}.`, errosCab);

  const reprovados = e.boletos.map(b => ({ b, t: travasBoletoDoRet(b) })).filter(x => !x.t.ok);
  item(!reprovados.length && e.boletos.length > 0, 'Travas de cada código', reprovados.length ? `${reprovados.length} boleto(s) do arquivo não passam nas travas:` :
    `Os ${e.boletos.length} códigos passam: 44 dígitos, DV geral, valor do código = valor do arquivo, ida e volta pela linha digitável, CPF/CNPJ válido.`,
    reprovados.map(x => `linha ${x.b.linhaG}: ${x.t.motivos.join('; ')}`));

  const esperados = ctx.boletos || [];
  const difs = [];
  if(e.boletos.length !== esperados.length) difs.push(`o arquivo tem ${e.boletos.length} boleto(s) e deveria ter ${esperados.length}`);
  e.boletos.forEach((b, k) => {
    const d = esperados[k];
    if(!d) return;
    const dif = diferencasDoDda(b, d);
    if(dif.length) difs.push(`linha ${b.linhaG} (${k + 1}º boleto): diferente do DDA em ${dif.join(', ')}`);
  });
  item(!difs.length, 'Cada boleto igual ao DDA', difs.length ? 'O arquivo não bate com o DDA:' :
    `Os ${e.boletos.length} boletos têm o mesmo código, CPF/CNPJ, vencimento e valor do DDA, na mesma ordem.`, difs);

  const comSacador = e.boletos.filter(b => b.h && campoCnab(b.h, 18, 73) !== '0' + '0'.repeat(15) + ' '.repeat(40));
  item(!comSacador.length, 'Sem desconto nem sacador', comSacador.length ? 'O H destes boletos não está vazio (18-73):' :
    'Nenhum H leva desconto nem sacador/avalista (18 "0", 19-33 zeros, 34-73 espaços).', comSacador.map(b => `linha ${b.linhaG + 1}`));

  return { ok: itens.every(i => i.ok), itens, qtd: e.boletos.length,
           total: e.boletos.reduce((s, b) => s + (b.valorCentavos || 0), 0) / 100 };
}

/* ---------------------------------------------------------------------
   "VERIFICAR UM .RET": um .RET qualquer (do site ou do banco)
   --------------------------------------------------------------------- */

// Empresa (de EMPRESAS) cujo CNPJ é o de um lote do .RET (15 dígitos), ou null.
function empresaDoLoteRet(cnpj15){
  return EMPRESAS.find(e => apenasDigitos(e.cnpj).padStart(15, '0') === cnpj15) || null;
}

// Refaz as conferências de um .RET enviado e, se houver, compara com o DDA de origem.
// dda (opcional) = { boletos, empresaCnpj (14 dígitos, só no Excel), tipo } já lido e aprovado.
// Devolve { ok, estrutura, itens (como na prova), boletos: [{ ...b, travas, sacador }],
//           alertas: [textos], semNoRet, qtd, total }.
// ok = estrutura, travas e (com DDA) a comparação sem nenhum erro.
function verificaRet(bytes, dda){
  const e = leEstruturaRet(bytes);
  const itens = [];
  const item = (tipo, titulo, texto, lista) => itens.push({ tipo, titulo, texto, itens: lista || [] });
  item(e.erros.length ? 'alerta' : 'ok', 'Estrutura do arquivo', e.erros.length ? 'O arquivo não fecha:' :
    `${e.linhas.length} linhas de 240 caracteres com CRLF, ${e.lotes.length} lote(s) (${e.lotes.map(l => cnpjDoRetFormatado(l.cnpj)).join(', ')}); ` +
    'cada G tem o seu H com o sequencial seguinte; registros e somas dos trailers batem.', e.erros);

  const boletos = e.boletos.map(b => ({ ...b, travas: travasBoletoDoRet(b), alertaSacador: alertaSacadorRet(b) }));
  const reprovados = boletos.filter(b => !b.travas.ok);
  item(reprovados.length || !boletos.length ? 'alerta' : 'ok', 'Travas de cada código', !boletos.length ? 'O arquivo não tem nenhum boleto (segmento G).' :
    reprovados.length ? `${reprovados.length} de ${boletos.length} boleto(s) não passam nas travas:` :
    `Os ${boletos.length} códigos passam: 44 dígitos, DV geral, valor do código = valor do arquivo, ida e volta pela linha digitável, CPF/CNPJ válido.`,
    reprovados.map(b => `linha ${b.linhaG}: ${b.nome} · ${b.travas.motivos.join('; ')}`));

  const vencDif = boletos.filter(b => b.travas.avisos.length);
  if(vencDif.length) item('aviso', `Vencimento do código diferente do arquivo: ${vencDif.length} boleto(s)`,
    'Não bloqueia, mas confira (boleto prorrogado?).', vencDif.map(b => `linha ${b.linhaG}: ${b.nome} · ${b.travas.avisos.join('; ')}`));

  const sacadores = boletos.filter(b => b.alertaSacador);
  item(sacadores.length ? 'aviso' : 'ok', sacadores.length ? `Sacador/avalista com CNPJ diferente do beneficiário: ${sacadores.length} boleto(s)` : 'Sacador/avalista',
    sacadores.length ? 'O boleto foi emitido com outro sacador/avalista (cedido ou intermediado). Confirme com o fornecedor antes de pagar.' :
    'Nenhum boleto com sacador/avalista diferente do beneficiário.',
    sacadores.map(b => `linha ${b.linhaG}: ${b.nome} (${cnpjDoRetFormatado(b.doc15)}) · sacador ${cnpjDoRetFormatado(b.sacador.doc15)} ${b.sacador.nome}`));

  let semNoRet = [], comparou = false;
  if(dda){
    let alvo = e.boletos;
    if(dda.empresaCnpj){
      const cnpj15 = dda.empresaCnpj.padStart(15, '0');
      alvo = e.boletos.filter(b => b.cnpjLote === cnpj15);
      if(!e.lotes.some(l => l.cnpj === cnpj15)){
        item('alerta', 'DDA de outra empresa', `O DDA é da conta ${cnpjDoRetFormatado(cnpj15)} e o .RET não tem lote desse CNPJ.`);
        alvo = null;
      }
    } else if(e.lotes.length > 1){
      item('alerta', 'Comparação com o DDA não feita', `O .RET tem ${e.lotes.length} lotes e o PDF não diz de que empresa é. Compare com o Excel do DDA, ou com um .RET de um lote só.`);
      alvo = null;
    }
    if(dda.contagem && !dda.contagem.ok) item('aviso', 'A contagem do DDA não fecha',
      'Algum boleto do DDA pode não ter sido lido: um boleto do .RET que "não está no DDA" pode ser só isso. ' + dda.contagem.texto, dda.contagem.onde);
    if(alvo){
      comparou = true;
      const c = comparaRetComDda(alvo, dda.boletos);
      semNoRet = c.semNoRet;
      item(c.erros.length ? 'alerta' : 'ok', 'Cada boleto igual ao DDA', c.erros.length ? `${c.erros.length} boleto(s) do .RET não batem com o DDA:` :
        `Os ${alvo.length} boletos do .RET${e.lotes.length > 1 ? ' (lote desta conta)' : ''} estão no DDA com o mesmo código, CPF/CNPJ, vencimento e valor.`, c.erros);
      if(semNoRet.length) item('aviso', `Boletos do DDA que não estão no .RET: ${semNoRet.length}`,
        'Normal no arquivo de teste e para os boletos que ficaram "Fora do arquivo". Confira se não falta nenhum que deveria estar.',
        semNoRet.map(d => `${d.beneficiario} · ${d.cnpj} · ${d.venc} · ${brl(d.valor)}`));
    }
  }
  const ok = !itens.some(i => i.tipo === 'alerta');
  return { ok, comparou, itens, boletos, semNoRet, qtd: boletos.length, lotes: e.lotes,
           total: boletos.reduce((s, b) => s + (b.valorCentavos || 0), 0) / 100 };
}

// Prepara o DDA de origem (opcional) do "Verificar um .RET" (dda = de leArquivoDdaRet).
// Tem que ser do Itaú: PDF "Boletos Recebidos (DDA)" ou Excel com o CNPJ da conta de uma
// empresa com Itaú (as mesmas travas da geração, checaDdaRet). Devolve { erro } ou
// { boletos, empresaCnpj (14 dígitos; '' no PDF), contagem } para verificaRet.
function ddaParaVerificacao(dda){
  if(dda.erro) return { erro: dda.erro };
  let empresaCnpj = '';
  if(dda.tipo === 'pdf'){
    const pdf = reconhecePdfItau(dda.pdf);
    if(pdf.erro) return { erro: pdf.erro };
  } else {
    empresaCnpj = cnpjDaContaDda(dda.matriz);
    const empresa = empresasRet().find(e => apenasDigitos(e.cnpj) === empresaCnpj);
    if(!empresa) return { erro: empresaCnpj ? `O Excel é da conta ${empresaCnpj}, que não é de uma empresa com Itaú.` :
                                              'Não achei o CNPJ da conta no topo do Excel do Itaú (linha "CPF/CNPJ:").' };
    const r = checaDdaRet(empresa, dda);
    if(r.bloqueio) return { erro: r.bloqueio };
  }
  const l = leituraDdaRet(dda);
  return { boletos: l.boletos, empresaCnpj, contagem: l.contagem };
}
