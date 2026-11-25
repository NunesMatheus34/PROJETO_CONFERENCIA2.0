/* =====================================================================
   CONTROLE DO NSA E DOS .RET BAIXADOS (DDA → .RET)
   O NSA (posições 158-163 do header de arquivo) é o número sequencial
   do arquivo. O sistema que importa o .RET pode recusar ou confundir um
   NSA repetido, então o site sugere um número (a partir de 900001, longe
   dos NSAs do banco), lembra os já usados e não deixa repetir.
   Desde a etapa 9 o controle fica no Firestore, coleção controleRet/{NSA}
   (o id do documento É o NSA com 6 dígitos): vale para todos os
   computadores e todas as pessoas. Cada documento guarda quem baixou,
   quando, empresa, NSA, quantidade de boletos, se era teste, e o SHA-256
   do .RET e do DDA. NUNCA o total em R$, fornecedor ou código.
   As regras do firestore.rules só deixam CRIAR (nunca editar nem apagar)
   e um documento que já existe não é criado de novo: dois computadores
   baixando o mesmo NSA ao mesmo tempo, só um consegue; o outro não baixa.
   Os NSAs usados antes, guardados no localStorage deste computador,
   continuam contando como usados (só leitura; nada novo vai para lá).
   Um NSA só conta como USADO quando o arquivo é baixado: gerar para ver
   na tela não gasta número.
   Só lerControleNsa e gravarNsaUsado tocam no armazenamento; o resto são
   funções puras (testadas em testes/testes.html).
   ===================================================================== */

const CHAVE_CONTROLE_NSA = 'central-financeira.ret.nsa';   // controle antigo, só deste computador (só leitura)
const COLECAO_CONTROLE_RET = 'controleRet';
// Primeiro NSA sugerido pelo site (os do banco são bem menores, ex.: 000741).
const NSA_INICIAL = 900001;
const NSA_MAXIMO = 999999;

// Controle vazio (nenhum NSA usado).
function controleNsaVazio(){
  return { versao: 1, usados: [] };
}

// NSAs usados guardados no localStorage deste computador (de antes do Firestore); [] se não houver.
function nsaUsadosLocais(){
  try{
    const c = JSON.parse(localStorage.getItem(CHAVE_CONTROLE_NSA));
    if(c && c.versao === 1 && Array.isArray(c.usados)) return c.usados.filter(n => Number.isInteger(n));
  }catch(e){ /* localStorage bloqueado ou valor estranho: nada local */ }
  return [];
}

// Junta os NSAs dos registros do Firestore com os locais, sem repetir e em ordem.
function controleDeRegistros(registros, locais){
  const usados = [...new Set([...(locais || []), ...registros.map(r => r.nsa).filter(n => Number.isInteger(n))])];
  return { versao: 1, usados: usados.sort((a, b) => a - b) };
}

// Id do documento de um NSA no Firestore: 6 dígitos, com zeros à esquerda.
function idNsa(nsa){
  return String(nsa).padStart(6, '0');
}

// Monta o registro de um .RET baixado, só com os campos permitidos.
// dados = { nsa, empresa (objeto ou id), qtdBoletos, shaRet, shaDda, teste }; quem = { uid, login, nome }.
// Devolve { registro } (sem o "quando", que é a hora do servidor) ou { erro }.
function montaRegistroRet(dados, quem){
  if(!quem || !quem.uid || !quem.login) return { erro: 'Sem usuário.' };
  const nsa = Number(dados.nsa);
  if(!Number.isInteger(nsa) || nsa < NSA_INICIAL || nsa > NSA_MAXIMO) return { erro: 'NSA fora da faixa.' };
  const empresa = dados.empresa && typeof dados.empresa === 'object' ? dados.empresa.id : dados.empresa;
  if(!EMPRESAS.some(e => e.id === empresa)) return { erro: 'Empresa desconhecida.' };
  if(!Number.isInteger(dados.qtdBoletos) || dados.qtdBoletos < 1 || dados.qtdBoletos > 100000) return { erro: 'Quantidade de boletos inválida.' };
  const sha = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  if(!sha(dados.shaRet) || !sha(dados.shaDda)) return { erro: 'SHA-256 inválido.' };
  return { registro: { uid: quem.uid, login: quem.login, nome: quem.nome || '', nsa, empresa,
                       qtdBoletos: dados.qtdBoletos, teste: !!dados.teste, shaRet: dados.shaRet, shaDda: dados.shaDda } };
}

// Quem está no site agora (para o registro), ou null se ninguém entrou / sem Firebase.
function quemNoSite(){
  if(typeof firebaseConectado !== 'function' || !firebaseConectado()) return null;
  const usuario = firebaseConectado().auth.currentUser;
  if(!usuario || !cadastroComPermissoes) return null;
  return { uid: usuario.uid, login: usuario.email, nome: cadastroComPermissoes.nome };
}

// LEITURA: os NSAs usados (Firestore + os locais antigos). Devolve { versao, usados, erro }:
// erro = '' quando leu do Firestore; com erro (sem login, sem internet, sem permissão) vêm só
// os locais, e o download continua protegido porque gravarNsaUsado confere no servidor.
async function lerControleNsa(){
  const locais = nsaUsadosLocais();
  if(!quemNoSite()) return { ...controleDeRegistros([], locais), erro: 'sem login' };
  try{
    const snap = await firebaseConectado().db.collection(COLECAO_CONTROLE_RET).get();
    return { ...controleDeRegistros(snap.docs.map(d => d.data()), locais), erro: '' };
  }catch(err){
    return { ...controleDeRegistros([], locais), erro: (err && err.code) || 'erro' };
  }
}

// GRAVAÇÃO: marca o NSA como usado no Firestore, com o registro do .RET baixado.
// Numa transação: se o NSA já existe (outra pessoa ou outro computador baixou), não grava.
// Devolve { ok, controle, motivo }: ok = gravou e pode baixar; controle = NSAs usados depois.
async function gravarNsaUsado(nsa, dados){
  const quem = quemNoSite();
  if(!quem) return { ok: false, controle: null, motivo: 'Você não está conectado: entre de novo para baixar.' };
  const r = montaRegistroRet({ ...dados, nsa }, quem);
  if(r.erro) return { ok: false, controle: null, motivo: 'Registro do .RET recusado: ' + r.erro };
  const db = firebaseConectado().db;
  const ref = db.collection(COLECAO_CONTROLE_RET).doc(idNsa(nsa));
  try{
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if(doc.exists){ const e = new Error('nsa-usado'); e.code = 'nsa-usado'; throw e; }
      tx.set(ref, { ...r.registro, quando: firebase.firestore.FieldValue.serverTimestamp() });
    });
  }catch(err){
    const controle = await lerControleNsa();
    // "já existe" pode chegar como nsa-usado (lido na transação) ou permission-denied (as regras não deixam sobrescrever)
    if(err && (err.code === 'nsa-usado' || (err.code === 'permission-denied' && controle.usados.includes(Number(nsa)))))
      return { ok: false, controle, motivo: `O NSA ${idNsa(nsa)} acabou de ser usado por outro arquivo.` };
    return { ok: false, controle, motivo: 'Não consegui marcar o NSA como usado no Firebase (' + mensagemErroConta(err) + ')' };
  }
  return { ok: true, controle: await lerControleNsa(), motivo: '' };
}

// Acompanha os .RET baixados, do NSA maior para o menor (tela Administração › Controle do .RET).
function acompanhaControleRet(limite, aoMudar, aoFalhar){
  return firebaseConectado().db.collection(COLECAO_CONTROLE_RET).orderBy('nsa', 'desc').limit(limite)
    .onSnapshot(snap => aoMudar(snap.docs.map(d => ({ id: d.id, ...d.data() }))), aoFalhar);
}

// NSA sugerido: o maior já usado + 1, ou 900001 se nenhum foi usado (ou se o maior é menor).
function proximoNsa(controle){
  const maior = controle.usados.length ? Math.max(...controle.usados) : 0;
  return Math.max(maior + 1, NSA_INICIAL);
}

// Confere o NSA digitado. Devolve { ok, nsa (número), motivo }: tem que ter só dígitos,
// de 1 a 6, ser de 900001 a 999999 e não ter sido usado antes (por ninguém).
function checaNsa(texto, controle){
  const t = String(texto || '').trim();
  if(!/^\d{1,6}$/.test(t)) return { ok:false, nsa:null, motivo:'O NSA tem que ter só números, até 6 dígitos.' };
  const nsa = Number(t);
  if(nsa < NSA_INICIAL) return { ok:false, nsa, motivo:`Use um NSA a partir de ${NSA_INICIAL}: os menores podem bater com os do banco.` };
  if(controle.usados.includes(nsa)) return { ok:false, nsa, motivo:`O NSA ${t} já foi usado num arquivo baixado. Use ${proximoNsa(controle)}.` };
  return { ok:true, nsa, motivo:'' };
}
