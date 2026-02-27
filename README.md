# Visitor Tools

Aplicação React + Vite para utilitários internos da Visitor.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicar na internet (GitHub Pages)

Este projeto já está configurado para deploy público com `gh-pages`.

### 1) Subir o código para um repositório no GitHub

```bash
git init
git add .
git commit -m "chore: preparar deploy"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/visitor-tools.git
git push -u origin main
```

### 2) Publicar

```bash
npm install
npm run deploy
```

Esse comando cria a branch `gh-pages` com os arquivos de produção.

### 3) Ativar GitHub Pages no repositório

No GitHub: `Settings` → `Pages` → `Build and deployment`:

- `Source`: `Deploy from a branch`
- `Branch`: `gh-pages`
- Pasta: `/ (root)`

Após salvar, o site fica disponível em:

`https://SEU_USUARIO.github.io/visitor-tools/`

## Scripts disponíveis

- `npm run dev`: desenvolvimento local
- `npm run build`: build de produção
- `npm run preview`: pré-visualização do build
- `npm run deploy`: publica versão atual no GitHub Pages
