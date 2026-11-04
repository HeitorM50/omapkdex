import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// A partida: team preview, o campo dos dois lados, os golpes ou a troca, e o
// que acabou de acontecer.
Column {
  id: root
  property var agent: null
  property var session: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  // Replay: the same board, read-only, with the headline supplied by the caller.
  property bool replayMode: false
  property string headline: ""

  readonly property var battle: session ? session.battle : null
  readonly property int role: session ? session.role : 0
  readonly property var me: battle ? battle.players[role] : null
  readonly property var foe: battle ? battle.players[1 - role] : null
  readonly property bool finished: !!session && session.phase === "finished"
  readonly property bool preview: !!battle && battle.phase === "teampreview"
  readonly property bool timed: !replayMode && !!session && session.timer > 0 && session.phase === "active" && !finished
  property real nowMs: Date.now()
  readonly property int secondsLeft: session && session.deadline > 0 ? Math.max(0, Math.ceil((session.deadline - nowMs) / 1000)) : 0
  readonly property bool canAct: !!agent && !!session && !agent.busy && session.phase === "active"
                                 && session.verified && !session.waiting
  readonly property var bench: me ? me.team.filter(function (m) { return !m.active && !m.fainted }) : []
  readonly property var events: battle
    ? battle.log.map(root.label).filter(function (v) { return !!v }).slice(-7) : []

  // Rendição em dois toques, como a compra na Shop: o segundo confirma e o
  // primeiro expira sozinho.
  property bool confirmingSurrender: false

  spacing: Style.space(8)

  function label(line) {
    var p = line.split("|"), who = function (v) { return String(v || "").replace(/^p[12][a-z]?: /, "") }
    if (p[1] === "turn") return "— Turn " + p[2] + " —"
    if (p[1] === "move") return who(p[2]) + " used " + p[3]
    if (p[1] === "switch" || p[1] === "drag") return who(p[2]) + " was sent out"
    if (p[1] === "cant") return who(p[2]) + " can't move · " + p[3]
    if (p[1] === "-damage") return String(p[3]).indexOf("0 fnt") === 0 ? "" : who(p[2]) + " · " + p[3] + " HP"
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
    if (p[1] === "-activate") return who(p[2]) + " · " + String(p[3]).replace(/^(move|ability): /, "")
    if (p[1] === "-ability") return who(p[2]) + " · " + p[3]
    if (p[1] === "-start") return who(p[2]) + " · " + String(p[3]).replace(/^(move|ability): /, "")
    if (p[1] === "-weather") return p[2] === "none" ? "The weather cleared" : "Weather · " + p[2]
    if (p[1] === "-sidestart") return String(p[3]).replace(/^move: /, "") + " set up"
    if (p[1] === "-sideend") return String(p[3]).replace(/^move: /, "") + " faded"
    return ""
  }

  Timer { id: surrenderReset; interval: 4000; onTriggered: root.confirmingSurrender = false }
  Timer { interval: 1000; repeat: true; running: root.timed; onTriggered: root.nowMs = Date.now() }

  Text {
    width: parent.width
    textFormat: Text.PlainText
    text: root.replayMode ? root.headline
          : root.finished
          ? (root.session.outcome === "win" ? "You won!" : root.session.outcome === "loss" ? "You lost" : "Draw")
          : root.preview ? "Team preview"
          : "Turn " + (root.battle ? root.battle.turn : 0)
          + (root.battle && root.battle.field.weather ? " · " + root.battle.field.weather : "")
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.subtitle
    font.bold: true
  }

  TeamPreview {
    width: parent.width
    agent: root.agent
    session: root.session
    foreground: root.foreground
    fontFamily: root.fontFamily
    readOnly: root.replayMode
    visible: root.preview
  }

  Row {
    id: sides
    width: parent.width
    spacing: Style.space(10)
    visible: !root.preview && !!root.battle

    // Você sempre à esquerda, seja host ou convidado.
    Repeater {
      model: root.battle ? [root.role, 1 - root.role] : []

      BattleSide {
        required property int modelData
        required property int index
        width: (sides.width - sides.spacing) / 2
        player: root.battle.players[modelData]
        label: index === 0 ? "You" : "Opponent"
        conditions: root.battle.field.sides[modelData]
        showThreat: index === 1 && !root.replayMode
        foreground: root.foreground
        fontFamily: root.fontFamily
      }
    }
  }

  BattleText {
    width: parent.width
    foreground: "#e0a060"
    fontFamily: root.fontFamily
    visible: !root.replayMode && !root.preview && !root.finished && !!root.foe && !!root.me && root.foe.threat >= 2
    text: root.foe && root.me
          ? "↑ " + root.foe.name + "'s " + root.foe.threatBy + " is super effective against " + root.me.name
            + " (×" + root.foe.threat + ")"
          : ""
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: true
    visible: !root.preview && !root.replayMode
    text: root.finished ? "Battle stats are temporary; your Pokémon keep their progress."
          : root.session && root.session.waiting ? "Choice committed. Waiting for your opponent…"
          : root.session && root.session.phase === "disconnected" ? "Connection lost. Reconnect to continue the same battle."
          : root.session && root.session.phase === "verifying" ? "Verifying the turn with your opponent…"
          : root.me && root.me.request === "switch" ? "Your Pokémon fainted. Choose the next one."
          : root.me && root.me.request === "move" && root.me.trapped
            ? (root.me.moves.length === 1
               ? "Locked into " + root.me.moves[0].name + ": you can't switch or pick another move until it ends."
               : "Your Pokémon is trapped and can't switch out.")
          : root.me && root.me.request === "move" ? "Choose a move or switch. Both choices are revealed together."
          : root.foe && root.foe.request ? "Waiting for your opponent to choose a replacement…"
          : ""
  }

  GridLayout {
    id: moveGrid
    width: parent.width
    columns: 2
    columnSpacing: Style.space(5)
    rowSpacing: Style.space(5)
    uniformCellWidths: true
    visible: !root.replayMode && !root.preview && !root.finished && !!root.me && root.me.request === "move"

    Repeater {
      model: root.me ? root.me.moves : []

      MoveButton {
        required property var modelData
        required property int index
        move: modelData
        foreground: root.foreground
        fontFamily: root.fontFamily
        enabled: root.canAct && !modelData.disabled && (modelData.pp === undefined || modelData.pp > 0)
        onClicked: root.agent.command("move", { slot: index + 1 })
      }
    }
  }

  // Troca voluntária (turno normal) e troca forçada (depois de um desmaio) usam
  // os mesmos botões; só muda o título.
  PanelSectionHeader {
    visible: !root.replayMode && !root.preview && !root.finished && !!root.me && root.me.request !== "" && root.bench.length > 0 && !(root.me.request === "move" && root.me.trapped)
    text: root.me && root.me.request === "switch" ? "Send out" : "Switch"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Grid {
    id: benchGrid
    width: parent.width
    columns: 3
    spacing: Style.space(5)
    visible: !root.replayMode && !root.preview && !root.finished && !!root.me && root.me.request !== "" && root.bench.length > 0 && !(root.me.request === "move" && root.me.trapped)

    Repeater {
      model: root.bench

      BattleButton {
        required property var modelData
        width: (benchGrid.width - benchGrid.spacing * 2) / 3
        foreground: root.foreground
        fontFamily: root.fontFamily
        text: modelData.name + " · " + modelData.hp + "/" + modelData.maxhp
        enabled: root.canAct && !(root.me.request === "move" && root.me.trapped)
        Accessible.name: "Switch to " + modelData.name + ", " + modelData.hp + " of " + modelData.maxhp + " HP"
        onClicked: root.agent.command("switch", { slot: modelData.slot })
      }
    }
  }

  Column {
    width: parent.width
    spacing: Style.space(2)
    visible: !root.preview && root.events.length > 0

    Repeater {
      model: root.events

      Text {
        required property string modelData
        required property int index
        width: root.width
        textFormat: Text.PlainText
        text: modelData
        color: root.foreground
        // O que acabou de acontecer pesa mais que o que veio antes.
        opacity: index === root.events.length - 1 ? 1 : 0.55
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
    }
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: root.secondsLeft > 10
    urgent: root.secondsLeft <= 10 && root.secondsLeft > 0
    visible: root.timed && !!root.me && (root.me.request !== "" || (!!root.foe && root.foe.request !== ""))
    text: {
      var mm = Math.floor(root.secondsLeft / 60), ss = root.secondsLeft % 60
      var clock = mm + ":" + (ss < 10 ? "0" : "") + ss
      if (root.secondsLeft === 0) return root.me && root.me.request !== "" && !root.session.waiting ? "Time is up · choosing for you…" : "Time is up for your opponent."
      return (root.me && root.me.request !== "" && !root.session.waiting ? "Your choice · " : "Opponent's choice · ") + clock + " left"
    }
  }

  BattleButton {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    visible: !root.replayMode && !!root.session && root.session.claimable === true
    text: "Opponent timed out · claim the win"
    enabled: !!root.agent && !root.agent.busy
    onClicked: root.agent.command("claim")
  }

  BattleButton {
    width: parent.width
    subtle: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    visible: !root.replayMode && !!root.session && ["active", "verifying"].includes(root.session.phase)
    text: root.confirmingSurrender
          ? "Confirm · this records a loss" + (root.session && root.session.rules && root.session.rules.stake ? " and pays the stake" : "")
          : "Surrender"
    enabled: !!root.agent && !!root.session && !root.agent.busy && root.session.phase === "active"
    onClicked: {
      if (!root.confirmingSurrender) { root.confirmingSurrender = true; surrenderReset.restart(); return }
      root.confirmingSurrender = false
      surrenderReset.stop()
      root.agent.command("forfeit")
    }
  }
}
