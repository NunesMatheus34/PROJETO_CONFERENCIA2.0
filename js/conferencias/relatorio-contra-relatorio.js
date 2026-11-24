/* =====================================================================
   CÓDIGO DE BARRAS — RELATÓRIO CONTRA RELATÓRIO (novo)
   Procura títulos que podem ser pagos DUAS VEZES, um em cada empresa:
   o mesmo fornecedor com o mesmo valor lançado no relatório de duas
   empresas diferentes (ex.: CRV Matriz e CRV Filial).
   Casa quando o NOME do fornecedor é o mesmo (palavra forte em comum,
   regra de js/conferencias/nomes.js, ou o nome inteiro igual) E o VALOR
   é igual ao centavo. O vencimento NÃO impede: só aparece como informação.
   ANTES de casar, tira os títulos que são a MESMA LINHA nos dois relatórios
   (mesmo código do fornecedor, NF/título, desdobramento, valor e vencimento):
   acontece quando o relatório de uma empresa traz também as linhas da outra
   (ex.: "Empresa(s): 1 / 4"). Isso não é duplicidade: vai para a aba
   "Mesma linha nos dois relatórios", só com a contagem e a lista.
   Títulos que casam entre si formam um GRUPO (todos os candidatos juntos);
   cada título fica em um grupo só. Se o mesmo código de barras aparece
   nas duas empresas, o grupo vai para "Mesmo boleto nas duas empresas".
   Aceita os dois relatórios do sistema: "Vencimento de Títulos" (sem código)
   e "Vencimento / Cód. Barras" (com a coluna Código de barras, lida como TEXTO).
   Nada aqui completa ou corrige código, valor ou vencimento.
   Precisa de js/leitura/formatos.js, js/leitura/planilha.js, js/empresas.js,
   js/boleto.js (validaEstrutura), js/conferencias/nomes.js e dda.js (limpaNome).
   ===================================================================== */

// Status desta conferência (mesmo nome e cor na tela, no Excel e na Ajuda).
const STATUS_RR = [
  { id:'mesmo', nome:'Mesmo boleto nas duas empresas', cor:'alerta',
    ajuda:'O mesmo código de barras foi lançado nas duas empresas. Só um pode ser pago: apague o lançamento da empresa errada.' },
  { id:'duplo', nome:'Mesmo fornecedor e valor',       cor:'aviso',
    ajuda:'O mesmo fornecedor, com o mesmo valor ao centavo, lançado nas duas empresas (o vencimento pode ser diferente). Confira se é a mesma nota antes de pagar.' },
  { id:'linha', nome:'Mesma linha nos dois relatórios', cor:'neutro', semTotal:true,
    ajuda:'O título aparece igual nos dois relatórios (mesmo código do fornecedor, NF, desdobramento, valor e vencimento): o relatório de uma empresa trouxe também as linhas da outra. Não é duplicidade; fica fora das outras abas.' },
];

// Lê os títulos de um relatório do sistema pelo cabeçalho (nas 15 primeiras linhas, a linha
// com uma célula começando por "Venc" e outra com "Saldo"). Colunas pelo nome:
//   nome = "Nome" (ou a coluna depois de "Cliente"), NF = "Título" ou "Duplicata",
//   código = a que tem "Código" e "Barra" (pode não existir),
//   código do fornecedor = "Código" ou "Cliente", desdobramento = "Desdobramento" ou "Des"
//   (estes dois só servem para achar a mesma linha nos dois relatórios; podem não existir).
// Entra toda linha com vencimento, nome e saldo numérico. leitura = lerMatrizComTexto.
// Devolve { titulos, erro }.
// Cada título: { venc, nome, nf, fornecedor, desd, valor, codigo, codigoIlegivel, linha }.
function extraiTitulosRelatorio(leitura){
  const m = leitura.matriz;
  const ehCab = l => (l || []).some(c => normaliza(c).startsWith('VENC')) && (l || []).some(c => normaliza(c).includes('SALDO'));
  const cab = m.slice(0, 15).findIndex(ehCab);
  if(cab < 0) return { titulos: [], erro: 'Não achei a linha de cabeçalho (com "Vencimento" e "Saldo"). Confira se é o relatório de títulos a pagar do sistema.' };
  const col = { venc:-1, nome:-1, nf:-1, barra:-1, saldo:-1, cliente:-1, fornecedor:-1, desd:-1 };
  m[cab].forEach((c, j) => {
    const n = normaliza(c);
    if(col.venc < 0 && n.startsWith('VENC')) col.venc = j;
    if(col.saldo < 0 && n.includes('SALDO')) col.saldo = j;
    if(col.nome < 0 && n === 'NOME') col.nome = j;
    if(col.cliente < 0 && n.includes('CLIENTE')) col.cliente = j;
    if(col.nf < 0 && (n === 'TITULO' || n.includes('DUPLICATA'))) col.nf = j;
    if(col.barra < 0 && n.includes('CODIGO') && n.includes('BARRA')) col.barra = j;
    if(col.fornecedor < 0 && n === 'CODIGO') col.fornecedor = j;
    if(col.desd < 0 && (n === 'DESDOBRAMENTO' || n === 'DES')) col.desd = j;
  });
  if(col.nome < 0 && col.cliente >= 0) col.nome = col.cliente + 1;
  if(col.fornecedor < 0 && col.cliente >= 0) col.fornecedor = col.cliente;
  const faltam = [['nome', 'Nome'], ['nf', 'Título/Duplicata']].filter(([k]) => col[k] < 0).map(([, n]) => n);
  if(faltam.length) return { titulos: [], erro: `Faltam as colunas ${faltam.join(' e ')} no cabeçalho do relatório.` };

  const titulos = [];
  for(let i = cab + 1; i < m.length; i++){
    const l = m[i] || [];
    const venc = formatData(l[col.venc]);
    const nome = l[col.nome] === null || l[col.nome] === undefined ? '' : String(l[col.nome]).trim();
    const valor = paraNumero(l[col.saldo]);
    if(!venc || !nome || valor === null) continue;
    let codigo = '', codigoIlegivel = false;
    if(col.barra >= 0){
      const cod = codigoBarrasDaCelula(leitura, i, col.barra);
      if(cod.suspeito) codigoIlegivel = true; else codigo = cod.digitos;
    }
    titulos.push({ venc, nome, nf: textoCelula(l, col.nf), fornecedor: textoCelula(l, col.fornecedor), desd: textoCelula(l, col.desd),
                   valor, codigo, codigoIlegivel, linha: leitura.linhaExcel(i) });
  }
  if(!titulos.length) return { titulos, erro: 'Não encontrei títulos no relatório (linhas com vencimento, nome e saldo).' };
  return { titulos, erro: '' };
}

// Texto de uma célula da linha, sem espaços nas pontas ('' se a coluna não existe ou está vazia).
function textoCelula(linha, j){
  if(j < 0) return '';
  const v = linha[j];
  return v === null || v === undefined ? '' : String(v).trim();
}

// Chave da "mesma linha": código do fornecedor, NF/título, desdobramento, valor em centavos
// e vencimento. Sem código do fornecedor ou sem NF não há chave ('').
function chaveMesmaLinha(t){
  if(!t.fornecedor || !t.nf) return '';
  return [t.fornecedor, t.nf, t.desd, Math.round(t.valor * 100), t.venc].join('|');
}

// Separa os títulos que são a MESMA LINHA nos dois relatórios, um a um (se a mesma
// linha aparece 2 vezes em A e 1 em B, só 1 par sai). Devolve
// { pares:[{ a, b }], restoA, restoB }: restoA/restoB seguem para o casamento.
function separaMesmaLinha(titulosA, titulosB){
  const livresB = new Map();
  titulosB.forEach(t => { const k = chaveMesmaLinha(t); if(!k) return; if(!livresB.has(k)) livresB.set(k, []); livresB.get(k).push(t); });
  const pares = [], restoA = [], usadosB = new Set();
  titulosA.forEach(t => {
    const lista = livresB.get(chaveMesmaLinha(t));
    if(lista && lista.length){ const b = lista.shift(); usadosB.add(b); pares.push({ a: t, b }); }
    else restoA.push(t);
  });
  return { pares, restoA, restoB: titulosB.filter(t => !usadosB.has(t)) };
}

// Confere o relatório de uma caixa: a empresa da 1ª linha (identificaEmpresa) tem que
// ser a escolhida na caixa e, na Rubi, o relatório não pode ser consolidado
// ("Empresa(s): 1 / 4 /", alertaRelatorioConsolidado). Devolve o texto do alerta ou ''.
function checaRelatorioCruzado(empresa, matriz){
  const consolidado = alertaRelatorioConsolidado(empresa, matriz);
  if(consolidado) return consolidado;
  const achada = identificaEmpresa(matriz);
  if(!achada) return 'Não reconheci a empresa deste relatório pela 1ª linha. Confira se é o relatório de títulos a pagar do sistema.';
  if(achada.id !== empresa.id) return `Este relatório é da ${achada.nome}, mas a empresa escolhida nesta caixa é ${empresa.nome}.`;
  return '';
}

// As duas caixas têm que ser de empresas DIFERENTES. Devolve o texto do alerta ou ''
// (vazio também quando alguma empresa ainda não foi escolhida).
function alertaEmpresasIguais(empresaA, empresaB){
  return empresaA && empresaB && empresaA.id === empresaB.id
    ? 'As duas caixas estão com a mesma empresa. Escolha duas empresas diferentes.' : '';
}

// Chave do código para comparar entre as empresas: o código de barras (44) quando o
// texto é um boleto íntegro (linha digitável e código de barras do mesmo boleto dão
// a mesma chave); senão os dígitos como vieram. Vazio = sem código.
function chaveCodigo(digitos){
  if(!digitos) return '';
  const e = validaEstrutura(digitos);
  return e.ok ? e.cb : digitos;
}

// Cruza os títulos da empresa A com os da B.
// Primeiro tira os pares que são a mesma linha nos dois relatórios (separaMesmaLinha).
// Depois liga A e B quando o valor é igual ao centavo e o nome é do mesmo fornecedor
// (palavra forte em comum ou nome inteiro igual). Os títulos ligados entre si formam
// um grupo (todos os candidatos juntos, cada título em um grupo só).
// Devolve { mesmo, duplo, linha }: listas de grupos { valor, a:[títulos], b:[títulos], codigosIguais:Set }.
// mesmo = grupos com o mesmo código de barras nos dois lados; linha = um grupo por par
// de mesma linha (um título de cada lado). Do maior valor para o menor.
function conferirRelatorios(titulosA, titulosB){
  const separados = separaMesmaLinha(titulosA, titulosB);
  const prepara = (t, lado, i) => ({ ...t, lado, id: lado + i, palavras: palavrasDoNome(t.nome), limpo: limpaNome(normaliza(t.nome)),
                                     centavos: Math.round(t.valor * 100), chave: t.codigoIlegivel ? '' : chaveCodigo(t.codigo) });
  const a = separados.restoA.map((t, i) => prepara(t, 'a', i));
  const b = separados.restoB.map((t, i) => prepara(t, 'b', i));
  const bPorValor = new Map();
  b.forEach(t => { if(!bPorValor.has(t.centavos)) bPorValor.set(t.centavos, []); bPorValor.get(t.centavos).push(t); });

  // grupos por "união": quem casa com alguém do grupo entra nele
  const pai = new Map();
  const raiz = id => { while(pai.get(id) !== id){ pai.set(id, pai.get(pai.get(id))); id = pai.get(id); } return id; };
  const une = (x, y) => { if(!pai.has(x)) pai.set(x, x); if(!pai.has(y)) pai.set(y, y); pai.set(raiz(x), raiz(y)); };
  a.forEach(ta => (bPorValor.get(ta.centavos) || []).forEach(tb => {
    const mesmoNome = (ta.limpo && ta.limpo === tb.limpo) || temPalavraEmComum(ta.palavras, tb.palavras);
    if(mesmoNome) une(ta.id, tb.id);
  }));

  const grupos = new Map();
  [...a, ...b].forEach(t => {
    if(!pai.has(t.id)) return;
    const r = raiz(t.id);
    if(!grupos.has(r)) grupos.set(r, { valor: t.valor, a: [], b: [], codigosIguais: new Set() });
    grupos.get(r)[t.lado].push(t);
  });
  const lista = [...grupos.values()];
  lista.forEach(g => {
    const chavesB = new Set(g.b.map(t => t.chave).filter(Boolean));
    g.a.forEach(t => { if(t.chave && chavesB.has(t.chave)) g.codigosIguais.add(t.chave); });
  });
  const ordena = l => l.sort((x, y) => y.valor - x.valor || x.a[0].nome.localeCompare(y.a[0].nome));
  ordena(lista);
  const linha = ordena(separados.pares.map(p => ({ valor: p.a.valor, a: [p.a], b: [p.b], codigosIguais: new Set(), mesmaLinha: true })));
  return { mesmo: lista.filter(g => g.codigosIguais.size), duplo: lista.filter(g => !g.codigosIguais.size), linha };
}

// Texto do código de um título para a tela e o Excel (sem código, ilegível ou os dígitos).
function textoCodigoRR(t){
  if(t.codigoIlegivel) return 'ilegível (o Excel gravou como número)';
  return t.codigo || '—';
}

// Linhas da tela: uma por grupo, com valor, textos para a busca e o aviso do mesmo boleto.
function linhasRelatorios(r){
  const linha = g => {
    const todos = [...g.a, ...g.b];
    const textos = todos.flatMap(t => [t.nome, t.nf, dataBR(t.venc), t.codigo]).concat(brl(g.valor));
    const digitos = todos.flatMap(t => [apenasDigitos(t.nf), t.codigo]).concat(centavos(g.valor));
    const vencimentos = new Set(todos.map(t => t.venc));
    return { grupo: g, valor: g.valor, mesmoBoleto: g.codigosIguais.size > 0, vencDiferente: vencimentos.size > 1,
             texto: normaliza(textos.join(' | ')), digitos: digitos.filter(Boolean).join('|') };
  };
  return { mesmo: r.mesmo.map(linha), duplo: r.duplo.map(linha), linha: r.linha.map(linha) };
}

// Texto do aviso de um grupo (igual na tela e no Excel).
function avisosGrupoRR(l){
  const avisos = [];
  if(l.grupo.mesmaLinha) return ['mesma linha nos dois relatórios'];
  if(l.mesmoBoleto) avisos.push('mesmo boleto lançado nas duas empresas');
  if(l.vencDiferente) avisos.push('vencimentos diferentes');
  if(l.grupo.a.length > 1 || l.grupo.b.length > 1) avisos.push('mais de um candidato');
  return avisos;
}

// Nomes do fornecedor num grupo, sem repetir (cada empresa pode ter escrito de um jeito).
function nomesDoGrupoRR(g){
  return [...new Set([...g.a, ...g.b].map(t => t.nome))];
}

// Textos de um campo ('nf', 'venc' ou 'codigo') dos títulos de uma empresa no grupo, na ordem.
function textosDoLadoRR(lista, campo){
  return lista.map(t => campo === 'codigo' ? textoCodigoRR(t) : campo === 'venc' ? dataBR(t.venc) : (t[campo] || '—'));
}

// Abas do Excel, iguais à tela (mesmas colunas, na mesma ordem): uma linha por grupo;
// quando há mais de um título de uma empresa no grupo, NF, vencimento e código ficam
// um embaixo do outro na mesma célula. empresaA/empresaB = da tabela EMPRESAS.
function abasExcelRelatorios(r, empresaA, empresaB){
  const real = 'R$ #,##0.00';
  const colunas = [
    { cab:'Fornecedor', w:40, quebra:true },
    { cab:`NF ${empresaA.nome}`, w:14, fmt:'@', quebra:true }, { cab:`Venc. ${empresaA.nome}`, w:14, quebra:true },
    { cab:`Código de barras ${empresaA.nome}`, w:50, fmt:'@', quebra:true },
    { cab:`NF ${empresaB.nome}`, w:14, fmt:'@', quebra:true }, { cab:`Venc. ${empresaB.nome}`, w:14, quebra:true },
    { cab:`Código de barras ${empresaB.nome}`, w:50, fmt:'@', quebra:true },
    { cab:'Avisos', w:40, quebra:true }, { cab:'Valor', w:16, fmt:real },
  ];
  const linhas = linhasRelatorios(r);
  const junta = (lista, campo) => textosDoLadoRR(lista, campo).join('\n');
  return STATUS_RR.map(st => ({
    nome: st.nome, titulo: `${st.nome} — ${empresaA.nome} × ${empresaB.nome}`, cor: st.cor, colunas,
    linhas: linhas[st.id].map(l => {
      const g = l.grupo;
      return [ nomesDoGrupoRR(g).join('\n'), junta(g.a, 'nf'), junta(g.a, 'venc'), junta(g.a, 'codigo'),
               junta(g.b, 'nf'), junta(g.b, 'venc'), junta(g.b, 'codigo'), avisosGrupoRR(l).join(' · '), g.valor ];
    }),
  }));
}
