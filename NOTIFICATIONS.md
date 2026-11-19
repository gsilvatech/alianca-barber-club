# Notificações Web Push

O projeto envia avisos para o navegador instalado como aplicativo. No iPhone, o cliente ou barbeiro deve adicionar o site à Tela de Início antes de tocar em **Ativar notificações**.

## Publicação

1. Execute `supabase/migrations/20261118000000_add_web_push_notifications.sql` no Supabase.
2. Cadastre no provedor de hospedagem as variáveis existentes em `.env.local`:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` com um e-mail real de contato da barbearia, no formato `mailto:email@dominio.com`
   - `CRON_SECRET`
   - as três variáveis já existentes do Supabase.
3. Faça o deploy. O arquivo `vercel.json` chama `/api/push/reminders` a cada minuto. Esse intervalo exige um plano Vercel que aceite cron de um minuto; caso o plano atual não aceite, configure outro agendador para fazer uma requisição `GET` para essa rota com o cabeçalho `Authorization: Bearer <CRON_SECRET>` a cada minuto.

## Comportamento

- Ao confirmar um agendamento pelo portal do cliente, o barbeiro responsável recebe um Push.
- Na área **Perfil**, o cliente pode escolher 1 hora, 30 minutos ou nenhum lembrete.
- A entrega registra cada lembrete no banco. Um mesmo agendamento não repete o mesmo lembrete, inclusive depois de uma nova execução do cron.
- Inscrições expiradas são removidas automaticamente quando o navegador informa 404 ou 410.

## Teste manual

Com o site aberto via HTTPS (ou `localhost`), entre como cliente e como barbeiro em aparelhos distintos, ative as notificações e crie um agendamento. Para testar lembretes, crie um horário para 30 ou 60 minutos à frente e execute o endpoint protegido usando o mesmo `CRON_SECRET` configurado no ambiente.
