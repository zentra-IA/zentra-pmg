# Zentra Sales AI — versão preservada

Esta versão foi preparada a partir do backup funcional, preservando o coração do sistema:

- Kanban comercial
- Inbox WhatsApp
- Mensagens com IA
- Campanhas e disparo automático
- WhatsApp QR / múltiplas sessões
- Radar
- BI
- Gerador de criativos

Também foram adicionadas páginas-base para:
- Pedidos
- Cotações
- Metas
- Central IA
- Cotador IA

## Como rodar

1. Configure `.env` ou `.env.local`.
2. Rode:

```bash
npm install
npx prisma generate
npm run dev
```

Ou use:

```bash
start-zentra-sales-ai.bat
```

## Importante

Os arquivos `.env`, `.env.local`, `.git`, `.next`, `node_modules`, sessões do WhatsApp e logs não foram incluídos no ZIP final por segurança e performance.

## APIs ajustadas

Foram criados `route.ts` para:
- app/api/automation/process-queue
- app/api/automation/start-campaign
- app/api/creative-generator/generate
- app/api/creative-generator/save

Isso preserva a lógica existente e torna as rotas compatíveis com Next.js App Router.
