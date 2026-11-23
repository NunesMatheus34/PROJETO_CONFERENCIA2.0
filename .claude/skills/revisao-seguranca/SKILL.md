---
name: revisao-seguranca
description: Use antes de fechar uma etapa, ou quando o usuário pedir revisão, para checar as travas de segurança do projeto Conferência DDA 2.0 nos arquivos alterados.
---

# Revisão de segurança

Procure nos arquivos alterados e liste cada problema como arquivo:linha + o porquê. NÃO corrija sozinho:

- innerHTML, outerHTML ou insertAdjacentHTML recebendo dado vindo de arquivo ou do Firebase;
- código de barras passando por Number, parseInt, parseFloat ou conta matemática;
- qualquer trecho que altere, complete ou "corrija" código de barras, valor, vencimento ou beneficiário;
- script ou CSS de CDN sem versão fixa ou sem integrity (SRI);
- dado de arquivo indo para fora do navegador (fetch, Firebase etc.). No Firebase só: usuários,
  permissões, histórico resumido (quantidades e totais), controle do .RET e memória de fornecedores;
- histórico gravando nome de fornecedor, código de barras ou valor de boleto;
- dados reais (nomes de fornecedor, CNPJs de fornecedor, códigos) em código ou em testes;
- arquivo sem comentário no topo, ou função sem comentário dizendo o que faz.

No fim escreva "Nenhum problema encontrado" ou a lista, e pergunte se deve corrigir.
