'use strict';
// Fixed browser-side adapter. Serialized arguments are data, never script text.
module.exports = async function runtimeBrowser(p) {
  const cc = window.System?.import ? await window.System.import('cc') : window.cc;
  if (!cc?.director?.getScene()) throw new Error('Game engine/scene is not ready.');
  const root = cc.director.getScene(), nodes = [];
  function visit(n, path, depth) {
    if (nodes.length >= 5000 || depth > 100) throw new Error('Runtime hierarchy exceeds supported bounds.');
    nodes.push({ node: n, path });
    for (const child of n.children) visit(child, path ? `${path}/${child.name}` : child.name, depth + 1);
  }
  visit(root, '', 0);
  let matches = nodes.filter(n => n.node.uuid === p.node);
  if (!matches.length) matches = nodes.filter(n => n.path === p.node?.replace(/^\//, '') || n.node.name === p.node);
  if (matches.length !== 1) throw new Error(`Expected one runtime node; found ${matches.length}. Use exact path/UUID.`);
  const { node, path } = matches[0];
  const stateKey = '__cocosMcpRuntimeEvents_v1';
  let session = window[stateKey];
  if (!session || session.scene !== root.uuid) session = window[stateKey] = { scene: root.uuid, events: [], subscriptions: new Set(), sequence: 0 };
  const emit = (kind, data) => { session.events.push({ seq: ++session.sequence, time: Date.now(), node: node.uuid, kind, ...data }); if (session.events.length > 200) session.events.shift(); };
  const vec = v => ({ x: v.x, y: v.y, z: v.z });
  if (p.domain === 'runtime') {
    const anim = node.getComponent(cc.Animation), skeleton = node.getComponent(cc.sp.Skeleton);
    const ui=node.getComponent(cc.UITransform),label=node.getComponent(cc.Label),rich=node.getComponent(cc.RichText);
    const text=label||rich;
    return { scene: root.uuid, uuid: node.uuid, path, name: node.name, active: node.activeInHierarchy, position: vec(node.position), scale: vec(node.scale), eulerAngles: vec(node.eulerAngles),
      components: node.getComponents(cc.Component).map(c => cc.js.getClassName(c)), label: node.getComponent(cc.Label)?.string,
      ui:ui?{size:{width:ui.width,height:ui.height},anchor:{x:ui.anchorX,y:ui.anchorY}}:null,
      text:text?{type:label?'cc.Label':'cc.RichText',preview:text.string.slice(0,160),fontSize:text.fontSize,actualFontSize:label?.actualFontSize,font:text.font?._uuid||null,useSystemFont:text.useSystemFont,fontFamily:text.fontFamily,...(rich?{maxWidth:rich.maxWidth}:{}),scope:'Observed runtime renderer state, not glyph-ink bounds or fallback coverage proof.'}:null,
      animation: anim ? anim.clips.filter(Boolean).map(c => { const s = anim.getState(c.name); return { name: c.name, uuid: c._uuid, time: s?.time, duration: s?.duration, playing: s?.isPlaying, paused: s?.isPaused }; }) : null,
      spine: skeleton ? { animation: skeleton.animation, paused: skeleton.paused, timeScale: skeleton.timeScale, tracks: Array.from({ length: 8 }, (_, i) => { const t = skeleton.getCurrent(i); return t ? { track: i, animation: t.animation?.name, time: t.trackTime, duration: t.animationEnd, loop: t.loop } : null; }).filter(Boolean),
        bones: (p.bones || []).map(name => { const b = skeleton.findBone(name); return b ? { name, x: b.x, y: b.y, rotation: b.rotation, worldX: b.worldX, worldY: b.worldY } : { name, missing: true }; }) } : null,
      events: session.events.filter(e => e.seq > (p.after || 0) && e.node === node.uuid).slice(-(p.limit || 30)), latest: session.sequence };
  }
  if (p.domain === 'animation') {
    const a = node.getComponent(cc.Animation);
    if (!a) throw new Error('Runtime node has no cc.Animation.');
    if (p.clip && !a.clips.some(c => c?.name === p.clip)) throw new Error(`Animation clip not bound: ${p.clip}`);
    if (!session.subscriptions.has(`animation:${node.uuid}`)) {
      for (const event of ['play', 'stop', 'pause', 'resume', 'finished', 'lastframe']) a.on(event, (_type, state) => emit(`animation.${event}`, { clip: state?.name }));
      session.subscriptions.add(`animation:${node.uuid}`);
    }
    if (p.action === 'play') a.play(p.clip);
    else if (p.action === 'crossFade') { if (!p.clip) throw new Error('crossFade requires clip.'); a.crossFade(p.clip, p.fade); }
    else if (p.action === 'sample') {
      const s = a.getState(p.clip || a.defaultClip?.name); if (!s) throw new Error('Animation state not found.');
      s.pause(); s.time = p.time; s.sample();
    } else if (['pause', 'resume', 'stop'].includes(p.action)) a[p.action]();
    else throw new Error('Unsupported runtime animation action.');
    return { uuid: node.uuid, path, action: p.action, runtimeOnly: true, editorSaved: false };
  }
  if (p.domain === 'spine') {
    const s = node.getComponent(cc.sp.Skeleton);
    if (!s?.skeletonData) throw new Error('Runtime node has no configured sp.Skeleton.');
    const data = s.skeletonData.getRuntimeData(true);
    if (!data) throw new Error('Spine runtime skeleton failed to load.');
    if (p.animation && !data.animations.some(a => a.name === p.animation)) throw new Error('Spine animation not found.');
    if (p.skin && !data.skins.some(a => a.name === p.skin)) throw new Error('Spine skin not found.');
    const track = p.track || 0;
    if (p.action === 'play' || p.action === 'queue') {
      if (!p.animation) throw new Error('Spine play/queue requires animation.');
      const entry = p.action === 'play' ? s.setAnimation(track, p.animation, p.loop) : s.addAnimation(track, p.animation, p.loop, p.delay);
      if (!entry) throw new Error('Spine did not return a track entry.');
      // Per-track listeners avoid replacing listeners owned by gameplay scripts.
      s.setTrackCompleteListener(entry, e => emit('spine.complete', { track: e.trackIndex, animation: e.animation?.name }));
      s.setTrackEventListener(entry, (_entry, e) => emit('spine.event', { track, event: e.data?.name, int: e.intValue, float: e.floatValue, string: e.stringValue }));
    } else if (p.action === 'skin') { if (!p.skin) throw new Error('Spine skin is required.'); s.setSkin(p.skin); s.setSlotsToSetupPose(); }
    else if (p.action === 'mix') {
      if (!p.from || !p.to || !data.animations.some(a => a.name === p.from) || !data.animations.some(a => a.name === p.to)) throw new Error('Valid from/to animations are required for mix.');
      s.setMix(p.from, p.to, p.duration);
    } else if (p.action === 'clear') s.clearTrack(track);
    else if (p.action === 'pause' || p.action === 'resume') s.paused = p.action === 'pause';
    else throw new Error('Unsupported runtime Spine action.');
    return { uuid: node.uuid, path, action: p.action, track, runtimeOnly: true, editorSaved: false };
  }
  throw new Error('Unsupported runtime domain.');
};
