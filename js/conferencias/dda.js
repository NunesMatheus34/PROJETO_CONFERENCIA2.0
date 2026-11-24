/* =====================================================================
   CONFERÊNCIA DDA (Santander, Itaú e Bradesco)
   Regras para cruzar os boletos do DDA do banco com os títulos do
   relatório do sistema. A lógica (extraiSistema, conferir e o que vai em
   cada aba do Excel) foi trazida do projeto antigo SEM mudança: os números
   têm que ser os mesmos de _referencia/NUMEROS.md.
   Novo aqui: as travas antes de conferir (relatório de outra empresa,
   DDA de outro banco ou de outra conta).
   O Bradesco (no fim do arquivo) tem regras próprias, trazidas de
   _referencia/brad.py e dda_brad.py, com as mesmas 5 abas.
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

/* =====================================================================
   BRADESCO (Rubi Matriz e Rubi Filial)
   O DDA do Bradesco vem em PDFs (js/bancos/bradesco.js lê). As regras
   abaixo foram trazidas do projeto antigo (_referencia/brad.py e
   _referencia/dda_brad.py) e são DIFERENTES das do Santander/Itaú:
   o relatório é lido pelos nomes das colunas, a conferência anda pelos
   títulos do sistema, o valor tem que ser igual ao centavo, e o "Só no
   banco" só traz boletos com vencimento numa das datas do relatório.
   As abas, nomes e cores são os mesmos (STATUS_DDA).
   ===================================================================== */

/* ---------- Passo 1: cada PDF ---------- */

// "Impressão digital" dos boletos de um PDF: dois PDFs com os mesmos boletos, na mesma
// ordem, são o MESMO conteúdo (mesmo que baixados em outra hora). Vazio = sem boletos.
function assinaturaPdfBradesco(leitura){
  if(!leitura.boletos.length) return '';
  return JSON.stringify(leitura.boletos.map(b =>
    [b.venc, b.limite, b.pagadorCnpj, b.docTexto, b.beneficiario, b.cnpj, b.banco, b.status, b.valor]));
}

// Decide a situação de um PDF recém-lido (leitura = o que leitorBradesco devolve):
//   'repetido' = mesmo conteúdo de um PDF já enviado (ignorado, só avisa);
//   'erro'     = não pode entrar (erro de leitura, outra empresa, outro pagador);
//   'ok'       = Leitura OK.
// anteriores = os PDFs já enviados nesta conferência ({ leitura, situacao }).
// Devolve { situacao, erros, repetidoDe }.
function avaliaPdfBradesco(leitura, empresa, anteriores){
  const assinatura = assinaturaPdfBradesco(leitura);
  const igual = assinatura && anteriores.find(a => a.situacao !== 'repetido' && assinaturaPdfBradesco(a.leitura) === assinatura);
  if(igual) return { situacao: 'repetido', erros: [], repetidoDe: igual.leitura.arquivo };

  const erros = [...leitura.erros];
  const cnpjEmpresa = apenasDigitos(empresa.cnpj);
  if(leitura.ehDda){
    if(!leitura.empresa) erros.push('não achei a empresa (nome | CNPJ) no topo do PDF');
    else if(cnpjBradescoParaComparar(leitura.empresa.cnpj) !== cnpjEmpresa){
      const dona = EMPRESAS.find(e => apenasDigitos(e.cnpj) === cnpjBradescoParaComparar(leitura.empresa.cnpj));
      erros.push(`o PDF é da conta ${dona ? 'da ' + dona.nome : leitura.empresa.nome + ' · ' + leitura.empresa.cnpj}, mas a empresa escolhida é ${empresa.nome}`);
    }
  }
  const outros = leitura.boletos.filter(b => b.pagadorCnpj && cnpjBradescoParaComparar(b.pagadorCnpj) !== cnpjEmpresa);
  if(outros.length)
    erros.push(`${outros.length === 1 ? 'o boleto' : 'os boletos'} ${outros.map(b => b.n).join(', ')} ` +
               `${outros.length === 1 ? 'tem' : 'têm'} outro pagador (${outros[0].pagador} · ${outros[0].pagadorCnpj}), não a ${empresa.nome}`);
  return { situacao: erros.length ? 'erro' : 'ok', erros, repetidoDe: '' };
}

// Junta os boletos dos PDFs aprovados, na ordem de envio. Um boleto que aparece em MAIS
// DE UM PDF (mesmo CNPJ, Nº Doc., valor e vencimento) entra uma vez só, como no antigo.
// Boleto sem Nº Doc. nunca é descartado (não dá para ter certeza de que é o mesmo).
// Devolve { boletos, repetidos } (repetidos = quantos foram descartados).
function boletosDosPdfsBradesco(leituras){
  const vistos = new Map();   // chave -> índice do PDF onde apareceu primeiro
  const boletos = [];
  let repetidos = 0;
  leituras.forEach((leitura, i) => {
    leitura.boletos.forEach(b => {
      const chave = JSON.stringify([b.cnpj, b.doc, Math.round(b.valor * 100), b.venc]);
      if(b.doc !== null && vistos.has(chave) && vistos.get(chave) !== i){ repetidos++; return; }
      if(b.doc !== null && !vistos.has(chave)) vistos.set(chave, i);
      boletos.push(b);
    });
  });
  return { boletos, repetidos };
}

/* ---------- Passo 2: relatório do sistema (layout Rubi, "Duplicatas em Aberto") ---------- */

// Texto "padronizado" como o norm() do antigo: sem acento (e sem nenhum caractere fora do
// ASCII), maiúsculo, um espaço só entre as palavras.
function normalizaNomeBradesco(s){
  return String(s === null || s === undefined ? '' : s).normalize('NFKD').replace(/[^\x00-\x7F]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

// Títulos do relatório do sistema, pelos NOMES das colunas (como o ler_sistema do antigo):
// a linha do cabeçalho é a que tem "Vencimento" na coluna A (nas 14 primeiras); depois,
// vale toda linha com data na coluna A e Código numérico.
// Devolve { titulos, erro }. Cada título: { venc, codigo, nome, doc (= NF/Título), desd, prefixo, valor }.
function extraiSistemaBradesco(m){
  const cab = m.slice(0, 14).findIndex(l => l && normalizaNomeBradesco(l[0]) === 'VENCIMENTO');
  if(cab < 0) return { titulos: [], erro: 'Não achei a linha de cabeçalho com "Vencimento" na coluna A. Confira se é o relatório "Duplicatas em Aberto" do sistema.' };
  const col = {};
  (m[cab] || []).forEach((c, j) => { if(c !== null && c !== '') col[normalizaNomeBradesco(c)] = j; });
  const faltam = ['CODIGO', 'NOME', 'TITULO', 'DESDOBRAMENTO', 'PREFIXO', 'SALDO'].filter(n => col[n] === undefined);
  if(faltam.length) return { titulos: [], erro: `Faltam as colunas ${faltam.join(', ')} no cabeçalho do relatório.` };
  const texto = v => (v === null || v === undefined ? '' : String(v).trim());
  const titulos = [];
  for(let i = cab + 1; i < m.length; i++){
    const l = m[i] || [];
    if(typeof l[col.CODIGO] !== 'number' || !(l[0] instanceof Date)) continue;
    const saldo = l[col.SALDO];
    if(typeof saldo !== 'number') return { titulos: [], erro: `A linha ${i + 1} do relatório tem título sem saldo (coluna Saldo).` };
    titulos.push({ venc: formatData(l[0]), codigo: l[col.CODIGO], nome: normalizaNomeBradesco(l[col.NOME]),
                   doc: texto(l[col.TITULO]), desd: texto(l[col.DESDOBRAMENTO]), prefixo: texto(l[col.PREFIXO]),
                   valor: Math.round(saldo * 100) / 100 });
  }
  if(!titulos.length) return { titulos, erro: 'Não encontrei títulos no relatório (linhas com data na coluna A e Código numérico).' };
  return { titulos, erro: '' };
}

/* ---------- Comparação de nomes (igual ao antigo) ---------- */

// Palavras que não ajudam a reconhecer um fornecedor (LTDA, COMERCIO, PECAS...).
const PALAVRAS_COMUNS_BRADESCO = new Set(('LTDA S/A SA DE DO DA E ME EPP EIRELI IND COM COMERCIO INDUSTRIA INDUSTRIAL BRASIL ' +
  'PECAS DISTRIBUIDORA LIMITADA SERVICOS AUTO MAQUINAS EQUIPAMENTOS COMERCIAL PRODUTOS').split(' '));

// As palavras "fortes" de um nome: só letras, 4 ou mais, fora das comuns, cortadas em 5 letras.
function palavrasDoNomeBradesco(nome){
  const out = new Set();
  (normalizaNomeBradesco(nome).match(/[A-Z]+/g) || []).forEach(w => {
    if(w.length >= 4 && !PALAVRAS_COMUNS_BRADESCO.has(w)) out.add(w.slice(0, 5));
  });
  return out;
}

// Semelhança entre dois textos de 0 a 1, IGUAL ao difflib.SequenceMatcher(None, a, b).ratio()
// do Python (usado no antigo): 2 × letras em blocos comuns ÷ (tamanho de a + tamanho de b).
function semelhancaSequencia(a, b){
  const la = a.length, lb = b.length;
  if(la + lb === 0) return 1;
  const b2j = new Map();
  for(let j = 0; j < lb; j++){ if(!b2j.has(b[j])) b2j.set(b[j], []); b2j.get(b[j]).push(j); }
  if(lb >= 200){   // "autojunk" do Python: letra que aparece demais é ignorada na busca
    const limite = Math.floor(lb / 100) + 1;
    [...b2j.keys()].forEach(c => { if(b2j.get(c).length > limite) b2j.delete(c); });
  }
  // maior bloco igual dentro de a[alo:ahi] e b[blo:bhi] (mesmo desempate do Python)
  const maiorBloco = (alo, ahi, blo, bhi) => {
    let bi = alo, bj = blo, bk = 0, j2len = new Map();
    for(let i = alo; i < ahi; i++){
      const novo = new Map();
      for(const j of (b2j.get(a[i]) || [])){
        if(j < blo) continue;
        if(j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        novo.set(j, k);
        if(k > bk){ bi = i - k + 1; bj = j - k + 1; bk = k; }
      }
      j2len = novo;
    }
    while(bi > alo && bj > blo && a[bi - 1] === b[bj - 1]){ bi--; bj--; bk++; }
    while(bi + bk < ahi && bj + bk < bhi && a[bi + bk] === b[bj + bk]) bk++;
    return [bi, bj, bk];
  };
  let iguais = 0;
  const fila = [[0, la, 0, lb]];
  while(fila.length){
    const [alo, ahi, blo, bhi] = fila.pop();
    const [i, j, k] = maiorBloco(alo, ahi, blo, bhi);
    if(!k) continue;
    iguais += k;
    if(alo < i && blo < j) fila.push([alo, i, blo, j]);
    if(i + k < ahi && j + k < bhi) fila.push([i + k, ahi, j + k, bhi]);
  }
  return 2 * iguais / (la + lb);
}

// Nome do sistema e nome do banco são o mesmo fornecedor? (o parecido() do antigo)
// Sim se têm uma palavra forte em comum, se começam iguais (até 10 letras) ou se a
// semelhança é de 60% ou mais.
function nomesParecidosBradesco(a, b){
  a = normalizaNomeBradesco(a); b = normalizaNomeBradesco(b);
  const pb = palavrasDoNomeBradesco(b);
  for(const w of palavrasDoNomeBradesco(a)) if(pb.has(w)) return true;
  const n = Math.min(a.length, b.length, 10);
  return a.slice(0, n) === b.slice(0, n) || semelhancaSequencia(a, b) >= 0.6;
}

// dd/mm/aaaa -> aaaammdd, para ordenar por data.
function chaveDataBradesco(d){
  return String(d).split('/').reverse().join('');
}

/* ---------- A conferência do Bradesco ---------- */

// Cruza boletos (dos PDFs) e títulos (do relatório) como o dda_brad.py do antigo.
// Anda pelos TÍTULOS, na ordem do relatório, em 3 passadas; em cada uma o título pega o
// PRIMEIRO boleto livre (na ordem dos PDFs) com o MESMO valor (ao centavo) e:
//   1) nome parecido e mesmo vencimento -> ok (Conferidos)
//   2) nome parecido                    -> datasDiff (Datas divergentes)
//   3) mesmo vencimento                 -> div (Nome divergente)
// Sobram: soBanco = boletos sem título com vencimento numa das datas do relatório;
// foraDoPeriodo = boletos sem título com vencimento fora delas (não vão para nenhuma aba,
// a tela avisa quantos são); soSis = títulos sem boleto. Só no banco e Só no sistema saem
// ordenados por vencimento e valor, como no Excel do antigo.
// Mesmo formato do conferir() (pares { banco, sistema }); banco.nome = beneficiário.
function conferirBradesco(boletos, titulos){
  const bols = boletos.map((b, id) => ({ ...b, nome: b.beneficiario, id }));
  const tits = titulos.map(t => ({ ...t, par: null }));
  const livres = new Set(bols.map(b => b.id));
  const ok = [], datasDiff = [], div = [];
  const cent = v => Math.round(v * 100);

  const passada = (cond, destino) => tits.forEach(t => {
    if(t.par !== null) return;
    const b = bols.find(b => livres.has(b.id) && cent(b.valor) === cent(t.valor) && cond(t, b));
    if(b){ livres.delete(b.id); t.par = b.id; destino.push({ banco: b, sistema: t }); }
  });
  passada((t, b) => nomesParecidosBradesco(t.nome, b.beneficiario) && b.venc === t.venc, ok);
  passada((t, b) => nomesParecidosBradesco(t.nome, b.beneficiario), datasDiff);
  passada((t, b) => b.venc === t.venc, div);

  const datasDoRelatorio = new Set(tits.map(t => t.venc));
  const porDataValor = (x, y) => chaveDataBradesco(x.venc).localeCompare(chaveDataBradesco(y.venc)) || x.valor - y.valor;
  const sobra = bols.filter(b => livres.has(b.id));
  return {
    ok, datasDiff, div,
    soBanco: sobra.filter(b => datasDoRelatorio.has(b.venc)).sort(porDataValor),
    foraDoPeriodo: sobra.filter(b => !datasDoRelatorio.has(b.venc)),
    soSis: tits.filter(t => t.par === null).sort(porDataValor),
  };
}

// Palavras que indicam que o boleto foi cedido (factoring, fundo, securitizadora...).
const SINAIS_CESSAO_BRADESCO = ['FOMENTO', 'FIDC', 'FUNDO', 'FACTORING', 'CRED', 'COBRAN', 'SECURITIZ'];

// Avisos de um boleto do Bradesco (com o título, se casou), como no antigo:
//  - cedido a factoring/fundo: o 1º nome do beneficiário é outro e ele tem cara de factoring;
//  - sem Nº Doc.: o banco mostrou só asteriscos, então não dá para conferir a NF.
// Devolve [{ tipo:'factoring'|'semDoc', texto }].
function avisosBoletoBradesco(b, s){
  const avisos = [];
  if(s){
    const a = normalizaNomeBradesco(s.nome).match(/[A-Z]+/g), c = normalizaNomeBradesco(b.beneficiario).match(/[A-Z]+/g);
    const outra = a && c && a[0].slice(0, 3) !== c[0].slice(0, 3);
    if(outra && SINAIS_CESSAO_BRADESCO.some(k => normalizaNomeBradesco(b.beneficiario).includes(k)))
      avisos.push({ tipo: 'factoring', texto: 'cedido a factoring/fundo' });
  }
  if(b.doc === null) avisos.push({ tipo: 'semDoc', texto: 'boleto sem Nº Doc.' + (s ? ': confirmar a NF' : '') });
  return avisos;
}

// Colunas do Excel do Bradesco (as do antigo, mais "Avisos").
const COLS_BRADESCO_PAR = [
  { cab:'Valor',              w:14, fmt:FMT_REAL },
  { cab:'Nome no sistema',    w:38 },
  { cab:'Nome no banco',      w:36 },
  { cab:'NF',                 w:12, fmt:'@' },
  { cab:'Nº Doc. (Bradesco)', w:18, fmt:'@' },
  { cab:'Venc. banco',        w:12 },
  { cab:'Venc. sistema',      w:12 },
  { cab:'Avisos',             w:34 },
];
const COLS_BRADESCO_BANCO = [
  { cab:'Vencimento',         w:12 },
  { cab:'Nome/Beneficiário',  w:40 },
  { cab:'CNPJ',               w:20, fmt:'@' },
  { cab:'Nº Doc. (Bradesco)', w:18, fmt:'@' },
  { cab:'Para NF',            w:12, fmt:'@' },
  { cab:'Valor',              w:14, fmt:FMT_REAL },
  { cab:'STATUS',             w:22 },
  { cab:'Avisos',             w:34 },
];
const COLS_BRADESCO_SIS = [
  { cab:'Vencimento',      w:12 },
  { cab:'Cód. Fornecedor', w:14 },
  { cab:'Fornecedor',      w:40 },
  { cab:'NF',              w:12, fmt:'@' },
  { cab:'Valor',           w:14, fmt:FMT_REAL },
];

// As 5 abas do Excel do Bradesco (mesma ordem, nomes e cores da tela).
// Nos pares o valor é o do sistema (igual ao do boleto: aqui o valor bate ao centavo).
// "Para NF" e "STATUS" saem em branco: são para preencher à mão, como no antigo.
function abasExcelBradesco(r){
  const avisos = (b, s) => avisosBoletoBradesco(b, s).map(a => a.texto).join(' · ');
  const par = d => [ d.sistema.valor, d.sistema.nome, d.banco.beneficiario, d.sistema.doc || '', d.banco.doc || '',
                     d.banco.venc, d.sistema.venc, avisos(d.banco, d.sistema) ];
  const linhas = {
    ok:    r.ok.map(par),
    data:  r.datasDiff.map(par),
    nome:  r.div.map(par),
    banco: r.soBanco.map(b => [ b.venc, b.beneficiario, b.cnpj, b.doc || '', '', b.valor, '', avisos(b, null) ]),
    sis:   r.soSis.map(t => [ t.venc, t.codigo, t.nome, t.doc || '', t.valor ]),
  };
  const colunas = { ok:COLS_BRADESCO_PAR, data:COLS_BRADESCO_PAR, nome:COLS_BRADESCO_PAR, banco:COLS_BRADESCO_BANCO, sis:COLS_BRADESCO_SIS };
  return STATUS_DDA.map(st => ({ status: st.id, cor: st.cor, nome: st.nome, titulo: TITULOS_EXCEL_DDA[st.id] + ' — Bradesco',
                                 colunas: colunas[st.id], linhas: linhas[st.id] }));
}
