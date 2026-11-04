import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance
import "Profile.js" as Profile

// Resumo do Pokémon escolhido: raridade, tipos, stats e a tabela de tipos da
// Gen 5. Tudo vem pronto do serviço de batalha (as mesmas regras que resolvem
// a partida); aqui só se desenha.
Column {
  id: root
  property var pokemon: null
  // Golpes em vigor: os escolhidos no time ou, fora dele, os que o nível dá.
  property var moves: []
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property var stats: pokemon ? pokemon.stats || [] : []
  readonly property var matchups: pokemon ? pokemon.matchups || ({}) : ({})
  readonly property real scaleMax: Profile.statScaleMax(stats)
  readonly property color nameColor: pokemon ? Balance.rarityColor(pokemon.rarity, foreground) : foreground

  spacing: Style.space(6)
  visible: !!pokemon

  Item {
    width: parent.width
    height: nameText.implicitHeight

    Text {
      id: nameText
      anchors.left: parent.left
      textFormat: Text.PlainText
      text: root.pokemon ? root.pokemon.name : ""
      color: root.nameColor
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
      font.bold: true
    }
    Text {
      anchors.left: nameText.right
      anchors.leftMargin: Style.space(6)
      anchors.right: typeRow.left
      anchors.rightMargin: Style.space(6)
      elide: Text.ElideRight
      anchors.baseline: nameText.baseline
      textFormat: Text.PlainText
      text: root.pokemon
            ? Balance.rarityLabel(root.pokemon.rarity) + " · Lv " + root.pokemon.level
              + " · " + Balance.speciesLabel(root.pokemon.nature)
              + (root.pokemon.ability ? " · " + root.pokemon.ability : "")
            : ""
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    Row {
      id: typeRow
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(3)
      Repeater {
        model: root.pokemon ? root.pokemon.types || [] : []
        TypeBadge { required property string modelData; type: modelData; fontFamily: root.fontFamily }
      }
    }
  }

  Row {
    id: statRow
    width: parent.width
    spacing: Style.space(6)

    Repeater {
      model: root.stats

      Column {
        required property var modelData
        width: (statRow.width - statRow.spacing * 5) / 6
        spacing: Style.space(2)

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: modelData.label
          color: Qt.darker(root.foreground, 1.4)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: modelData.value
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: true
        }
        Rectangle {
          width: parent.width
          height: Style.space(3)
          radius: height / 2
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
          Rectangle {
            width: parent.width * Math.min(1, modelData.value / root.scaleMax)
            height: parent.height
            radius: parent.radius
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.6)
          }
        }
      }
    }
  }

  GridLayout {
    id: moveGrid
    width: parent.width
    columns: 2
    columnSpacing: Style.space(6)
    rowSpacing: Style.space(4)
    uniformCellWidths: true
    visible: root.moves.length > 0

    Repeater {
      model: root.moves
      MoveChip {
        required property var modelData
        move: modelData
        foreground: root.foreground
        fontFamily: root.fontFamily
      }
    }
  }

  // Fraquezas primeiro: é o que muda a escolha do golpe. "Strong vs" são os
  // tipos que o próprio Pokémon acerta em dobro com os seus tipos (STAB).
  Repeater {
    model: [
      { label: "Weak to", key: "weak", showMult: true },
      { label: "Resists", key: "resist", showMult: true },
      { label: "Immune", key: "immune", showMult: false },
      { label: "Strong vs", key: "strong", showMult: false }
    ]

    Row {
      id: line
      required property var modelData
      readonly property var items: root.matchups[modelData.key] || []
      width: root.width
      spacing: Style.space(6)
      visible: items.length > 0

      Text {
        id: lineLabel
        width: Style.space(64)
        textFormat: Text.PlainText
        text: line.modelData.label
        color: Qt.darker(root.foreground, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        topPadding: Style.space(1)
      }

      Flow {
        width: line.width - lineLabel.width - line.spacing
        spacing: Style.space(3)
        Repeater {
          model: line.items
          TypeBadge {
            required property var modelData
            type: modelData.type
            mult: line.modelData.showMult ? modelData.mult : -1
            fontFamily: root.fontFamily
          }
        }
      }
    }
  }
}
