import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance

// Um lado do campo: o Pokémon ativo (HP, status, tipos, boosts) e o banco.
Column {
  id: root
  property var player: null
  property string label: ""
  property var conditions: []
  // On the opponent's side: ↑ marks a Pokémon whose types or used moves hit your active one super effectively.
  property bool showThreat: false
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property string rarity: player && player.rarity ? player.rarity : "common"
  readonly property real fraction: player && player.maxhp > 0 ? player.hp / player.maxhp : 0
  readonly property var boostNames: ({ atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe", accuracy: "Acc", evasion: "Eva" })

  function hpColor(fraction) {
    return fraction > 0.5 ? "#7cc47c" : fraction > 0.2 ? "#f5c542" : Commons.Color.urgent
  }

  function boostLine() {
    if (!player) return ""
    var parts = []
    for (var k in player.boosts)
      parts.push(boostNames[k] + " " + (player.boosts[k] > 0 ? "+" : "") + player.boosts[k])
    return parts.concat(player.volatiles || []).join(" · ")
  }

  spacing: Style.space(3)

  // "Opponent · Name · Rarity": o nome na cor da raridade, como no resto do plugin.
  Item {
    width: parent.width
    height: nameLine.implicitHeight
    Row {
      id: nameLine
      spacing: Style.space(4)
      Text {
        textFormat: Text.PlainText
        text: root.label + " ·"
        color: Qt.darker(root.foreground, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        width: Math.min(implicitWidth, root.width - Style.space(100))
        textFormat: Text.PlainText
        text: root.player ? root.player.name : ""
        color: Balance.rarityColor(root.rarity, root.foreground)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        elide: Text.ElideRight
      }
      Text {
        textFormat: Text.PlainText
        text: "· " + Balance.rarityLabel(root.rarity)
        color: Balance.rarityColor(root.rarity, Qt.darker(root.foreground, 1.4))
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        visible: root.showThreat && !!root.player && root.player.threat >= 2
        textFormat: Text.PlainText
        text: "↑"
        color: "#e0a060"
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
        Accessible.role: Accessible.StaticText
        Accessible.name: "Super effective against your Pokémon"
      }
    }
  }

  Item {
    width: parent.width
    height: Style.space(58)
    Image {
      anchors.centerIn: parent
      width: Style.space(64)
      height: width
      source: root.player && !String(root.player.sprite).endsWith(".gif") ? root.player.sprite || "" : ""
      fillMode: Image.PreserveAspectFit
      smooth: false
      visible: !!source
    }
    AnimatedImage {
      anchors.centerIn: parent
      width: Style.space(64)
      height: width
      source: root.player && String(root.player.sprite || "").endsWith(".gif") ? root.player.sprite : ""
      fillMode: Image.PreserveAspectFit
      smooth: false
      visible: !!source
      playing: visible
      opacity: root.player && root.player.hp <= 0 ? 0.35 : 1
    }
    Text {
      anchors.centerIn: parent
      visible: !root.player || !root.player.sprite
      text: "◉"
      color: Qt.darker(root.foreground, 1.8)
      font.pixelSize: Style.space(32)
    }
  }

  Rectangle {
    width: parent.width
    height: Style.space(7)
    radius: Style.space(3)
    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
    Accessible.role: Accessible.ProgressBar
    Accessible.name: root.player ? root.player.name + " HP " + root.player.hp + " of " + root.player.maxhp : ""

    Rectangle {
      width: parent.width * Math.max(0, Math.min(1, root.fraction))
      height: parent.height
      radius: parent.radius
      color: root.hpColor(root.fraction)
      Behavior on width { NumberAnimation { duration: 200 } }
    }
  }

  Text {
    width: parent.width
    textFormat: Text.PlainText
    text: root.player ? root.player.hp + " / " + root.player.maxhp + " HP · Lv " + root.player.level : ""
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
  }

  Row {
    spacing: Style.space(3)
    Repeater {
      model: root.player ? root.player.types || [] : []
      TypeBadge { required property string modelData; type: modelData; fontFamily: root.fontFamily }
    }
    Rectangle {
      id: status
      readonly property var look: ({
        psn: ["PSN", "#a040a0", "#f4f4f4"], tox: ["TOX", "#7a2f7a", "#f4f4f4"], brn: ["BRN", "#f08030", "#1c1c1c"],
        par: ["PAR", "#f8d030", "#1c1c1c"], slp: ["SLP", "#8a8a8a", "#1c1c1c"], frz: ["FRZ", "#98d8d8", "#1c1c1c"],
        fnt: ["FNT", "#555555", "#f4f4f4"]
      })
      readonly property var entry: root.player && root.player.status ? look[root.player.status] : null
      visible: !!entry
      width: statusText.implicitWidth + Style.space(10)
      height: Style.space(16)
      radius: Style.space(4)
      color: entry ? entry[1] : "transparent"
      Text {
        id: statusText
        anchors.centerIn: parent
        textFormat: Text.PlainText
        text: status.entry ? status.entry[0] : ""
        color: status.entry ? status.entry[2] : "transparent"
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }
  }

  Text {
    width: parent.width
    visible: !!(root.player && root.player.ability)
    textFormat: Text.PlainText
    text: root.player ? "Ability · " + root.player.ability : ""
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
  }

  Text {
    width: parent.width
    visible: !!text
    textFormat: Text.PlainText
    text: root.boostLine()
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
  }

  // O time inteiro com tipo e raridade (também o banco do adversário): bolinha cheia
  // = em pé, vazada = desmaiado, borda forte = em campo.
  Column {
    width: parent.width
    spacing: Style.space(2)

    Repeater {
      model: root.player ? root.player.team : []

      Row {
        id: member
        required property var modelData
        spacing: Style.space(4)
        opacity: modelData.fainted ? 0.5 : 1
        Accessible.role: Accessible.StaticText
        Accessible.name: modelData.name + ", " + Balance.rarityLabel(modelData.rarity || "common") + ", "
                         + (modelData.types || []).join(" and ")
                         + (modelData.fainted ? ", fainted" : ", " + modelData.hp + " of " + modelData.maxhp + " HP")

        Rectangle {
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(8)
          height: width
          radius: width / 2
          color: member.modelData.fainted ? "transparent" : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, member.modelData.active ? 0.95 : 0.55)
          border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, member.modelData.active ? 1 : 0.35)
        }
        Text {
          anchors.verticalCenter: parent.verticalCenter
          width: Math.min(implicitWidth, Style.space(70))
          textFormat: Text.PlainText
          text: member.modelData.name
          color: Balance.rarityColor(member.modelData.rarity || "common", root.foreground)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: member.modelData.active
          elide: Text.ElideRight
        }
        Row {
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.space(2)
          Repeater {
            model: member.modelData.types || []
            TypeBadge { required property string modelData; type: modelData; fontFamily: root.fontFamily }
          }
        }
        Text {
          anchors.verticalCenter: parent.verticalCenter
          visible: root.showThreat && !member.modelData.fainted && member.modelData.threat >= 2
          textFormat: Text.PlainText
          text: "↑"
          color: "#e0a060"
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          Accessible.role: Accessible.StaticText
          Accessible.name: "Super effective against your Pokémon"
        }
      }
    }
  }

  Flow {
    width: parent.width
    spacing: Style.space(3)
    Repeater {
      model: root.conditions
      Rectangle {
        required property var modelData
        width: tagText.implicitWidth + Style.space(8)
        height: Style.space(14)
        radius: Style.space(4)
        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
        Text {
          id: tagText
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: modelData.name + (modelData.layers > 1 ? " ×" + modelData.layers : "")
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
