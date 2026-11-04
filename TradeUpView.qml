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
  readonly property var inputs: Balance.PACK_REWARDS.filter(function(k) { var inv = root.state.inventory || {}; return Balance.itemRarity(k) === root.tiers[root.tierIndex] && (k === "shinyCharm" ? inv.shinyCharm === true || Number(inv.shinyCharmDuplicates) > 0 : Number(inv[k]) > 0) })
  readonly property var outputs: Balance.PACK_REWARDS.filter(function(k) { return Balance.itemRarity(k) === root.tiers[root.tierIndex + 1] })
  readonly property int requiredCount: [5, 4, 3, 2][tierIndex]
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
    next[key] = Math.max(0, Math.min(available(key), (next[key] || 0) + delta, requiredCount - total + (next[key] || 0)))
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
    text: root.expanded ? "← Back to items" : "Realizar Trade Up"
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
      text: "Trade " + root.requiredCount + " items of the same rarity for one chosen item of the next rarity. No token cost. Reserved items and your active Charm are protected."
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
    Text {
      width: parent.width
      text: root.inputs.length ? "Click an item to add it · right-click to remove" : "No items of this rarity in your Bag."
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      color: root.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
    Grid {
      id: inventoryGrid
      width: parent.width
      columns: 3
      spacing: Style.space(5)
      Repeater {
        model: root.inputs
        Controls.Button {
          id: tile
          objectName: "tradeInput-" + modelData
          required property string modelData
          readonly property int chosen: root.selected[modelData] || 0
          readonly property int availableCount: root.available(modelData)
          readonly property color rarityColor: Balance.rarityColor(Balance.itemRarity(modelData), root.foreground)
          width: (inventoryGrid.width - inventoryGrid.spacing * 2) / 3
          height: Style.space(112)
          padding: Style.space(5)
          Accessible.name: Balance.itemLabel(modelData) + ", " + availableCount + " available, " + chosen + " selected"
          Accessible.description: "Activate to add one. Right-click to remove one, or use Clear selection."
          enabled: !root.busy && availableCount > 0
          onClicked: {
            if (root.total < root.requiredCount && chosen < availableCount) root.adjust(modelData, 1)
          }
          TapHandler {
            acceptedButtons: Qt.RightButton
            onTapped: { if (!root.busy && tile.chosen > 0) root.adjust(tile.modelData, -1) }
          }
          Controls.ToolTip.visible: hovered
          Controls.ToolTip.text: Balance.itemHint(modelData)
          background: Rectangle {
            radius: Style.space(5)
            color: Qt.rgba(tile.rarityColor.r, tile.rarityColor.g, tile.rarityColor.b, tile.chosen > 0 ? 0.18 : (tile.hovered ? 0.10 : 0.04))
            border.width: tile.chosen > 0 || tile.activeFocus ? 2 : 1
            border.color: tile.chosen > 0 || tile.activeFocus ? tile.rarityColor : Qt.rgba(tile.rarityColor.r, tile.rarityColor.g, tile.rarityColor.b, 0.3)
          }
          contentItem: Column {
            spacing: Style.space(3)
            opacity: tile.enabled ? 1 : 0.45
            Text {
              width: parent.width
              text: Balance.itemGlyph(tile.modelData)
              textFormat: Text.PlainText
              font.pixelSize: Style.font.subtitle
              horizontalAlignment: Text.AlignHCenter
            }
            Text {
              width: parent.width
              text: Balance.itemLabel(tile.modelData)
              textFormat: Text.PlainText
              color: tile.rarityColor
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.WordWrap
            }
            Text {
              width: parent.width
              text: tile.availableCount ? tile.chosen + " / " + tile.availableCount + " selected" : "Protected"
              textFormat: Text.PlainText
              color: root.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.WordWrap
            }
          }
        }
      }
    }
    BattleButton {
      text: "Clear selection"
      foreground: root.foreground
      enabled: !root.busy && root.total > 0
      onClicked: root.selected = ({})
    }
    Text {
      text: root.total + "/" + root.requiredCount + " selected · Choose your guaranteed " + Balance.rarityLabel(root.tiers[root.tierIndex + 1]) + ":"
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
      text: root.busy ? "Trading…" : "Realizar Trade Up"
      enabled: !root.busy && root.total === root.requiredCount && !!root.target
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
            + "\n\nReceive: 1× " + Balance.itemLabel(root.target) + "\n\nThe " + root.requiredCount + " selected items will be consumed."
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
    }
    onAccepted: { if (root.host && root.total === root.requiredCount && root.target) root.host.tradeUp(root.selected, root.target) }
  }
}
