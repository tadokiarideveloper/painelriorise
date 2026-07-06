Atualização incluída:

- O botão Exportar planilha .xlsx agora só aparece para Líder (2) ou Desenvolvedor (3).
- Em Registros foi adicionado o botão Exportar log completa, também só para Líder/Desenvolvedor.
- Ao abrir uma ficha, Líder/Desenvolvedor podem clicar no nome do admin em Registrado por.
- A tela do admin mostra informações, total de registros e botão Exportar registros do admin.
- Os relatórios exportados saem em documento HTML com logo, dados do admin e tabela dos registros do mês.
- Usuário principal migrado para:
  usuário: developer
  nome: Desenvolvedor
  cargo: Desenvolvedor (3)

Depois de subir os arquivos, faça login uma vez com developer e sua senha do ADMIN_PASS.
Se quiser forçar a migração direto no D1, execute:

UPDATE users
SET username = 'developer', nickname = 'Desenvolvedor', role_level = 3, is_super = 1, blocked = 0, server = '39', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE username = 'adminkiari';

UPDATE sessions SET username = 'developer' WHERE username = 'adminkiari';
UPDATE punishments SET created_by_username = 'developer', created_by = 'Desenvolvedor' WHERE created_by_username = 'adminkiari' OR created_by = 'Admin Kiari';
