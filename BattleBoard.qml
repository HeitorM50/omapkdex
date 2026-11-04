import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons
Column {
  id: root
  property var agent: null
  property var session: null
  property color foreground: Commons.Color.foreground
  readonly property var battle: session ? session.battle : null
  spacing: Style.space(6)
  function label(line) {
    var p = line.split("|"), who = function(v) { return String(v || "").replace(/^p[12][a-z]?: /, "") }
    if (p[1] === "move") return who(p[2]) + " used " + p[3]
    if (p[1] === "turn") return "Turn " + p[2]
    if (p[1] === "-damage") return who(p[2]) + " · " + p[3] + " HP"
    if (p[1] === "-heal") return who(p[2]) + " healed · " + p[3]
    if (p[1] === "faint") return who(p[2]) + " fainted"
    if (p[1] === "-status") return who(p[2]) + " · " + p[3]
    if (p[1] === "-boost" || p[1] === "-unboost") return who(p[2]) + " · " + p[3] + (p[1] === "-boost" ? " ↑" : " ↓")
    if (p[1] === "-supereffective") return "It's super effective!"
    if (p[1] === "-resisted") return "It's not very effective."
    if (p[1] === "-immune") return who(p[2]) + " is immune"
    if (p[1] === "-miss") return "The attack missed"
    if (p[1] === "-crit") return "Critical hit!"
    if (p[1] === "-fail") return "The move failed"
    if (p[1] === "-activate") return who(p[2]) + " · " + p[3]
    if (p[1] === "-ability") return who(p[2]) + " · " + p[3]
    if (p[1] === "-weather") return "Weather · " + p[2]
    return ""
  }
  Text {
    text: root.session && root.session.phase === "finished" ? (root.session.outcome === "win" ? "You won!" : root.session.outcome === "loss" ? "You lost" : "Draw") : "Turn " + (root.battle ? root.battle.turn : 0)
    color: root.foreground; font.family: Style.font.family; font.pixelSize: Style.font.subtitle; font.bold: true
  }
  Row {
    width: parent.width; spacing: Style.space(10)
    Repeater {
      model: root.battle ? root.battle.players : []
      Column {
        required property var modelData
        required property int index
        width: (root.width - Style.space(10)) / 2
        spacing: Style.space(3)
        Text { width: parent.width; text: (index === root.session.role ? "You · " : "Opponent · ") + modelData.name; textFormat: Text.PlainText; elide: Text.ElideRight; color: root.foreground; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall }
        Item {
          width: parent.width; height: Style.space(58)
          Image { anchors.centerIn: parent; width: Style.space(64); height: width; source: modelData.sprite || ""; fillMode: Image.PreserveAspectFit; smooth: false; visible: !!source && !String(source).endsWith(".gif") }
          AnimatedImage { anchors.centerIn: parent; width: Style.space(64); height: width; source: String(modelData.sprite || "").endsWith(".gif") ? modelData.sprite : ""; fillMode: Image.PreserveAspectFit; smooth: false; visible: !!source; playing: visible }
          Text { anchors.centerIn: parent; visible: !modelData.sprite; text: "◉"; font.pixelSize: Style.space(32); color: root.foreground }
        }
        Controls.ProgressBar { width: parent.width; from: 0; to: modelData.maxhp; value: modelData.hp; Accessible.name: modelData.name + " HP" }
        Text { text: modelData.hp + " / " + modelData.maxhp + " HP · Lv " + modelData.level + (modelData.status ? " · " + modelData.status : ""); color: root.foreground; font.family: Style.font.family; font.pixelSize: Style.font.caption }
      }
    }
  }
  Text {
    width: parent.width
    text: root.session && root.session.phase === "finished" ? "Battle stats are temporary; your Pokémon keeps its progress."
          : root.session && root.session.waiting ? "Move committed. Waiting for your opponent…"
          : root.session && root.session.phase === "disconnected" ? "Connection lost. Reconnect to continue the same battle."
          : root.session && root.session.phase === "verifying" ? "Verifying the turn with your opponent…" : "Choose your move. Both choices are revealed together."
    wrapMode: Text.WordWrap; color: Qt.darker(root.foreground,1.4); font.family: Style.font.family; font.pixelSize: Style.font.caption
  }
  Grid {
    width: parent.width; columns: 2; spacing: Style.space(5)
    Repeater {
      model: root.battle && root.session ? root.battle.players[root.session.role].moves : []
      BattleButton {
        required property var modelData
        required property int index
        width: (root.width - Style.space(5)) / 2
        text: modelData.name + (modelData.pp !== undefined ? " · " + modelData.pp + " PP" : "")
        foreground: root.foreground
        enabled: root.agent && root.session && !root.agent.busy && root.session.phase === "active" && root.session.verified && !root.session.waiting && !modelData.disabled && (modelData.pp === undefined || modelData.pp > 0)
        onClicked: root.agent.command("move", {slot: index + 1})
      }
    }
  }
  ListView {
    width: parent.width; height: Style.space(100); clip: true
    model: root.battle ? root.battle.log.map(root.label).filter(function(v) { return !!v }) : []
    onCountChanged: positionViewAtEnd()
    Controls.ScrollBar.vertical: Controls.ScrollBar {}
    delegate: Text { required property string modelData; width: ListView.view.width; text: modelData; textFormat: Text.PlainText; wrapMode: Text.WordWrap; color: root.foreground; font.family: Style.font.family; font.pixelSize: Style.font.caption }
  }
  BattleButton {
    width: parent.width; foreground: root.foreground; text: "Surrender this battle"
    visible: root.session && !["finished", "closed"].includes(root.session.phase)
    enabled: root.agent && root.session && !root.agent.busy && root.session.phase === "active"
    onClicked: surrenderDialog.open()
  }
  Controls.Dialog {
    id: surrenderDialog
    title: "Surrender?"
    width: Math.min(Style.space(280), root.width)
    modal: true
    standardButtons: Controls.Dialog.Yes | Controls.Dialog.No
    onAccepted: root.agent.command("forfeit")
    contentItem: Text { text: "This records a loss and pays the agreed stake to your opponent."; wrapMode: Text.WordWrap; textFormat: Text.PlainText }
  }
}
