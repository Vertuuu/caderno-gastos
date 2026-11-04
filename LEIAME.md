# Caderno de Gastos

Controle mensal de gastos e rendas, rodando num servidor local. Não precisa de internet nem de conta: qualquer aparelho na mesma rede abre pelo navegador.

## Iniciar pelo painel (recomendado)

Dê dois cliques em **`Caderno de Gastos.pyw`**. Abre uma janelinha com o ícone de dinheiro que:

- liga o servidor sem janela preta de terminal e mostra se ele está **ativo**;
- mostra os endereços para este computador e para o celular, com botão de copiar;
- tem **Abrir no navegador** e **Ligar/Desligar** (desliga salvando tudo);
- cria um **atalho na Área de Trabalho** e pode **ligar junto com o Windows**, já minimizado.

Ao fechar a janela, você escolhe entre desligar o servidor ou só minimizar.
Precisa do Python 3 (com tkinter, que já vem no instalador oficial) e do Node.js.

## Iniciar pelo terminal

Dê dois cliques em `iniciar.bat` (ou rode `node server.js` nesta pasta). A janela mostra os endereços:

- `http://localhost:3000` — neste computador
- `http://192.168.x.x:3000` — celular, notebook etc. na mesma rede Wi-Fi

Precisa do Node.js instalado (versão 18 ou mais nova). Para usar outra porta: `set PORT=8080 && node server.js`.

## Liberar no firewall (uma vez)

Se outro aparelho não conseguir abrir, libere a porta no Windows. Num PowerShell **como administrador**:

```powershell
New-NetFirewallRule -DisplayName "Caderno de Gastos" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

A rede Wi-Fi precisa estar marcada como **Privada** nas configurações do Windows.

## Iniciar junto com o Windows

Marque "Ligar junto com o Windows" no painel. Sem o painel: aperte `Win + R`, digite `shell:startup` e crie ali um atalho para `iniciar.bat`.

## Dados

- Tudo fica em `dados/caderno.json`.
- Uma cópia por dia vai para `dados/backups/`.
- Para levar para outro computador, copie a pasta inteira.

## Acesso fora de casa

O servidor só atende a rede local. Para abrir de fora (4G, outra casa), use uma VPN como o Tailscale nos aparelhos, que é o caminho mais seguro. Não abra a porta no roteador: o app não tem senha.
