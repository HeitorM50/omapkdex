import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Balance.js" as Balance

// Uma tela por fase da sala: sem sala → lobby; com sala → um título, uma ação
// primária e a saída. A partida em andamento é do BattleBoard.
Column {
  id: root
  property var host: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property var agent: host ? host.battles : null
  readonly property var serviceData: agent ? agent.data : ({})
  readonly property var session: serviceData.session || null
  readonly property string phase: session ? session.phase : "closed"
  readonly property bool idle: phase === "closed"
  readonly property var replay: serviceData.replay || null
  readonly property var replaySession: replay
    ? ({ phase: "replay", role: replay.role, battle: replay.battle, outcome: replay.outcome, timer: 0, waiting: false, verified: true })
    : null
  readonly property string replayHeadline: !replay ? ""
    : replay.battle.finished ? (replay.battle.winner === null ? "Draw" : replay.names[replay.battle.winner] + " won")
    : replay.battle.phase === "teampreview" ? "Team preview" : "Turn " + replay.battle.turn
  readonly property bool practice: !!session && session.practice === true
  readonly property var team: serviceData.team || ({ ok: false, size: 0, error: "" })
  readonly property bool hasPokemon: team.ok === true
  readonly property bool ready: !!agent && !agent.busy
  readonly property var rules: session ? session.rules : null
  readonly property int stake: rules ? rules.stake || 0 : 0

  readonly property string title: {
    switch (phase) {
    case "waiting": return "Waiting for an opponent"
    case "connecting": return "Connecting…"
    case "pairing": return "Compare the code"
    case "reconnecting": return "Resuming the match…"
    case "settling": return "Result saved"
    case "disconnected": return "Disconnected"
    case "lobby": return session && session.peer ? "Paired with " + session.peer.displayName : "Paired"
    default: return ""
    }
  }
  readonly property string hint: {
    switch (phase) {
    case "waiting": return "Share this address, or ask them to find your room."
    case "pairing": return "It must be identical on both computers."
    case "reconnecting": return "Waiting to resume with the same peer."
    case "settling": return "Waiting for your opponent to confirm the settlement."
    case "disconnected": return "Your match and reserved tokens are saved."
    case "lobby": return "Lock in your team when you are ready."
    default: return ""
    }
  }
  readonly property string rulesLine: rules
    ? "Gen 5 · 3v3 · real levels · "
      + (stake ? Balance.formatTokens(stake) + " token stake" : "Friendly")
      + (rules.timer ? " · " + (rules.timer >= 60 ? (rules.timer / 60) + " min" : rules.timer + "s") + " timer" : "")
    : ""

  property bool trusted: false

  spacing: Style.space(8)

  BattleSystemButton {
    width: parent.width
    agent: root.agent
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  // ---------- Replay: percorre uma partida salva, sem agir nela ----------
  Column {
    width: parent.width
    spacing: Style.space(8)
    visible: !!root.replay

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.replay ? "Replay · " + root.replay.names[0] + " vs " + root.replay.names[1] : ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
      font.bold: true
      elide: Text.ElideRight
    }
    BattleText {
      width: parent.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      dim: true
      text: root.replay ? "Round " + root.replay.step + " of " + root.replay.total : ""
    }

    BattleBoard {
      width: parent.width
      agent: root.agent
      session: root.replaySession
      replayMode: true
      headline: root.replayHeadline
      foreground: root.foreground
      fontFamily: root.fontFamily
      visible: !!root.replay
    }

    Row {
      id: stepper
      width: parent.width
      spacing: Style.space(5)
      Repeater {
        model: [
          { label: "« Start", to: function (r) { return 0 } },
          { label: "‹ Prev", to: function (r) { return r.step - 1 } },
          { label: "Next ›", to: function (r) { return r.step + 1 } },
          { label: "End »", to: function (r) { return r.total } }
        ]
        BattleButton {
          required property var modelData
          required property int index
          width: (stepper.width - stepper.spacing * 3) / 4
          foreground: root.foreground
          fontFamily: root.fontFamily
          text: modelData.label
          enabled: root.ready && !!root.replay
                   && (index < 2 ? root.replay.step > 0 : root.replay.step < root.replay.total)
          onClicked: root.agent.command("replay", { matchId: root.replay.matchId, step: modelData.to(root.replay) })
        }
      }
    }
    BattleButton {
      width: parent.width
      subtle: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: "Close replay"
      onClicked: root.agent.command("replay", {})
    }
  }

  // ---------- Sem Pokémon escolhido ----------
  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: true
    visible: root.idle && !root.hasPokemon && !root.replay
    text: root.team.size >= 3 && root.team.error ? root.team.error
          : "Build a team of 3 to 6 Pokémon in Trainer. You choose 3 of them at the start of each battle."
  }

  BattleButton {
    width: parent.width
    primary: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    visible: root.idle && !root.hasPokemon && !root.replay
    text: "Build your team in Trainer"
    onClicked: if (root.host) root.host.openTab(5)
  }

  // ---------- Sem sala ----------
  LanLobby {
    width: parent.width
    agent: root.agent
    foreground: root.foreground
    fontFamily: root.fontFamily
    visible: root.idle && root.hasPokemon && !root.replay
  }

  // ---------- Com sala ----------
  Column {
    width: parent.width
    spacing: Style.space(8)
    visible: !root.idle && !root.replay

    Column {
      width: parent.width
      spacing: Style.space(2)
      visible: !!root.title

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: root.title
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.subtitle
        font.bold: true
        elide: Text.ElideRight
      }
      BattleText {
        width: parent.width
        foreground: root.foreground
        fontFamily: root.fontFamily
        dim: true
        text: root.hint
        visible: !!text
      }
      BattleText {
        width: parent.width
        foreground: root.foreground
        fontFamily: root.fontFamily
        dim: true
        visible: !!root.rulesLine && !root.session.battle
        text: root.rulesLine
      }
    }

    BattleText {
      width: parent.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      visible: root.phase === "waiting"
      text: root.session ? (root.session.host || "") + ":" + (root.session.port || "") : ""
      wrapMode: Text.WrapAnywhere
      font.pixelSize: Style.font.body
      font.bold: true
    }

    Text {
      width: parent.width
      visible: root.phase === "pairing"
      textFormat: Text.PlainText
      text: root.session ? root.session.pairCode || "" : ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.title
      font.bold: true
      horizontalAlignment: Text.AlignHCenter
      Accessible.role: Accessible.StaticText
      Accessible.name: "Pairing code " + text
    }

    BattleButton {
      width: parent.width
      primary: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      visible: root.phase === "pairing"
      text: "The codes match"
      enabled: root.ready
      onClicked: root.agent.command("pair")
    }

    BattleChip {
      visible: root.phase === "lobby" && root.stake > 0 && !root.session.battle
      text: "I accept this trusted-friends token stake"
      selected: root.trusted
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.trusted = !root.trusted
    }

    BattleText {
      width: parent.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      urgent: true
      visible: root.phase === "lobby" && root.stake > 0 && !root.session.battle
      text: "A local save can be changed. Stakes stay reserved after disconnects; reconnect to agree on the result."
    }

    BattleButton {
      width: parent.width
      primary: !(root.session && root.session.ownReady)
      foreground: root.foreground
      fontFamily: root.fontFamily
      visible: root.phase === "lobby"
      text: root.session && root.session.ownReady ? "Ready · waiting for your opponent" : "Ready"
      enabled: root.ready && !!root.rules && !(root.session && root.session.ownReady)
               && root.hasPokemon && (!root.stake || root.trusted)
      onClicked: root.agent.command("ready", { trustedStakesAccepted: root.trusted })
    }

    BattleBoard {
      width: parent.width
      agent: root.agent
      session: root.session
      foreground: root.foreground
      fontFamily: root.fontFamily
      visible: !!root.session && !!root.session.battle
    }

    Row {
      width: parent.width
      spacing: Style.space(6)
      visible: root.phase === "disconnected"

      TextField {
        id: reconnectAddress
        width: parent.width - reconnectPort.width - parent.spacing
        foreground: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        placeholderText: "Current host IP"
        Accessible.name: "Reconnect IP address"
      }
      TextField {
        id: reconnectPort
        width: Style.space(64)
        foreground: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        text: "47853"
        validator: IntValidator { bottom: 1; top: 65535 }
        inputMethodHints: Qt.ImhDigitsOnly
        Accessible.name: "Reconnect port"
      }
      Connections {
        target: root.agent
        function onDataChanged() {
          if (!root.session) return
          if (!reconnectAddress.activeFocus) reconnectAddress.text = root.session.host || ""
          if (!reconnectPort.activeFocus) reconnectPort.text = String(root.session.port || 47853)
        }
      }
    }

    BattleButton {
      width: parent.width
      primary: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      visible: root.phase === "disconnected"
      text: "Reconnect saved match"
      enabled: root.ready
      onClicked: root.agent.command("resume", {
        host: reconnectAddress.text.trim(),
        port: Math.max(1, Math.min(65535, parseInt(reconnectPort.text) || 47853))
      })
    }

    Row {
      id: afterRow
      width: parent.width
      spacing: Style.space(6)
      visible: root.phase === "finished"

      BattleButton {
        width: (afterRow.width - afterRow.spacing) / 2
        foreground: root.foreground
        fontFamily: root.fontFamily
        text: "Watch replay"
        enabled: root.ready
        onClicked: root.agent.command("replay", { matchId: root.session.matchId, step: 0 })
      }
      BattleButton {
        width: (afterRow.width - afterRow.spacing) / 2
        foreground: root.foreground
        fontFamily: root.fontFamily
        text: "Save replay log"
        enabled: root.ready
        onClicked: root.agent.command("export", { matchId: root.session.matchId })
      }
    }

    BattleText {
      width: parent.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      dim: true
      visible: root.phase === "finished" && !!root.serviceData.exportedReplay
      text: "Saved to " + root.serviceData.exportedReplay
      wrapMode: Text.WrapAnywhere
    }

    BattleButton {
      width: parent.width
      subtle: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: root.phase === "finished" ? "Close result · new room" : (root.practice ? "Leave battle" : "Close room")
      enabled: root.ready
      onClicked: root.agent.command("close")
    }
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    urgent: true
    visible: !!text
    text: root.agent ? (root.agent.error || root.serviceData.error || root.serviceData.discoveryError || "")
                     : "Battle service unavailable"
  }

}
