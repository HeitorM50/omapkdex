import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons
Controls.Button {
  id: root
  property color foreground: Commons.Color.foreground
  implicitHeight: Style.space(34)
  Accessible.name: text
  contentItem: Text {
    text: root.text
    textFormat: Text.PlainText
    color: root.foreground
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall
    horizontalAlignment: Text.AlignHCenter
    verticalAlignment: Text.AlignVCenter
    elide: Text.ElideRight
    opacity: root.enabled ? 1 : 0.4
  }
  background: Rectangle {
    radius: Style.space(4)
    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, root.down ? 0.18 : (root.hovered ? 0.12 : 0.07))
    border.color: root.activeFocus ? root.foreground : "transparent"
  }
}
