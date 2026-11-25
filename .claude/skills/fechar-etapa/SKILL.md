---
name: fechar-etapa
description: Use ao terminar cada etapa do projeto Conferência DDA 2.0, para rodar os testes, conferir os números, checar a segurança e listar o que mudou antes do commit.
---

# Fechar etapa

Faça nesta ordem e mostre o resultado de cada item:

1. Rode testes/testes.html (sem navegador: Node com jsdom numa pasta FORA do git, como _referencia/numeros/)
   e mostre o placar. Algum teste vermelho: pare aqui e explique.
2. Rode SEMPRE todos os scripts de _referencia/numeros/ (todas as conferências), não só os da tela mexida.
3. Siga a skill revisao-seguranca nos arquivos alterados nesta etapa.
4. Rode git status. Se aparecer .xlsx, .xls, .pdf, .RET ou qualquer coisa de EXEMPLOS/ ou _referencia/,
   PARE e avise: nada disso pode subir.
5. Liste cada arquivo alterado com uma linha do que mudou.
6. Sugira a mensagem de commit no formato "Etapa N: <resumo>".

NÃO faça commit nem push: quem sobe é o usuário.
