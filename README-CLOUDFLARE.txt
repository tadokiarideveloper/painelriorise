RIO RISE - PAINEL COM BANCO CLOUDFLARE D1

O que esta versão tem:
- Login validado no backend por Cloudflare Pages Functions.
- Senha não fica no HTML/JS do navegador.
- Registros salvos no Cloudflare D1, não mais apenas no navegador.
- Link público da ficha usa o ID do registro no banco.
- Evidência continua sendo por link clicável.
- Exportação .xlsx real com abas Resumo, Registros, Resumo por Tipo e Resumo por Jogador.
- Tipo de punição Mute Report incluído.

PASTAS IMPORTANTES:
- index.html / app.js / styles.css: painel visual.
- functions/api: APIs do Cloudflare Pages Functions.
- schema.sql: tabelas do banco D1.
- wrangler.toml: configuração do Cloudflare/Wrangler.

DEPLOY RESUMIDO:
1. Suba esta pasta em um repositório GitHub.
2. No Cloudflare, vá em Workers & Pages > Create > Pages > Connect to Git.
3. Framework preset: None.
4. Build command: deixe vazio.
5. Build output directory: .
6. Crie um banco D1 chamado rio-rise-db.
7. Execute o schema.sql no banco D1.
8. Em Settings > Bindings do projeto Pages, adicione D1 database com:
   Variable name/binding: DB
   D1 database: rio-rise-db
9. Em Settings > Variables, adicione:
   ADMIN_USER = seu usuário
   ADMIN_PASS = sua senha
10. Faça novo deploy.

COMANDOS OPCIONAIS PELO TERMINAL:
- npm install -g wrangler
- wrangler login
- wrangler d1 create rio-rise-db
- wrangler d1 execute rio-rise-db --remote --file=./schema.sql

Depois de criar o banco pelo terminal, copie o database_id retornado e cole no wrangler.toml.
