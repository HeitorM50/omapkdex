import QtQuick
import qs.Commons
import "Balance.js" as Balance

// Etiqueta de tipo na cor clássica dos jogos. Com `mult` mostra também o
// multiplicador de dano (×2, ×½...), que é como o resumo lista fraquezas.
Rectangle {
  id: root
  property string type: ""
  property real mult: -1
  property string fontFamily: Style.font.family

  readonly property color base: Balance.typeColor(type)
  // Texto escuro nos tipos claros (Electric, Ice) e claro nos escuros (Dragon).
  readonly property color ink: (base.r * 0.299 + base.g * 0.587 + base.b * 0.114) > 0.6
                               ? "#1c1c1c" : "#f4f4f4"

  implicitWidth: label.implicitWidth + Style.space(10)
  implicitHeight: Style.space(16)
  radius: Style.space(4)
  color: base

  Accessible.role: Accessible.StaticText
  Accessible.name: label.text

  Text {
    id: label
    anchors.centerIn: parent
    textFormat: Text.PlainText
    text: root.type + (root.mult >= 0 ? " " + Balance.multiplierLabel(root.mult) : "")
    color: root.ink
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
  }
}
