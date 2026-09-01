# Modelo — REVIEW-NNN-resultado.md

Copiar e preencher. Substituir NNN / campos.

```markdown
# REVIEW-NNN — Resultado code review (SPEC-NNN | CORR-NNN)

| Campo | Valor |
|-------|-------|
| Data | YYYY-MM-DD |
| Branch | `feat/…` ou `fix/…` |
| Alvo | SPEC-NNN vx.y / CORR-NNN |
| Diff base | `main` / `master` / … |
| Revisor | agent `review-pro` (model: …) |
| Veredito | Pronto para testes de RN / Quase / Bloqueado |

## Escopo revisado

- Pastas/arquivos principais tocados (bullets curtos)
- Fora de escopo consciente (se houver)

## Checklist CR1–CR16

| # | Status | Nota |
|---|--------|------|
| CR1 | OK | … |
| CR2 | OK | … |
| CR3 | OK | … |
| CR4 | OK | … |
| CR5 | OK | … |
| CR6 | OK | … |
| CR7 | OK | … |
| CR8 | N/A | sem migration |
| CR9 | OK | … |
| CR10 | OK | … |
| CR11 | OK | … |
| CR12 | OK | … |
| CR13 | OK | lint/typecheck |
| CR14 | N/A | Compose nao tocado |
| CR15 | OK | … |
| CR16 | N/A | nao-SAP |

## Achados

| Severidade | Onde | Problema | Correcao sugerida | Status |
|------------|------|----------|-------------------|--------|
| bloqueante | `path` | … | … | aberto / corrigido |
| importante | `path` | … | … | debito aceito |
| nit | `path` | … | … | opcional |

(Se nenhum achado: `Nenhum achado.`.)

## Debitos aceitos

- … (ou “Nenhum”)

## Riscos

- …

## Historico

| Data | Nota |
|------|------|
| YYYY-MM-DD | Review inicial — veredito X |
| YYYY-MM-DD | Re-review apos correcoes — veredito Y |

## Proxima fase

Teste de regra de negocio (`teste-regra-negocio`) — VAL-xx / V-xx.
```
