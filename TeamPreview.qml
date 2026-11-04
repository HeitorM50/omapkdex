import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Team preview: os dois times (6 de cada) aparecem com tipo e raridade, e cada
// jogador escolhe 3 na ordem; o primeiro escolhido abre a batalha. As escolhas
// são secretas até as duas estarem trancadas.
Column {
  id: root
  property var agent: null
  property var session: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property int size: 3
  readonly property var battle: session ? session.battle : null
  readonly property int role: session ? session.role : 0
  readonly property var mine: battle ? battle.players[role].team : []
  readonly property var foe: battle ? battle.players[1 - role].team : []
  readonly property bool locked: !!session && session.waiting
  property var picks: []
  property bool readOnly: false

  function toggle(slot) {
    if (locked) return
    var next = picks.slice(), i = next.indexOf(slot)
    if (i >= 0) next.splice(i, 1)
    else if (next.length < size) next.push(slot)
    picks = next
  }

  spacing: Style.space(8)

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: true
    text: root.readOnly ? "Both players picked 3 of these, in order."
          : root.locked ? "Team locked · waiting for your opponent…"
          : "Pick " + root.size + " in order. The first one leads. Both players choose at the same time."
  }

  PanelSectionHeader {
    text: "Opponent's team"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Grid {
    id: foeGrid
    width: parent.width
    columns: 3
    columnSpacing: Style.space(5)
    rowSpacing: Style.space(5)

    Repeater {
      model: root.foe

      PreviewCard {
        required property var modelData
        width: (foeGrid.width - foeGrid.columnSpacing * 2) / 3
        member: modelData
        foreground: root.foreground
        fontFamily: root.fontFamily
      }
    }
  }

  PanelSectionHeader {
    text: "Your team"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Grid {
    id: mineGrid
    width: parent.width
    columns: 3
    columnSpacing: Style.space(5)
    rowSpacing: Style.space(5)

    Repeater {
      model: root.mine

      PreviewCard {
        required property var modelData
        width: (mineGrid.width - mineGrid.columnSpacing * 2) / 3
        member: modelData
        order: root.picks.indexOf(modelData.slot) + 1
        interactive: !root.readOnly && !root.locked
        dimmed: root.locked && order === 0
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.toggle(modelData.slot)
      }
    }
  }

  BattleButton {
    visible: !root.readOnly
    width: parent.width
    primary: !root.locked
    foreground: root.foreground
    fontFamily: root.fontFamily
    text: root.locked ? "Team locked" : (root.picks.length === root.size ? "Lock team" : "Pick " + (root.size - root.picks.length) + " more")
    enabled: !!root.agent && !root.agent.busy && !root.locked && root.picks.length === root.size
    onClicked: root.agent.command("team", { order: root.picks.join("") })
  }
}
