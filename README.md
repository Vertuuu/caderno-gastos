# Caderno de Gastos

Um app para controlar, mês a mês, quanto você ganha e quanto gasta, organizado em tabelas como "Salário", "Gastos Fixos", "Comida" ou "Uber".

Ele não é um site na internet: **você roda o app no seu próprio computador**, e ele vira um pequeno servidor que abre no navegador. O celular e outros aparelhos da mesma rede Wi-Fi também conseguem abrir.

- **Seus dados ficam só com você**: são salvos num arquivo no seu computador e nunca são enviados para o GitHub nem para lugar nenhum.
- **Não precisa criar conta** nem estar conectado à internet para usar.
- **Cada pessoa que baixa tem o próprio caderno**: instalar não traz os dados de ninguém, e atualizar não apaga os seus.

**Neste guia:**

1. [Configurar para usar](#1-configurar-para-usar), feito uma vez só
2. [Atualizar para a versão mais nova](#2-atualizar-para-a-versão-mais-nova), sempre que sair novidade aqui no repositório
3. [Funcionalidades](#3-funcionalidades), o que dá para fazer no app

> O guia é escrito para **Windows**. Em Mac ou Linux o app também funciona: siga os mesmos passos, mas ligue o servidor rodando `node server.js` dentro da pasta, já que o painel e o `iniciar.bat` são feitos para Windows.

---

## 1. Configurar para usar

### Passo 1: instalar os programas necessários

| Programa | Para quê | Onde baixar |
|---|---|---|
| **Node.js** (18 ou mais novo) | roda o app. **Obrigatório.** | https://nodejs.org, botão da versão **LTS** |
| **Git** | baixa o app deste repositório e atualiza depois. **Obrigatório.** | https://git-scm.com/download/win |
| **Python 3** | abre o painel com ícone que liga e desliga o app. Opcional, mas recomendado. | https://www.python.org/downloads, e no instalador marque **"Add python.exe to PATH"** |

Nos três instaladores, pode clicar em "Next" mantendo as opções padrão. Depois de instalar, **reinicie o computador** (ou pelo menos feche e abra de novo os terminais), para o Windows reconhecer os programas.

### Passo 2: baixar o app

1. Abra o Explorador de Arquivos na pasta onde quer guardar o app, por exemplo `Documentos`.
2. Clique na barra de endereço, apague o que estiver escrito, digite `powershell` e aperte Enter. Abre um terminal já nessa pasta.
3. Cole o comando abaixo e aperte Enter:

   ```bash
   git clone https://github.com/Vertuuu/caderno-gastos.git
   ```

Isso cria a pasta `caderno-gastos` com o app. É nessa pasta que ele vai ficar e onde seus dados serão guardados.

> Prefira o `git clone` ao botão **Code → Download ZIP** aqui do GitHub. Com o clone, atualizar depois é um comando só e não oferece risco para os seus dados.

### Passo 3: ligar o app

Abra a pasta `caderno-gastos` e escolha um dos jeitos:

**Pelo painel (recomendado):** dê dois cliques em **`Caderno de Gastos.pyw`**. Abre uma janelinha com um ícone de dinheiro que:

- liga o app sem janela preta de terminal e mostra quando ele está **ativo**;
- mostra os endereços para abrir no computador e no celular, com botão de copiar;
- tem os botões **Abrir no navegador** e **Ligar/Desligar** (desligar salva tudo antes);
- cria um **atalho na Área de Trabalho** e pode **ligar junto com o Windows**, já minimizado;
- tem tema claro, escuro ou igual ao Windows.

Ao fechar a janela, ele pergunta se você quer desligar o app ou só minimizar.

**Pelo terminal:** dê dois cliques em **`iniciar.bat`**. Abre uma janela preta com os endereços. Deixe essa janela aberta enquanto usa o app; fechar desliga.

### Passo 4: abrir no navegador

- **Neste computador:** http://localhost:3000
- **No celular ou em outro computador da mesma rede Wi-Fi:** o endereço que começa com `http://192.168.` e aparece no painel (ou na janela do `iniciar.bat`).

Se o celular não abrir, veja [Liberar no firewall](#liberar-no-firewall-se-o-celular-não-abrir).

### Passo 5: começar a usar

1. Clique em **Criar mês** (ou em **+ Novo mês**, no topo) e escolha o mês atual.
2. Crie suas tabelas: em **Entradas**, coisas como "Salário" e "Extras"; em **Saídas**, coisas como "Gastos Fixos", "Comida" e "Uber".
3. Em cada tabela, escreva o nome do item e o valor e aperte Enter. Exemplo: em "Gastos Fixos", `Aluguel` e `1500`.

No mês seguinte, ao criar o novo mês, os itens de "Gastos Fixos" e "Salário" já vêm copiados. Você pode escolher outras tabelas para repetir.

### Ajustes opcionais

#### Liberar no firewall (se o celular não abrir)

Abra o PowerShell **como administrador** (menu Iniciar → digite "PowerShell" → botão direito → "Executar como administrador") e rode:

```powershell
New-NetFirewallRule -DisplayName "Caderno de Gastos" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

A rede Wi-Fi também precisa estar marcada como **Privada**, em Configurações → Rede e Internet → Wi-Fi → nome da rede.

#### Ligar junto com o Windows

Marque **"Ligar junto com o Windows"** no painel. Sem o painel: aperte `Win + R`, digite `shell:startup` e crie ali um atalho para o `iniciar.bat`.

#### Usar outra porta

Se a porta 3000 já estiver em uso por outro programa, rode no terminal, dentro da pasta: `set PORT=3001 && node server.js`.

#### Acesso fora de casa

O app só atende a rede local. Para abrir de fora (4G, outra casa), instale uma VPN como o [Tailscale](https://tailscale.com) no computador e no celular. **Não abra a porta no roteador**: o app não tem senha, e qualquer pessoa na internet conseguiria ver seus dados.

### Onde ficam os seus dados

- Tudo fica em `caderno-gastos/dados/caderno.json`.
- Uma cópia de segurança por dia vai para `caderno-gastos/dados/backups/`.
- Para levar para outro computador, instale o app lá e copie a pasta `dados` para dentro dele.
- A pasta `dados` é ignorada pelo Git: ela **nunca** é enviada ao repositório e não é afetada pelas atualizações.

---

## 2. Atualizar para a versão mais nova

Quando houver novidades aqui no repositório, você pode trazê-las para o seu app. **Atualizar não apaga os seus dados**: a pasta `dados/` e as preferências do painel (`app/config.json`) não fazem parte do repositório, então o Git não mexe nelas.

1. **(Opcional, recomendado)** Copie a pasta `dados` para outro lugar, como cópia de segurança.
2. **Desligue o app**: botão **Desligar** no painel, ou feche a janela do `iniciar.bat`.
3. Abra um terminal **dentro da pasta `caderno-gastos`** (barra de endereço do Explorador → `powershell` → Enter) e rode:

   ```bash
   git pull
   ```

4. **Ligue o app de novo** e **recarregue a página** no navegador de cada aparelho, inclusive no celular.

### Cuidados

- **Nunca rode `git clean -x`** (nem `-fdx`): esse comando apaga os arquivos que o Git ignora, e isso inclui a pasta `dados`.
- **Não edite os arquivos do app** (`server.js`, a pasta `public` etc.). Se editou, o `git pull` pode dar conflito. Seus dados continuam salvos, mas a atualização trava até a edição ser desfeita.
- **Baixou pelo ZIP?** Baixe o ZIP novo e **copie a sua pasta `dados` para dentro da pasta nova** antes de apagar a antiga. Se apagar a pasta antiga primeiro, perde tudo. Para não precisar disso das próximas vezes, troque para o `git clone` do [Passo 2](#passo-2-baixar-o-app) e copie a pasta `dados` para dentro do clone.

---

## 3. Funcionalidades

### Lançamentos

- **Tabelas de entradas e saídas**, cada uma com cor própria e total do mês.
- **Registros com nome e valor** dentro de cada tabela. Clique no nome ou no valor para editar e no × para remover.
- **Resumo do mês**: quanto entrou, quanto saiu, quanto sobrou e uma barra com o peso de cada tabela na renda.
- **Mover tabelas** de posição arrastando pela alça ⠿ ou pelos botões **← Antes / Depois →** no menu ⋯. A ordem vale para todos os meses.
- **Excluir tabela** pela lixeira no cabeçalho (ou no menu ⋯), mesmo com registros: um popup mostra quantos registros e meses serão afetados e, ao confirmar, a tabela e todos os registros dela são apagados em todos os meses.
- **Menu ⋯ da tabela**: renomear, trocar a cor, mover, marcar "Repetir os itens ao criar o próximo mês" e excluir.
- **Desfazer** no aviso que aparece depois de remover, mover, excluir ou limpar (veja também os botões fixos em **Geral**).

### Meses

- **Novo mês** com cópia automática dos itens das tabelas marcadas para repetir (por padrão, Gastos Fixos e Salário). Na hora de criar, dá para escolher quais copiar.
- Navegação entre meses pelas setas ou pela lista.
- **Limpar registros** do mês e **Excluir mês**, os dois com confirmação.

### Gráficos

- Análise por **mês, semestre ou ano**, para **gastos, entradas ou geral**.
- Composição por tabela em **rosca, barras ou colunas**, com porcentagens.
- Evolução ao longo do tempo **empilhada ou em linhas**.
- Indicadores, análises em texto (o que subiu, o que caiu) e visualização em tabela.

### Metas

- Meta com nome, valor e cor, calculada por **gasto mensal** ou por **meses para atingir**: você preenche um e o outro é calculado, mostrando o que sobra no último mês.
- Barra de progresso em %, quanto **falta juntar** e previsão de quando a meta será atingida.
- O botão de parcela mostra o valor (**+ R$ 300,00**) e lança esse valor numa tabela de saídas **Metas**, criada automaticamente. Registros com o nome da meta nessa tabela contam para o progresso.
- No celular, cada meta vira um **card** (sem rolar para o lado), com um resumo curto (quanto falta, quantos meses faltam e quanto vai sobrar); a nova meta é preenchida num card-formulário.
- Caixa **Ativa** para tirar uma meta do resumo do topo sem apagá-la.

### Geral

- **Desfazer e Refazer** sempre à mão, no canto inferior direito (ou **Ctrl+Z** e **Ctrl+Y**): voltam qualquer ação, como lançar, editar, remover, renomear, mover, criar ou excluir tabela, mês ou meta. Cada aparelho guarda as **últimas 20 ações** enquanto a aba estiver aberta, e desfazer não apaga o que foi lançado depois em outro aparelho.
- **Tema claro e escuro** (ou igual ao sistema), no site e no painel.
- Funciona no celular, com layout próprio para tela pequena: a navegação fica numa **barra fixa embaixo**, com o mês no centro, menus de **páginas** e **tema** que abrem para cima e **Desfazer/Refazer**; **Novo mês** fica no topo de Lançamentos, junto de Limpar registros e Excluir mês.
- **Sincronização entre aparelhos** da mesma rede: o que é lançado no celular aparece no computador em poucos segundos.
- Salvamento automático, com uma cópia de segurança por dia.
