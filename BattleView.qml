import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance
Column {
  id: root
  property var host: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  readonly property var agent: host ? host.battles : null
  readonly property var serviceData: agent ? agent.data : ({})
  readonly property var session: serviceData.session || null
  readonly property bool idle: !session || session.phase === "closed"
  spacing: Style.space(8)
  Text { text: "Pokémon · LAN 1×1"; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.subtitle; font.bold: true }
  Text {
    width: parent.width
    text: "Available " + Balance.formatTokens(root.serviceData.wallet ? root.serviceData.wallet.available : 0) + " · Reserved " + Balance.formatTokens(root.serviceData.wallet ? root.serviceData.wallet.reserved : 0)
    color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption
  }
  BattleButton {
    width: parent.width; text: "Choose your Pokémon in Trainer"; foreground: root.foreground
    visible: !root.serviceData.profile || !root.serviceData.profile.selectedCompanionId
    onClicked: if (root.host) root.host.openTab(6)
  }
  LanLobby {
    width: parent.width; agent: root.agent; foreground: root.foreground
    visible: root.idle && !!root.serviceData.profile && !!root.serviceData.profile.selectedCompanionId
  }
  Column {
    width: parent.width; spacing: Style.space(6); visible: !root.idle
    Text {
      width: parent.width
      text: root.session ? "Room · " + (root.session.host || "") + ":" + (root.session.port || "") : ""
      textFormat: Text.PlainText; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption; wrapMode: Text.WrapAnywhere
    }
    Text {
      width: parent.width
      text: !root.session ? "" : root.session.phase === "waiting" ? "Waiting for another player. Share this address, or ask them to find your LAN room."
            : root.session.phase === "pairing" ? "Compare this code with your friend on the other computer:"
            : root.session.phase === "connecting" ? "Connecting…"
            : root.session.phase === "reconnecting" ? "Waiting to resume with the same peer…"
            : root.session.phase === "settling" ? "Result saved. Waiting for your opponent to confirm settlement…"
            : root.session.phase === "disconnected" ? "Disconnected. Your match and reserved tokens are saved."
            : root.session.peer ? "Paired with " + root.session.peer.displayName : "Paired · choose your Pokémon in Trainer, then get ready."
      textFormat: Text.PlainText; wrapMode: Text.WordWrap; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.bodySmall
    }
    Text { text: root.session ? root.session.pairCode || "" : ""; visible: root.session && root.session.phase === "pairing"; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.subtitle; font.bold: true }
    BattleButton {
      width: parent.width; text: "The codes match · confirm pairing"; foreground: root.foreground
      visible: root.session && root.session.phase === "pairing"
      enabled: root.agent && !root.agent.busy
      onClicked: root.agent.command("pair")
    }
    Text {
      width: parent.width; visible: root.session && !!root.session.rules
      text: root.session && root.session.rules ? "Gen 5 · " + (root.session.rules.mode === "level50" ? "Level 50" : "Real level") + " · " + (root.session.rules.stake ? Balance.formatTokens(root.session.rules.stake) + " token stake" : "Friendly · no stake") : ""
      color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption; wrapMode: Text.WordWrap
    }
    Controls.CheckBox {
      id: trust
      width: parent.width; text: "I accept this trusted-friends token stake"
      visible: root.session && root.session.rules && root.session.rules.stake > 0 && !root.session.battle
    }
    Text {
      width: parent.width; visible: trust.visible
      text: "A local save can be changed. Stakes stay reserved after disconnects; reconnect to agree on the result. After 7 days without the opponent, closing the room releases the stake."
      textFormat: Text.PlainText; wrapMode: Text.WordWrap; color: Commons.Color.urgent; font.family: root.fontFamily; font.pixelSize: Style.font.caption
    }
    BattleButton {
      width: parent.width; foreground: root.foreground
      text: root.session && root.session.ownReady ? "Ready · waiting for opponent" : "Accept rules and lock selected Pokémon"
      visible: root.session && root.session.phase === "lobby"
      enabled: root.agent && !root.agent.busy && root.session && root.session.rules && !root.session.ownReady && !!root.serviceData.profile.selectedCompanionId && (!root.session.rules.stake || trust.checked)
      onClicked: root.agent.command("ready", {trustedStakesAccepted: trust.checked})
    }
    BattleBoard {
      width: parent.width; agent: root.agent; session: root.session; foreground: root.foreground
      visible: root.session && !!root.session.battle
    }
    Row {
      width: parent.width; spacing: Style.space(6)
      visible: root.session && root.session.phase === "disconnected"
      Controls.TextField { id: reconnectAddress; width: (parent.width - Style.space(6)) * 0.65; placeholderText: "Current host IP"; Accessible.name: "Reconnect IP address" }
      Controls.SpinBox { id: reconnectPort; width: (parent.width - Style.space(6)) * 0.35; from: 1; to: 65535; value: 47853; editable: true; Accessible.name: "Reconnect port" }
      Connections {
        target: root.agent
        function onDataChanged() {
          if (root.session && !reconnectAddress.activeFocus) reconnectAddress.text = root.session.host || ""
          if (root.session && !reconnectPort.activeFocus) reconnectPort.value = root.session.port || 47853
        }
      }
    }
    BattleButton {
      width: parent.width; text: "Reconnect saved match"; foreground: root.foreground
      visible: root.session && root.session.phase === "disconnected"
      enabled: root.agent && !root.agent.busy
      onClicked: root.agent.command("resume", {host: reconnectAddress.text.trim(), port: reconnectPort.value})
    }
    BattleButton {
      width: parent.width; text: root.session && root.session.phase === "finished" ? "Close result · new room" : "Close / cancel room"; foreground: root.foreground
      enabled: root.agent && !root.agent.busy
      onClicked: root.agent.command("close")
    }
  }
  Text {
    width: parent.width; visible: !!text
    text: root.agent ? (root.agent.error || root.serviceData.error || root.serviceData.discoveryError || "") : "Battle service unavailable"
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Commons.Color.urgent; font.family: root.fontFamily; font.pixelSize: Style.font.caption
  }
  BattleButton { width: parent.width; foreground: root.foreground; text: "Install / repair battle runtime"; visible: root.agent && !root.agent.initialized; enabled: root.agent && !root.agent.busy; onClicked: root.agent.install() }
}
