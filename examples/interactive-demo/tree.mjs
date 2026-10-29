const size = (width, height) => ({ width, height });
function text(name, string, x, y, fontSize = 24, width = 500) {
  return { name, position: { x, y, z: 0 }, size: size(width, fontSize + 20), components: [{ type: 'cc.Label', properties: { string, fontSize, lineHeight: fontSize + 6, horizontalAlign: 1, verticalAlign: 1 } }] };
}
function button(name, label, x, y, width = 220) {
  return { name, position: { x, y, z: 0 }, size: size(width, 52), components: [{ type: 'cc.Button', properties: { transition: 3 } }], children: [text('Text', label, 0, 0, 22, width)] };
}
function panel(name, title, children) {
  return { name, active: false, position: { x: 190, y: -5, z: 0 }, size: size(380, 320), children: [text('Title', title, 0, 115, 28, 350), ...children, button('BackButton', 'Back', 0, -115, 170)] };
}
export const demoTree = {
  name: 'InteractiveDemo', size: size(900, 600), components: [{ type: 'cc.Widget', properties: { isAlignHorizontalCenter: true, isAlignVerticalCenter: true, horizontalCenter: 0, verticalCenter: 0 } }], children: [
    text('Title', 'COCOS × MCP', 0, 245, 42, 800),
    text('Subtitle', 'Native scene · typed references · real button events', 0, 193, 18, 850),
    text('Status', 'Ready · click a button', 0, -240, 23, 850),
    button('PlayButton', 'Play / Add score', -260, 80),
    button('SettingsButton', 'Settings', -260, 0),
    button('InventoryButton', 'Inventory', -260, -80),
    panel('SettingsPanel', 'Settings', [text('Description', 'Event binding is working', 0, 20, 19, 350)]),
    panel('InventoryPanel', 'Inventory', Array.from({ length: 6 }, (_, i) => ({ name: `Slot${i + 1}`, position: { x: (i % 3 - 1) * 100, y: 45 - Math.floor(i / 3) * 85, z: 0 }, size: size(80, 65), children: [text('Item', String(i + 1).padStart(2, '0'), 0, 0, 24, 80)] }))),
  ],
};
