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
- tem os botões **Abrir no navegador** e **Ligar/Desligar** (desligar salva tudo antes). Se o app já estava ligado pelo `iniciar.bat`, o **Desligar** do painel também desliga ele;
- cria um **atalho na Área de Trabalho** e pode **ligar junto com o Windows**, já minimizado (se você mudar a pasta de lugar, o atalho de inicialização é corrigido sozinho na próxima vez que o painel abrir);
- tem tema claro, escuro ou igual ao Windows.

Ao fechar a janela, ele pergunta se você quer desligar o app ou só minimizar. Abrir o painel de novo traz para frente a janela que já está aberta. Se algo der errado no painel, os detalhes ficam em `app/erro.log`.

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

#### Segurança

- O app funciona **sem internet**: as fontes vêm junto, em `public/fonts/` (licença livre, em `OFL.txt`).
- Ele só abre pelo **localhost**, por um **IP** (como o `192.168.x.x` do celular ou o `100.x.x.x` do Tailscale) ou pelo **nome do computador**. Endereços de outros domínios são recusados, para que um site de fora não consiga acessar seus dados pelo navegador.
- O **Desligar** só é aceito do próprio painel, no próprio computador.

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
- **Ordenar tabelas:** ao lado do título **Entradas** e **Saídas**, escolha **Manual (arrastar)**, **Nome A–Z**, **Nome Z–A**, **Maior valor**, **Menor valor** ou **Mais registros** (valor e registros do mês aberto). Fora do Manual, a alça de arrastar some.
- **Ordenar itens de uma tabela:** no seletor **⇅** acima dos itens: **Data (dia 1 → 31)** (padrão), **Data (dia 31 → 1)**, **Nome A–Z**, **Nome Z–A**, **Maior valor** ou **Menor valor**. Cada tabela guarda a sua escolha.
- As ordenações valem para todos os aparelhos e entram no **desfazer**.
- **Excluir tabela** pela lixeira no cabeçalho (ou no menu ⋯), mesmo com registros: um popup mostra quantos registros e meses serão afetados e, ao confirmar, a tabela e todos os registros dela são apagados em todos os meses.
- **Menu ⋯ da tabela**: renomear, trocar a cor, mover, marcar "Repetir os itens ao criar o próximo mês", marcar "Manter esta cor ao trocar de tema" e excluir.
- **Desfazer** no aviso que aparece depois de remover, mover, excluir ou limpar (veja também os botões fixos em **Geral**). O aviso fica 8 segundos, pausa com o mouse em cima e, se fosse cobrir o campo em que você digita, aparece no topo.
- **Salvamento:** ao lado do nome do app, no topo, aparece **Salvo**, **Salvando…** ou **Sem conexão** (passe o mouse para ver os detalhes). Se algo não puder ser salvo, uma faixa vermelha fica presa no topo com o motivo e o botão **Tentar agora**; as alterações ficam guardadas no aparelho até conseguirem ser enviadas.

### Data dos lançamentos

- Toda entrada e saída tem uma **data**, mostrada numa coluna própria, depois do valor. O item novo entra com a data de **hoje**; num mês que não é o atual, com o mesmo número do dia de hoje (no dia 31, um mês mais curto usa o último dia).
- Para mudar a data de um item, **clique na data**: abre o calendário, com qualquer dia do mês aberto. Na edição, o nome fica em cima e o valor e a data embaixo.
- **Saída com data de hoje ou passada** fica **paga**. **Saída com data futura** vira **conta a vencer**, com lembrete e bolinha de paga (veja Vencimento das contas). Mudar a data recalcula isso; a bolinha continua desmarcando.
- Registros antigos, lançados antes de a data existir, contam pelo dia em que foram lançados (ou no dia 1, se foram lançados em outro mês) até você editá-los.

### Datas de recebimento

- Nas tabelas de **entradas**, o menu ⋯ tem **Dividir em datas de recebimento**: cada valor lançado é dividido nas datas configuradas. Exemplo: salário de R$ 5.000 com 60% no **5º dia útil** e 40% **todo dia 20** vira dois registros, de R$ 3.000 e R$ 2.000, cada um com o seu dia.
- Cada data pode ser **"dia útil"** (o Nº dia útil do mês, contando de segunda a sexta, pulando feriados nacionais, com opção de contar o sábado) ou **"dia fixo"** (todo mês no mesmo dia, que **antecipa**, **adia** ou **mantém** quando cai em fim de semana ou feriado). Dá para ter até 6 datas, e as porcentagens precisam somar 100%.
- No mês seguinte, os itens copiados têm o dia **recalculado**, porque o 5º dia útil muda de mês para mês.
- O resumo do mês mostra quanto **já caiu** e qual é o **próximo recebimento**. Cada registro mostra a data e fica verde depois que ela passa.
- Para não dividir mais, **desligue a opção**: os registros já lançados mantêm as datas. Também dá para mudar a data de qualquer entrada clicando nela para editar.
- O botão **Dividir os itens deste mês** aplica a divisão ao que já foi lançado antes de ligar a opção.

### Vencimento das contas

- Uma **saída com data futura** é uma conta a vencer naquele dia (ex.: Aluguel dia 5, lançado no dia 1). Ao criar o mês seguinte, ela repete no mesmo dia.
- A saída tem uma **bolinha para marcar como paga** e a data na coluna própria: fica **vermelha** quando a conta venceu e **amarela** quando vence hoje ou nos próximos 3 dias (passe o mouse para ver a situação). Os itens aparecem na ordem da data (dá para mudar no **⇅** da tabela).
- Se o vencimento cai em **fim de semana ou feriado**, vale o próximo dia útil, como num boleto (a coluna da data já mostra o dia útil).
- No mês atual, uma **faixa no topo** lista as contas vencidas e as que vencem nos próximos dias, com o botão **✓ Paga**. O resumo mostra quanto ainda falta **pagar** e quantas estão **vencidas**.
- Ao criar o mês seguinte, as contas copiadas mantêm o dia do vencimento e voltam a ficar **em aberto**.

### Compras parceladas

- Em qualquer tabela de **saídas**, clique em **Parcelar no cartão** abaixo do campo de lançamento. Digite o nome e o **valor total**, o número de parcelas e se a 1ª parcela cai **neste mês** ou no **próximo** (compra feita depois do fechamento da fatura). O dia de vencimento da fatura é opcional. Uma prévia mostra, por exemplo, "3x de R$ 333,33 (1ª de R$ 333,34) · de Nov 2026 a Jan 2027".
- Cada mês ganha sozinho a parcela dele, como "Geladeira (2/3)", inclusive os meses criados depois. Os centavos que sobram da divisão ficam na 1ª parcela, como na fatura.
- Parcelas não são copiadas junto com a tabela ao criar o mês, então nada sai duplicado.
- A seção **Compras parceladas** lista o que ainda está sendo pago: a parcela do mês, quanto falta e quando termina.
  - **Antecipar o resto** junta as parcelas que faltam num pagamento só, no mês aberto, e tira as parcelas dos meses seguintes.
  - **Excluir compra** apaga a compra e todas as parcelas dela.
- As parcelas com dia de vencimento entram nos lembretes de contas e na previsão do saldo.

### Importar extrato

- **Importar extrato** fica no topo de Lançamentos, ao lado de Limpar registros.
- **De onde vem o arquivo:** exporte o extrato da conta ou a fatura do cartão no app do banco, em **OFX** (recomendado) ou **CSV**. Escolha o arquivo ou cole o conteúdo. Nada sai do seu computador.
  - **CSV:** precisa ter cabeçalho com data e valor. Funciona com `;` ou `,`, valores no formato `1.234,56` ou `1234.56` e datas `dd/mm/aaaa` ou `aaaa-mm-dd`.
  - **Fatura de cartão em CSV:** valor positivo é gasto. O modelo do Nubank (`date,title,amount`) é reconhecido sozinho.
- **Na prévia,** cada transação vai para o mês da data dela, e a **tabela** vem sozinha, nesta ordem:
  1. pelas **regras** ("contém uber → Uber");
  2. pelo **histórico** (um item com o mesmo nome já lançado antes);
  3. ou você escolhe na hora.
- **Linhas que já vêm desmarcadas:** transações **já lançadas**, que nunca entram duas vezes; transações sem tabela; e o pagamento da própria fatura. Meses que ainda não existem aparecem bloqueados.
- **Regras automáticas:** com a opção **Criar regras com as tabelas que eu escolher**, cada escolha feita à mão vira uma regra para as próximas importações. Em **Regras automáticas** dá para criar regras (com nome novo opcional, ex.: "ifood" → Mercado, como "iFood") ou apagar as que existem.
- **Gastos importados** já entram como **pagos** e com o dia da compra, então aparecem na previsão do saldo sem virar "conta a vencer".

### Desde a última vez

- Ao abrir o app, um quadro no topo resume o que aconteceu no mês desde a sua **última visita** naquele aparelho:
  - as **entradas que caíram**;
  - as **contas que venceram** e ainda não foram marcadas como pagas, com o botão **✓ Já paguei** para marcar todas de uma vez.
- Se o **mês atual ainda não existe**, o quadro oferece **Criar** o mês na hora, já com as tabelas que repetem (com as datas recalculadas) e as parcelas das compras parceladas.
- **Entendi** fecha o quadro. Sem clicar, ele volta na próxima vez que você abrir o app, para nada passar despercebido.

### Previsão do saldo

- Em **Lançamentos**, a seção **Previsão do saldo** mostra como o dinheiro anda dia a dia no mês, pela data de cada entrada e saída. Ela responde à pergunta "o dinheiro chega até o dia 20?".
- É **opcional** e vem **desligada**: aparece só uma faixa com o botão **Mostrar**. Para esconder de novo, use **Ocultar** no topo da seção. A escolha vale para todos os aparelhos.
- Três números aparecem no topo: **saldo hoje** (ou o início do mês, quando não é o mês atual), **menor saldo** do mês com o dia em que ele acontece, e **fim do mês**. O **saldo hoje** e o **fim do mês** aparecem também no resumo do mês, no topo de Lançamentos, mesmo com a previsão oculta.
- **Ver dia a dia:** cada dia num bloco separado, com entradas em verde e saídas em vermelho.
- Se o saldo ficar **negativo**, um aviso mostra em quais dias e qual é o pior valor. O trecho negativo do gráfico fica em vermelho.
- **Gráfico:** passe o mouse (ou toque) para ver o saldo de cada dia e o que entra e sai nele. Com o teclado, use as setas. **Ver dia a dia** abre a mesma informação em tabela.
- **Saldo no início do mês:** clique em **Alterar** para informar quanto já havia na conta (aceita valor negativo, como `-150,50`). Ou use **Usar a sobra do mês anterior** para começar com o que sobrou no mês passado.
- **Regras usadas:**
  - Cada entrada e saída conta no dia dela; nada é espalhado pelo mês. Conta em aberto conta no vencimento (no próximo dia útil, se cair em fim de semana ou feriado).
  - Registros antigos sem data contam no dia em que foram lançados (ou no dia 1).
  - No mês atual, conta vencida e não paga é contada como saindo hoje.
  - Conta paga antes do vencimento também é contada como saindo hoje.

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
- A cor da meta pode ser qualquer tom: os do tema atual (acompanham o tema) ou os de outros temas (ficam fixos).

### Geral

- **Desfazer e Refazer** sempre à mão, no canto inferior direito (ou **Ctrl+Z** e **Ctrl+Y**): voltam qualquer ação, como lançar, editar, remover, renomear, mover, criar ou excluir tabela, mês ou meta. Cada aparelho guarda as **últimas 20 ações** enquanto a aba estiver aberta, e desfazer não apaga o que foi lançado depois em outro aparelho.
- **Aparência** (botão no topo; no celular, o ícone de paleta da barra de baixo): **tema** Azul, Vermelho, Rosa, Verde ou Roxo, que pinta a página inteira (topo, fundo, cartões, gráficos e metas); **claro, escuro** ou igual ao sistema; **tamanho do texto** P/M/G; **cantos** retos, suaves ou redondos; e **cards por linha** no computador (automático, 2 a 5). Vale para todos os aparelhos e entra no desfazer.
- As tabelas usam os tons do tema; no menu ⋯ da tabela dá para escolher outro tom, inclusive de outro tema ("Tons de outros temas"). O botão **Cor**, ao lado de Ordenar em Entradas e em Saídas, aplica um mesmo tom a todas as tabelas daquela seção de uma vez. Trocar de tema devolve as cores das tabelas ao automático, menos as marcadas com **"Manter esta cor ao trocar de tema"** (no menu ⋯ da tabela), que continuam com a mesma cor.
- Entradas e saídas aparecem com sinal e seta (**↑ +** e **↓ −** nos resumos e gráficos; os registros nas tabelas aparecem sem sinal, e a seção define a conta: em Saídas o valor sai, em Entradas entra), e o saldo negativo fica em negrito com fundo destacado.
- A situação das contas não depende só da cor: **atrasada** aparece como etiqueta cheia (com **!** nos avisos), **vencendo** só com contorno (**◷**) e **paga** em texto fraco (**✓**). Nos gráficos de Entradas × Gastos, os gastos são **listrados** (colunas) ou **tracejados** (linhas). Erros de salvamento ficam sempre em **vermelho**, em qualquer tema.
- Funciona no celular, com layout próprio para tela pequena: a navegação fica numa **barra fixa embaixo**, com o mês no centro, menus de **páginas** e **aparência** que abrem para cima e **Desfazer/Refazer**; **Novo mês** fica no topo de Lançamentos, junto de Limpar registros e Excluir mês.
- **Sincronização entre aparelhos** da mesma rede: o que é lançado no celular aparece no computador em poucos segundos.
- Salvamento automático, com uma cópia de segurança por dia.
