/* =====================================================================
   CONTROLE DO NSA (DDA → .RET)
   O NSA (posições 158-163 do header de arquivo) é o número sequencial
   do arquivo. O sistema que importa o .RET pode recusar ou confundir um
   NSA repetido, então o site sugere um número (a partir de 900001, longe
   dos NSAs do banco), lembra os já usados e não deixa repetir.
   Hoje fica no localStorage (só neste computador). Na etapa 9 vai para o
   Firebase: por isso só lerControleNsa e gravarNsaUsado tocam no
   armazenamento (e já são assíncronas); o resto são funções puras.
   Um NSA só conta como USADO quando o arquivo for baixado (sub-etapa 6):
   gerar para ver na tela não gasta número.
   Formato: { versao:1, usados:[900001, ...] }.
   ===================================================================== */

const CHAVE_CONTROLE_NSA = 'central-financeira.ret.nsa';
// Primeiro NSA sugerido pelo site (os do banco são bem menores, ex.: 000741).
const NSA_INICIAL = 900001;

// Controle vazio (nenhum NSA usado neste computador).
function controleNsaVazio(){
  return { versao: 1, usados: [] };
}

// LEITURA: devolve o controle guardado, ou um vazio se não houver ou estiver estragado.
async function lerControleNsa(){
  try{
    const c = JSON.parse(localStorage.getItem(CHAVE_CONTROLE_NSA));
    if(c && c.versao === 1 && Array.isArray(c.usados) && c.usados.every(n => Number.isInteger(n))) return c;
  }catch(e){ /* localStorage bloqueado ou valor estranho: começa vazio */ }
  return controleNsaVazio();
}

// GRAVAÇÃO: marca um NSA como usado (lê o que está guardado, junta e grava).
// Devolve o controle gravado, ou null se não conseguiu gravar.
async function gravarNsaUsado(nsa){
  const atual = await lerControleNsa();
  const gravado = { versao: 1, usados: [...new Set([...atual.usados, Number(nsa)])].sort((a, b) => a - b) };
  try{ localStorage.setItem(CHAVE_CONTROLE_NSA, JSON.stringify(gravado)); return gravado; }
  catch(e){ return null; }
}

// NSA sugerido: o maior já usado + 1, ou 900001 se nenhum foi usado (ou se o maior é menor).
function proximoNsa(controle){
  const maior = controle.usados.length ? Math.max(...controle.usados) : 0;
  return Math.max(maior + 1, NSA_INICIAL);
}

// Confere o NSA digitado. Devolve { ok, nsa (número), motivo }: tem que ter só dígitos,
// de 1 a 6, ser de 900001 a 999999 e não ter sido usado antes neste computador.
function checaNsa(texto, controle){
  const t = String(texto || '').trim();
  if(!/^\d{1,6}$/.test(t)) return { ok:false, nsa:null, motivo:'O NSA tem que ter só números, até 6 dígitos.' };
  const nsa = Number(t);
  if(nsa < NSA_INICIAL) return { ok:false, nsa, motivo:`Use um NSA a partir de ${NSA_INICIAL}: os menores podem bater com os do banco.` };
  if(controle.usados.includes(nsa)) return { ok:false, nsa, motivo:`O NSA ${t} já foi usado num arquivo baixado neste computador. Use ${proximoNsa(controle)}.` };
  return { ok:true, nsa, motivo:'' };
}
