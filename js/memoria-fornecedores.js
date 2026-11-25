/* =====================================================================
   MEMÓRIA DE FORNECEDORES (DDA → .RET, alertas de fraude)
   Guarda, para cada CPF/CNPJ de beneficiário já confirmado, o nome e os
   bancos pelos quais os boletos dele já vieram. Serve para alertar quando
   um fornecedor conhecido aparece por um banco novo, ou quando um nome
   conhecido aparece com outro CNPJ (golpe do boleto trocado).
   Só é gravada quando a pessoa clica em "Confirmei com o fornecedor":
   nada entra sozinho.
   Hoje fica no localStorage (só neste computador). Na etapa 9 vai para o
   Firebase: por isso só lerMemoriaFornecedores e gravarMemoriaFornecedores
   tocam no armazenamento (e já são assíncronas); o resto são funções puras
   que recebem e devolvem a memória, sem mexer na memória recebida.
   Formato: { versao:1, atualizadaEm:'<data ISO da última gravação>',
              fornecedores: { '<documento sem pontuação>': { nome, bancos:['341', ...] } } }.
   Precisa de js/leitura/formatos.js (normaliza, apenasDigitos) e js/cpf-cnpj.js.
   ===================================================================== */

const CHAVE_MEMORIA_FORNECEDORES = 'central-financeira.ret.memoria-fornecedores';

// Memória vazia (primeira vez, ou armazenamento ilegível).
function memoriaVazia(){
  return { versao: 1, fornecedores: {} };
}

// LEITURA: devolve a memória guardada. Se não houver, ou se estiver estragada, devolve
// uma vazia (todo fornecedor vira "novo", que é o lado seguro: nada passa como conhecido).
async function lerMemoriaFornecedores(){
  try{
    const m = JSON.parse(localStorage.getItem(CHAVE_MEMORIA_FORNECEDORES));
    if(m && m.versao === 1 && m.fornecedores && typeof m.fornecedores === 'object') return m;
  }catch(e){ /* localStorage bloqueado ou valor estranho: começa vazia */ }
  return memoriaVazia();
}

// GRAVAÇÃO: guarda a memória inteira, carimbada com a data e hora desta gravação.
// Devolve a memória gravada (com atualizadaEm), ou null se não conseguiu gravar (sem localStorage).
// Não mexe na memória recebida.
async function gravarMemoriaFornecedores(memoria){
  const gravada = { ...memoria, atualizadaEm: new Date().toISOString() };
  try{ localStorage.setItem(CHAVE_MEMORIA_FORNECEDORES, JSON.stringify(gravada)); return gravada; }
  catch(e){ return null; }
}

// Resumo da memória para mostrar: "N fornecedor(es) · última gravação em dd/mm/aaaa às hh:mm"
// (ou "nunca gravada"). Só conta e formata; não lê nem grava nada.
function resumoMemoriaFornecedores(memoria){
  const qtd = Object.keys(memoria.fornecedores).length;
  const d = memoria.atualizadaEm ? new Date(memoria.atualizadaEm) : null;
  const dois = n => String(n).padStart(2, '0');
  const quando = d && !isNaN(d) ? `última gravação em ${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`
                                : 'nunca gravada neste computador';
  return `${qtd} fornecedor(es) · ${quando}`;
}

// Chave de um fornecedor na memória: o CPF/CNPJ sem pontuação, como veio ('' se não houver).
function chaveFornecedor(documento){
  return documentoSemPontuacao(documento);
}

// Banco com 3 dígitos ("341"), para comparar o que veio no DDA com o que está na memória.
function chaveBanco(banco){
  const d = apenasDigitos(banco);
  return d ? d.padStart(3, '0') : '';
}

// O fornecedor guardado para este CPF/CNPJ, ou null se ele nunca foi confirmado.
function fornecedorNaMemoria(memoria, documento){
  return memoria.fornecedores[chaveFornecedor(documento)] || null;
}

// Os CPFs/CNPJs da memória guardados com este nome (comparado sem acento, caixa e espaços duplos).
function documentosDoNome(memoria, nome){
  const alvo = normaliza(nome).replace(/\s+/g, ' ');
  if(!alvo) return [];
  return Object.keys(memoria.fornecedores).filter(k => normaliza(memoria.fornecedores[k].nome).replace(/\s+/g, ' ') === alvo);
}

// Devolve uma memória NOVA com estes fornecedores confirmados (lista de { documento, nome, banco }):
// CPF/CNPJ novo entra com o nome e o banco; já conhecido ganha o banco (o nome guardado não muda).
// Documento com DV inválido não entra (não deveria chegar aqui: as travas já tiram esses boletos).
function confirmaFornecedores(memoria, lista){
  const nova = { versao: 1, atualizadaEm: memoria.atualizadaEm, fornecedores: {} };
  Object.keys(memoria.fornecedores).forEach(k => {
    nova.fornecedores[k] = { nome: memoria.fornecedores[k].nome, bancos: [...memoria.fornecedores[k].bancos] };
  });
  lista.forEach(({ documento, nome, banco }) => {
    const k = chaveFornecedor(documento), b = chaveBanco(banco);
    if(!cpfCnpjValido(k) || !b) return;
    const f = nova.fornecedores[k] || (nova.fornecedores[k] = { nome: String(nome || '').trim(), bancos: [] });
    if(!f.bancos.includes(b)) f.bancos.push(b);
  });
  return nova;
}
