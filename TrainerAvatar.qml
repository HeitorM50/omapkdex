import QtQuick
Item {
  id: root
  property string avatarKey: "pokeball"
  implicitWidth: 28
  implicitHeight: 28
  Accessible.role: Accessible.Graphic
  Accessible.name: avatarKey === "greatball" ? "Great Ball avatar" : avatarKey === "ultraball" ? "Ultra Ball avatar" : "Poké Ball avatar"
  onAvatarKeyChanged: art.requestPaint()
  Canvas {
    id: art; anchors.fill: parent
    onPaint: {
      var c = getContext("2d"), size = Math.min(width, height), r = size * 0.44, x = width/2, y = height/2
      c.reset(); c.lineWidth = Math.max(1, size*0.06); c.strokeStyle = "#242424"
      c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fillStyle = "#eee5d5"; c.fill(); c.stroke()
      c.beginPath(); c.arc(x,y,r,Math.PI,Math.PI*2); c.closePath()
      c.fillStyle = root.avatarKey === "greatball" ? "#4a9eff" : root.avatarKey === "ultraball" ? "#f5c542" : "#e76a64"; c.fill(); c.stroke()
      c.beginPath(); c.arc(x,y,r*0.24,0,Math.PI*2); c.fillStyle = "#eee5d5"; c.fill(); c.stroke()
    }
  }
}
