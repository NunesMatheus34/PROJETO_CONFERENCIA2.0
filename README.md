# Central Financeira

CRV · Rubi

Conferências financeiras (DDA dos bancos × relatório do sistema, código de barras) e arquivos
bancários. Site em HTML, CSS e JavaScript puro, publicado no GitHub Pages.

Planilhas, PDFs e boletos são lidos só no navegador: nenhum dado de arquivo vai para servidor.

## Telas

- **Início**
- **Conferências:** Conferência DDA, Código de barras, Conferência de boletos
- **Arquivos bancários:** DDA → .RET
- **Caixa** e **Relatórios:** em breve
- **Ajuda** e **Perfil**

## Acrescentar uma tela

1. Em `js/app.js`, acrescente uma linha no grupo certo da lista `MENU`:
   `{ tela: 'nome-da-tela', titulo: 'Nome da tela' },`
2. No `index.html`, crie a `<section class="tela" id="tela-nome-da-tela" hidden>`.

O menu, o caminho do topo e a tela Início saem sozinhos da lista.

## Testes

Abra `testes/testes.html` no navegador (só dados fictícios): verde passou, vermelho falhou.
