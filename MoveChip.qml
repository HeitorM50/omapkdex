import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance

// Um golpe com tipo, poder e precisão. No editor do Trainer também é a opção
// que se marca (`interactive`), no resumo é só leitura.
Rectangle {
  id: root
  property var move: null
  property bool selected: false
  property bool interactive: false
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  signal clicked()

  readonly property color accent: Balance.typeColor(move ? move.type : "")

  implicitHeight: info.implicitHeight + Style.space(10)
  // Num GridLayout os cards da mesma linha ficam com a altura do mais alto.
  Layout.fillWidth: true
  Layout.fillHeight: true
  radius: Style.space(5)
  color: Qt.rgba(foreground.r, foreground.g, foreground.b,
                 selected ? 0.16 : (interactive && hover.hovered ? 0.1 : 0.06))
  border.color: selected ? Qt.darker(foreground, 1.5) : "transparent"

  Accessible.role: interactive ? Accessible.CheckBox : Accessible.StaticText
  Accessible.name: move ? move.name + ", " + move.type : ""
  Accessible.checkable: interactive
  Accessible.checked: selected

  Rectangle {
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    anchors.margins: Style.space(3)
    width: Style.space(3)
    radius: width / 2
    color: root.accent
  }

  Column {
    id: info
    spacing: Style.space(3)
    anchors.left: parent.left
    anchors.leftMargin: Style.space(10)
    anchors.right: parent.right
    anchors.rightMargin: Style.space(6)
    anchors.top: parent.top
    anchors.topMargin: Style.space(5)

    // O PP fica logo ao lado do nome, onde não é cortado; só o nome cede espaço.
    Row {
      id: head
      width: parent.width
      spacing: Style.space(6)
      Text {
        width: Math.min(implicitWidth, head.width - ppText.implicitWidth - head.spacing)
        textFormat: Text.PlainText
        text: root.move ? root.move.name : ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: root.selected
        elide: Text.ElideRight
      }
      Text {
        id: ppText
        textFormat: Text.PlainText
        text: root.move ? root.move.pp + " PP" : ""
        color: Qt.darker(root.foreground, 1.3)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.move
            ? root.move.type + " · " + (root.move.category === "Physical" ? "Phys" : root.move.category === "Special" ? "Spec" : root.move.category)
              + (root.move.power ? " · " + root.move.power + (root.move.accuracy ? "/" + root.move.accuracy + "%" : "") : "")
            : ""
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }
    MoveEffects {
      width: parent.width
      effects: root.move ? root.move.effects || [] : []
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
  }

  HoverHandler { id: hover }
  TapHandler { enabled: root.interactive; onTapped: root.clicked() }
}
