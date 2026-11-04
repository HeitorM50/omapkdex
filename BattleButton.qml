import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons

// Mesmo vocabulário da Shop: preenchimento translúcido do foreground, borda só
// no destaque. `primary` é a ação que avança o fluxo; `subtle` é a saída
// secundária (cancelar, recuperar) e não deve competir com ela.
Controls.Button {
  id: root
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  property bool primary: false
  property bool subtle: false

  implicitHeight: subtle ? Style.space(22) : Style.space(32)
  Accessible.name: text

  contentItem: Text {
    text: root.text
    textFormat: Text.PlainText
    color: root.subtle ? Qt.darker(root.foreground, 1.4) : root.foreground
    font.family: root.fontFamily
    font.pixelSize: root.subtle ? Style.font.caption : Style.font.bodySmall
    font.bold: root.primary
    horizontalAlignment: Text.AlignHCenter
    verticalAlignment: Text.AlignVCenter
    elide: Text.ElideRight
    opacity: root.enabled ? 1 : 0.4
  }

  background: Rectangle {
    radius: Style.space(4)
    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                   root.subtle ? (root.hovered ? 0.06 : 0)
                               : root.down ? 0.18
                               : root.primary ? (root.hovered ? 0.2 : 0.16)
                               : (root.hovered ? 0.12 : 0.07))
    border.color: root.primary || root.activeFocus ? root.foreground : "transparent"
  }
}
