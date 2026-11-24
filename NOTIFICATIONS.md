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
3. Faça o deploy. O projeto **não** usa Vercel Cron, porque o plano Hobby só aceita execuções diárias. Os lembretes são disparados por um agendador externo (cron-job.org), configurado abaixo.

## Agendador de lembretes (cron-job.org)

1. Crie uma conta gratuita em [cron-job.org](https://cron-job.org) e clique em **Create cronjob**.
2. Preencha:
   - **Title:** `Barbearia - lembretes push`
   - **URL:** `https://<seu-dominio>/api/push/reminders`
   - **Execution schedule:** a cada 1 minuto (no máximo 5 minutos; a rota só envia lembretes até 10 minutos após o horário previsto).
3. Na aba **Advanced**:
   - **Request method:** `GET`
   - **Headers:** adicione `Authorization` com o valor `Bearer <CRON_SECRET>` (o mesmo valor da variável de ambiente configurada na Vercel).
4. Em **Notifications**, ative o aviso por e-mail para execuções com falha.
5. Salve e use **Test run**. A resposta esperada é `200` com `{"sent":0}` (ou o número de lembretes enviados). `401` indica `CRON_SECRET` ou header incorreto.

Se o projeto migrar para o plano Pro da Vercel, é possível desativar o job externo e voltar a usar um `vercel.json` com `crons`.

## Comportamento

- Ao confirmar um agendamento pelo portal do cliente, o barbeiro responsável recebe um Push.
- Na área **Perfil**, o cliente pode escolher 1 hora, 30 minutos ou nenhum lembrete.
- A entrega registra cada lembrete no banco. Um mesmo agendamento não repete o mesmo lembrete, inclusive depois de uma nova execução do cron.
- Inscrições expiradas são removidas automaticamente quando o navegador informa 404 ou 410.

## Teste manual

Com o site aberto via HTTPS (ou `localhost`), entre como cliente e como barbeiro em aparelhos distintos, ative as notificações e crie um agendamento. Para testar lembretes, crie um horário para 30 ou 60 minutos à frente e execute o endpoint protegido usando o mesmo `CRON_SECRET` configurado no ambiente.
