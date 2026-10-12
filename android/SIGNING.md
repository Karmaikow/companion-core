# Assinatura do APK

A partir da beta 0.4.8, as atualizações usam uma chave RSA-3072 persistente, cujo certificado público fica em `signing-certificate.json`. O build confere esse certificado antes de assinar e recusa outra chave. A chave privada e sua senha são entregues separadamente no kit privado de backup; nunca entram no Git.

## Migração da 0.4.7

A 0.4.8 tem assinatura diferente. Antes de remover o APK antigo, exporte o Cristal da Companion, confirme o arquivo salvo e guarde sua senha e código de recuperação. Desinstalar apaga os dados locais. Após instalar a 0.4.8, crie o acesso local e importe o Cristal. O protocolo de transferência continua exigindo autorização do registro central.

Esta chave assina o aplicativo. Ela não é uma chave da Companion e não substitui a senha ou o código do Cristal.

## Próximas compilações

Extraia o kit em uma pasta privada fora do repositório. Defina estas variáveis no processo de build, sem colocar a senha em comandos publicados ou arquivos versionados:

- `COMPANION_SIGNING_KEY`: caminho do arquivo PKCS12.
- `COMPANION_SIGNING_PASSWORD`: senha contida no kit privado.
- `COMPANION_SIGNING_ALIAS`: `companioncore` (padrão).

O script recebe a senha por variável de ambiente, verifica o certificado e usa a versão do manifesto no nome do APK. Para futuras atualizações, mantenha o applicationId e aumente o versionCode. Guarde uma segunda cópia privada do kit em outro dispositivo. Não envie o kit ao GitHub.

## Validação da 0.4.8

Java e recursos compilados contra API 35; assinatura APK v2/v3 verificada com apksigner. Core, interface web e bibliotecas nativas foram reaproveitados do APK 0.4.7 e conferidos byte a byte. A interface Android foi recompilada com o menu recolhível. Não houve execução em aparelho neste ambiente; instalação, importação e persistência precisam ser testadas no Android.
