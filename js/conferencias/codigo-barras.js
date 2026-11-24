/* =====================================================================
   CÓDIGO DE BARRAS — UM RELATÓRIO
   Confere, num relatório do sistema com a coluna "Código de barras", se o
   valor gravado no código bate com o saldo lançado e se o mesmo código foi
   lançado em mais de um título.
   acharCabecalho, mapeiaColunas, extraiTitulos, achaDivergencias e
   achaDuplicados foram trazidas do projeto antigo SEM mudar a regra: os
   números têm que ser os de _referencia/NUMEROS.md (seção 3).
   Única diferença: o código de barras é lido como TEXTO da célula (cell.w
   ou string, por codigoBarrasDaCelula). Célula que o Excel gravou como
   número fica de fora e é listada como ilegível (o antigo pulava calado).
   Nada aqui completa ou corrige código, valor ou vencimento.
   Precisa de js/leitura/formatos.js e js/leitura/planilha.js.
   ===================================================================== */

// Status desta conferência, na ordem dos cartões e das abas. O mesmo nome e a mesma
// cor na tela, no Excel e na Ajuda. Um título pode estar em dois (Divergência e Duplicados).
const STATUS_CB = [
  { id:'ok',    nome:'Conferidos',           cor:'ok',
    ajuda:'Títulos em que o valor do código de barras bate com o saldo lançado.' },
  { id:'valor', nome:'Divergência de valor', cor:'aviso',
    ajuda:'O valor que está no código de barras é diferente do saldo lançado. Corrija o lançamento ou peça o boleto certo ao fornecedor.' },
  { id:'dup',   nome:'Duplicados',           cor:'alerta',
    ajuda:'O mesmo código de barras foi lançado em mais de um título. Risco de pagar duas vezes: apague o lançamento repetido.' },
];

// Valor gravado no código: os ÚLTIMOS 10 dígitos, em centavos (regra do antigo).
// Só esse pedaço de 10 dígitos vira número (cabe sem arredondar); o código continua texto.
function valorDoCodigoBarras(digitos){
  const ult10 = digitos.slice(-10);
  const n = Number(ult10);
  return (ult10 === '' || isNaN(n)) ? null : Math.round(n)/100;
}

// Procura a linha que tem, ao mesmo tempo, uma célula com "CÓDIGO DE BARRAS"
// (o subtítulo do relatório só tem "Cód. Barras" abreviado, então exigir a
// palavra completa "CODIGO" evita pegar essa linha errada) e uma com "SALDO".
// Devolve o índice da linha, ou -1.
function acharCabecalho(m){
  for(let i=0;i<m.length;i++){
    const linha = m[i] || [];
    let temCodBarras = false, temSaldo = false;
    linha.forEach(cel=>{
      const n = normaliza(cel);
      if(n.includes('CODIGO') && n.includes('BARRA')) temCodBarras = true;
      if(n.includes('SALDO')) temSaldo = true;
    });
    if(temCodBarras && temSaldo) return i;
  }
  return -1;
}

// Mapeia as colunas pelo texto do cabeçalho; usa posição fixa se não achar.
// O nome do fornecedor fica na coluna logo depois de "Cliente".
function mapeiaColunas(linhaCab){
  const cols = { venc:-1, cliente:-1, nome:-1, duplicata:-1, barra:-1, saldo:-1 };
  (linhaCab || []).forEach((cel,i)=>{
    const n = normaliza(cel);
    if(cols.barra<0      && n.includes('BARRA'))     cols.barra = i;
    if(cols.saldo<0      && n.includes('SALDO'))     cols.saldo = i;
    if(cols.venc<0       && n.includes('VENC'))      cols.venc = i;
    if(cols.duplicata<0  && n.includes('DUPLICATA')) cols.duplicata = i;
    if(cols.cliente<0    && n.includes('CLIENTE'))   cols.cliente = i;
  });
  cols.nome = cols.cliente>=0 ? cols.cliente+1 : -1;

  // posição fixa: A=Vencto, B=Cliente, C=Nome, D=Duplicata, K=Código de barras, L=Saldo
  if(cols.venc<0)       cols.venc = 0;
  if(cols.nome<0)       cols.nome = 2;
  if(cols.duplicata<0)  cols.duplicata = 3;
  if(cols.barra<0)      cols.barra = 10;
  if(cols.saldo<0)      cols.saldo = 11;
  return cols;
}

// Títulos com código de barras de 40+ dígitos e saldo numérico (regra do antigo).
// leitura = o que lerMatrizComTexto devolve: o código sai do TEXTO da célula.
// Devolve { titulos, ilegiveis }: ilegiveis = linhas com saldo cujo código o Excel gravou
// como número (não dá para confiar nos dígitos); elas não entram na conferência.
function extraiTitulos(leitura, cols, headerIdx){
  const m = leitura.matriz;
  const titulos = [], ilegiveis = [];
  for(let i=headerIdx+1; i<m.length; i++){
    const linha = m[i] || [];
    const saldo = paraNumero(linha[cols.saldo]);
    if(saldo===null) continue;
    const cod = codigoBarrasDaCelula(leitura, i, cols.barra);
    if(cod.suspeito){ ilegiveis.push({ linha: leitura.linhaExcel(i), nome: linha[cols.nome]!=null ? String(linha[cols.nome]).trim() : '' }); continue; }
    const digitos = cod.digitos;
    if(digitos.length<40) continue;
    titulos.push({
      venc: formatData(linha[cols.venc]),
      nome: linha[cols.nome]!=null ? String(linha[cols.nome]).trim() : '',
      duplicata: linha[cols.duplicata]!=null ? String(linha[cols.duplicata]).trim() : '',
      codigo: digitos,
      valorCodigo: valorDoCodigoBarras(digitos),
      saldo,
    });
  }
  return { titulos, ilegiveis };
}

// Títulos em que o valor do código é diferente do saldo (meio centavo ou mais),
// com a diferença (código − saldo), da maior diferença para a menor.
function achaDivergencias(titulos){
  return titulos
    .map(t => ({ ...t, diff: Math.round((t.valorCodigo - t.saldo)*100)/100 }))
    .filter(t => Math.abs(t.diff) >= 0.005)
    .sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// Grupos de títulos com o MESMO código de barras (2 ou mais), na ordem em que aparecem.
function achaDuplicados(titulos){
  const porCodigo = new Map();
  titulos.forEach(t => {
    if(!porCodigo.has(t.codigo)) porCodigo.set(t.codigo, []);
    porCodigo.get(t.codigo).push(t);
  });
  const grupos = [];
  porCodigo.forEach(lista => { if(lista.length>1) grupos.push(lista); });
  return grupos;
}

// Roda a conferência num relatório já lido (lerMatrizComTexto).
// Devolve { erro } ou { titulos, divergencias, duplicados, ilegiveis }.
// Cada título ganha idx (a posição dele), para a tela saber quem é quem.
function conferirCodigoBarras(leitura){
  const headerIdx = acharCabecalho(leitura.matriz);
  if(headerIdx<0) return { erro: 'Não encontrei a linha de cabeçalho (preciso de uma linha com "Código de Barras" e "Saldo" juntos).' };
  const cols = mapeiaColunas(leitura.matriz[headerIdx]);
  const { titulos, ilegiveis } = extraiTitulos(leitura, cols, headerIdx);
  if(!titulos.length && !ilegiveis.length) return { erro: 'Não encontrei títulos com código de barras válido (40+ dígitos) e saldo numérico.' };
  titulos.forEach((t, i) => { t.idx = i; });
  return { titulos, divergencias: achaDivergencias(titulos), duplicados: achaDuplicados(titulos), ilegiveis };
}

// Linhas de cada status para a tela: { ok, valor, dup }.
// Cada linha: { titulo, diff, dup (nº do grupo), valor (= saldo), texto e digitos para a busca }.
// Divergência de valor sai da maior diferença para a menor; Duplicados lado a lado, por grupo.
function linhasCodigoBarras(r){
  const divDoTitulo = new Map(r.divergencias.map(d => [d.idx, d]));
  const grupoDup = new Map();
  r.duplicados.forEach((lista, gi) => lista.forEach(t => grupoDup.set(t.idx, gi+1)));
  const linha = t => {
    const div = divDoTitulo.get(t.idx);
    const textos = [t.nome, t.duplicata, dataBR(t.venc), t.codigo, brl(t.saldo), brl(t.valorCodigo)];
    const digitos = [centavos(t.saldo), centavos(t.valorCodigo), apenasDigitos(t.duplicata), t.codigo];
    return { titulo:t, diff: div ? div.diff : null, dup: grupoDup.get(t.idx) || null, valor:t.saldo,
             texto: normaliza(textos.join(' | ')), digitos: digitos.filter(Boolean).join('|') };
  };
  return {
    ok:    r.titulos.filter(t => !divDoTitulo.has(t.idx)).map(linha),
    valor: r.divergencias.map(d => linha(r.titulos[d.idx])),
    dup:   r.duplicados.flat().map(linha),
  };
}

// Abas do Excel, como no antigo: Divergência de valor e Duplicados (Conferidos não vai).
// Nomes e cores iguais aos da tela (STATUS_CB). O código de barras vai como texto.
function abasExcelCodigoBarras(r){
  const st = id => STATUS_CB.find(s => s.id === id);
  const real = 'R$ #,##0.00';
  return [
    { nome: st('valor').nome, titulo: st('valor').nome + ' — Código de barras', cor: st('valor').cor,
      colunas: [ { cab:'Vencto.', w:14 }, { cab:'Nome', w:40 }, { cab:'Duplicata', w:16, fmt:'@' }, { cab:'Código de barras', w:50, fmt:'@' },
                 { cab:'Valor no código', w:18, fmt:real }, { cab:'Saldo lançado', w:18, fmt:real }, { cab:'Diferença', w:16, fmt:real } ],
      linhas: r.divergencias.map(t => [ t.venc, t.nome, t.duplicata, t.codigo, t.valorCodigo, t.saldo, t.diff ]) },
    { nome: st('dup').nome, titulo: st('dup').nome + ' — Código de barras', cor: st('dup').cor,
      colunas: [ { cab:'Grupo', w:10 }, { cab:'Vencto.', w:14 }, { cab:'Nome', w:40 }, { cab:'Duplicata', w:16, fmt:'@' },
                 { cab:'Código de barras', w:50, fmt:'@' }, { cab:'Saldo lançado', w:18, fmt:real } ],
      linhas: r.duplicados.flatMap((lista, gi) => lista.map(t => [ gi+1, t.venc, t.nome, t.duplicata, t.codigo, t.saldo ])) },
  ];
}
