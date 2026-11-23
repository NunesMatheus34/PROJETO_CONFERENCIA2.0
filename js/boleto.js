/* =====================================================================
   BOLETO (código de barras e linha digitável)
   Funções puras, sem tela: conferem se o código de um boleto bancário está
   íntegro antes de alguém copiar e pagar. Trazidas do projeto antigo com a
   MESMA regra; aqui só ficaram organizadas e comentadas.
   Estas funções nunca criam nem consertam um código: ou devolvem o código
   que veio (convertido entre os dois formatos, conferido pelos DVs), ou
   BLOQUEIAM com o motivo.
   Índices começam em 0, como no JavaScript (cb[0..3] = 4 primeiros).
     Código de barras (44): banco(0..2) moeda(3) DV geral(4) fator(5..8)
                            valor(9..18) campo livre(19..43).
     Linha digitável (47):  campo1(0..9) campo2(10..20) campo3(21..31)
                            DV geral(32) fator+valor(33..46).
   O código anda sempre como TEXTO. Number só aparece para um dígito
   sozinho (cálculo do DV), para o fator (4 dígitos) e para o valor
   (10 dígitos), que cabem sem arredondar.
   Precisa de js/leitura/formatos.js (apenasDigitos, paraNumero, formatData, brl).
   ===================================================================== */

// Só os dígitos: tira espaços, pontos e traços. Devolve null se sobrar outra coisa
// (letra, vírgula...), por exemplo notação científica "3,4191E+43".
// Diferente de apenasDigitos, que jogaria fora a letra e esconderia o problema.
function soDigitos(texto){
  if(texto===null || texto===undefined) return null;
  const limpo = String(texto).replace(/[\s.\-]+/g, '');
  return /^\d*$/.test(limpo) ? limpo : null;
}

// true quando o texto parece número em notação científica (ex.: 2,38E+43):
// sinal de que o Excel gravou o código como número e perdeu dígitos.
function ehNotacaoCientifica(texto){
  return /\d[.,]?\d*\s*E\s*[+-]?\s*\d+/i.test(String(texto || ''));
}

// DV de um campo da linha digitável (módulo 10): da direita para a esquerda,
// pesos 2,1,2,1...; soma os dígitos de cada produto (12 -> 1+2).
function dvMod10(campo){
  let soma = 0;
  for(let i = campo.length - 1, peso = 2; i >= 0; i--, peso = peso===2 ? 1 : 2){
    const p = Number(campo[i]) * peso;
    soma += p > 9 ? p - 9 : p;
  }
  return (10 - soma % 10) % 10;
}

// DV geral do código de barras (módulo 11): os 43 dígitos sem a posição 4 (o próprio DV),
// pesos 2 a 9 da direita para a esquerda, repetindo. Resultado 0, 10 ou 11 vira 1.
function dvMod11Geral(cb44){
  const base = cb44.slice(0, 4) + cb44.slice(5);
  let soma = 0;
  for(let i = base.length - 1, peso = 2; i >= 0; i--, peso = peso===9 ? 2 : peso + 1){
    soma += Number(base[i]) * peso;
  }
  const dv = 11 - (soma % 11);
  return (dv===0 || dv===10 || dv===11) ? 1 : dv;
}

// Código de barras (44) -> linha digitável (47), só números.
// Os DVs dos 3 campos são calculados; o resto é só mudança de posição.
function barrasParaLinha(cb44){
  const c1 = cb44.slice(0, 4) + cb44.slice(19, 24);
  const c2 = cb44.slice(24, 34);
  const c3 = cb44.slice(34, 44);
  return c1 + dvMod10(c1) + c2 + dvMod10(c2) + c3 + dvMod10(c3) + cb44[4] + cb44.slice(5, 19);
}

// Linha digitável (47) -> código de barras (44): tira os 3 DVs de campo e reordena.
function linhaParaBarras(l47){
  return l47.slice(0, 4) + l47[32] + l47.slice(33, 47) + l47.slice(4, 9) + l47.slice(10, 20) + l47.slice(21, 31);
}

// O que está gravado no código: banco, vencimento (dd/mm/aaaa) e valor.
// Fator 0000 = boleto sem vencimento (venc = '').
// Desde 22/02/2025 o fator recomeçou em 1000: venc = 22/02/2025 + (fator - 1000) dias.
function decodifica(cb44){
  const fator = Number(cb44.slice(5, 9));
  let venc = '';
  if(fator > 0){
    const d = new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86400000);
    venc = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  return { banco: cb44.slice(0, 3), fator, venc, valor: Number(cb44.slice(9, 19)) / 100 };
}

// Confere só a estrutura do código (regras a, b e c): tamanho, DVs e ida e volta.
// Devolve { ok, tipo, linha, cb, motivo }. Não compara com nada do DDA.
// tipo: 'boleto' | 'consumo' (conta de consumo/convênio, começa com 8) | 'invalido'.
function validaEstrutura(texto){
  const bloqueia = (motivo, tipo) => ({ ok:false, tipo: tipo || 'invalido', linha:'', cb:'', motivo });

  if(ehNotacaoCientifica(texto)) return bloqueia('código ilegível: veio em notação científica (o Excel gravou como número e perdeu dígitos)');
  const d = soDigitos(texto);
  if(d===null) return bloqueia('o código tem caracteres que não são números');
  if(!d) return bloqueia('sem código de barras');

  // a) tamanho: 44 (código de barras) ou 47 (linha digitável); 48 ou começo 8 = conta de consumo
  if(d[0]==='8' && (d.length===48 || d.length===44)) return bloqueia('conta de consumo (não é boleto bancário)', 'consumo');
  let cb;
  if(d.length===44) cb = d;
  else if(d.length===47){
    // b) os 3 DVs de campo que vieram na linha digitável
    const campos = [[0, 9], [10, 20], [21, 31]];
    for(let k=0; k<3; k++){
      const [ini, posDv] = campos[k];
      if(dvMod10(d.slice(ini, posDv)) !== Number(d[posDv])) return bloqueia(`dígito verificador do campo ${k+1} da linha digitável não confere`);
    }
    cb = linhaParaBarras(d);
  }
  else return bloqueia(`tem ${d.length} dígitos (o boleto tem 44 no código de barras ou 47 na linha digitável)`);

  // b) DV geral
  if(dvMod11Geral(cb) !== Number(cb[4])) return bloqueia('dígito verificador geral (módulo 11) não confere');

  // c) ida e volta
  const linha = barrasParaLinha(cb);
  if(linhaParaBarras(linha) !== cb) return bloqueia('conversão código de barras ↔ linha digitável não fecha');
  if(d.length===47 && linha !== d) return bloqueia('a linha digitável não bate com o código de barras dela');

  return { ok:true, tipo:'boleto', linha, cb, motivo:'' };
}

// Confere um código de boleto (linha digitável ou código de barras) contra o DDA.
// esperado = { banco, valor, venc } do DDA (coluna Banco, "Até Venc." e "Venc.").
// Devolve { ok, tipo, linha, cb, motivo, avisos }. Se não for ok, linha e cb vêm
// vazios: o boleto fica BLOQUEADO (nada para copiar) e motivo diz por quê.
// Vencimento diferente não bloqueia: só entra em avisos.
function validaBoleto(texto, esperado){
  const esp = esperado || {};
  const avisos = [];
  const bloqueia = (motivo, tipo) => ({ ok:false, tipo: tipo || 'invalido', linha:'', cb:'', motivo, avisos });

  const e = validaEstrutura(texto);
  if(!e.ok) return bloqueia(e.motivo, e.tipo);
  const { linha, cb } = e;

  // d) bate com o DDA: banco, valor ao centavo e vencimento
  const dec = decodifica(cb);
  const bancoDda = apenasDigitos(esp.banco);
  if(!bancoDda) return bloqueia('o DDA não tem o banco para comparar');
  if(bancoDda.padStart(3, '0') !== dec.banco) return bloqueia(`banco do código (${dec.banco}) diferente do banco no DDA (${esp.banco})`);
  const valorDda = paraNumero(esp.valor);
  if(valorDda===null) return bloqueia('o DDA não tem o valor para comparar');
  if(Math.round(valorDda * 100) !== Math.round(dec.valor * 100)) return bloqueia(`valor do código (${brl(dec.valor)}) diferente do "Até Venc." no DDA (${brl(valorDda)})`);

  if(formatData(esp.venc) !== dec.venc) avisos.push('vencimento do código diferente do DDA (boleto prorrogado?)');

  return { ok:true, tipo:'boleto', linha, cb, motivo:'', avisos };
}

// Linha digitável no formato impresso no boleto, só para mostrar na tela:
// 00190.50095 40144.816069 06809.350314 3 37370000000100
function formataLinha(l47){
  if(!l47 || l47.length!==47) return l47 || '';
  return `${l47.slice(0,5)}.${l47.slice(5,10)} ${l47.slice(10,15)}.${l47.slice(15,21)} ` +
         `${l47.slice(21,26)}.${l47.slice(26,32)} ${l47[32]} ${l47.slice(33)}`;
}
