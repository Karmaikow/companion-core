# Segurança do MVP

Este projeto demonstra a arquitetura, não uma solução de produção.

- Ed25519 autentica eventos assinados pela identidade da Companion.
- SHA-256 encadeia eventos e permite detectar alterações.
- O servidor mantém um snapshot confiável e aplica regras próprias.
- Uma alteração offline pode ser aceita localmente, mas rejeitada ao entrar no mundo online.
- O servidor devolve o último estado confiável e o cliente pode fazer rollback.
- O MVP armazena a chave privada em arquivo apenas para demonstração. Isso é inseguro em um dispositivo real.

## Produção

A chave privada deve ser mantida por um KeyStore/TPM/Secure Enclave/Android Keystore ou equivalente. O servidor nunca recebe a chave privada.

Além disso, o servidor deve ser autoritativo para recursos competitivos: ranking, PvP, comércio, itens raros, recompensas e conquistas globais.
