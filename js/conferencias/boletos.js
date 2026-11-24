/* =====================================================================
   CONFERÊNCIA DE BOLETOS (DDA do Itaú × "Duplicatas em Aberto Modelo A")
   Para cada título do sistema SEM código de barras, acha o boleto no DDA
   (regras em PAREAMENTO, abaixo: nome, NF e valor) e entrega a linha
   digitável, mas só se o código do DDA passar no validaBoleto (js/boleto.js).
   Títulos que JÁ têm código no sistema ficam fora da conferência; o código
   deles só é conferido (e, se estiver errado, o site aponta o boleto certo
   do DDA). Nada aqui corrige o código do sistema.
   Trazido da seção 8 do projeto antigo (_referencia/app.js) SEM mudar a
   regra: os números têm que ser os de _referencia/NUMEROS.md (seção 4).
   Novo aqui: a empresa vem do seletor da tela (só CRV Matriz e CRV Filial,
   que têm Itaú) e é conferida antes de rodar (checaArquivosBoletos):
   relatório de outra empresa ou DDA de outro banco/conta não confere.
   Grupos das linhas (conferirBoletos):
     bolOk     Com boleto     título achado no DDA (2 sinais entre nome, NF e valor), sem pendência
     bolVerif  Verificação    agrupado, código do DDA bloqueado, outra empresa, NF com 1 dígito
                              diferente, desconto, valor diferente, boleto que não fecha, duplicidade
     bolCodSis Verificação    (bloco vermelho no fim) código do sistema inválido, trocado ou fora do DDA
     bolJa     (fora)         código no sistema válido e igual ao do DDA (ou conta de consumo)
     bolSem    Sem boleto     título sem código que não está no DDA
     bolFolha  Sem boleto     folha e impostos (bloco no fim, somado por tipo)
     bolDda    DDA sem título boleto do DDA sem título no sistema
   Nada aqui desenha tela: js/telas/boletos.js só mostra o resultado, e o
   Excel fica em js/excel.js.
   Precisa de js/leitura/formatos.js, js/empresas.js, js/bancos/itau.js,
   js/bancos/detecta.js, js/boleto.js, js/conferencias/nomes.js e
   js/conferencias/dda.js (checaRelatorioDda, checaDda, limpaNome,
   mesmaData, somaValores, buscaCasa).
   ===================================================================== */

/* ---------------------------------------------------------------------
   RELATÓRIO DO SISTEMA
   --------------------------------------------------------------------- */

// SISTEMA ("Duplicatas em Aberto Modelo A"): o cabeçalho é a linha com
// "Código de barras" e "Saldo" (acharCabecalho); as colunas são achadas pelo
// texto (mapeiaColunas) + Prf. Entram só as linhas com código do fornecedor
// (coluna Cliente) numérico: subtotais e totais ficam de fora.
// leitura = lerMatrizComTexto(arquivo). O código de barras vem do texto da célula.
function leitorSistemaBoletos(leitura){
  const m = leitura.matriz;
  const cab = acharCabecalho(m);
  if(cab<0) throw new Error('Não reconheci o relatório do sistema: falta a linha de cabeçalho com "Código de barras" e "Saldo". Confira se é o "Duplicatas em Aberto Modelo A".');
  const nomes = (m[cab] || []).map(normaliza);
  const cols = mapeiaColunas(m[cab]);
  cols.prf = nomes.findIndex(c => c.startsWith('PRF'));
  const falta = [['Cliente', cols.cliente], ['Vencto.', nomes.findIndex(c => c.includes('VENC'))],
                 ['Duplicata', nomes.findIndex(c => c.includes('DUPLICATA'))]].filter(([, i]) => i<0).map(([n]) => n);
  if(falta.length) throw new Error(`No relatório do sistema não achei a coluna ${falta.join(', ')}. Confira se é o "Duplicatas em Aberto Modelo A".`);

  const texto = v => v!=null ? String(v).trim() : '';
  const out = [];
  for(let i=cab+1; i<m.length; i++){
    const linha = m[i] || [];
    if(!/^\d+$/.test(texto(linha[cols.cliente]))) continue;
    const saldo = paraNumero(linha[cols.saldo]);
    if(saldo===null) continue;
    const cel = leitura.textoDe(i, cols.barra);
    out.push({
      venc: formatData(linha[cols.venc]),
      fornecedor: texto(linha[cols.cliente]),
      nome: texto(linha[cols.nome]),
      doc: texto(linha[cols.duplicata]),
      prf: cols.prf>=0 ? texto(linha[cols.prf]) : '',
      valor: saldo,
      codigoTexto: cel.texto.trim(),
      codigoSuspeito: !cel.eraTexto,
      temCodigo: /\d/.test(cel.texto),
      linhaExcel: leitura.linhaExcel(i),
    });
  }
  return out;
}

/* -------------------------------------------------------------------
   CHECAGENS DOS ARQUIVOS (avisos no topo, antes do resultado)
   Conferem se os dois arquivos combinam: mesma data, mesma empresa e
   período. Não mudam o resultado da conferência, só avisam.
   ------------------------------------------------------------------- */

// datas dd/mm/aaaa (ou dd/mm/aa) que aparecem num texto ou numa célula de data,
// na ordem em que aparecem. Cada uma: { txt:'dd/mm/aaaa', t: milissegundos UTC }
function datasDoTexto(v){
  const s = formatData(v);
  const out = [];
  for(const m of s.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g)){
    const d = Number(m[1]), mes = Number(m[2]), a = m[3].length===2 ? 2000 + Number(m[3]) : Number(m[3]);
    const t = Date.UTC(a, mes - 1, d);
    const dt = new Date(t);
    if(dt.getUTCDate()!==d || dt.getUTCMonth()!==mes-1) continue;   // 31/02 etc.
    out.push({ txt:`${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${a}`, t });
  }
  return out;
}
// um dia em milissegundos e o nome de cada dia da semana (0 = domingo), para as faixas e avisos
const DIA_MS = 86400000;
const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// valor de um rótulo nas primeiras linhas (antes do cabeçalho): "Rótulo: valor" na
// mesma célula, ou o rótulo numa célula e o valor nas seguintes da mesma linha
function valorDoRotulo(m, fim, teste){
  for(let i=0; i<fim; i++){
    const linha = m[i] || [];
    for(let j=0; j<linha.length; j++){
      const n = normaliza(linha[j]);
      if(!n || !teste(n)) continue;
      const s = formatData(linha[j]);
      const depois = (s.includes(':') ? s.slice(s.indexOf(':') + 1) : s.replace(/^\S+/, '')).trim();
      if(depois) return depois;
      return linha.slice(j+1).filter(c => c!==null && c!=='').map(formatData).join(' ').trim();
    }
  }
  return '';
}

// topo do "Duplicatas em Aberto Modelo A": código da empresa (A1), data/hora
// do relatório (linha 1) e período (célula "Período").
// empresaAchada = a empresa da tabela EMPRESAS (js/empresas.js) pela 1ª linha, só para mostrar o nome.
function topoSistemaBoletos(m){
  const cab = acharCabecalho(m);
  const fim = cab>=0 ? cab : Math.min(m.length, 15);
  const a1 = formatData((m[0] || [])[0]);
  const empresa = (a1.match(/\d+/) || [''])[0];
  // data/hora: a primeira data da linha 1 (e a hora, se vier junto)
  let dataHora = '', data = null;
  for(const cel of (m[0] || [])){
    if(cel===null || cel==='') continue;
    const ds = datasDoTexto(cel);
    if(!ds.length) continue;
    data = ds[0];
    const s = formatData(cel);
    const hora = s.match(/\d{1,2}:\d{2}(:\d{2})?/) ||
                 formatData((m[0] || [])[(m[0] || []).indexOf(cel) + 1]).match(/^\d{1,2}:\d{2}(:\d{2})?$/);
    dataHora = data.txt + (hora ? ' ' + hora[0] : '');
    break;
  }
  const periodoTxt = valorDoRotulo(m, fim, n => n.startsWith('PERIODO'));
  const ds = datasDoTexto(periodoTxt);
  const periodo = ds.length ? { ini: ds[0], fim: ds[ds.length-1], txt: periodoTxt } : null;
  return { empresa, a1, dataHora, data, periodo, empresaAchada: identificaEmpresa(m) };
}

// nome da empresa e CNPJ do DDA do Itaú (linhas antes do cabeçalho)
function contaDoDdaItau(m){
  const cab = achaCabecalhoItau(m);
  const fim = cab>=0 ? cab : Math.min(m.length, 15);
  return {
    nome: valorDoRotulo(m, fim, n => n.startsWith('NOME DA EMPRESA')),
    cnpj: valorDoRotulo(m, fim, n => n.startsWith('CPF/CNPJ') || n.startsWith('CNPJ')),
  };
}

// período efetivo: se começa numa segunda-feira, inclui o sábado e o domingo
// anteriores (boleto que vence no fim de semana é pago na segunda)
function periodoEfetivo(periodo){
  if(!periodo) return null;
  const segunda = new Date(periodo.ini.t).getUTCDay() === 1;
  return { ini: segunda ? periodo.ini.t - 2*DIA_MS : periodo.ini.t, fim: periodo.fim.t, segunda };
}

// devolve a lista de checagens: { tipo:'ok'|'aviso'|'alerta', titulo, texto, itens:[...] }
// e marca nos boletos de fim de semana o aviso com a data original.
// linhas = resultado do conferirBoletos; dda = boletos lidos do DDA.
function checagensBoletos({ topo, consultaDda, conta, dda, linhas }){
  const out = [];

  // 1) mesma data
  const dDda = datasDoTexto(consultaDda)[0];
  if(!dDda || !topo.data){
    out.push({ tipo:'aviso', titulo:'Data dos arquivos',
      texto:`Não consegui comparar as datas. DDA: ${consultaDda || 'data/hora não encontrada'} · Relatório do sistema: ${topo.dataHora || 'data/hora não encontrada na linha 1'}.` });
  }else if(dDda.t !== topo.data.t){
    out.push({ tipo:'aviso', titulo:'Arquivos de dias diferentes',
      texto:`O DDA foi consultado em ${consultaDda} e o relatório do sistema é de ${topo.dataHora}. Gere os dois no mesmo dia para não faltar boleto ou título.` });
  }else{
    out.push({ tipo:'ok', titulo:'Mesma data', texto:`DDA consultado em ${consultaDda} · relatório do sistema de ${topo.dataHora}.` });
  }

  // 2) período: boletos do DDA que vencem fora dele
  const per = periodoEfetivo(topo.periodo);
  const dentro = [];
  if(!per){
    out.push({ tipo:'aviso', titulo:'Período do relatório',
      texto:'Não achei a célula "Período" no relatório do sistema, então não contei os boletos do DDA que vencem fora dele.' });
    dentro.push(...dda);
  }else{
    const fora = [], fimDeSemana = [];
    dda.forEach(b => {
      const v = datasDoTexto(b.venc)[0];
      if(!v || v.t < per.ini || v.t > per.fim){ fora.push(b); return; }
      dentro.push(b);
      if(per.segunda && v.t < topo.periodo.ini.t) fimDeSemana.push({ b, v });
    });
    const p = topo.periodo;
    const txtPer = p.ini.t===p.fim.t ? p.ini.txt : `${p.ini.txt} a ${p.fim.txt}`;
    const itens = [];
    if(fimDeSemana.length){
      itens.push(`O período começa numa segunda-feira: ${fimDeSemana.length} ${fimDeSemana.length===1 ? 'boleto que vence' : 'boletos que vencem'} no sábado ou domingo anterior ${fimDeSemana.length===1 ? 'entrou' : 'entraram'} no período (é pago na segunda):`);
      fimDeSemana.forEach(({ b, v }) => itens.push(`${NOMES_DIA[new Date(v.t).getUTCDay()]} ${v.txt} · ${b.beneficiario} · ${brl(b.valor)}`));
    }
    if(fora.length){
      itens.push(`${fora.length} ${fora.length===1 ? 'boleto vence' : 'boletos vencem'} fora do período:`);
      fora.forEach(b => itens.push(`${dataBR(b.venc) || 'sem vencimento'} · ${b.beneficiario} · ${brl(b.valor)}`));
    }
    out.push({ tipo: fora.length ? 'aviso' : 'ok', titulo:`Período do relatório: ${txtPer}`,
      texto: fora.length ? `${fora.length} de ${dda.length} boletos do DDA vencem fora do período do relatório; eles aparecem na aba "DDA sem título no sistema".`
                         : `Todos os ${dda.length} boletos do DDA vencem dentro do período${per.segunda ? ' (contando o fim de semana anterior)' : ''}.`,
      itens });
    // aviso na própria linha do boleto de fim de semana, com a data original
    fimDeSemana.forEach(({ b, v }) => {
      linhas.filter(l => l.boleto && l.boleto.idx===dda.indexOf(b)).forEach(l =>
        l.avisos.push(`vence ${NOMES_DIA[new Date(v.t).getUTCDay()]} ${v.txt}; pago na segunda ${p.ini.txt}`));
    });
  }

  // 3) mesma empresa: quantos boletos do DDA (dentro do período) casaram com o sistema
  const casados = new Set(linhas.filter(l => l.boleto && l.titulo).map(l => l.boleto.idx));
  const base = dentro.length ? dentro : dda;
  const nCasados = base.filter(b => casados.has(dda.indexOf(b))).length;
  const pct = base.length ? nCasados / base.length : 0;
  // nome da empresa só para mostrar (no antigo vinha de uma tabela fixa com a empresa 5)
  const nomeEmp = topo.empresaAchada ? `${topo.empresaAchada.nome}, CNPJ ${topo.empresaAchada.cnpj}` : '';
  const quem = `Relatório do sistema: empresa ${topo.empresa ? topo.empresa + (nomeEmp ? ' = ' + nomeEmp : '') : '(não achei o código na célula A1)'} · ` +
               `DDA: ${conta.nome || 'nome não encontrado'}${conta.cnpj ? ' · CNPJ ' + conta.cnpj : ''}`;
  const conta_ = `${nCasados} de ${base.length} boletos do DDA${dentro.length && per ? ' (dentro do período)' : ''} casaram com títulos do sistema (${Math.round(pct*100)}%, contando os códigos já lançados).`;
  if(pct < 0.10){
    out.unshift({ tipo:'alerta', titulo:'Os arquivos podem ser de empresas diferentes. Confira a empresa do relatório do sistema',
      texto: `${quem}. ${conta_}` });
  }else{
    out.push({ tipo:'ok', titulo:'Mesma empresa', texto:`${quem}. ${conta_}` });
  }
  return out;
}

// código de um boleto do DDA: bloqueia se a célula não era texto (pode ter perdido dígitos)
function validaBoletoDda(b){
  if(b.codigoSuspeito && b.codigoTexto)
    return { ok:false, tipo:'invalido', linha:'', cb:'', avisos:[],
             motivo:'código ilegível: no Excel do DDA o código de barras não está gravado como texto (pode ter perdido dígitos)' };
  return validaBoleto(b.codigoTexto, { banco:b.banco, valor:b.valor, venc:b.venc });
}

/* -------------------------------------------------------------------
   PAREAMENTO DA CONFERÊNCIA DE BOLETOS
   1) Um para um: título x boleto precisa de PELO MENOS 2 sinais entre
      nome, NF e valor. Só o valor nunca casa.
   2) Boleto agrupado: um boleto que paga 2 ou mais títulos do mesmo
      fornecedor, com soma exata ao centavo (subset-sum em centavos).
   3) Boleto que não fecha: boleto livre de um fornecedor com títulos sem
      boleto cuja soma é diferente (vai para a Verificação).
   4) O resto fica sem boleto / DDA sem título no sistema.
   ------------------------------------------------------------------- */

// PALAVRAS_IGNORADAS e palavrasDoNome ficam em js/conferencias/nomes.js (a mesma regra,
// usada também pelo Relatório contra relatório).

// palavra que aparece no nome de 3 ou mais fornecedores DIFERENTES do mesmo arquivo
// (ex.: o nome da cidade) não diz quem é o fornecedor: nesta conferência ela não conta.
// Cada arquivo é contado separado, porque o mesmo fornecedor costuma vir escrito de
// um jeito no DDA e de outro no sistema.
const MIN_FORNECEDORES_GENERICA = 3;
// Junta as palavras genéricas de cada lista de nomes (uma lista por arquivo). Devolve um Set.
function palavrasGenericas(...listasDeNomes){
  const genericas = new Set();
  listasDeNomes.forEach(nomes => {
    const porPalavra = new Map();
    new Set(nomes.map(n => limpaNome(normaliza(n)))).forEach(n => {
      palavrasDoNome(n).forEach(p => porPalavra.set(p, (porPalavra.get(p) || 0) + 1));
    });
    porPalavra.forEach((qtd, p) => { if(qtd >= MIN_FORNECEDORES_GENERICA) genericas.add(p); });
  });
  return genericas;
}
// as 5 primeiras letras do nome (só letras), para juntar títulos do mesmo fornecedor
const inicioDoNome = nome => (normaliza(nome).match(/[A-Z]+/g) || []).join('').slice(0, 5);

// NF sem zeros à esquerda; com menos de 3 dígitos não serve de sinal
function nfSinal(doc){
  const d = apenasDigitos(doc).replace(/^0+/, '');
  return d.length >= 3 ? d : '';
}
// sinal de NF: a NF aparece no COMEÇO dos dígitos do Nº Doc. (sem zeros à esquerda).
// Ex.: NF 13047 casa com Nº Doc. "013047-1", mas não com "1/13047".
const nfNoDoc = (nf, doc) => !!nf && apenasDigitos(doc).replace(/^0+/, '').startsWith(nf);

// Valor em centavos (número inteiro), para comparar sem erro de vírgula; null se não houver valor.
const emCentavos = v => (v===null || v===undefined || isNaN(v)) ? null : Math.round(v * 100);

// sinais entre um título do sistema e um boleto do DDA
function sinaisPar(t, b){
  const nome = [...t.palavras].some(p => b.palavras.has(p));
  const nf = nfNoDoc(t.nf, b.doc);
  const c = emCentavos(t.valor);
  const valorAteVenc = c === emCentavos(b.valor);
  const valorAPagar = !valorAteVenc && b.valorAPagar!==null && c === emCentavos(b.valorAPagar);
  const valor = valorAteVenc || valorAPagar;
  return { nome, nf, valor, valorAPagar, n: nome + nf + valor };
}

// distância em dias entre dois vencimentos (desempate: o mais perto ganha)
function distanciaDias(a, b){
  const da = datasDoTexto(a)[0], db = datasDoTexto(b)[0];
  return da && db ? Math.abs(da.t - db.t) / DIA_MS : 9999;
}

// 1) um para um. Monta todos os pares com 2 sinais ou mais e escolhe do mais forte
// para o mais fraco (3 sinais antes de 2; empate: vencimento mais perto, depois a
// ordem dos arquivos). Cada título e cada boleto entram em um par só.
function parearUmParaUm(titulos, boletos){
  const cand = [];
  titulos.forEach(t => boletos.forEach(b => {
    const s = sinaisPar(t, b);
    if(s.n >= 2) cand.push({ t, b, s, dist: distanciaDias(t.venc, b.venc) });
  }));
  cand.sort((x, y) => y.s.n - x.s.n || x.dist - y.dist || x.t.ref - y.t.ref || x.b.idx - y.b.idx);
  const tUsado = new Set(), bUsado = new Set(), pares = [];
  for(const c of cand){
    if(tUsado.has(c.t.ref) || bUsado.has(c.b.idx)) continue;
    tUsado.add(c.t.ref); bUsado.add(c.b.idx); pares.push(c);
  }
  return pares;
}

// subset-sum em centavos: acha itens cuja soma dá EXATAMENTE "alvo" e diz se essa
// combinação é a ÚNICA. Programação dinâmica: para cada soma alcançada guarda de
// onde ela veio (a soma anterior e o item somado) e de quantas formas dá para
// chegar nela (contando até 2: "uma" ou "mais de uma"); no fim refaz o caminho.
// itens: [{ c: centavos, ... }], todos positivos.
// Devolve { itens: [...] | null, unica: true/false, estourou: true/false }.
// estourou = passou de "limite" somas guardadas (desiste para não travar o navegador).
const LIMITE_SOMAS = 2000000;
// A busca da soma exata (regras no comentário acima).
function somaExata(itens, alvo, limite = LIMITE_SOMAS){
  const uteis = itens.filter(it => it.c > 0 && it.c <= alvo);
  if(alvo <= 0) return { itens:null, unica:false, estourou:false };
  // somas alcançadas e, para cada uma (mesma posição): a soma anterior, o item somado
  // e de quantas formas se chega nela (1 ou 2 = "mais de uma")
  const somas = [0], anterior = [-1], item = [-1], formas = [1];
  const pos = new Map([[0, 0]]);
  const caminho = () => {
    const usados = [];
    for(let k = pos.get(alvo); k > 0; k = pos.get(anterior[k])) usados.push(uteis[item[k]]);
    return usados.reverse();
  };
  for(let i = 0; i < uteis.length; i++){
    const v = uteis[i].c;
    const n = somas.length;
    // as formas são lidas de uma cópia de ANTES deste item, para ele não ser contado duas vezes
    const formasAntes = formas.slice(0, n);
    for(let j = 0; j < n; j++){
      const nova = somas[j] + v;
      if(nova > alvo) continue;
      const k = pos.get(nova);
      if(k !== undefined){ formas[k] = Math.min(2, formas[k] + formasAntes[j]); continue; }
      pos.set(nova, somas.length);
      somas.push(nova); anterior.push(somas[j]); item.push(i); formas.push(formasAntes[j]);
    }
    const kAlvo = pos.get(alvo);
    if(kAlvo !== undefined && formas[kAlvo] >= 2) return { itens: caminho(), unica:false, estourou:false };  // já é ambíguo
    if(somas.length > limite) return { itens:null, unica:false, estourou:true };
  }
  if(!pos.has(alvo)) return { itens:null, unica:false, estourou:false };
  return { itens: caminho(), unica: formas[pos.get(alvo)] === 1, estourou:false };
}

// combinação de 2 ou mais títulos para um boleto, com preferência para as notas
// cuja NF aparece no Nº Doc. do boleto. Devolve { titulos, unica, estourou } ou null.
function combinacaoDoBoleto(b, itens){
  const alvo = emCentavos(b.valor);
  // um título sozinho igual ao boleto não é agrupado (e não pode estar numa soma de 2+)
  const uteis = itens.filter(it => it.c < alvo);
  const docB = apenasDigitos(b.doc);
  const comNf = uteis.filter(it => it.t.nf && docB.includes(it.t.nf));
  if(comNf.length){
    const somaNf = comNf.reduce((s, it) => s + it.c, 0);
    if(somaNf === alvo && comNf.length >= 2) return { titulos: comNf.map(it => it.t), unica:true, estourou:false };
    if(somaNf < alvo){
      const r = somaExata(uteis.filter(it => !comNf.includes(it)), alvo - somaNf);
      if(r.itens) return { titulos: [...comNf, ...r.itens].map(it => it.t), unica: r.unica, estourou:false };
    }
    // as NFs do Nº Doc. não fecham a soma: tenta sem elas como preferência
  }
  const r = somaExata(uteis, alvo);
  if(r.estourou) return { titulos:[], unica:false, estourou:true };
  return r.itens ? { titulos: r.itens.map(it => it.t), unica: r.unica, estourou:false } : null;
}

// 2) boleto agrupado. Para cada boleto livre (do maior valor para o menor), junta
// os títulos sem par e os provisórios (bateram NF e nome, mas não o valor) com as
// mesmas 5 primeiras letras no nome e procura uma soma exata.
// Só agrupa quando a combinação é a ÚNICA; se houver mais de uma (ou notas demais
// para conferir), o boleto vai para "ambiguos" e nenhuma nota é marcada por ele.
function agruparBoletos(boletosLivres, titulosCandidatos){
  const grupos = [], ambiguos = [];
  const usado = new Set();
  [...boletosLivres].sort((a, b) => b.valor - a.valor || a.idx - b.idx).forEach(b => {
    const ini = inicioDoNome(b.beneficiario);
    if(!ini) return;
    const itens = titulosCandidatos
      .filter(t => !usado.has(t.ref) && inicioDoNome(t.nome) === ini)
      .map(t => ({ c: emCentavos(t.valor), t }));
    if(itens.length < 2) return;
    const achou = combinacaoDoBoleto(b, itens);
    if(!achou) return;
    if(!achou.unica){
      ambiguos.push({ b, exemplo: achou.titulos, candidatos: itens.map(it => it.t), estourou: achou.estourou });
      return;
    }
    achou.titulos.forEach(t => usado.add(t.ref));
    grupos.push({ b, titulos: achou.titulos });
  });
  return { grupos, ambiguos };
}

/* -------------------------------------------------------------------
   MOTIVOS DE VERIFICAÇÃO (além do boleto agrupado ambíguo)
   Um par título x boleto vai para a Verificação, com o motivo escrito, se:
   - o boleto está em nome de outra empresa (3 primeiras letras do primeiro
     nome diferentes, ou o nome não bateu no pareamento): "título cedido a
     factoring/fundo" se o beneficiário for FOMENTO, FIDC, FUNDO, FACTORING,
     SECURITIZ..., CRED..., COBRAN... ou PAGAMENTOS; senão "confirmar se é o
     mesmo fornecedor";
   - casou por nome e valor, mas o Nº Doc. traz a NF com 1 dígito diferente
     (ver umDigitoDiferente);
   - "A Pagar" diferente de "Até Venc.": "Desconto/abatimento: pagar R$ X";
   - bateram NF e nome mas não o valor: "Valor diferente: boleto R$ X x sistema R$ Y";
   - código do DDA inválido ou o aviso de vencimento do validaBoleto (boleto prorrogado?);
   - possível pagamento em duplicidade (ver marcaDuplicidade).
   Títulos com código no sistema ficam fora da conferência (ver conferirBoletos, passo 1).
   ------------------------------------------------------------------- */

// primeiro nome (primeira palavra só de letras), para comparar as 3 primeiras letras
const primeiroNome = nome => ((normaliza(nome).match(/[A-Z]+/g) || [''])[0]);
// true quando o boleto parece de outra empresa: as 3 primeiras letras do primeiro nome são diferentes.
function outraEmpresa(nomeSistema, beneficiario){
  const a = primeiroNome(nomeSistema).slice(0, 3), b = primeiroNome(beneficiario).slice(0, 3);
  return !!a && !!b && a !== b;
}
// comparadas pelo começo da palavra (CRED pega CREDITO, PAGAMENTO pega PAGAMENTOS)
const PALAVRAS_FACTORING = ['FOMENTO', 'FIDC', 'FUNDO', 'FACTORING', 'CRED', 'COBRAN', 'SECURITIZ', 'PAGAMENTO'];
// true quando o beneficiário tem cara de factoring, fundo ou instituição de pagamento.
function cedidoAFactoring(beneficiario){
  const palavras = normaliza(beneficiario).match(/[A-Z]+/g) || [];
  return palavras.some(p => PALAVRAS_FACTORING.some(f => p.startsWith(f)));
}
// A frase do boleto em nome de outra empresa: "título cedido..." (factoring/fundo) ou "confirmar...".
const motivoOutraEmpresa = beneficiario =>
  cedidoAFactoring(beneficiario) ? 'título cedido a factoring/fundo' : 'confirmar se é o mesmo fornecedor';

// NF com um dígito diferente: algum número do Nº Doc. (sem zeros à esquerda), ou o
// começo dos dígitos dele, tem o mesmo tamanho da NF e só 1 dígito diferente.
// Devolve esse número ('' se não houver). Ex.: NF 256 x Nº Doc. 246.
function umDigitoDiferente(nf, doc){
  if(!nf) return '';
  const tiraZeros = s => s.replace(/^0+/, '');
  const cands = (String(doc || '').match(/\d+/g) || []).map(tiraZeros);
  cands.push(tiraZeros(apenasDigitos(doc)).slice(0, nf.length));
  for(const c of cands){
    if(c.length !== nf.length || c === nf) continue;
    let dif = 0;
    for(let i = 0; i < c.length; i++) if(c[i] !== nf[i]) dif++;
    if(dif === 1) return c;
  }
  return '';
}

// FOLHA E IMPOSTOS: nunca vêm no DDA. Ficam fora do pareamento e aparecem num
// bloco no fim da aba "Sem boleto", uma linha por tipo. A ordem importa: o
// primeiro tipo que aparecer no nome é o que vale.
const TIPOS_FOLHA = [
  ['13º salário',           /\b13\S*\s*SALARIO/],
  ['Consignado',            /CONSIGNADO/],
  ['INSS',                  /\bINSS\b/],
  ['FGTS',                  /\bFGTS\b/],
  ['IRRF',                  /\bIRRF\b/],
  ['DARF',                  /\bDARF\b/],
  ['Pensão alimentícia',    /PENSAO ALIMENT/],
  ['Contribuição sindical', /CONTRIBUICAO SINDICAL/],
  ['Rescisão',              /RESCIS/],
  ['Férias',                /FERIAS/],
  ['Folha',                 /\bFOLHA\b/],
  ['Salário',               /SALARIO/],
];
// O tipo de folha ou imposto pelo nome do título ('' quando não é folha nem imposto).
function tipoFolha(nome){
  const n = normaliza(nome);
  const achou = TIPOS_FOLHA.find(([, re]) => re.test(n));
  return achou ? achou[0] : '';
}

// banco de um boleto do DDA: pelo código (se válido) ou pela coluna Banco
const bancoDoBoleto = b => b.val && b.val.ok ? b.val.cb.slice(0, 3) : apenasDigitos(b.banco).padStart(3, '0');

// possível pagamento em duplicidade, entre as linhas que têm título e boleto, e os
// boletos do DDA sem título:
//  a) mesmo fornecedor (código do sistema) e mesmo valor em NFs diferentes;
//  b) a mesma linha digitável em mais de uma linha (as notas de um mesmo boleto
//     agrupado contam como uma só).
// Quem estava em "Com boleto" ou "DDA sem título" vai para a Verificação; os títulos
// com código no sistema (fora da conferência) só ganham o aviso.
function marcaDuplicidade(linhas){
  const marca = (l, texto) => {
    if(l.grupo === 'bolJa' || l.grupo === 'bolCodSis'){ l.avisos.push(texto); return; }
    l.motivo = l.motivo ? `${l.motivo} · ${texto}` : texto;
    l.grupo = 'bolVerif';
  };
  // a) por fornecedor + valor
  const porFornValor = new Map();
  linhas.filter(l => l.titulo && l.boleto).forEach(l => {
    const k = `${l.titulo.fornecedor}|${emCentavos(l.titulo.valor)}`;
    porFornValor.set(k, [...(porFornValor.get(k) || []), l]);
  });
  porFornValor.forEach(ls => {
    const nfs = [...new Set(ls.map(l => l.titulo.doc))];
    const boletos = new Set(ls.map(l => l.boleto.idx));
    if(nfs.length < 2 || boletos.size < 2) return;   // notas do mesmo agrupado não contam
    const texto = `possível pagamento em duplicidade: mesmo fornecedor e mesmo valor (${brl(ls[0].titulo.valor)}) nas NFs ${nfs.join(', ')}`;
    ls.forEach(l => marca(l, texto));
  });
  // b) mesma linha digitável
  const porLinha = new Map();
  linhas.filter(l => l.linha).forEach(l => porLinha.set(l.linha, [...(porLinha.get(l.linha) || []), l]));
  porLinha.forEach(ls => {
    const unidades = new Set(ls.map(l => l.agrupado ? 'g' + l.agrupado.idx : 'l' + linhas.indexOf(l)));
    if(unidades.size < 2) return;
    const nfs = ls.map(l => l.titulo ? l.titulo.doc : 'só no DDA').join(', ');
    const texto = `possível pagamento em duplicidade: a mesma linha digitável aparece em ${unidades.size} lugares (${nfs})`;
    ls.forEach(l => marca(l, texto));
  });
}

// ETAPA 4: título com código no sistema que não é o de um boleto do DDA.
// Procura um boleto LIVRE com o mesmo valor e com a NF no Nº Doc. ou nome parecido
// (preferência: 1º Nº Doc. com a NF, 2º vencimento do código igual ao do boleto) e
// devolve a frase do que fazer. NUNCA corrige o código do sistema.
const MSG_COD_SIS = {
  invalidoComDda: 'Código digitado no sistema é INVÁLIDO. Use o código do DDA ao lado',
  invalidoSemDda: 'Código digitado no sistema é INVÁLIDO. Peça o boleto ao fornecedor',
  trocado:        'Boleto trocado: confirme com o fornecedor qual é o válido. Não pague os dois.',
  diferente:      'Código do sistema diferente do boleto do DDA. Use o do DDA e corrija o lançamento',
  foraDoDda:      'Código válido, mas não aparece no DDA. Confirme se o boleto ainda está em aberto.',
  repetido:       'O mesmo código já está lançado em outro título do sistema. Confira qual NF ele paga; não pague duas vezes.',
};
// Procura no DDA o boleto livre de um título com código errado (regras no comentário acima). null se não achar.
function procuraBoletoDoCodigo(p, livres, genericas){
  const t = p.t, c = emCentavos(t.valor), nf = nfSinal(t.doc);
  const palavras = palavrasDoNome(t.nome, genericas);
  const vencCodigo = p.cb ? decodifica(p.cb).venc : '';
  const cand = livres
    .filter(b => emCentavos(b.valor) === c || (b.valorAPagar !== null && b.valorAPagar !== undefined && emCentavos(b.valorAPagar) === c))
    .map(b => ({ b,
      nfDoc: !!nf && apenasDigitos(b.doc).includes(nf),
      nome: [...palavras].some(x => palavrasDoNome(b.beneficiario, genericas).has(x)),
      mesmoVenc: !!vencCodigo && formatData(b.venc) === vencCodigo }))
    .filter(x => x.nfDoc || x.nome)
    .sort((x, y) => (y.nfDoc - x.nfDoc) || (y.mesmoVenc - x.mesmoVenc) || (y.nome - x.nome) || x.b.idx - y.b.idx);
  return cand.length ? cand[0].b : null;
}
// A frase do que fazer com o código do sistema (uma das MSG_COD_SIS), conforme o caso.
function fraseCodSis(p, achado){
  if(p.invalido) return achado && achado.val.ok ? MSG_COD_SIS.invalidoComDda : MSG_COD_SIS.invalidoSemDda;
  if(!achado) return p.repetido ? MSG_COD_SIS.repetido : MSG_COD_SIS.foraDoDda;
  if(bancoDoBoleto(achado) !== p.cb.slice(0, 3)) return MSG_COD_SIS.trocado;
  return MSG_COD_SIS.diferente;
}

// a conferência: devolve as linhas da tabela, cada uma com
// { grupo, titulo, boleto, linha, bloqueio, motivo, avisos }
//   grupo    = bolOk | bolVerif | bolCodSis | bolJa | bolSem | bolFolha | bolDda
//   linha    = linha digitável (47) só quando dá para usar; '' quando bloqueado
//   bloqueio = por que o código do DDA foi bloqueado
//   motivo   = o que verificar (grupo Verificação)
//   sinais   = o que bateu no um para um: 'nome', 'nf', 'valor'
//   agrupado = { n, k, idx } quando o boleto paga n títulos (este é o k-ésimo)
function conferirBoletos(dda, titulos){
  const boletos = dda.map((b, i) => ({ ...b, idx:i, val: validaBoletoDda(b) }));
  const porCb = new Map();
  boletos.forEach(b => { if(b.val.ok && !porCb.has(b.val.cb)) porCb.set(b.val.cb, b); });
  const usados = new Set();
  const linhas = [];
  const add = (grupo, titulo, boleto, extra) =>
    linhas.push({ grupo, titulo, boleto, linha:'', bloqueio:'', motivo:'', avisos:[], ...extra });

  // 1) títulos que já têm código no sistema: ficam fora da conferência, só o código
  //    é conferido (validaBoleto) e procurado no DDA. Folha e impostos ficam de fora.
  const semCodigo = [], codErrado = [];
  titulos.forEach((t, ref) => {
    const tt = { ...t, ref };
    if(!t.temCodigo){
      const tipo = tipoFolha(t.nome);
      if(tipo) add('bolFolha', tt, null, { tipoFolha: tipo });
      else semCodigo.push(tt);
      return;
    }
    if(t.codigoSuspeito){ codErrado.push({ t:tt, invalido:true, detalhe:'ilegível: a célula não está gravada como texto e pode ter perdido dígitos' }); return; }
    const e = validaEstrutura(t.codigoTexto);
    if(e.tipo==='consumo'){ add('bolJa', tt, null, { avisos:['conta de consumo (não é conferida como boleto)'] }); return; }
    if(!e.ok){ codErrado.push({ t:tt, invalido:true, detalhe:e.motivo }); return; }
    const b = porCb.get(e.cb);
    if(!b){ codErrado.push({ t:tt, cb:e.cb }); return; }
    if(usados.has(b.idx)){ codErrado.push({ t:tt, cb:e.cb, repetido:true }); return; }
    const v = validaBoleto(t.codigoTexto, { banco:b.banco, valor:b.valor, venc:b.venc });
    if(!v.ok){ codErrado.push({ t:tt, invalido:true, detalhe:v.motivo }); return; }
    usados.add(b.idx);
    // fora da conferência: os motivos de Verificação viram só aviso
    const avisos = [...v.avisos];
    if(outraEmpresa(t.nome, b.beneficiario)) avisos.push(motivoOutraEmpresa(b.beneficiario));
    if(b.comDesconto && b.valorAPagar!==null) avisos.push(`Desconto/abatimento: pagar ${brl(b.valorAPagar)}`);
    add('bolJa', tt, b, { linha:v.linha, avisos });
  });

  const genericas = palavrasGenericas(titulos.map(t => t.nome), dda.map(b => b.beneficiario));

  // 1b) código do sistema errado ou fora do DDA: procura o boleto certo (etapa 4).
  //     O boleto achado fica "usado" e não entra mais na conferência.
  codErrado.forEach(p => {
    const achado = procuraBoletoDoCodigo(p, boletos.filter(b => !usados.has(b.idx)), genericas);
    if(achado) usados.add(achado.idx);
    const detalhes = [
      p.detalhe && `código do sistema ${p.detalhe}`,
      `código do sistema na linha ${p.t.linhaExcel} do relatório`,
      achado && !achado.val.ok && `o código do DDA também está bloqueado (${achado.val.motivo}): peça o boleto ao fornecedor`,
      achado && outraEmpresa(p.t.nome, achado.beneficiario) && motivoOutraEmpresa(achado.beneficiario),
      achado && achado.comDesconto && achado.valorAPagar!==null && `Desconto/abatimento: pagar ${brl(achado.valorAPagar)}`,
    ].filter(Boolean);
    add('bolCodSis', p.t, achado, { linha: achado && achado.val.ok ? achado.val.linha : '',
      motivo: [fraseCodSis(p, achado), ...detalhes].join(' · '), codigoSistemaInvalido: !!p.invalido });
  });

  // 2) os títulos sem código procuram o boleto no DDA (regras em PAREAMENTO, acima)
  const tits = semCodigo.map(t => ({ ...t, palavras: palavrasDoNome(t.nome, genericas), nf: nfSinal(t.doc) }));
  const livres = boletos.filter(b => !usados.has(b.idx))
    .map(b => ({ ...b, palavras: palavrasDoNome(b.beneficiario, genericas) }));
  const titulo = s => ({ ...titulos[s.ref], ref:s.ref });
  const boleto = b => boletos[b.idx];

  // 2.1) um para um. Par sem o sinal de valor (bateram NF e nome) é provisório:
  //      o título pode ser uma das notas de um boleto agrupado
  const pares = parearUmParaUm(tits, livres);
  const firmes = pares.filter(p => p.s.valor);
  const provisorios = pares.filter(p => !p.s.valor);
  const tPareado = new Set(pares.map(p => p.t.ref));
  const bFirme = new Set(firmes.map(p => p.b.idx));

  // 2.2) boleto agrupado: boletos sem par firme x títulos sem par + provisórios
  const candidatos = [...tits.filter(t => !tPareado.has(t.ref)), ...provisorios.map(p => p.t)];
  const { grupos, ambiguos } = agruparBoletos(livres.filter(b => !bFirme.has(b.idx)), candidatos);
  const tNoGrupo = new Set(grupos.flatMap(g => g.titulos.map(t => t.ref)));
  // boleto ambíguo também fica "ocupado": vai sozinho para a Verificação
  const bNoGrupo = new Set([...grupos, ...ambiguos].map(g => g.b.idx));
  // o provisório vale se nem o título nem o boleto dele foram para um grupo
  const finais = [...firmes, ...provisorios.filter(p => !tNoGrupo.has(p.t.ref) && !bNoGrupo.has(p.b.idx))];

  // cada par (um para um ou nota de um agrupado) vai para "Com boleto" só se não
  // tiver nenhum motivo de Verificação (regras em MOTIVOS DE VERIFICAÇÃO, acima)
  const poePar = (t, bo, s, extra) => {
    const v = bo.val;
    const avisos = [...(extra.avisos || [])];
    const motivos = [];
    if(!v.ok) motivos.push('código do boleto no DDA bloqueado');
    if(s && !s.valor) motivos.push(`Valor diferente: boleto ${brl(bo.valor)} x sistema ${brl(t.valor)}`);
    if(s && s.nome && s.valor && !s.nf){
      const nfBoleto = umDigitoDiferente(nfSinal(t.doc), bo.doc);
      if(nfBoleto) motivos.push(`O boleto é da NF ${nfBoleto} e no sistema está NF ${t.doc}; confirmar (pode ser erro de digitação)`);
    }
    const outra = outraEmpresa(t.nome, bo.beneficiario) || (s && !s.nome);
    if(outra) motivos.push(motivoOutraEmpresa(bo.beneficiario));
    if(bo.comDesconto && bo.valorAPagar!==null) motivos.push(`Desconto/abatimento: pagar ${brl(bo.valorAPagar)}`);
    (v.avisos || []).forEach(a => (a.startsWith('vencimento do código') ? motivos : avisos).push(a));
    if(!mesmaData(t.venc, bo.venc)) avisos.push('vencimento no sistema diferente do DDA');
    add(motivos.length ? 'bolVerif' : 'bolOk', t, bo, { linha: v.ok ? v.linha : '', bloqueio: v.ok ? '' : v.motivo,
      avisos, motivo: motivos.join(' · '), ...(s ? { sinais: ['nome', 'nf', 'valor'].filter(k => s[k]) } : {}),
      ...(extra.agrupado ? { agrupado: extra.agrupado } : {}) });
  };

  finais.forEach(({ t: tp, b: bp, s }) => poePar(titulo(tp), boleto(bp), s, {}));

  grupos.forEach(g => {
    const bo = boleto(g.b), n = g.titulos.length;
    const nfs = g.titulos.map(t => t.doc || '?').join(', ');
    g.titulos.forEach((tg, k) => {
      const info = `boleto agrupado (${k + 1} de ${n}): um boleto de ${brl(bo.valor)} paga ${n} títulos (NF ${nfs}). Pague uma vez só.`;
      poePar(titulo(tg), bo, null, { avisos:[info], agrupado:{ n, k: k + 1, idx: bo.idx } });
    });
  });

  // boleto que pode pagar mais de uma combinação de notas: nenhuma nota é marcada;
  // o boleto vai para a Verificação com as notas candidatas
  ambiguos.forEach(a => {
    const bo = boleto(a.b), v = bo.val;
    const lista = ts => ts.map(t => `${t.doc || '?'} (${brl(t.valor)})`).join(', ');
    const motivo = a.estourou
      ? `boleto agrupado: há notas demais de ${bo.beneficiario} para conferir a soma (${a.candidatos.length} notas). Confira no boleto quais notas ele paga.`
      : `boleto agrupado ambíguo: há mais de uma combinação de notas que soma ${brl(bo.valor)}. Exemplo: NF ${lista(a.exemplo)}. ` +
        `Confira no boleto quais notas ele paga. Notas candidatas: NF ${lista(a.candidatos)}.`;
    add('bolVerif', null, bo, { linha: v.ok ? v.linha : '', bloqueio: v.ok ? '' : v.motivo, avisos:[...(v.avisos || [])], motivo, ambiguo:true });
  });

  // 3) o resto: título sem boleto e boleto sem título
  const tFinal = new Set([...finais.map(p => p.t.ref), ...tNoGrupo]);
  const bFinal = new Set([...finais.map(p => p.b.idx), ...bNoGrupo]);
  const semBoleto = tits.filter(t => !tFinal.has(t.ref));
  semBoleto.forEach(s => add('bolSem', titulo(s), null, {}));

  // 3.1) boleto que não fecha: sobrou um boleto de um fornecedor (mesmas 5 primeiras
  //      letras) que tem títulos sem boleto, e a soma deles é diferente do boleto.
  //      O boleto vai para a Verificação; as NFs continuam em "Sem boleto".
  livres.filter(b => !bFinal.has(b.idx)).forEach(b => {
    const bo = boleto(b), v = bo.val;
    const ini = inicioDoNome(bo.beneficiario);
    const doFornecedor = ini ? semBoleto.filter(t => inicioDoNome(t.nome) === ini) : [];
    const soma = doFornecedor.reduce((s, t) => s + emCentavos(t.valor), 0);
    const alvo = emCentavos(bo.valor);
    const extra = { linha: v.ok ? v.linha : '', bloqueio: v.ok ? '' : v.motivo, avisos:[...(v.avisos || [])] };
    if(doFornecedor.length && soma !== alvo){
      const n = doFornecedor.length;
      const as = n === 1 ? 'a NF' : `as ${n} NFs`;
      const dica = soma < alvo ? 'O boleto deve incluir nota que não está no relatório; peça o demonstrativo.'
                               : 'O boleto não paga todas as notas; peça o demonstrativo para saber quais ele paga.';
      add('bolVerif', null, bo, { ...extra, naoFecha:true, motivo:
        `Boleto de ${brl(bo.valor)} do fornecedor ${bo.beneficiario} não fecha com ${as} do sistema ` +
        `(soma ${brl(soma / 100)}, diferença ${brl(Math.abs(alvo - soma) / 100)}). ${dica}` });
      return;
    }
    add('bolDda', null, bo, extra);
  });

  marcaDuplicidade(linhas);

  // ordem: o que precisa de atenção primeiro
  const ORDEM = ['bolVerif', 'bolOk', 'bolCodSis', 'bolDda', 'bolSem', 'bolFolha', 'bolJa'];
  linhas.sort((a, b) => ORDEM.indexOf(a.grupo) - ORDEM.indexOf(b.grupo));
  linhas.forEach(l => {
    const t = l.titulo, b = l.boleto;
    l.grupos = [l.grupo];
    // boleto agrupado: cada título entra com o saldo dele (a soma dá o valor do boleto)
    l.valor = l.agrupado || !b ? t.valor : b.valor;
    const textos = [t && t.nome, b && b.beneficiario, t && t.doc, t && t.prf, t && t.fornecedor, b && b.doc, b && b.cnpj,
                    b && b.banco, dataBR(t ? t.venc : b.venc), brl(l.valor), l.motivo, l.bloqueio];
    const digitos = [centavos(l.valor), t && centavos(t.valor), t && apenasDigitos(t.doc), t && t.fornecedor,
                     b && apenasDigitos(b.doc), b && apenasDigitos(b.cnpj), l.linha, b && b.codigoBarras, t && apenasDigitos(t.codigoTexto)];
    l.texto = normaliza(textos.filter(Boolean).join(' | '));
    l.digitos = digitos.filter(Boolean).join('|');
  });
  return linhas;
}

/* -------------------------------------------------------------------
   AS 4 ABAS (iguais na tela e no Excel)
   O resultado do conferirBoletos é separado em 4 abas: Com boleto,
   Verificação, Sem boleto e DDA sem título no sistema. Cada linha tem um
   status; o nome e a cor de cada status ficam só em STATUS_BOL (tela,
   Excel e Ajuda). cor = uma das cores de status de css/base.css (no Excel,
   CORES_STATUS de js/excel.js); 'grupo' e 'compoe' são o azul do boleto agrupado.
   Se o período tem mais de um vencimento, cada aba é separada em faixas por
   data, com o subtotal de cada data (linhas 'faixa' e 'subtotal').
   A tela (js/telas/boletos.js) e o Excel (js/excel.js) só desenham estas linhas.
   ------------------------------------------------------------------- */
const STATUS_BOL = {
  ok:      { nome:'Com boleto',        cor:'ok',
             ajuda:'Título achado no DDA, um para um, sem nenhuma pendência. Pode copiar a linha digitável e pagar.' },
  grupo:   { nome:'Boleto agrupado',   cor:'grupo',
             ajuda:'Um boleto só que paga várias NFs: a soma delas dá exatamente o valor do boleto. Pague uma vez só.' },
  compoe:  { nome:'Compõe o boleto',   cor:'compoe',
             ajuda:'NF que faz parte do boleto agrupado logo acima. Não tem linha digitável própria.' },
  verif:   { nome:'Verificar',         cor:'aviso',
             ajuda:'Precisa de conferência antes de pagar. A coluna "O que verificar" diz o quê.' },
  bloq:    { nome:'Bloqueado',         cor:'alerta',
             ajuda:'O código de barras não passou na conferência (tamanho, dígitos, banco ou valor). Não há linha digitável para copiar: peça o boleto certo.' },
  codsis:  { nome:'Código do sistema', cor:'alerta',
             ajuda:'O título já tinha código no sistema, mas ele é inválido, de outro boleto ou não está no DDA. O site nunca corrige o código: corrija o lançamento. Quando há linha digitável, ela é a do boleto do DDA.' },
  sem:     { nome:'Sem boleto',        cor:'neutro',
             ajuda:'Título do sistema sem boleto no DDA. Pode ser Pix, transferência ou boleto ainda não emitido.' },
  consumo: { nome:'Conta de consumo',  cor:'neutro',
             ajuda:'Conta de consumo (energia, água, telefone...). Não é boleto bancário e não é conferida aqui.' },
  folha:   { nome:'Folha e impostos',  cor:'neutro',
             ajuda:'Consignado, INSS, FGTS, IRRF, DARF, folha, férias, rescisão... Nunca vêm no DDA: aparecem somados por tipo no fim da aba "Sem boleto".' },
  dda:     { nome:'Só no DDA',         cor:'confirmar',
             ajuda:'Boleto do DDA que não casou com nenhum título. Veja se falta lançar a nota. Se ninguém reconhecer o boleto, não pague.' },
};

// Linha de faixa (data) ou subtotal: não é status, só formatação. true para essas linhas.
const ehFaixa = r => r.status === 'faixa' || r.status === 'subtotal';

// As 4 abas, na ordem dos cartões. cor = cor do cartão; planilha = nome da aba no Excel (sem acento, como no antigo).
const ABAS_BOL = [
  { id:'ok',    nome:'Com boleto',                planilha:'Com boleto',     cor:'ok' },
  { id:'verif', nome:'Verificação',               planilha:'Verificacao',    cor:'aviso' },
  { id:'sem',   nome:'Sem boleto',                planilha:'Sem boleto',     cor:'neutro' },
  { id:'dda',   nome:'DDA sem título no sistema', planilha:'DDA sem titulo', cor:'confirmar' },
];
// colunas de cada aba (iguais na tela e no Excel). O valor é sempre a 4ª coluna.
function colunasAbaBol(aba){
  if(aba === 'dda') return [
    { id:'fornecedor', cab:'Beneficiário',     w:44 },
    { id:'nf',         cab:'Nº Doc.',          w:18, texto:true },
    { id:'venc',       cab:'Vencimento',       w:13 },
    { id:'valor',      cab:'Valor',            w:16 },
    { id:'cb',         cab:'Código de Barras', w:50, texto:true },
    { id:'linha',      cab:'Linha Digitável',  w:52, texto:true },
    { id:'verificar',  cab:'Observação',       w:50 },
  ];
  const cols = [
    { id:'codForn',    cab:'Cód. Fornecedor', w:16, texto:true },
    { id:'fornecedor', cab:'Fornecedor',      w:44 },
    { id:'nf',         cab:'NF',              w:14, texto:true },
    { id:'valor',      cab:'Valor',           w:16 },
  ];
  if(aba !== 'sem') cols.push({ id:'cb',    cab:'Código de Barras', w:50, texto:true },
                              { id:'linha', cab:'Linha Digitável',  w:52, texto:true });
  if(aba === 'verif') cols.push({ id:'verificar', cab:'O que verificar', w:70 });
  return cols;
}

// ordem: fornecedor e NF (NF como número: 900 antes de 1000)
const ordemFornNf = (a, b) => normaliza(a.fornecedor).localeCompare(normaliza(b.fornecedor)) ||
                              String(a.nf).localeCompare(String(b.nf), 'pt-BR', { numeric:true });

// uma linha de aba. conta = entra na quantidade e no total do cartão (as NFs que
// compõem um boleto agrupado não contam: o boleto já conta uma vez).
// qtd = quantos títulos a linha representa (a linha de um tipo de folha soma vários)
function linhaAbaBol(status, { t, b, linha, valor, verificar, nf, obs, conta = true, bloco, venc, qtd = 1 }){
  const r = {
    status, bloco, conta, qtd,
    codForn: t ? String(t.fornecedor || '') : '',
    fornecedor: t ? t.nome : (b ? b.beneficiario : ''),
    nf: nf !== undefined ? nf : (t ? String(t.doc || '') : ''),
    venc: dataBR(venc !== undefined ? venc : (t ? t.venc : (b ? b.venc : ''))) || '',
    valor, linha: linha || '', cb: linha ? linhaParaBarras(linha) : '',
    verificar: verificar || '', obs: obs || [],
  };
  r.dec = r.cb ? decodifica(r.cb) : null;
  r.texto = normaliza([r.codForn, r.fornecedor, b && b.beneficiario, r.nf, b && b.doc, r.venc, brl(valor), r.verificar].filter(Boolean).join(' | '));
  r.digitos = [centavos(valor), r.codForn, apenasDigitos(r.nf), b && apenasDigitos(b.doc), r.linha, r.cb].filter(Boolean).join('|');
  return r;
}
// linha de faixa (data) ou subtotal: nunca casa com a busca
function linhaFaixa(status, rotulo, valor, bloco){
  return { status, bloco, conta:false, qtd:0, codForn:'', fornecedor:rotulo, nf:'', venc:'', valor, linha:'', cb:'',
           verificar:'', obs:[], dec:null, texto:'', digitos:'' };
}

// Rótulo da faixa de uma data: "Vencimento 14/11/2026 (sábado)".
const rotuloData = venc => {
  const d = datasDoTexto(venc)[0];
  return d ? `Vencimento ${d.txt} (${NOMES_DIA[new Date(d.t).getUTCDay()]})` : 'Sem vencimento';
};

// separa uma aba em faixas por data (pela data da 1ª linha de cada bloco), com o
// subtotal de cada data. Dentro de cada data a ordem da aba é mantida.
function faixasPorData(linhas, proximoBloco){
  const blocos = [];
  linhas.forEach(r => {
    const ult = blocos[blocos.length - 1];
    if(ult && ult.bloco === r.bloco) ult.linhas.push(r);
    else blocos.push({ bloco:r.bloco, venc:r.venc, linhas:[r] });
  });
  const chave = v => { const d = datasDoTexto(v)[0]; return d ? d.t : Infinity; };
  const porData = new Map();
  blocos.forEach(b => {
    const k = chave(b.venc);
    porData.set(k, [...(porData.get(k) || []), b]);
  });
  const out = [];
  [...porData.keys()].sort((a, b) => a - b).forEach(k => {
    const bs = porData.get(k);
    const rot = rotuloData(bs[0].venc);
    const ls = bs.flatMap(b => b.linhas);
    const res = resumoAba(ls);
    out.push(linhaFaixa('faixa', rot, null, proximoBloco()), ...ls,
             linhaFaixa('subtotal', `Subtotal ${rot.replace('Vencimento ', '')} · ${res.qtd === 1 ? '1 item' : res.qtd + ' itens'}`, res.total, proximoBloco()));
  });
  return out;
}

// distribui as linhas do conferirBoletos nas 4 abas.
// opcoes.porData = o período do relatório tem mais de um vencimento (faixas por data)
function montaAbasBol(linhas, opcoes = {}){
  const ok = [], grupos = new Map(), amarelos = [], vermelhos = [], codSis = [], sem = [], dda = [], folha = new Map();
  const juntaVerificar = l => [l.bloqueio && 'Bloqueado: ' + l.bloqueio, l.motivo, ...l.avisos].filter(Boolean).join(' · ');
  let bloco = 0;
  const proximoBloco = () => ++bloco;
  let jaConferidos = 0;
  linhas.forEach(l => {
    const t = l.titulo, b = l.boleto;
    if(l.agrupado){ grupos.set(l.agrupado.idx, [...(grupos.get(l.agrupado.idx) || []), l]); return; }
    if(l.grupo === 'bolFolha'){ folha.set(l.tipoFolha, [...(folha.get(l.tipoFolha) || []), t]); return; }
    bloco++;
    if(l.grupo === 'bolOk'){
      ok.push(linhaAbaBol('ok', { t, b, linha:l.linha, valor:b.valor, obs:l.avisos, bloco }));
    }else if(l.grupo === 'bolJa' && !b){
      sem.push(linhaAbaBol('consumo', { t, valor:t.valor, bloco }));
    }else if(l.grupo === 'bolJa'){
      // código já lançado no sistema e igual ao do DDA: fora da conferência. Só aparece
      // (na Verificação) se tiver algum aviso; senão só entra na contagem.
      if(l.avisos.length) amarelos.push(linhaAbaBol('verif', { t, b, linha:l.linha, valor:b.valor, bloco,
        verificar:'Código já lançado no sistema. ' + l.avisos.join(' · ') }));
      else jaConferidos++;
    }else if(l.grupo === 'bolCodSis'){
      codSis.push(linhaAbaBol('codsis', { t, b, linha:l.linha, valor:t.valor, verificar: juntaVerificar(l), bloco }));
    }else if(l.grupo === 'bolSem'){
      sem.push(linhaAbaBol('sem', { t, valor:t.valor, bloco }));
    }else if(l.grupo === 'bolDda'){
      const obs = [l.bloqueio && 'Bloqueado: ' + l.bloqueio, ...l.avisos].filter(Boolean).join(' · ');
      dda.push(linhaAbaBol(l.bloqueio ? 'bloq' : 'dda', { t:null, b, linha:l.linha, valor:b.valor, nf:String(b.doc || ''),
        verificar: obs, bloco }));
    }else{
      // bolVerif: vermelho quando o código do DDA não pode ser usado
      const bloq = !!l.bloqueio;
      (bloq ? vermelhos : amarelos).push(linhaAbaBol(bloq ? 'bloq' : 'verif', { t, b, linha:l.linha,
        valor: b ? b.valor : t.valor, verificar: juntaVerificar(l), bloco }));
    }
  });

  // boletos agrupados: uma linha azul para o boleto e, abaixo, as NFs (sem repetir a linha digitável)
  const blocosGrupo = [...grupos.values()].map(ls => {
    bloco++;
    ls.sort((x, y) => String(x.titulo.doc).localeCompare(String(y.titulo.doc), 'pt-BR', { numeric:true }));
    const b = ls[0].boleto, n = ls.length;
    const bloqueado = !!ls[0].bloqueio;
    const codigos = [...new Set(ls.map(l => l.titulo.fornecedor))];
    const extras = [...new Set(ls.flatMap(l => (l.motivo || '').split(' · ').filter(Boolean)))];
    const verificar = [bloqueado && 'Bloqueado: ' + ls[0].bloqueio,
      `Boleto único: a soma das ${n} NFs abaixo dá ${brl(b.valor)}. Pagar uma vez só.`, ...extras].filter(Boolean).join(' · ');
    const venc = ls[0].titulo.venc;
    const cab = linhaAbaBol(bloqueado ? 'bloq' : 'grupo', { t:null, b, linha: bloqueado ? '' : ls[0].linha, valor:b.valor,
      nf:`${n} NFs`, verificar, bloco, venc });
    cab.codForn = codigos.length === 1 ? String(codigos[0]) : '';
    cab.fornecedor = ls[0].titulo.nome;
    cab.texto = normaliza([cab.texto, ...ls.map(l => l.titulo.doc)].join(' | '));
    const filhos = ls.map(l => linhaAbaBol('compoe', { t:l.titulo, b, valor:l.titulo.valor, verificar:'compõe o boleto acima', conta:false, bloco, venc }));
    return [cab, ...filhos];
  }).sort((x, y) => ordemFornNf(x[0], y[0]));

  // folha e impostos: um bloco cinza no fim da aba "Sem boleto", uma linha por tipo
  const blocoFolha = [];
  if(folha.size){
    const b0 = proximoBloco();
    blocoFolha.push(linhaFaixa('faixa', 'Folha e impostos (não vêm no DDA)', null, b0));
    TIPOS_FOLHA.map(([tipo]) => tipo).filter(tipo => folha.has(tipo)).forEach(tipo => {
      const ts = folha.get(tipo);
      const codigos = [...new Set(ts.map(t => String(t.fornecedor)))];
      const nomes = [...new Set(ts.map(t => t.nome))];
      const r = linhaAbaBol('folha', { t:null, valor: somaValores(ts), nf:`${ts.length} ${ts.length === 1 ? 'título' : 'títulos'}`,
        bloco: proximoBloco(), venc:'', qtd: ts.length });
      r.codForn = codigos.length <= 3 ? codigos.join(', ') : `${codigos.slice(0, 3).join(', ')} e mais ${codigos.length - 3}`;
      r.fornecedor = nomes.length === 1 ? `${tipo}: ${nomes[0]}` : `${tipo} (${nomes.length} fornecedores)`;
      r.texto = normaliza([r.codForn, r.fornecedor, ...nomes, tipo].join(' | '));
      r.digitos = [centavos(r.valor), ...codigos].join('|');
      blocoFolha.push(r);
    });
    const res = resumoAba(blocoFolha);
    blocoFolha.push(linhaFaixa('subtotal', `Subtotal folha e impostos · ${res.qtd} ${res.qtd === 1 ? 'título' : 'títulos'}`, res.total, proximoBloco()));
  }

  const abas = {
    ok: ok.sort(ordemFornNf),
    verif: [...blocosGrupo.flat(), ...amarelos.sort(ordemFornNf), ...vermelhos.sort(ordemFornNf), ...codSis.sort(ordemFornNf)],
    sem: sem.sort(ordemFornNf),
    dda: dda.sort((a, b) => b.valor - a.valor || ordemFornNf(a, b)),
  };
  // faixas por data só se o período tem mais de um vencimento e as linhas têm mais de uma data
  const datas = new Set(Object.values(abas).flat().map(r => r.venc).filter(Boolean));
  const porData = !!opcoes.porData && datas.size > 1;
  if(porData) Object.keys(abas).forEach(k => { abas[k] = faixasPorData(abas[k], proximoBloco); });
  abas.sem.push(...blocoFolha);
  abas.porData = porData;
  abas.jaConferidos = jaConferidos;
  return abas;
}

// Quantidade e total de uma aba: só as linhas que contam (as NFs que compõem um boleto
// agrupado e as faixas não contam); a linha de um tipo de folha conta pelos títulos dela.
const resumoAba = linhas => {
  const conta = linhas.filter(r => r.conta);
  return { qtd: conta.reduce((s, r) => s + (r.qtd || 1), 0), total: somaValores(conta) };
};

// o período do relatório tem mais de um vencimento? (com a regra do fim de semana:
// período que começa na segunda inclui o sábado e o domingo anteriores)
function periodoTemVariasDatas(topo, titulos){
  const per = periodoEfetivo(topo.periodo);
  if(per) return per.fim > per.ini;
  return new Set(titulos.map(t => formatData(t.venc)).filter(Boolean)).size > 1;
}

/* ---------------------------------------------------------------------
   DA ESCOLHA DA EMPRESA AO RESULTADO
   Novo nesta versão: a empresa vem do seletor da tela e os dois arquivos
   são conferidos ANTES de rodar (como na Conferência DDA). O resto é o
   que o botão Conferir do antigo fazia, na mesma ordem.
   --------------------------------------------------------------------- */

// Empresas que podem usar esta conferência: as que têm conta no Itaú (CRV Matriz e CRV Filial).
function empresasBoletos(){
  return EMPRESAS.filter(e => e.bancos.includes('Itaú'));
}

// Travas antes de conferir: o relatório tem que ser da empresa escolhida (1ª linha,
// identificaEmpresa) e o DDA tem que ser do Itaú e da conta (CNPJ) dessa empresa.
// Usa as mesmas travas da Conferência DDA (checaRelatorioDda e checaDda, js/conferencias/dda.js).
// Devolve { bloqueio, onde, aviso }: bloqueio = alerta que impede conferir; onde = de qual
// arquivo é o problema ('sistema' ou 'dda'); aviso = algo para olhar que não impede.
function checaArquivosBoletos(empresa, matrizDda, matrizSistema){
  const rel = checaRelatorioDda(empresa, matrizSistema);
  if(rel) return { bloqueio: rel, onde:'sistema', aviso:'' };
  return { ...checaDda('itau', empresa, matrizDda), onde:'dda' };
}

// A conferência inteira, a partir da empresa escolhida e das duas leituras (lerMatrizComTexto).
// Devolve { erro, onde } quando não dá para conferir (onde = 'sistema' ou 'dda'), ou o resultado:
// { linhas, abas, checagens, aviso, consulta, nDda, nTitulos, comCodigo }.
function conferenciaBoletos(empresa, leituraDda, leituraSistema){
  const trava = checaArquivosBoletos(empresa, leituraDda.matriz, leituraSistema.matriz);
  if(trava.bloqueio) return { erro: trava.bloqueio, onde: trava.onde };

  const dda = leitorItau(leituraDda);
  let titulos;
  try{ titulos = leitorSistemaBoletos(leituraSistema); }
  catch(err){ return { erro: err.message, onde:'sistema' }; }
  if(!dda.length) return { erro:'Não encontrei boletos no arquivo do Itaú. Confira se os valores estão na coluna "Até Venc.".', onde:'dda' };
  if(!titulos.length) return { erro:'Não encontrei títulos no relatório do sistema (linhas com código do fornecedor numérico e saldo).', onde:'sistema' };

  const linhas = conferirBoletos(dda, titulos);
  const consulta = dataHoraConsultaItau(leituraDda.matriz);
  // checagens dos arquivos (mesma data, mesma empresa, período), antes de montar as abas:
  // elas põem nos boletos de fim de semana o aviso com a data original
  const topo = topoSistemaBoletos(leituraSistema.matriz);
  const checagens = checagensBoletos({ topo, consultaDda: consulta, conta: contaDoDdaItau(leituraDda.matriz), dda, linhas });
  const abas = montaAbasBol(linhas, { porData: periodoTemVariasDatas(topo, titulos) });
  return { linhas, abas, checagens, aviso: trava.aviso, consulta,
           nDda: dda.length, nTitulos: titulos.length, comCodigo: titulos.filter(t => t.temCodigo).length };
}
