import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons
Column {
  id: root
  property var agent: null
  property color foreground: Commons.Color.foreground
  readonly property var serviceData: agent ? agent.data : ({})
  spacing: Style.space(6)
  Text { text: "Create a room"; color: root.foreground; font.pixelSize: Style.font.bodySmall; font.family: Style.font.family; font.bold: true }
  Row {
    width: parent.width; spacing: Style.space(6)
    Controls.ComboBox {
      id: iface
      property string selectedInterface: ""
      currentIndex: Math.max(0, (root.serviceData.interfaces || []).indexOf(selectedInterface))
      onActivated: selectedInterface = currentText
      width: (parent.width - Style.space(6)) * 0.6
      model: root.serviceData.interfaces || []
      Accessible.name: "Local network interface"
    }
    Controls.ComboBox {
      id: mode; width: (parent.width - Style.space(6)) * 0.4
      model: ["Level 50", "Real level"]
      Accessible.name: "Battle level format"
    }
  }
  Row {
    width: parent.width; spacing: Style.space(6)
    Text { text: "Host port"; width: Style.space(72); anchors.verticalCenter: parent.verticalCenter; color: root.foreground; font.pixelSize: Style.font.caption; font.family: Style.font.family }
    Controls.SpinBox { id: hostPort; width: parent.width - Style.space(78); from: 1024; to: 65535; value: 47853; editable: true; Accessible.name: "Room hosting port" }
  }
  Row {
    width: parent.width; spacing: Style.space(6)
    Text { text: "Stake"; width: Style.space(42); anchors.verticalCenter: parent.verticalCenter; color: root.foreground; font.pixelSize: Style.font.caption; font.family: Style.font.family }
    Controls.SpinBox {
      id: stake; width: parent.width - Style.space(48)
      from: 0; to: 1000000000; value: 0; stepSize: 1000000; editable: true
      Accessible.name: "Stake in virtual tokens; zero is friendly"
    }
  }
  Controls.CheckBox {
    id: trust; width: parent.width; visible: stake.value > 0
    text: "I accept a trusted-friends token stake"
    Accessible.name: text
  }
  Text {
    width: parent.width; visible: stake.value > 0
    text: "Local saves can be edited. A stake stays reserved after a disconnect until both peers agree on the result. No provider credits or real money."
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Commons.Color.urgent; font.pixelSize: Style.font.caption; font.family: Style.font.family
  }
  BattleButton {
    width: parent.width; text: "Create LAN room"; foreground: root.foreground
    enabled: root.agent && !root.agent.busy && iface.currentText.length > 0 && (!stake.value || trust.checked)
    onClicked: root.agent.command("host", {host: iface.currentText, port: hostPort.value, mode: mode.currentIndex === 0 ? "level50" : "natural", stake: stake.value, trustedStakesAccepted: trust.checked})
  }
  Text { text: "Join a room"; color: root.foreground; font.pixelSize: Style.font.bodySmall; font.family: Style.font.family; font.bold: true }
  Row {
    width: parent.width; spacing: Style.space(6)
    Controls.TextField { id: address; width: (parent.width - Style.space(6)) * 0.65; placeholderText: "192.168.1.42"; Accessible.name: "Host local IP address" }
    Controls.SpinBox { id: port; width: (parent.width - Style.space(6)) * 0.35; from: 1; to: 65535; value: 47853; editable: true; Accessible.name: "Host port" }
  }
  Row {
    width: parent.width; spacing: Style.space(6)
    BattleButton { width: (parent.width - Style.space(6))/2; text: "Join address"; foreground: root.foreground; enabled: root.agent && !root.agent.busy && !!address.text; onClicked: root.agent.command("join", {host: address.text.trim(), port: port.value}) }
    BattleButton { width: (parent.width - Style.space(6))/2; text: "Find LAN rooms"; foreground: root.foreground; enabled: root.agent && !root.agent.busy; onClicked: root.agent.command("scan") }
  }
  Repeater {
    model: (root.serviceData.rooms || []).slice(0, 4)
    BattleButton {
      required property var modelData
      width: parent.width; text: modelData.name + " · " + modelData.host + ":" + modelData.port; foreground: root.foreground
      enabled: root.agent && !root.agent.busy
      onClicked: root.agent.command("join", {host: modelData.host, port: modelData.port})
    }
  }
}
