# Fórmulas do planejador

Todos os valores são **centavos inteiros** (BIGINT no banco, `Number` inteiro no código).
Datas são `AAAA-MM-DD` no fuso `America/Sao_Paulo`. Implementação: `shared/calc.js`.
Exemplos conferidos à mão estão em `tests/calc.test.mjs`.

## Saldo de uma conta

```
saldo = saldo_inicial
      + Σ entradas recebidas + Σ reembolsos recebidos
      − Σ despesas pagas
      − Σ transferências que saíram + Σ transferências que entraram
      + Σ ajustes de saldo (com sinal)
```

Só movimentações com status `realizado` contam. Receitas previstas e contas a pagar não alteram o saldo.
Transferência muda o saldo das duas contas, mas não é receita nem despesa (o total não muda).

## Dinheiro destinado a metas

Cada aporte/resgate liga um valor a **uma meta e uma conta**. Por conta:
`destinado(conta) = Σ aportes − Σ resgates`. O servidor garante, numa transação com trava por usuário,
que `destinado(conta) ≤ max(0, saldo(conta))` e que nenhuma meta fica negativa numa conta.
Se um gasto invadir esse dinheiro, a operação é recusada, a menos que a pessoa confirme o resgate.

## Quanto posso gastar

```
período   = hoje … véspera da próxima renda fixa   (ou fim do mês, se escolhido / sem renda fixa)
base      = Σ saldo das contas com finalidade "para gastar"
separado  = Σ destinado a metas nessas contas
contas    = Σ despesas a pagar com vencimento ≤ fim do período (inclui atrasadas e ocorrências de recorrências)
aportes   = Σ aporte que falta no mês em cada meta (opcional, ligado por padrão)
livre     = base − separado − contas − aportes
por dia   = ⌊livre ÷ dias do período⌋        (0 se livre ≤ 0; o déficit é mostrado à parte)
por semana= min(livre, por dia × 7)
```

Exemplo (teste "quanto posso gastar"): base R$ 440,00; separado R$ 30,00; contas R$ 40,00; aportes R$ 70,00;
3 dias → livre R$ 300,00; R$ 100,00 por dia.

Contas reservadas/investidas e receitas previstas nunca entram como dinheiro livre.

## Metas

- Prazo por idade: data do aniversário em que a pessoa completa a idade (`nascimento + N anos`;
  29/02 vira 28/02 em anos não bissextos). Prazo por data: a data informada.
- `falta = max(0, alvo − atual)`, `dias = prazo − hoje`, `meses = dias ÷ 30,4375`, `semanas = dias ÷ 7`.
- `por mês = ⌈falta ÷ meses⌉` (se meses < 1, o valor inteiro); `por semana = ⌈falta ÷ semanas⌉` (idem).
- Exemplo: R$ 10.000 aos 20 anos, nascimento 10/03/2009, hoje 29/10/2026, já tem R$ 80 →
  prazo 10/03/2029, 863 dias, R$ 349,88/mês e R$ 80,47/semana.
- Aporte esperado no mês = aporte planejado (convertido para mensal: semanal × 52/12, a cada 14 dias × 26/12)
  ou, sem plano, o valor por mês acima. No mês de criação da meta, proporcional aos dias restantes.
- Ritmo real = aportes dos últimos 90 dias (ou desde a criação, mínimo 30) convertidos para mês.
- Projeção sem rendimento = atual + ritmo × meses restantes.
- Situação: compara o atual com a reta entre (criação, valor inicial) e (prazo, alvo); tolerância de 2% do caminho.
  Também: `atingida`, `vencida` (prazo passou), `sem_prazo` (idade sem data de nascimento).

## Simulações opcionais (premissas do usuário)

- Taxa mensal equivalente: `(1 + taxa_anual)^(1/12) − 1` (nunca divide a anual por 12).
- Valor futuro mês a mês, com cada aporte rendendo separadamente; aporte no fim de cada mês.
- IR de renda fixa por aporte, sobre o rendimento: 22,5% (≤180 dias), 20% (≤360), 17,5% (≤720), 15% (>720).
  O resultado é rotulado como **bruto** e **líquido estimado**; não inclui IOF, custódia nem isenções.
- Aporte necessário com taxa `r` em `n` meses: `PMT = (FV − PV·(1+r)^n)·r ÷ ((1+r)^n − 1)`.
- Meta em poder de compra de hoje: `alvo_nominal = alvo × (1 + inflação)^(anos)`.

## Sobra mensal e plano

```
renda    = Σ receitas recorrentes (equivalente mensal) + média das receitas avulsas recebidas
despesas = Σ despesas recorrentes (eq. mensal) + parcelas dos próximos 30 dias
         + média das despesas avulsas pagas − média dos reembolsos
sobra    = renda − despesas
```

Janela da média: últimos 90 dias (ou desde o cadastro, mínimo 30). Enquanto houver menos de 60 dias de histórico,
a estimativa de renda variável informada pela pessoa pode ser usada se for maior.
A sobra é distribuída às metas por prioridade e prazo. Sugestões de corte: só categorias não essenciais,
até 25% da média de cada uma.

## Divisão de uma entrada

1. Contas: o que faltava para cobrir as contas até o fim do período.
2. Reserva: 20% do restante se a reserva está abaixo de 50% do alvo, senão 10% (limitado ao que falta).
3. Metas: aporte pendente do mês por prioridade, limitado a 50% do que sobrou.
4. O resto fica livre. A pessoa revisa e confirma; nada é movimentado no banco.
