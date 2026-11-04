import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance

// Um Pokémon no team preview: nome na cor da raridade, a raridade e os tipos.
// Os dois times usam o mesmo cartão; só o seu é clicável.
Rectangle {
  id: root
  property var member: null
  property int order: 0
  property bool interactive: false
  property bool dimmed: false
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  signal clicked()

  readonly property string rarity: member && member.rarity ? member.rarity : "common"

  implicitHeight: Style.space(72)
  radius: Style.space(5)
  opacity: dimmed ? 0.45 : 1
  color: Qt.rgba(foreground.r, foreground.g, foreground.b,
                 order > 0 ? 0.16 : (interactive && hover.hovered ? 0.1 : 0.06))
  border.color: order > 0 ? foreground : "transparent"

  Accessible.role: interactive ? Accessible.CheckBox : Accessible.StaticText
  Accessible.name: member ? member.name + ", " + Balance.rarityLabel(rarity) + ", " + (member.types || []).join(" and ")
                            + ", level " + member.level + (order > 0 ? ", pick " + order : "") : ""
  Accessible.checkable: interactive
  Accessible.checked: order > 0

  Image {
    id: face
    anchors.left: parent.left
    anchors.leftMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(40)
    height: width
    source: root.member ? root.member.sprite || "" : ""
    sourceSize.width: width * 2
    sourceSize.height: height * 2
    fillMode: Image.PreserveAspectFit
    smooth: false
    Accessible.ignored: true
  }

  Column {
    anchors.left: face.right
    anchors.leftMargin: Style.space(4)
    anchors.right: parent.right
    anchors.rightMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(2)

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.member ? root.member.name + " · Lv " + root.member.level : ""
      color: Balance.rarityColor(root.rarity, root.foreground)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      elide: Text.ElideRight
    }
    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: Balance.rarityLabel(root.rarity)
      color: Balance.rarityColor(root.rarity, Qt.darker(root.foreground, 1.4))
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    Row {
      spacing: Style.space(2)
      Repeater {
        model: root.member ? root.member.types || [] : []
        TypeBadge { required property string modelData; type: modelData; fontFamily: root.fontFamily }
      }
    }
  }

  Rectangle {
    visible: root.order > 0
    anchors.top: parent.top
    anchors.right: parent.right
    anchors.margins: Style.space(3)
    width: Style.space(16)
    height: width
    radius: width / 2
    color: root.foreground
    Text {
      anchors.centerIn: parent
      textFormat: Text.PlainText
      text: String(root.order)
      color: Commons.Color.background
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
  }

  HoverHandler { id: hover }
  TapHandler { enabled: root.interactive; onTapped: root.clicked() }
}
