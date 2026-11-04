import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance

Column {
  id: root
  property var host: null
  property color foreground: Commons.Color.foreground
  property bool expanded: false
  property int tierIndex: 0
  property var selected: ({})
  property string target: ""
  readonly property var tiers: ["common", "uncommon", "rare", "legendary", "mythical"]
  readonly property var state: host && host.progressState ? host.progressState : ({})
  readonly property bool busy: host ? host.tradeBusy === true : false
  readonly property var inputs: Balance.PACK_REWARDS.filter(function(k) { return Balance.itemRarity(k) === root.tiers[root.tierIndex] })
  readonly property var outputs: Balance.PACK_REWARDS.filter(function(k) { return Balance.itemRarity(k) === root.tiers[root.tierIndex + 1] })
  readonly property int total: Object.keys(selected).reduce(function(n, k) { return n + root.selected[k] }, 0)
  spacing: Style.space(6)

  function available(key) {
    var inv = state.inventory || {}
    var n = Number(inv[key === "shinyCharm" ? "shinyCharmDuplicates" : key]) || 0
    if (key === "luckyClover" && (state.luckyCloverArmed || state.luckyCloverPending)) n--
    return Math.max(0, n)
  }
  function adjust(key, delta) {
    var next = Object.assign({}, selected)
    next[key] = Math.max(0, Math.min(available(key), (next[key] || 0) + delta, 10 - total + (next[key] || 0)))
    if (!next[key]) delete next[key]
    selected = next
  }
  function reset() { selected = ({}); target = ""; confirmation.close() }
  onTierIndexChanged: reset()
  readonly property string lastTradeId: state.lastTradeUp ? state.lastTradeUp.id || "" : ""
  onLastTradeIdChanged: reset()
  onStateChanged: {
    // Usage updates frequently refresh state; keep a valid draft intact.
    if (Object.keys(selected).some(function(k) { return root.selected[k] > root.available(k) })) reset()
  }

  BattleButton {
    width: parent.width
    foreground: root.foreground
    text: root.expanded ? "← Back to items" : "Trade up · 10 items → 1 upgraded item"
    enabled: !root.busy
    onClicked: { root.expanded = !root.expanded; root.reset() }
  }
  Controls.ScrollView {
    id: tradeScroll
    visible: root.expanded
    width: parent.width
    height: Math.min(Style.space(350), tradeContent.implicitHeight)
    contentWidth: availableWidth
    clip: true
    Column {
      id: tradeContent
      width: tradeScroll.availableWidth
      spacing: Style.space(6)
    Text {
      width: parent.width
      text: "Trade 10 items of the same rarity for one chosen item of the next rarity. No token cost. Reserved items and your active Charm are protected."
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      color: root.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
    Flow {
      width: parent.width
      spacing: Style.space(4)
      Repeater {
        model: root.tiers.slice(0, -1)
        BattleButton {
          required property int index
          required property string modelData
          foreground: Balance.rarityColor(modelData, root.foreground)
          text: (root.tierIndex === index ? "✓ " : "") + Balance.rarityLabel(modelData)
          enabled: !root.busy
          onClicked: root.tierIndex = index
        }
      }
    }
    Repeater {
      model: root.inputs
      Row {
        required property string modelData
        width: parent.width
        spacing: Style.space(4)
        Text {
          width: parent.width - Style.space(96)
          height: Style.space(34)
          verticalAlignment: Text.AlignVCenter
          text: Balance.itemLabel(parent.modelData) + " · " + root.available(parent.modelData) + " available"
          textFormat: Text.PlainText
          elide: Text.ElideRight
          color: root.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
        BattleButton { width: Style.space(28); text: "−"; Accessible.name: "Remove " + parent.modelData; enabled: !root.busy && (root.selected[parent.modelData] || 0) > 0; onClicked: root.adjust(parent.modelData, -1) }
        Text { width: Style.space(20); height: Style.space(34); verticalAlignment: Text.AlignVCenter; horizontalAlignment: Text.AlignHCenter; text: root.selected[parent.modelData] || 0; color: root.foreground }
        BattleButton { width: Style.space(28); text: "+"; Accessible.name: "Add " + parent.modelData; enabled: !root.busy && root.total < 10 && (root.selected[parent.modelData] || 0) < root.available(parent.modelData); onClicked: root.adjust(parent.modelData, 1) }
      }
    }
    Text {
      text: root.total + "/10 selected · Choose your guaranteed " + Balance.rarityLabel(root.tiers[root.tierIndex + 1]) + ":"
      width: parent.width
      wrapMode: Text.WordWrap
      color: root.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
    Flow {
      width: parent.width
      spacing: Style.space(4)
      Repeater {
        model: root.outputs
        BattleButton {
          required property string modelData
          text: (root.target === modelData ? "✓ " : "") + Balance.itemLabel(modelData)
          foreground: Balance.rarityColor(Balance.itemRarity(modelData), root.foreground)
          enabled: !root.busy
          onClicked: root.target = modelData
        }
      }
    }
    BattleButton {
      width: parent.width
      foreground: root.foreground
      text: root.busy ? "Trading…" : "Review trade up"
      enabled: !root.busy && root.total === 10 && !!root.target
      onClicked: confirmation.open()
    }
  }
  }
  Text {
    width: parent.width
    visible: !!text
    text: root.host ? root.host.tradeMessage || "" : ""
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: root.foreground
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
  }
  Controls.Dialog {
    id: confirmation
    title: "Confirm trade up?"
    width: Math.min(Style.space(310), root.width)
    modal: true
    standardButtons: Controls.Dialog.Yes | Controls.Dialog.No
    contentItem: Text {
      text: Object.keys(root.selected).map(function(k) { return root.selected[k] + "× " + Balance.itemLabel(k) }).join("\n")
            + "\n\nReceive: 1× " + Balance.itemLabel(root.target) + "\n\nThe 10 selected items will be consumed."
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
    }
    onAccepted: { if (root.host && root.total === 10 && root.target) root.host.tradeUp(root.selected, root.target) }
  }
}
