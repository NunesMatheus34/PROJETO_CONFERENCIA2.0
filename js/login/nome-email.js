/* =====================================================================
   NOME → E-MAIL INTERNO
   A pessoa entra só com NOME e SENHA. O Firebase Authentication pede um
   e-mail, então o nome vira um e-mail interno que ela nunca vê:
     "Matheus Nunes" → matheus.nunes@conferencia.local
   (sem acento, minúsculo, espaço vira ponto). Dois nomes que dão o mesmo
   e-mail ("José Silva" e "jose  silva") são o MESMO login: é isso que faz
   o Firebase responder "esse nome já existe".
   Este arquivo não fala com o Firebase: só limpa e confere o nome.
   ===================================================================== */

const DOMINIO_LOGIN = 'conferencia.local';
const NOME_MINIMO = 3;
const NOME_MAXIMO = 60;
const SENHA_MINIMA = 8;

// Tira os espaços das pontas e junta espaços repetidos num só.
// É assim que o nome é guardado no cadastro e mostrado na tela.
function limpaNomeDigitado(nome){
  return String(nome == null ? '' : nome).trim().replace(/\s+/g, ' ');
}

// Confere o nome digitado e devolve { nome, email } ou { erro } com a mensagem para a tela.
// Aceita letras (com acento), números, espaço, hífen e ponto; o resto é recusado
// em vez de sumir calado, para dois nomes diferentes não virarem o mesmo login sem aviso.
function nomeParaLogin(nomeDigitado){
  const nome = limpaNomeDigitado(nomeDigitado);
  if(nome.length < NOME_MINIMO) return { erro: `Digite o nome com pelo menos ${NOME_MINIMO} letras.` };
  if(nome.length > NOME_MAXIMO) return { erro: `O nome pode ter no máximo ${NOME_MAXIMO} caracteres.` };
  if(!/^[\p{L}0-9 .-]+$/u.test(nome)) return { erro: 'Use no nome só letras, números, espaço, hífen ou ponto.' };

  const local = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // "ç" → "c", "ã" → "a"
    .toLowerCase()
    .replace(/[ .]+/g, '.')                              // espaço (ou ponto) vira UM ponto
    .replace(/^[.-]+|[.-]+$/g, '');                      // sem ponto ou hífen nas pontas
  // letras que não têm versão sem acento (ß, ø, æ...) não cabem num e-mail simples
  if(!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(local) || /\.\./.test(local))
    return { erro: 'Esse nome tem letras que o login não aceita. Escreva sem símbolos especiais.' };
  return { nome, email: local + '@' + DOMINIO_LOGIN };
}

// Confere a senha nova (criar conta e trocar senha): mínimo de caracteres e confirmação igual.
// Devolve a mensagem de erro, ou '' quando está tudo certo.
function confereSenhaNova(senha, confirmacao){
  if(String(senha).length < SENHA_MINIMA) return `A senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.`;
  if(senha !== confirmacao) return 'As duas senhas não são iguais.';
  return '';
}
