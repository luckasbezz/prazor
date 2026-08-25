# Prazor — documentação do produto

Este diretório transforma a visão do Prazor em um plano executável. A documentação considera o estado real do projeto e do banco **Prazor Produção**, auditado em 21 de agosto de 2026.

## Documentos

1. [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md) — proposta, público, escopo, métricas e regras do produto.
2. [SCREENS_AND_FLOWS.md](./SCREENS_AND_FLOWS.md) — arquitetura de informação, telas e jornadas.
3. [DATA_MODEL_AND_SECURITY.md](./DATA_MODEL_AND_SECURITY.md) — banco existente, lacunas e modelo de segurança.
4. [BACKLOG.md](./BACKLOG.md) — entregas priorizadas, histórias e critérios de aceite.

## Decisão executiva

O banco atual já sustenta grande parte do MVP. O trabalho deve continuar sobre essa base, nesta ordem:

1. corrigir e validar segurança, autenticação e isolamento entre empresas;
2. conectar a aplicação ao Supabase;
3. construir o fluxo operacional completo de produto, lote, saldo e ação;
4. liberar alertas e relatórios;
5. adicionar tarefas, leitura por câmera e integrações.

O Prazor não será um ERP completo. Seu foco é transformar dados de estoque e validade em ações que evitem perdas.
