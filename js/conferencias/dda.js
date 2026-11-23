/* =====================================================================
   CONFERÊNCIA DDA (Santander e Itaú)
   Regras para cruzar os boletos do DDA do banco com os títulos do
   relatório do sistema. A lógica (extraiSistema, conferir e o que vai em
   cada aba do Excel) foi trazida do projeto antigo SEM mudança: os números
   têm que ser os mesmos de _referencia/NUMEROS.md.
   Novo aqui: as travas antes de conferir (relatório de outra empresa,
   DDA de outro banco ou de outra conta).
   Nada aqui desenha tela: js/telas/conferencia-dda.js só mostra o resultado.
   Precisa de js/leitura/formatos.js, js/empresas.js e js/bancos/*.js.
   ===================================================================== */

/* ---------------------------------------------------------------------
   STATUS: nome, cor e explicação de cada aba. Os mesmos na tela, no Excel
   e na Ajuda. A ordem é a das abas.
   --------------------------------------------------------------------- */
const STATUS_DDA = [
  { id:'ok',    nome:'Conferidos',        cor:'ok',
    ajuda:'Boletos que bateram em tudo com o sistema: valor, nome do fornecedor e vencimento. Não precisa fazer nada.' },
  { id:'data',  nome:'Datas divergentes', cor:'aviso',
    ajuda:'O mesmo boleto (valor e nome batem), mas o vencimento no sistema é diferente do boleto. Acerte a data no sistema.' },
  { id:'nome',  nome:'Nome divergente',   cor:'confirmar',
    ajuda:'O valor bateu, mas o nome do fornecedor é diferente. Pode ser factoring (outra empresa cobrando no lugar do fornecedor). Confirme com o fornecedor antes de pagar.' },
  { id:'banco', nome:'Só no banco',       cor:'alerta',
    ajuda:'Boletos que estão no banco, mas não foram achados no sistema. Veja se falta lançar a nota. Se ninguém reconhecer o boleto, não pague.' },
  { id:'sis',   nome:'Só no sistema',     cor:'neutro',
    ajuda:'Títulos do sistema que não apareceram no banco. Pode ser conta de consumo, Pix, transferência ou boleto ainda não emitido.' },
];

/* ---------------------------------------------------------------------
   TRAVAS ANTES DE CONFERIR
   --------------------------------------------------------------------- */

// Confere se o relatório do sistema é da empresa escolhida (pela 1ª linha).
// Devolve '' quando está certo, ou o texto do alerta (e a conferência não roda).
function checaRelatorioDda(empresa, matrizSistema){
  const achada = identificaEmpresa(matrizSistema);
  if(!achada) return 'Não reconheci a empresa deste relatório pela 1ª linha. Confira se é o relatório de títulos a pagar do sistema.';
  if(achada.id !== empresa.id)
    return `Este relatório é da ${achada.nome}, mas a empresa escolhida é ${empresa.nome}. A conferência não foi feita.`;
  return '';
}

// Confere se o DDA é do banco escolhido e da conta (CNPJ) da empresa escolhida.
// Devolve { bloqueio, aviso }: bloqueio = texto do alerta que impede conferir;
// aviso = algo para olhar que não impede (ex.: DDA sem CNPJ no topo).
function checaDda(banco, empresa, matrizDda){
  const achado = detectaBanco(matrizDda);
  if(achado && achado !== banco) return { bloqueio: avisoBancoErrado(achado, banco), aviso:'' };
  if(!achado) return { bloqueio: banco === 'itau'
    ? 'Não reconheci o arquivo do Itaú: falta a linha de cabeçalho com "Beneficiário" e "Código de barras". Confira se é o Excel "Consulta Boletos Recebidos" do internet banking.'
    : 'Não reconheci o arquivo do Santander: falta o cabeçalho com "Nosso Número" e "Beneficiário". Confira se é o Excel do Pagador Eletrônico.', aviso:'' };
  const cnpj = cnpjDaContaDda(matrizDda);
  if(!cnpj) return { bloqueio:'', aviso:'Não achei o CNPJ da conta no topo do DDA. Confira se o arquivo é da empresa escolhida.' };
  if(cnpj !== apenasDigitos(empresa.cnpj)){
    const dona = EMPRESAS.find(e => apenasDigitos(e.cnpj) === cnpj);
    return { bloqueio: `Este DDA é da conta ${dona ? 'da ' + dona.nome : 'de outro CNPJ'}, mas a empresa escolhida é ${empresa.nome}. A conferência não foi feita.`, aviso:'' };
  }
  return { bloqueio:'', aviso:'' };
}

/* ---------------------------------------------------------------------
   RELATÓRIO DO SISTEMA
   --------------------------------------------------------------------- */

// Títulos do sistema: dados a partir da linha 7 (índice 6). Vencimento = A(0), Nome = C(2),
// Título (NF/duplicata) = D(3), Saldo = P(15). Linha sem nome ou sem saldo é ignorada.
// O título (doc) só aparece na tela e na busca; não é usado na conferência.
function extraiSistema(m){
  const out = [];
  for(let i=6; i<m.length; i++){
    const linha = m[i] || [];
    const venc  = linha[0];
    const nome  = linha[2];
    if(nome===null || String(nome).trim()==='') continue;
    const saldo = paraNumero(linha[15]);
    if(saldo===null) continue;
    const doc = linha[3];
    out.push({ venc: formatData(venc), nome: String(nome).trim(), valor: saldo, doc: doc!=null ? String(doc).trim() : '' });
  }
  return out;
}

/* ---------------------------------------------------------------------
   COMPARAÇÃO DE NOME, VALOR E DATA
   --------------------------------------------------------------------- */

// Nome "padronizado" para comparar: maiúsculo, sem espaço extra, sem . , / - &
function limpaNome(s){
  if(s===null || s===undefined) return '';
  s = String(s).trim().toUpperCase().replace(/\s+/g,' ');
  s = s.replace(/[.,/\-&]/g,'');
  return s.replace(/\s+/g,' ').trim();
}

// Dois nomes são "a mesma empresa" se, depois de limpos, o mais longo começa com os
// 10 primeiros caracteres do mais curto, ou se a semelhança por pares de letras é de 60% ou mais.
function nomesBatem(a,b){
  a = limpaNome(a); b = limpaNome(b);
  if(!a || !b) return false;
  const [curto,longo] = a.length<=b.length ? [a,b] : [b,a];
  if(longo.startsWith(curto.slice(0, Math.min(curto.length,10)))) return true;
  return similaridade(a,b) >= 0.6;
}

// Quanto dois textos são parecidos (0 = nada, 1 = idênticos), por pares de letras (Dice).
function similaridade(a,b){
  if(a===b) return 1;
  if(a.length<2 || b.length<2) return 0;
  const bigramas = s => {
    const m = new Map();
    for(let i=0;i<s.length-1;i++){
      const g = s.substr(i,2);
      m.set(g,(m.get(g)||0)+1);
    }
    return m;
  };
  const A = bigramas(a), B = bigramas(b);
  let inter = 0;
  A.forEach((c,g)=>{ if(B.has(g)) inter += Math.min(c,B.get(g)); });
  return (2*inter) / ((a.length-1)+(b.length-1));
}

// Diferença de até 1 centavo ainda conta como "mesmo valor" (arredondamento entre
// o boleto e o lançamento no sistema).
const TOLERANCIA_VALOR = 0.01;

// true quando os dois valores são iguais dentro da TOLERANCIA_VALOR.
function valoresBatem(a, b){
  return Math.abs(a - b) <= TOLERANCIA_VALOR + 1e-9;
}

// Agrupa os índices dos títulos por valor em centavos, para achar os candidatos de um
// boleto sem varrer a lista inteira a cada vez.
function indexaPorValor(sis){
  const idx = new Map();
  sis.forEach((s,i) => {
    const c = Math.round(s.valor*100);
    if(!idx.has(c)) idx.set(c, []);
    idx.get(c).push(i);
  });
  return idx;
}

// Índices dos títulos com valor dentro da tolerância, na ordem do relatório
// (a mesma ordem de uma varredura completa).
function candidatosPorValor(idx, valor){
  const centro = Math.round(valor*100);
  const tol = Math.round(TOLERANCIA_VALOR*100);
  let out = [];
  for(let c=centro-tol; c<=centro+tol; c++){
    const lista = idx.get(c);
    if(lista) out = out.concat(lista);
  }
  return tol>0 ? out.sort((a,b)=>a-b) : out;
}

// Compara só os números das datas. Se uma das duas estiver vazia, conta como igual.
function mesmaData(a, b){
  const so = s => (s ? String(s).match(/\d+/g) || [] : []).join('-');
  const A = so(a), B = so(b);
  if(!A || !B) return true;
  return A === B;
}

/* ---------------------------------------------------------------------
   A CONFERÊNCIA
   --------------------------------------------------------------------- */

// Cruza os boletos do banco (formato comum dos leitores) com os títulos do sistema.
// Cada boleto procura UM título, em 3 passadas, da mais rígida para a mais frouxa;
// um título já usado não volta. Em cada passada pega o PRIMEIRO título livre na
// ordem do relatório:
//   1) valor + nome + vencimento -> ok (Conferidos)
//   2) valor + nome              -> datasDiff (Datas divergentes)
//   3) só o valor                -> div (Nome divergente)
// O que sobra: soBanco (boleto sem título) e soSis (título sem boleto).
// O beneficiário é copiado para "nome", que é o campo comparado.
function conferir(banco, sistema){
  const sis = sistema.map(s => ({ ...s, usado:false }));
  const ban = banco.map(b => ({ ...b, nome:b.beneficiario, usado:false }));
  const idxValor = indexaPorValor(sis);

  const ok        = [];
  const datasDiff = [];
  const div       = [];

  // primeiro título livre com valor compatível que também passa no teste da passada
  function achaPar(b, testeExtra){
    for(const i of candidatosPorValor(idxValor, b.valor)){
      const s = sis[i];
      if(!s.usado && valoresBatem(s.valor,b.valor) && testeExtra(s)) return i;
    }
    return -1;
  }

  // Passada 1: valor + nome + vencimento -> CONFERIDO
  ban.forEach(b => {
    const i = achaPar(b, s => nomesBatem(b.nome,s.nome) && mesmaData(b.venc,s.venc));
    if(i>=0){ sis[i].usado = true; b.usado = true; ok.push({ banco:b, sistema:sis[i] }); }
  });

  // Passada 2: valor + nome, data diferente -> DATA DIVERGENTE
  ban.forEach(b => {
    if(b.usado) return;
    const i = achaPar(b, s => nomesBatem(b.nome,s.nome));
    if(i>=0){ sis[i].usado = true; b.usado = true; datasDiff.push({ banco:b, sistema:sis[i] }); }
  });

  // Passada 3: só o valor -> NOME DIVERGENTE
  ban.forEach(b => {
    if(b.usado) return;
    const i = achaPar(b, () => true);
    if(i>=0){ sis[i].usado = true; b.usado = true; div.push({ banco:b, sistema:sis[i] }); }
  });

  const soBanco = ban.filter(b => !b.usado);
  const soSis   = sis.filter(s => !s.usado);

  return { ok, div, soBanco, soSis, datasDiff };
}

// Itaú: só os boletos da unidade escolhida ('todas', 'sem-capinopolis' ou 'capinopolis').
function boletosDaUnidade(boletos, unidade){
  return unidade === 'todas' ? boletos : boletos.filter(b => unidadeDoPagador(b.pagador) === unidade);
}

/* ---------------------------------------------------------------------
   RESULTADO EM LINHAS (o que a tela mostra)
   --------------------------------------------------------------------- */

// Transforma o resultado do conferir nas linhas da tela, uma lista por status.
// O valor da linha é o do boleto; no "Só no sistema", o saldo lançado (igual ao antigo:
// é a soma que aparece nos cartões). texto e digitos são onde a busca procura.
function linhasDda(r){
  const linhas = { ok:[], data:[], nome:[], banco:[], sis:[] };
  const add = (status, b, s) => {
    const valor = b ? b.valor : s.valor;
    const textos = [b && b.nome, s && s.nome, b && b.doc, s && s.doc, b && b.cnpj, b && b.banco,
                    b && dataBR(b.venc), s && dataBR(s.venc), brl(valor)];
    const digitos = [centavos(valor), b && centavos(b.valor), s && centavos(s.valor),
                     b && apenasDigitos(b.doc), s && apenasDigitos(s.doc), b && apenasDigitos(b.cnpj)];
    linhas[status].push({ status, banco:b, sistema:s, valor,
                          texto: normaliza(textos.filter(Boolean).join(' | ')),
                          digitos: digitos.filter(Boolean).join('|') });
  };
  r.div.forEach(d => add('nome', d.banco, d.sistema));
  r.datasDiff.forEach(d => add('data', d.banco, d.sistema));
  r.soBanco.forEach(b => add('banco', b, null));
  r.soSis.forEach(s => add('sis', null, s));
  r.ok.forEach(d => add('ok', d.banco, d.sistema));
  return linhas;
}

// Soma dos valores das linhas, em centavos para não acumular erro de vírgula.
function somaValores(linhas){
  return Math.round(linhas.reduce((s, l) => s + (l.valor || 0), 0) * 100) / 100;
}

// A busca procura no texto (fornecedor, NF, CNPJ, data...) e, se a busca for um número,
// nos valores e documentos só com dígitos. Busca vazia mostra tudo.
function buscaCasa(linha, busca){
  const q = normaliza(busca).replace(/\s+/g,' ');
  if(!q) return true;
  if(linha.texto.includes(q)) return true;
  if(/^[R$\s\d.,\/-]+$/.test(q)){
    const d = q.replace(/\D/g,'');
    return d.length>0 && linha.digitos.includes(d);
  }
  return false;
}

/* ---------------------------------------------------------------------
   O QUE VAI EM CADA ABA DO EXCEL (igual ao projeto antigo)
   No Excel o valor de Conferidos, Datas e Nome divergente é o SALDO DO SISTEMA
   (na tela é o do boleto). Por isso, com a tolerância de 1 centavo, o total de
   uma aba pode diferir 1 centavo do cartão, como no antigo (ver NUMEROS.md).
   "Para NF" e "Pedidos" saem em branco: são para preencher à mão.
   --------------------------------------------------------------------- */
const FMT_REAL = 'R$ #,##0.00';

// Colunas do Excel do Santander (e do "Só no sistema" do Itaú).
const COLS_PADRAO = [
  { cab:'Vencimento',        w:14 },
  { cab:'Nome/Beneficiário', w:46 },
  { cab:'Para NF',           w:16 },
  { cab:'Pedidos',           w:16 },
  { cab:'Valor',             w:16, fmt:FMT_REAL },
];
const COLS_DATAS = [
  { cab:'Nome/Beneficiário',         w:46 },
  { cab:'Valor',                     w:16, fmt:FMT_REAL },
  { cab:'Data no DDA (boleto)',      w:20 },
  { cab:'Data no sistema (lançada)', w:24 },
];
const COLS_DIV = [
  { cab:'Vencimento',      w:14 },
  { cab:'Nome no banco',   w:40 },
  { cab:'Nome no sistema', w:40 },
  { cab:'Para NF',         w:16 },
  { cab:'Pedidos',         w:16 },
  { cab:'Valor',           w:16, fmt:FMT_REAL },
];

// Colunas que o Itaú acrescenta, no meio e no fim das de sempre.
const COLS_ITAU_MEIO = [
  { cab:'CNPJ',             w:20 },
  { cab:'Banco',            w:8 },
  { cab:'Código de barras', w:50, fmt:'@' },   // texto: o código nunca vira número
  { cab:'Nº Doc. (Itaú)',   w:18, fmt:'@' },   // texto, para não perder zeros à esquerda
];
const COLS_ITAU_FIM = [
  { cab:'A pagar',  w:16, fmt:FMT_REAL },
  { cab:'Desconto', w:14 },
  { cab:'Unidade',  w:22 },
];
const COLS_ITAU_PADRAO = [
  { cab:'Vencimento',        w:14 },
  { cab:'Nome/Beneficiário', w:46 },
  ...COLS_ITAU_MEIO,
  { cab:'Para NF',           w:16 },
  { cab:'Pedidos',           w:16 },
  { cab:'Valor (até venc.)', w:18, fmt:FMT_REAL },
  ...COLS_ITAU_FIM,
];
const COLS_ITAU_DIV = [
  { cab:'Vencimento',        w:14 },
  { cab:'Nome no banco',     w:40 },
  { cab:'Nome no sistema',   w:40 },
  ...COLS_ITAU_MEIO,
  { cab:'Para NF',           w:16 },
  { cab:'Pedidos',           w:16 },
  { cab:'Valor (até venc.)', w:18, fmt:FMT_REAL },
  ...COLS_ITAU_FIM,
];
const COLS_ITAU_DATAS = [
  { cab:'Nome/Beneficiário',         w:46 },
  { cab:'Valor (até venc.)',         w:18, fmt:FMT_REAL },
  { cab:'Data no DDA (boleto)',      w:20 },
  { cab:'Data no sistema (lançada)', w:24 },
  ...COLS_ITAU_MEIO,
  ...COLS_ITAU_FIM,
];

// Título de cada aba no Excel (linha 1), como no antigo.
const TITULOS_EXCEL_DDA = {
  ok:    'Conferidos (valor e nome batem)',
  data:  'Datas divergentes (mesmo título, vencimento diferente)',
  nome:  'Nome divergente (conferir · possível factoring)',
  banco: 'Só no banco (não achado no sistema)',
  sis:   'Só no sistema (não achado no banco)',
};

// Código de barras do boleto só para mostrar (tela e Excel). Se a célula do DDA não estava
// gravada como texto, os dígitos podem ter mudado: mostra o aviso no lugar do código.
function codigoParaMostrar(b){
  return b.codigoSuspeito ? 'ilegível: não estava gravado como texto no DDA' : (b.codigoBarras || '');
}

// Monta as 5 abas do Excel a partir do resultado do conferir, na ordem de STATUS_DDA.
// banco = 'santander' | 'itau'; unidade = a escolhida no Itaú ('todas' no Santander).
// Devolve [{ status, nome, titulo, colunas, linhas }]; quem grava é js/excel.js.
function abasExcelDda(r, banco, unidade){
  const sufixo = banco === 'itau' && unidade && unidade !== 'todas' ? ` — ${NOMES_UNIDADE[unidade]}` : '';
  const padrao = (venc, nome, valor) => [ venc || '', nome || '', '', '', valor ];
  let linhas, colunas;

  if(banco === 'itau'){
    const meio = b => [ b.cnpj, b.banco, codigoParaMostrar(b), b.doc ? String(b.doc) : '' ];
    const fim  = b => [ b.valorAPagar, b.comDesconto ? 'com desconto' : '', NOMES_UNIDADE[unidadeDoPagador(b.pagador)] ];
    colunas = { ok:COLS_ITAU_PADRAO, data:COLS_ITAU_DATAS, nome:COLS_ITAU_DIV, banco:COLS_ITAU_PADRAO, sis:COLS_PADRAO };
    linhas = {
      nome:  r.div.map(d => [ d.sistema.venc || '', d.banco.nome || '', d.sistema.nome || '', ...meio(d.banco), '', '', d.sistema.valor, ...fim(d.banco) ]),
      data:  r.datasDiff.map(d => [ d.sistema.nome, d.sistema.valor, d.banco.venc, d.sistema.venc, ...meio(d.banco), ...fim(d.banco) ]),
      banco: r.soBanco.map(d => [ d.venc || '', d.nome || '', ...meio(d), '', '', d.valor, ...fim(d) ]),
      sis:   r.soSis.map(d => padrao(d.venc, d.nome, d.valor)),
      ok:    r.ok.map(d => [ d.sistema.venc || '', d.sistema.nome || '', ...meio(d.banco), '', '', d.sistema.valor, ...fim(d.banco) ]),
    };
  }else{
    colunas = { ok:COLS_PADRAO, data:COLS_DATAS, nome:COLS_DIV, banco:COLS_PADRAO, sis:COLS_PADRAO };
    linhas = {
      nome:  r.div.map(d => [ d.sistema.venc || '', d.banco.nome || '', d.sistema.nome || '', '', '', d.sistema.valor ]),
      data:  r.datasDiff.map(d => [ d.sistema.nome, d.sistema.valor, d.banco.venc, d.sistema.venc ]),
      banco: r.soBanco.map(d => padrao(d.venc, d.nome, d.valor)),
      sis:   r.soSis.map(d => padrao(d.venc, d.nome, d.valor)),
      ok:    r.ok.map(d => padrao(d.sistema.venc, d.sistema.nome, d.sistema.valor)),
    };
  }
  return STATUS_DDA.map(st => ({ status: st.id, cor: st.cor, nome: st.nome, titulo: TITULOS_EXCEL_DDA[st.id] + sufixo,
                                 colunas: colunas[st.id], linhas: linhas[st.id] }));
}
