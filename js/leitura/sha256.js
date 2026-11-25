/* =====================================================================
   SHA-256 (impressão digital de um arquivo)
   Calcula o SHA-256 dos bytes de um arquivo SÓ no navegador
   (crypto.subtle.digest), sem enviar nada para lugar nenhum. Serve para
   provar que um arquivo não mudou: qualquer byte alterado (abrir e editar
   o .RET, por exemplo) dá outro SHA-256.
   ===================================================================== */

// SHA-256 dos bytes (Uint8Array ou ArrayBuffer), em 64 letras hexadecimais minúsculas.
// Lança erro se o navegador não tiver crypto.subtle (página fora de https): quem chama bloqueia.
async function sha256Hex(bytes){
  const sutil = globalThis.crypto && globalThis.crypto.subtle;
  if(!sutil) throw new Error('este navegador não calcula SHA-256 aqui (abra o site pelo endereço https)');
  const resumo = await sutil.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(resumo), b => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 de um arquivo escolhido pelo usuário (lê os bytes com bytesDoArquivo, de js/leitura/pdf.js).
async function sha256DoArquivo(arquivo){
  return sha256Hex(await bytesDoArquivo(arquivo));
}

// Bytes de um texto só ASCII, um byte por caractere (o .RET). Lança erro se aparecer
// caractere fora do ASCII: o arquivo nunca é baixado com um caractere trocado em silêncio.
function bytesAsciiDoTexto(texto){
  const bytes = new Uint8Array(texto.length);
  for(let i = 0; i < texto.length; i++){
    const c = texto.charCodeAt(i);
    if(c > 0x7E) throw new Error(`caractere fora do ASCII na posição ${i + 1}`);
    bytes[i] = c;
  }
  return bytes;
}
