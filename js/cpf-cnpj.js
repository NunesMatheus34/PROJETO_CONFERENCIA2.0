/* =====================================================================
   CPF E CNPJ: DÍGITOS VERIFICADORES
   Confere se um CPF ou CNPJ, do jeito que veio do arquivo do banco, tem
   os dígitos verificadores certos. Serve de trava: um documento com DV
   errado é sinal de leitura ruim ou de dado adulterado, e o boleto não
   segue. Nada aqui completa, corrige ou "acerta" um documento: só
   responde sim ou não. Aceita o CNPJ alfanumérico (letras nas 12
   primeiras posições, regra da Receita a partir de julho de 2026).
   ===================================================================== */

// Tira só a pontuação de documento (ponto, barra, traço e espaços). Não mexe em mais nada:
// letra minúscula ou outro caractere continuam lá e fazem a conferência falhar.
function documentoSemPontuacao(texto){
  return String(texto === null || texto === undefined ? '' : texto).replace(/[\s.\/-]+/g, '');
}

// DV do CPF (módulo 11): pesos decrescentes a partir de (tamanho + 1); resto < 2 vira 0.
function dvCpf(base){
  let soma = 0;
  for(let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// DV do CNPJ (módulo 11): pesos 2 a 9 da direita para a esquerda, repetindo; resto < 2 vira 0.
// Cada caractere vale (código ASCII − 48): dígito vale ele mesmo, letra A = 17 ... Z = 42
// (é assim que a Receita calcula o CNPJ alfanumérico; para CNPJ só de números não muda nada).
function dvCnpj(base){
  let soma = 0;
  for(let i = base.length - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1)
    soma += (base.charCodeAt(i) - 48) * peso;
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// true quando o texto é um CPF (11 dígitos) ou CNPJ (14 caracteres) com os DVs certos.
// Todos os dígitos iguais (000.000.000-00, 11.111.111/1111-11) passam na conta mas não existem: false.
function cpfCnpjValido(texto){
  const d = documentoSemPontuacao(texto);
  if(/^\d{11}$/.test(d)){
    if(/^(\d)\1{10}$/.test(d)) return false;
    return dvCpf(d.slice(0, 9)) === Number(d[9]) && dvCpf(d.slice(0, 10)) === Number(d[10]);
  }
  if(/^[0-9A-Z]{12}\d{2}$/.test(d)){
    if(/^(\d)\1{13}$/.test(d)) return false;
    return dvCnpj(d.slice(0, 12)) === Number(d[12]) && dvCnpj(d.slice(0, 13)) === Number(d[13]);
  }
  return false;
}
