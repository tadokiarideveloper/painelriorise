ATUALIZAÇÃO RIO RISE

O que foi alterado:
- Removida a foto grande do fundo da tela de login.
- Removida a opção Solicitação de Kick.
- Adicionada a opção Solicitação de Prisão.
- Mantida a opção Mute Report.
- Adicionados cargos: Desenvolvedor (3), Líder (2), Admin (1).
- Usuário principal adminkiari entra como Admin (1), mas com permissões totais liberadas.
- Líder/Desenvolvedor/Super podem cadastrar Admin (1).
- Área de administradores com lista de usuários, bloqueio/desbloqueio, alteração de usuário/senha e verificação de punições aplicadas.
- Meta administrativa só aparece para Líder/Desenvolvedor/Super.
- Toda punição ou solicitação salva é enviada automaticamente para o Discord via webhook no backend.

IMPORTANTE SOBRE CLOUDFLARE:
Se seu projeto já está com D1 configurado no wrangler.toml, mantenha o seu database_id real.
Não deixe o arquivo wrangler.toml com database_id de exemplo.

BANCO D1:
Execute o schema.sql atualizado no Console do D1 para criar/atualizar as tabelas.
O login adminkiari será criado automaticamente no primeiro login usando ADMIN_USER e ADMIN_PASS.
