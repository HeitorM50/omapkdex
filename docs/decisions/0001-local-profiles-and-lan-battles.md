# ADR-0001: Perfis locais e entrega gradual de batalhas LAN

## Status

Proposto — depende da confirmação do escopo de perfil e do spike de simulação.

## Data

2026-11-03.

## Contexto

OmaPkDex já tem perfis determinísticos por Pokémon, coleção e carteira em
arquivos locais. O usuário quer perfil e partidas 1×1 entre dois computadores,
amistosas ou valendo tokens. Não há servidor de identidade ou carteira confiável.

## Decisão proposta

1. Adicionar um perfil de treinador local referenciando indivíduos existentes
   por companionId, sem reatribuir identidade ou atributos de Pokémon antigos.
2. Separar apresentação QML, simulação e transporte; entregar motor offline e
   amistoso LAN antes de apostas. Avaliar motor existente antes de reimplementar
   regras Pokémon.
3. Tratar mDNS/DNS-SD apenas como descoberta, com pareamento explícito e uma
   alternativa de conexão manual. Nenhuma escuta permanente por padrão.
4. Projetar apostas com um ledger separado de lifetimeTokens e liquidação
   idempotente. Uma modalidade competitiva exige autoridade confiável;
   apostas somente P2P devem declarar que dependem de confiança entre amigos.

## Alternativas

- Reusar o perfil Pokémon como identidade do jogador: não identifica o treinador
  nem resolve dois indivíduos da mesma espécie; manter as duas entidades.
- Implementar regras completas à mão: custo alto de correção e manutenção;
  comparar com o simulador do Pokémon Showdown antes de escolher.
- Considerar estar no mesmo Wi‑Fi como autenticação ou garantia de saldo:
  insuficiente contra pares maliciosos e restauração de saves.
- Criar um backend obrigatório desde o início: aumenta implantação e coleta
  de dados; o amistoso LAN não depende dessa infraestrutura.

## Consequências

Apostas precisam de uma decisão separada e não bloqueiam perfil ou amistosos.
O spike pode introduzir uma dependência Node; ela precisa de versão fixada,
revisão de scripts e avisos de licença. O modo local não pode prometer
integridade de moeda contra o dono do próprio computador. Nenhum serviço novo
é ativado com este documento.

Plano completo: [perfil e PvP LAN](../plans/trainer-profile-lan-pvp.md).
