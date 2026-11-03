import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Ui
import "Balance.js" as Balance

// A receipt is written with the debit and reward. Animation only presents it.
Column {
  id: root
  property var host: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  signal buyRequested(string key, string tier)

  readonly property var progressState: host ? host.progressState : null
  readonly property real wallet: Balance.availableTokens(progressState)
  readonly property var receipt: progressState ? progressState.lastPack || null : null
  readonly property string receiptId: receipt ? receipt.id : ""
  readonly property bool busy: (host ? host.packBusy === true : false) || opening.running
  property string selectedPackage: "poorPackage"
  readonly property var packageConfig: Balance.PACKAGES[selectedPackage]
  readonly property var meter: Balance.rngesusMeter(progressState, selectedPackage)
  readonly property var rewards: Balance.packRewards(selectedPackage, meter.ready)
  onSelectedPackageChanged: { pending = false; resetTimer.stop() }
  property bool pending: false
  property bool ready: false
  property bool revealed: true
  property string seenReceipt: ""

  Component.onCompleted: { seenReceipt = receiptId; ready = true }
  onReceiptIdChanged: {
    if (!ready || !receiptId || receiptId === seenReceipt) return
    seenReceipt = receiptId
    pending = false
    resetTimer.stop()
    revealed = false
    opening.restart()
  }

  function press() {
    if (busy || wallet < root.packageConfig.price) return
    if (!pending) { pending = true; resetTimer.restart(); return }
    pending = false
    resetTimer.stop()
    root.buyRequested(root.selectedPackage, "")
  }

  Timer { id: resetTimer; interval: 4000; onTriggered: root.pending = false }
  SequentialAnimation {
    id: opening
    NumberAnimation { target: parcel; property: "rotation"; from: 0; to: -14; duration: 100 }
    NumberAnimation { target: parcel; property: "rotation"; to: 14; duration: 100 }
    NumberAnimation { target: parcel; property: "rotation"; to: -14; duration: 100 }
    NumberAnimation { target: parcel; property: "rotation"; to: 14; duration: 100 }
    NumberAnimation { target: parcel; property: "rotation"; to: 0; duration: 100 }
    NumberAnimation { target: parcel; property: "scale"; from: 1; to: 1.35; duration: 150 }
    NumberAnimation { target: parcel; property: "scale"; to: 1; duration: 200 }
    ScriptAction { script: root.revealed = true }
  }

  spacing: Style.space(7)

  Text {
    width: parent.width
    text: Balance.formatTokens(root.wallet) + " available"
    textFormat: Text.PlainText
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.subtitle
    font.bold: true
  }

  Row {
    width: parent.width
    spacing: Style.space(4)
    Repeater {
      model: Balance.PACKAGE_ORDER
      delegate: Controls.Button {
        id: choice
        required property string modelData
        readonly property var config: Balance.PACKAGES[modelData]
        readonly property bool selected: root.selectedPackage === modelData
        width: (root.width - Style.space(8)) / 3
        height: Style.space(40)
        enabled: !root.busy
        Accessible.name: config.label + ", " + Balance.formatTokens(config.price) + " tokens"
        Accessible.role: Accessible.RadioButton
        Accessible.checkable: true
        Accessible.checked: selected
        onClicked: root.selectedPackage = modelData
        contentItem: Text {
          text: choice.config.label + "\n" + Balance.formatTokens(choice.config.price)
          textFormat: Text.PlainText
          color: choice.selected ? choice.config.color : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: choice.selected
          horizontalAlignment: Text.AlignHCenter
          verticalAlignment: Text.AlignVCenter
        }
        Rectangle {
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          anchors.margins: Style.space(4)
          height: Style.space(2)
          color: Qt.darker(root.foreground, 3)
          Rectangle {
            width: parent.width * Balance.rngesusMeter(root.progressState, choice.modelData).fraction
            height: parent.height
            color: choice.config.color
          }
        }
        background: Rectangle {
          radius: Style.space(4)
          color: "transparent"
          border.color: choice.selected ? choice.config.color : Qt.darker(root.foreground, 2)
          border.width: choice.selected ? 2 : 1
        }
      }
    }
  }

  RngesusMeter {
    width: parent.width
    meter: root.meter
    foreground: root.foreground
    accentColor: root.packageConfig.color
    fontFamily: root.fontFamily
  }

  Item {
    width: parent.width
    height: Style.space(40)
    Rectangle {
      anchors.centerIn: parent
      width: Style.space(70); height: width
      radius: width / 2
      color: root.receipt && root.revealed
             ? Balance.rarityColor(Balance.itemRarity(root.receipt.key), root.foreground) : root.packageConfig.color
      opacity: 0.12
    }
    Image {
      id: parcel
      anchors.centerIn: parent
      width: Style.space(60); height: width
      source: Qt.resolvedUrl("assets/parcel.png")
      fillMode: Image.PreserveAspectFit
      smooth: false
      Accessible.ignored: true
    }
  }


  Text {
    width: parent.width
    text: root.selectedPackage === "poorPackage" ? "One reward · all rarities · original odds."
          : root.selectedPackage === "fancyPackage" ? "One reward · all rarities · better rare-item odds."
          : "One reward · Uncommon and above · best rare-item odds."
    textFormat: Text.PlainText
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Controls.Button {
    width: parent.width
    enabled: !root.busy && root.wallet >= root.packageConfig.price
    text: root.busy ? "Opening…" : (root.pending ? (root.meter.ready ? "Confirm RNGesus · " : "Confirm · ") + Balance.formatTokens(root.packageConfig.price)
          : "Buy " + root.packageConfig.label + " · " + Balance.formatTokens(root.packageConfig.price))
    Accessible.name: text
    onClicked: root.press()
    contentItem: Text {
      text: parent.text
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      horizontalAlignment: Text.AlignHCenter
      verticalAlignment: Text.AlignVCenter
      opacity: parent.enabled ? 1 : 0.45
    }
    background: Rectangle {
      implicitHeight: Style.space(36)
      radius: Style.space(4)
      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, root.pending ? 0.16 : 0.08)
      border.color: root.pending ? root.foreground : "transparent"
    }
  }

  Text {
    width: parent.width
    visible: !!text
    text: host && host.packError ? host.packError
          : (!root.revealed ? "Unwrapping…" : (root.receipt
             ? Balance.itemGlyph(root.receipt.key) + " " + Balance.itemLabel(root.receipt.key)
               + " · " + Balance.rarityLabel(Balance.itemRarity(root.receipt.key))
               + (root.receipt.rngesusGuaranteed ? " · RNGesus!" : "") + " — in your Bag"
             : (root.wallet < root.packageConfig.price ? "You need " + Balance.formatTokens(root.packageConfig.price) + " tokens for this package." : "")))
    textFormat: Text.PlainText
    color: root.receipt && root.revealed ? Balance.rarityColor(Balance.itemRarity(root.receipt.key), root.foreground) : root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
    wrapMode: Text.WordWrap
    Accessible.role: Accessible.StaticText
    Accessible.name: text
  }

  PanelSeparator { foreground: root.foreground }

  Text {
    text: (root.meter.ready ? "Guaranteed RNGesus rewards · " : "Possible rewards · ") + root.packageConfig.label
    width: parent.width
    textFormat: Text.PlainText
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  ListView {
    id: rewardList
    width: parent.width
    height: Math.min(Style.space(145), contentHeight)
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    interactive: contentHeight > height
    Controls.ScrollBar.vertical: Controls.ScrollBar { policy: Controls.ScrollBar.AsNeeded }
    model: root.rewards
    delegate: Row {
      required property var modelData
      width: rewardList.width
      height: Style.space(18)
      Text {
        width: parent.width * 0.8
        text: modelData.glyph + " " + modelData.label + " · " + Balance.rarityLabel(modelData.rarity)
        textFormat: Text.PlainText
        color: Balance.rarityColor(modelData.rarity, root.foreground)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
      Text {
        width: parent.width * 0.2
        text: (modelData.chance * 100).toFixed(2) + "%"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        horizontalAlignment: Text.AlignRight
      }
    }
  }

  Text {
    width: parent.width
    text: "Shiny Charm stays active forever; duplicates are kept in the Bag and do not stack its bonus."
    textFormat: Text.PlainText
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }
}
