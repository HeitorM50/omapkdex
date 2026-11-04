import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Balance.js" as Balance

// Sem sala aberta: criar uma ou entrar numa. O caminho comum (nível 50, sem
// aposta, primeira interface de rede) é um clique; o resto fica em "Options".
Column {
  id: root
  property var agent: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property var serviceData: agent ? agent.data : ({})
  readonly property var interfaces: serviceData.interfaces || []
  readonly property bool ready: !!agent && !agent.busy

  property bool advanced: false
  property bool trusted: false
  property int timer: 0
  property string chosenInterface: ""

  // A lista de interfaces muda com a rede; uma escolha que sumiu cai na
  // primeira (o service já ordena o loopback por último).
  readonly property string iface: interfaces.indexOf(chosenInterface) >= 0
                                  ? chosenInterface : (interfaces.length > 0 ? interfaces[0] : "")
  readonly property int stake: Math.max(0, Math.min(1000000000, parseInt(stakeField.text) || 0))
  readonly property int hostPort: Math.max(1024, Math.min(65535, parseInt(hostPortField.text) || 47853))
  readonly property int joinPort: Math.max(1, Math.min(65535, parseInt(joinPortField.text) || 47853))

  spacing: Style.space(8)

  BattleButton {
    width: parent.width
    primary: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    text: "Create room"
    enabled: root.ready && root.iface.length > 0 && (root.stake === 0 || root.trusted)
    onClicked: root.agent.command("host", {
      host: root.iface, port: root.hostPort,
      stake: root.stake, timer: root.timer, trustedStakesAccepted: root.trusted
    })
  }

  BattleButton {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    text: "Practice vs CPU"
    enabled: root.ready
    onClicked: root.agent.command("practice")
  }

  Item {
    width: parent.width
    height: Style.space(26)

    BattleText {
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      foreground: root.foreground
      fontFamily: root.fontFamily
      dim: true
      wrapMode: Text.NoWrap
      text: "Gen 5 · 3v3 · real levels"
    }

    BattleButton {
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(76)
      subtle: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: root.advanced ? "Options ▴" : "Options ▾"
      onClicked: root.advanced = !root.advanced
    }
  }

  Column {
    width: parent.width
    spacing: Style.space(6)
    visible: root.advanced

    PanelSectionHeader {
      text: "Network"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Flow {
      width: parent.width
      spacing: Style.space(4)
      Repeater {
        model: root.interfaces
        BattleChip {
          required property string modelData
          text: modelData
          selected: modelData === root.iface
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: root.chosenInterface = modelData
        }
      }
    }

    Row {
      spacing: Style.space(4)
      BattleText {
        width: Style.space(48)
        anchors.verticalCenter: parent.verticalCenter
        foreground: root.foreground
        fontFamily: root.fontFamily
        dim: true
        text: "Timer"
      }
      Repeater {
        model: [{ s: 0, label: "Off" }, { s: 30, label: "30s" }, { s: 60, label: "60s" }, { s: 120, label: "2 min" }, { s: 180, label: "3 min" }]
        BattleChip {
          required property var modelData
          text: modelData.label
          selected: root.timer === modelData.s
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: root.timer = modelData.s
        }
      }
    }

    Row {
      width: parent.width
      spacing: Style.space(6)
      BattleText {
        width: Style.space(48)
        anchors.verticalCenter: parent.verticalCenter
        foreground: root.foreground
        fontFamily: root.fontFamily
        dim: true
        text: "Port"
      }
      TextField {
        id: hostPortField
        width: Style.space(84)
        foreground: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        text: "47853"
        validator: IntValidator { bottom: 1024; top: 65535 }
        inputMethodHints: Qt.ImhDigitsOnly
        Accessible.name: "Room hosting port"
      }
    }

    Row {
      width: parent.width
      spacing: Style.space(6)
      BattleText {
        width: Style.space(48)
        anchors.verticalCenter: parent.verticalCenter
        foreground: root.foreground
        fontFamily: root.fontFamily
        dim: true
        text: "Stake"
      }
      TextField {
        id: stakeField
        width: Style.space(120)
        foreground: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        placeholderText: "0 · friendly"
        validator: IntValidator { bottom: 0; top: 1000000000 }
        inputMethodHints: Qt.ImhDigitsOnly
        Accessible.name: "Stake in virtual tokens; empty or zero is friendly"
      }
      BattleText {
        width: parent.width - Style.space(48) - Style.space(120) - parent.spacing * 2
        anchors.verticalCenter: parent.verticalCenter
        foreground: root.foreground
        fontFamily: root.fontFamily
        dim: true
        elide: Text.ElideRight
        wrapMode: Text.NoWrap
        text: Balance.formatTokens(root.serviceData.wallet ? root.serviceData.wallet.available : 0) + " available"
      }
    }

    BattleChip {
      visible: root.stake > 0
      text: "I accept a trusted-friends token stake"
      selected: root.trusted
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.trusted = !root.trusted
    }

    BattleText {
      width: parent.width
      visible: root.stake > 0
      foreground: root.foreground
      fontFamily: root.fontFamily
      urgent: true
      text: "Local saves can be edited. A stake stays reserved after a disconnect until both peers agree on the result. No provider credits or real money."
    }
  }

  PanelSeparator { foreground: root.foreground }

  PanelSectionHeader {
    text: "Join a room"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Row {
    width: parent.width
    spacing: Style.space(6)

    TextField {
      id: address
      width: parent.width - joinPortField.width - joinButton.width - parent.spacing * 2
      foreground: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      placeholderText: "Host IP, e.g. 192.168.1.42"
      Accessible.name: "Host local IP address"
      onAccepted: joinButton.clicked()
    }
    TextField {
      id: joinPortField
      width: Style.space(64)
      foreground: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      text: "47853"
      validator: IntValidator { bottom: 1; top: 65535 }
      inputMethodHints: Qt.ImhDigitsOnly
      Accessible.name: "Host port"
    }
    BattleButton {
      id: joinButton
      width: Style.space(56)
      height: address.height
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: "Join"
      enabled: root.ready && address.text.trim().length > 0
      onClicked: if (enabled) root.agent.command("join", { host: address.text.trim(), port: root.joinPort })
    }
  }

  BattleButton {
    width: parent.width
    subtle: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    text: "Find rooms on this network"
    enabled: root.ready
    onClicked: root.agent.command("scan")
  }

  Repeater {
    model: (root.serviceData.rooms || []).slice(0, 4)

    BattleButton {
      required property var modelData
      width: root.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: modelData.name + " · " + modelData.host + ":" + modelData.port
      enabled: root.ready
      onClicked: root.agent.command("join", { host: modelData.host, port: modelData.port })
    }
  }
}
