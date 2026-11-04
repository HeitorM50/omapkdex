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
  readonly property var profile: serviceData.profile || ({})
  readonly property var stats: serviceData.stats || ({})
  readonly property var roster: serviceData.roster || []
  spacing: Style.space(8)
  Row {
    spacing: Style.space(8)
    TrainerAvatar { width: Style.space(28); height: width; avatarKey: root.profile.avatarKey || "pokeball" }
    Text { anchors.verticalCenter: parent.verticalCenter; text: "Trainer profile"; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.subtitle; font.bold: true }
  }
  Text {
    width: parent.width
    text: root.agent && root.agent.busy ? "Connecting to trainer service…" : "Private on this computer. Only your chosen Pokémon is shared after pairing."
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Qt.darker(root.foreground, 1.4); font.family: root.fontFamily; font.pixelSize: Style.font.caption
  }
  Controls.TextField {
    id: nameField
    width: parent.width; maximumLength: 32
    placeholderText: "Trainer name"
    Accessible.name: "Trainer name"
    Component.onCompleted: text = root.profile.displayName || ""
  }
  Connections {
    target: root.agent
    function onDataChanged() { if (!nameField.activeFocus) nameField.text = root.profile.displayName || "" }
  }
  Row {
    width: parent.width; spacing: Style.space(6)
    Controls.ComboBox {
      id: avatar; width: (parent.width - Style.space(6)) / 2
      model: ["Poké Ball", "Great Ball", "Ultra Ball"]
      readonly property var keys: ["pokeball", "greatball", "ultraball"]
      currentIndex: Math.max(0, keys.indexOf(root.profile.avatarKey || "pokeball"))
      Accessible.name: "Local trainer avatar"
      onActivated: root.agent.command("profile", {avatarKey: keys[currentIndex]})
    }
    BattleButton {
      width: (parent.width - Style.space(6)) / 2
      text: "Save name"; foreground: root.foreground
      enabled: root.agent && root.agent.initialized && !root.agent.busy && nameField.text.trim().length > 0
      onClicked: root.agent.command("profile", {displayName: nameField.text})
    }
  }
  Text { text: "Battle Pokémon · independent of your bar sprite"; width: parent.width; wrapMode: Text.WordWrap; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
  Controls.ComboBox {
    width: parent.width
    model: root.roster.map(function(r) { return { label: r.name + " · Lv " + r.level + " · " + r.companionId.slice(-6), key: r.companionId } })
    textRole: "label"
    currentIndex: root.roster.findIndex(function(r) { return r.companionId === root.profile.selectedCompanionId })
    displayText: currentIndex < 0 ? "Choose a captured Pokémon" : currentText
    Accessible.name: "Selected battle Pokémon"
    onActivated: root.agent.command("profile", {selectedCompanionId: root.roster[currentIndex].companionId})
    enabled: root.roster.length > 0 && root.agent && !root.agent.busy
  }
  Text {
    visible: root.roster.length === 0; width: parent.width
    text: "No eligible Pokémon yet. Hatch your egg first; unrevealed Ditto and released Pokémon cannot battle."
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Qt.darker(root.foreground, 1.4); font.family: root.fontFamily; font.pixelSize: Style.font.caption
  }
  Text {
    text: (root.stats.wins || 0) + " wins · " + (root.stats.losses || 0) + " losses · " + (root.stats.draws || 0) + " draws"
    color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.bodySmall
  }
  Text {
    text: "Wallet: " + Balance.formatTokens(root.serviceData.wallet ? root.serviceData.wallet.available : 0)
    color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption
  }
  Text { text: "Recent battles"; color: Qt.darker(root.foreground,1.4); font.family: root.fontFamily; font.pixelSize: Style.font.caption }
  ListView {
    width: parent.width; height: Style.space(90); clip: true
    model: root.serviceData.history || []
    Controls.ScrollBar.vertical: Controls.ScrollBar {}
    delegate: Row {
      required property var modelData
      width: ListView.view.width; height: Style.space(28)
      Text {
        width: parent.width - Style.space(80); anchors.verticalCenter: parent.verticalCenter
        text: modelData.result.toUpperCase() + " · " + modelData.opponent + (modelData.stake ? " · " + Balance.formatTokens(modelData.stake) : " · friendly")
        textFormat: Text.PlainText; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideRight
      }
      BattleButton {
        width: Style.space(80); height: parent.height; text: "Recover"; foreground: root.foreground
        enabled: root.agent && !root.agent.busy
        Accessible.name: "Recover saved result with " + modelData.opponent
        onClicked: { root.agent.command("recover", {matchId: modelData.matchId}); if (root.host) root.host.openTab(7) }
      }
    }
  }
  Text {
    width: parent.width; visible: !!text
    text: root.agent ? (root.agent.error || root.serviceData.error || "") : "Trainer service unavailable"
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Commons.Color.urgent; font.family: root.fontFamily; font.pixelSize: Style.font.caption
  }
  BattleButton {
    width: parent.width; text: "Install / repair battle runtime"; foreground: root.foreground
    visible: root.agent && !root.agent.initialized
    enabled: root.agent && !root.agent.busy
    onClicked: root.agent.install()
  }
}
