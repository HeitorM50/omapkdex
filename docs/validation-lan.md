# Validação final em dois computadores

A implementação está na branch local `feat/trainer-lan-battles`. Ainda não foi
aberto um novo PR; primeiro vem sua validação. O pacote de código fica em
`artifacts/omapkdex-lan-validation.tar.gz`.

## No segundo computador com Omarchy

Copie o pacote para esse computador. Preserve sua instalação anterior antes de
extrair o código. Os dados de progresso ficam fora da pasta do plugin.

```bash
plugin_dir="$HOME/.config/omarchy/plugins/io.github.heitorm50.omapkdex"
if [ -d "$plugin_dir" ]; then
  cp -a "$plugin_dir" "$plugin_dir.backup-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$plugin_dir"
tar -xzf /caminho/omapkdex-lan-validation.tar.gz -C "$plugin_dir"
node "$plugin_dir/battle/setup.mjs"
omarchy plugin enable io.github.heitorm50.omapkdex --section right
omarchy restart shell
```

É necessário Node 22+, npm e OpenSSL. A instalação do runtime desativa scripts
de dependências e não altera firewall. Os dois computadores precisam ter
Pokémon próprios capturados; o pacote não contém seu save nem Pokémon de teste.

## Roteiro curto

1. Nos dois computadores, abra **Trainer**, salve nome/avatar e monte um time de 3 a 6 Pokémon de espécies distintas.
   Use **Edit moves** para escolher os golpes; confira stats, tipos e efeitos.
   Valide **Practice vs CPU** antes da partida em rede.
2. No primeiro, abra **Battle**, selecione o IP da interface Wi-Fi e
   stake **0**, e clique em **Create LAN room**.
3. No segundo, use **Find LAN rooms**. Se não aparecer, informe o IP e a porta
   exibidos no primeiro computador e clique em **Join address**.
4. Compare os códigos e confirme nos dois. Aceite as regras nos dois.
   Escolha três Pokémon no team preview e jogue até o resultado. Confira HP, PP,
   golpes, trocas voluntárias/forçadas, histórico e preservação da coleção.
5. Em outra partida amistosa, interrompa e retome a conexão com **Reconnect
   saved match**. O turno deve continuar, sem duplicação.
6. Se quiser validar apostas, só então crie uma sala com um valor pequeno e
   marque a aceitação nos dois. A stake é moeda virtual entre amigos; saves
   locais são editáveis. Confira a reserva no saldo e a liquidação ao terminar.
7. Se uma confirmação ficar pendente, retome a partida; não delete o journal
   nem restaure só uma carteira. Resultados antigos podem ser reabertos em
   **Trainer → Recent battles → Recover**, coordenando com o adversário.

Os dois computadores devem usar a mesma versão (protocolo 2). Finalize partidas
1v1 pendentes antes de atualizar: seus journals antigos não podem ser retomados
ou reproduzidos pelo novo motor. Confira também timer, replay e exportação do log.
Detalhes de regras, arquivos e recuperação: [lan-battles.md](lan-battles.md).
