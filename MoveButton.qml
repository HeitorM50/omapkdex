import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Commons
import "Balance.js" as Balance

// Botão de golpe da batalha: tipo na cor, PP restante/máximo e, quando o golpe
// causa dano, o multiplicador contra o ativo do adversário.
Controls.Button {
  id: root
  property var move: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property real effect: move && move.effect !== null && move.effect !== undefined ? move.effect : -1

  implicitHeight: Math.max(Style.space(40), body.implicitHeight + Style.space(12))
  // Num GridLayout os botões da mesma linha ficam com a altura do mais alto.
  Layout.fillWidth: true
  Layout.fillHeight: true
  Accessible.name: move ? move.name + (move.pp !== undefined ? ", " + move.pp + " of " + move.maxpp + " PP" : "") : ""

  contentItem: Item {
    opacity: root.enabled ? 1 : 0.4

    Column {
      id: body
      spacing: Style.space(3)
      anchors.left: parent.left
      anchors.leftMargin: Style.space(10)
      anchors.right: tag.left
      anchors.rightMargin: Style.space(4)
      anchors.top: parent.top
      anchors.topMargin: Style.space(6)

      // PP restante/máximo logo ao lado do nome, onde não é cortado.
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
          elide: Text.ElideRight
        }
        Text {
          id: ppText
          textFormat: Text.PlainText
          text: root.move && root.move.pp !== undefined ? root.move.pp + "/" + root.move.maxpp + " PP" : ""
          color: Qt.darker(root.foreground, 1.3)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: root.move
              ? root.move.type + (root.move.power ? " · " + root.move.power : "")
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

    // ×2 / ×½ / ×0 contra o ativo do adversário.
    Rectangle {
      id: tag
      visible: root.effect >= 0 && root.effect !== 1
      anchors.right: parent.right
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(28)
      height: Style.space(16)
      radius: Style.space(4)
      color: root.effect > 1 ? "#7cc47c" : (root.effect === 0 ? "#555555" : "#d98a4a")
      Text {
        anchors.centerIn: parent
        textFormat: Text.PlainText
        text: Balance.multiplierLabel(root.effect)
        color: "#1c1c1c"
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }
  }

  background: Rectangle {
    radius: Style.space(4)
    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                   root.down ? 0.18 : (root.hovered ? 0.12 : 0.07))
    border.color: root.activeFocus ? root.foreground : "transparent"

    Rectangle {
      anchors.left: parent.left
      anchors.top: parent.top
      anchors.bottom: parent.bottom
      anchors.margins: Style.space(3)
      width: Style.space(3)
      radius: width / 2
      color: Balance.typeColor(root.move ? root.move.type : "")
    }
  }
}
