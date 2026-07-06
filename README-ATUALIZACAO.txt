Atualização do painel Rio Rise

Incluído nesta versão:
- Foto grande de fundo removida da tela de login.
- Removida a opção Solicitação de Kick.
- Adicionada a opção Solicitação de Prisão.
- Mantida a opção Mute Report.
- Cargos administrativos:
  - Admin (1): não vê a área de Administradores e não pode cadastrar usuários.
  - Líder (2): vê a listagem, pode cadastrar apenas Admin (1), editar/bloquear/desbloquear admins e ver punições aplicadas.
  - Desenvolvedor (3): pode cadastrar Admin (1), Líder (2) e Desenvolvedor (3), editar/bloquear/desbloquear usuários e ver punições aplicadas.
- Usuário adminkiari fica com poder de Desenvolvedor (3) e usuário principal, além de aparecer no painel como Admin + Desenvolvedor.
- Meta administrativa continua liberada apenas para Líder/Desenvolvedor.
- Toda punição/solicitação salva continua sendo enviada para o Discord via backend.

Depois de enviar para o GitHub:
1. Faça commit dos arquivos.
2. Aguarde o deploy automático da Cloudflare ou clique em Retry deployment.
3. No D1 Console, execute este comando para garantir o cargo do adminkiari:

UPDATE users
SET role_level = 3,
    is_super = 1,
    blocked = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE username = 'adminkiari';

Se o usuário adminkiari ainda não existir, basta fazer login uma vez com ADMIN_USER e ADMIN_PASS que ele será criado automaticamente com essas permissões.
