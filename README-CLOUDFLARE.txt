RIO RISE - PAINEL COM BANCO CLOUDFLARE D1

CORRECAO DO ERRO 8000022:
Se aparecer: Invalid database UUID (COLE_AQUI_O_DATABASE_ID), edite o wrangler.toml e remova qualquer linha com database_id de exemplo.
Nesta versao corrigida, o D1 deve ser vinculado pelo painel da Cloudflare usando o binding DB.

DEPLOY:
1. Suba esta pasta no GitHub.
2. Cloudflare > Workers & Pages > Create > Pages > Connect to Git.
3. Framework preset: None.
4. Build command: deixe vazio.
5. Build output directory: .
6. Clique em Save and Deploy.

BANCO D1:
1. Cloudflare > Workers & Pages > D1 SQL Database > Create.
2. Nome do banco: rio-rise-db.
3. Abra o banco > Console.
4. Cole o conteudo de schema.sql e execute.
5. Depois volte no projeto Pages:
   Workers & Pages > painelriorise > Settings > Bindings > Add > D1 database.
6. Configure:
   Variable name / Binding name: DB
   Database: rio-rise-db
7. Em Settings > Environment variables, adicione:
   ADMIN_USER = seu usuario
   ADMIN_PASS = sua senha
8. Faca Redeploy.

PASTAS IMPORTANTES:
- index.html / app.js / styles.css: painel visual.
- functions/api: APIs do Cloudflare Pages Functions.
- schema.sql: tabelas do banco D1.
- wrangler.toml: config de deploy sem database_id fixo.
