/* =====================================================================
   DDA → .RET: ALERTAS DE FRAUDE (sub-etapa 4)
   Depois das travas, os boletos que vão para o arquivo passam por estes
   alertas. Alerta NÃO tira o boleto do arquivo: ele entra, mas a pessoa
   precisa ver antes de importar (lista amarela "Atenção antes de importar"):
     - factoring, FIDC, securitizadora, fundo ou instituição de pagamento;
     - mudança de banco/CNPJ de fornecedor conhecido (memória de fornecedores);
     - boleto duplicado (mesmo código, ou mesmo beneficiário + valor + vencimento);
     - desconto ou abatimento ("A Pagar" diferente de "Até Venc.": pagar o "A Pagar").
   Fornecedor que não está na memória não é alerta: vai para a lista de
   "Fornecedores novos", onde a pessoa confirma (só então entra na memória).
   Só regras, sem tela e sem armazenamento: a memória chega pronta.
   Precisa de js/memoria-fornecedores.js, js/boleto.js (soDigitos),
   js/conferencias/boletos.js (PALAVRAS_FACTORING) e js/leitura/formatos.js (normaliza, brl).
   ===================================================================== */

// Os tipos de alerta, na ordem em que aparecem na lista, com o nome mostrado na tela.
const TIPOS_ATENCAO_RET = [
  { id:'factoring', nome:'Factoring, fundo ou instituição de pagamento' },
  { id:'mudanca',   nome:'Mudança de banco/CNPJ' },
  { id:'duplicado', nome:'Boleto duplicado' },
  { id:'desconto',  nome:'Desconto ou abatimento' },
];

// De onde o boleto veio no arquivo do banco: "página N" (PDF) ou "linha N" (Excel).
function origemBoletoRet(b){
  return b.pagina ? `página ${b.pagina}` : `linha ${b.linhaExcel}`;
}

// A palavra do nome que o faz parecer factoring/fundo/instituição de pagamento, ou '' se não há.
// Mesma regra e mesma lista (PALAVRAS_FACTORING, pelo começo da palavra: CRED pega CREDITO,
// não ACREDITAR) do cedidoAFactoring da Conferência de boletos; aqui devolve a palavra para mostrar.
function palavraFactoring(nome){
  const palavras = normaliza(nome).match(/[A-Z]+/g) || [];
  return palavras.find(p => PALAVRAS_FACTORING.some(f => p.startsWith(f))) || '';
}

// Alerta de memória de UM boleto: { tipo:'mudanca', texto } quando o CNPJ é conhecido mas o
// banco nunca foi visto, ou quando o nome é conhecido com outro CNPJ; { tipo:'novo' } quando
// nem o CNPJ nem o nome estão na memória; null quando está tudo como de costume.
function alertaMemoriaRet(b, memoria){
  const banco = chaveBanco(b.banco);
  const f = fornecedorNaMemoria(memoria, b.cnpj);
  if(f){
    if(f.bancos.includes(banco)) return null;
    return { tipo:'mudanca', texto:`Mudança de banco/CNPJ: confirme com o fornecedor antes de pagar. Banco ${banco} nunca visto para este CNPJ (já veio por ${f.bancos.join(', ')}).` };
  }
  const outros = documentosDoNome(memoria, b.beneficiario);
  if(outros.length)
    return { tipo:'mudanca', texto:`Mudança de banco/CNPJ: confirme com o fornecedor antes de pagar. Este nome está na memória com outro CPF/CNPJ (${outros.join(', ')}); este CPF/CNPJ é novo.` };
  return { tipo:'novo' };
}

// Boletos duplicados entre os do arquivo: o mesmo código de barras mais de uma vez, ou o mesmo
// beneficiário (CPF/CNPJ) com o mesmo valor e o mesmo vencimento em códigos diferentes.
// Devolve um Map boleto -> texto do alerta.
function duplicadosRet(boletos){
  const grupos = (chave) => boletos.reduce((m, b) => m.set(chave(b), [...(m.get(chave(b)) || []), b]), new Map());
  const out = new Map();
  const outras = (b, lista) => lista.filter(x => x !== b).map(origemBoletoRet).join(', ');
  grupos(b => soDigitos(b.codigoTexto)).forEach(lista => {
    if(lista.length > 1) lista.forEach(b => out.set(b, `O mesmo código de barras aparece ${lista.length} vezes no DDA (também em ${outras(b, lista)}).`));
  });
  grupos(b => `${chaveFornecedor(b.cnpj)}|${Math.round(b.valor * 100)}|${b.venc}`).forEach(lista => {
    if(new Set(lista.map(b => soDigitos(b.codigoTexto))).size < 2) return;
    lista.forEach(b => { if(!out.has(b)) out.set(b, `Mesmo beneficiário, valor (${brl(b.valor)}) e vencimento (${b.venc}) em ${lista.length} códigos diferentes (também em ${outras(b, lista)}).`); });
  });
  return out;
}

// Todos os alertas dos boletos do arquivo (itens = travas.noArquivo, cada um { boleto, ... }).
// Devolve { atencao, novos, porTipo }:
//   atencao = [{ tipo, boleto, texto, confirmar }] na ordem dos tipos e depois do DDA;
//             confirmar = { documento, nome, banco } só no alerta de mudança (botão "Confirmei").
//   novos   = [{ documento, nome, bancos, boletos, alertas }] um por CPF/CNPJ fora da memória;
//             alertas = nomes dos alertas dos boletos dele (lista amarela e "vencimento diferente"),
//             vazio se não tem nenhum. Só os sem alerta entram no "Confirmei todos" (novosSemAlerta).
//   porTipo = { factoring, mudanca, duplicado, desconto } = quantos boletos em cada.
function alertasDdaRet(itens, memoria){
  const boletos = itens.map(i => i.boleto);
  const vencDiferente = new Set(itens.filter(i => i.avisos && i.avisos.length).map(i => i.boleto));
  const dup = duplicadosRet(boletos);
  const atencao = [], novos = new Map();
  boletos.forEach(b => {
    const palavra = palavraFactoring(b.beneficiario);
    if(palavra) atencao.push({ tipo:'factoring', boleto:b, confirmar:null,
      texto:`O beneficiário parece factoring, fundo ou instituição de pagamento ("${palavra}" no nome): confirme com o fornecedor que o boleto é dele.` });
    const mem = alertaMemoriaRet(b, memoria);
    if(mem && mem.tipo === 'mudanca') atencao.push({ tipo:'mudanca', boleto:b, texto: mem.texto,
      confirmar:{ documento: b.cnpj, nome: b.beneficiario, banco: b.banco } });
    if(mem && mem.tipo === 'novo'){
      const k = chaveFornecedor(b.cnpj);
      const n = novos.get(k) || { documento: b.cnpj, nome: b.beneficiario, bancos: [], boletos: [], alertas: [] };
      if(!n.bancos.includes(chaveBanco(b.banco))) n.bancos.push(chaveBanco(b.banco));
      n.boletos.push(b); novos.set(k, n);
    }
    if(dup.has(b)) atencao.push({ tipo:'duplicado', boleto:b, confirmar:null, texto: dup.get(b) });
    if(b.valorAPagar !== null && b.valorAPagar !== undefined && b.valorAPagar !== b.valor)
      atencao.push({ tipo:'desconto', boleto:b, confirmar:null,
        texto:`"A Pagar" ${brl(b.valorAPagar)} diferente do "Até Venc." ${brl(b.valor)}: pagar ${brl(b.valorAPagar)}. O .RET leva o "Até Venc." do código; o desconto não vai no arquivo.` });
  });
  const nomeTipo = Object.fromEntries(TIPOS_ATENCAO_RET.map(t => [t.id, t.nome]));
  novos.forEach(n => {
    const nomes = new Set(atencao.filter(al => n.boletos.includes(al.boleto)).map(al => nomeTipo[al.tipo]));
    if(n.boletos.some(b => vencDiferente.has(b))) nomes.add('Vencimento do código diferente do DDA');
    n.alertas = [...nomes];
  });
  const ordem = TIPOS_ATENCAO_RET.map(t => t.id);
  atencao.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
  const porTipo = Object.fromEntries(ordem.map(id => [id, atencao.filter(a => a.tipo === id).length]));
  return { atencao, novos: [...novos.values()], porTipo };
}

// Os fornecedores novos SEM nenhum alerta (nem da lista amarela, nem vencimento diferente):
// só esses podem entrar de uma vez pelo "Confirmei todos os N novos sem alerta". Os com
// alerta ficam só com o botão um por um, para a pessoa olhar cada um antes.
function novosSemAlerta(novos){
  return novos.filter(n => !n.alertas.length);
}

// O que gravar na memória para estes fornecedores novos: um { documento, nome, banco }
// por banco de cada CPF/CNPJ.
function confirmacoesDosNovos(novos){
  return novos.flatMap(n => n.bancos.map(banco => ({ documento: n.documento, nome: n.nome, banco })));
}
