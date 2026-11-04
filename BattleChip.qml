import QtQuick
import qs.Commons
import qs.Commons as Commons

// Escolha de um conjunto pequeno (formato, interface, aceite): o mesmo chip
// das abas do painel, sem ComboBox nativo.
Rectangle {
  id: root
  property string text: ""
  property bool selected: false
  property bool enabled: true
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  signal clicked()

  implicitWidth: label.implicitWidth + Style.space(16)
  implicitHeight: Style.space(26)
  radius: Style.space(5)
  opacity: enabled ? 1 : 0.4
  color: Qt.rgba(foreground.r, foreground.g, foreground.b,
                 selected ? 0.14 : (hover.hovered && enabled ? 0.06 : 0))
  border.color: selected ? Qt.darker(foreground, 1.5) : "transparent"

  Accessible.role: Accessible.RadioButton
  Accessible.name: text
  Accessible.checkable: true
  Accessible.checked: selected

  Behavior on color { ColorAnimation { duration: 120 } }

  Text {
    id: label
    anchors.centerIn: parent
    width: Math.min(implicitWidth, parent.width - Style.space(8))
    textFormat: Text.PlainText
    text: root.text
    color: root.selected ? root.foreground : Qt.darker(root.foreground, 1.5)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: root.selected
    elide: Text.ElideRight
  }

  HoverHandler { id: hover }
  TapHandler { enabled: root.enabled; onTapped: root.clicked() }
}
