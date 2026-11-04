import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import "Balance.js" as Balance

Column {
  id: root
  property var meter: ({ tokens: 0, limit: 1, fraction: 0, ready: false })
  property color foreground: Color.foreground
  property color accentColor: "#f5c542"
  property string fontFamily: Style.font.family
  spacing: Style.space(3)

  Text {
    width: parent.width
    text: "RNGesus Meter · " + Balance.formatTokens(root.meter.tokens)
          + " / " + Balance.formatTokens(root.meter.limit)
    textFormat: Text.PlainText
    color: root.meter.ready ? "#f5c542" : root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: root.meter.ready
  }

  Controls.ProgressBar {
    id: progressBar
    width: parent.width
    height: Style.space(7)
    from: 0
    to: root.meter.limit
    value: root.meter.tokens
    Accessible.name: "RNGesus Meter"
    Accessible.description: root.meter.ready
      ? "Next opening guarantees a Legendary or Mythic item"
      : Balance.formatTokens(root.meter.tokens) + " of " + Balance.formatTokens(root.meter.limit) + " tokens spent without a Legendary or Mythic drop"
    background: Rectangle {
      radius: Style.space(3)
      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
    }
    contentItem: Item {
      Rectangle {
        width: parent.width * root.meter.fraction
        height: parent.height
        radius: Style.space(3)
        color: root.meter.ready ? "#f5c542" : root.accentColor
      }
    }
  }

  Text {
    width: parent.width
    text: root.meter.ready ? "READY · next opening guarantees Legendary or Mythic!"
          : "Fill the meter → next opening guaranteed. Legendary/Mythic resets it."
    textFormat: Text.PlainText
    color: root.meter.ready ? "#f5c542" : Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }
}
