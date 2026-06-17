(function(){
  // Device mockups — screen-hole geometry measured from each PNG (transparent cutout).
  const DEVICES={
    ios:    {src:'hand-ios.png',  img:[768,1257], scr:[285,211,373,812]},
    android:{src:'hand-and.png',  img:[778,1258], scr:[285,212,375,812]},
  };
  // iframe logical resolution — 375×812, shared by both devices.
  const VIEWPORT_W=375, VIEWPORT_H=812, PREVIEW_H=VIEWPORT_H;
  const BLEED=1;   // grow the viewport 1px on every side so content tucks under the bezel
  // Mutable geometry for the active device (set by applyDevice).
  let IMG_W,IMG_H,SCR_L,SCR_T,SCR_W,SCR_H,SCR_CX,SCR_CY,DISP_W,DISP_H,FIT;

  const unit=document.getElementById('deviceUnit');
  const mock=document.getElementById('mock');
  const frame=document.getElementById('frame');
  const customCursor=document.getElementById('customCursor');
  const empty=document.getElementById('empty');
  const scene=document.getElementById('scene');
  const drop=document.getElementById('drop');
  const filepill=document.getElementById('filepill');
  const filename=document.getElementById('filename');
  const fileInput=document.getElementById('fileInput');
  const bgInput=document.getElementById('bgInput');
  const resetBtn=document.getElementById('resetBtn');
  const viewportEl=document.querySelector('.viewport');
  const cursorShield=document.getElementById('cursorShield');
  const frameLoader=document.getElementById('frameLoader');

  // Hide loader when iframe finishes loading.
  // Figma is a SPA — 'load' fires when HTML parses, but React + prototype data
  // need extra time to render. 3 s covers most networks; 12 s cap handles slow ones.
  let loaderMaxTimer;
  frame.addEventListener('load', ()=>{
    if(frameLoader.classList.contains('show')){
      clearTimeout(loaderMaxTimer);
      loaderMaxTimer=setTimeout(()=>frameLoader.classList.remove('show'), 3000);
    }
  });

  // Move the custom cursor dot to a viewport coordinate and reveal it.
  function moveCursor(x, y){
    customCursor.style.left = x + 'px';
    customCursor.style.top  = y + 'px';
    customCursor.classList.add('visible');
  }

  // Cross-origin iframe cursor shield.
  // The shield sits over the iframe (pointer-events:auto, cursor:none) so the custom
  // dot keeps tracking and the native cursor stays hidden. To let a click or scroll
  // reach the iframe we briefly drop the shield to pointer-events:none, then restore.
  let shieldRestoreTimer, wheelRestoreTimer;
  function restoreShield(){
    clearTimeout(shieldRestoreTimer);
    if (cursorShield.classList.contains('active')) cursorShield.style.pointerEvents = 'auto';
  }

  // Click: open the shield for the mousedown→mouseup→click chain, then restore.
  cursorShield.addEventListener('pointerdown', e => {
    moveCursor(e.clientX, e.clientY);
    try { cursorShield.releasePointerCapture(e.pointerId); } catch(_) {}
    cursorShield.style.pointerEvents = 'none';
    clearTimeout(shieldRestoreTimer);
    shieldRestoreTimer = setTimeout(restoreShield, 180);
  });
  cursorShield.addEventListener('pointerup', () => requestAnimationFrame(restoreShield));
  frame.addEventListener('mouseleave', restoreShield);
  document.addEventListener('pointerup', () => requestAnimationFrame(restoreShield));

  // Scroll: keep the shield open so every wheel event reaches the iframe; restore
  // 500 ms after the last wheel so cursor tracking resumes once scrolling stops.
  cursorShield.addEventListener('wheel', e => {
    moveCursor(e.clientX, e.clientY);
    cursorShield.style.pointerEvents = 'none';
    clearTimeout(wheelRestoreTimer);
    wheelRestoreTimer = setTimeout(restoreShield, 500);
    scheduleInk();   // content under the status bar may have scrolled → re-check ink
  }, { passive: true });

  // Hide the top-left brand and bottom-left dock while the cursor is over the screen.
  viewportEl.addEventListener('mouseenter', () => document.body.classList.add('screen-hover'));
  viewportEl.addEventListener('mouseleave', () => document.body.classList.remove('screen-hover'));

  // Status bar toggle (bottom-right) — overlay the iPhone status bar on the screen.
  const statusBarToggle=document.getElementById('statusBarToggle');
  const statusBar=document.getElementById('statusBar');
  statusBarToggle.addEventListener('click',()=>{
    const on=document.body.classList.toggle('statusbar-on');
    statusBarToggle.setAttribute('aria-pressed',String(on));
    updateStatusBarInk();
  });

  // Decide the status bar ink (black vs white) from what's actually behind the bar.
  // 1) Read the live colour at the top of the prototype screen (same-origin srcdoc HTML).
  //    A dark box under the bar → white ink; a light area → black ink. Re-runs on scroll.
  // 2) Cross-origin prototypes (e.g. Figma) can't be read → fall back to the scene tone.
  function parseRGB(s){
    const m=String(s).match(/rgba?\(([^)]+)\)/i); if(!m) return null;
    const p=m[1].split(',').map(v=>parseFloat(v));
    return [p[0],p[1],p[2],p.length>3?p[3]:1];
  }
  function frameInkDark(){
    let doc,win;
    try{ doc=frame.contentDocument; win=frame.contentWindow; if(!doc||!doc.body||!win) return null; }
    catch(e){ return null; }   // cross-origin → unreadable
    // Sample the clock (left) and indicators (right) row; skip the centre (notch covers it).
    const pts=[[40,24],[70,24],[300,24],[330,24],[352,24]];
    let sum=0,n=0;
    for(const [x,y] of pts){
      let el; try{ el=doc.elementFromPoint(x,y); }catch(e){ continue; }
      let node=el,rgb=null;
      while(node && node.nodeType===1){
        const c=parseRGB(win.getComputedStyle(node).backgroundColor);
        if(c && c[3]>0){ rgb=c; break; }
        node=node.parentElement;
      }
      if(!rgb) rgb=[255,255,255];   // no opaque bg up the tree → assume the white page
      sum+=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000; n++;
    }
    if(!n) return null;
    return (sum/n)<140;
  }
  // 'auto' = detect from screen content (HTML) or scene tone (Figma); 'light'/'dark' force it.
  const sbInkPop=document.getElementById('sbInkPop');
  const sbInkThumb=document.getElementById('sbInkThumb');
  let statusBarInk='auto';
  // Glide the highlight to the active option (widths vary, so measure each time).
  function moveInkThumb(){
    const act=sbInkPop.querySelector('.sb-ink-opt.is-active'); if(!act) return;
    sbInkThumb.style.width=act.offsetWidth+'px';
    sbInkThumb.style.height=act.offsetHeight+'px';
    sbInkThumb.style.transform='translate('+act.offsetLeft+'px,'+act.offsetTop+'px)';
  }
  function setStatusBarInk(mode){
    statusBarInk=mode;
    sbInkPop.querySelectorAll('.sb-ink-opt').forEach(x=>x.classList.toggle('is-active',x.dataset.ink===mode));
    moveInkThumb();
    updateStatusBarInk();
  }
  sbInkPop.addEventListener('click',e=>{
    const b=e.target.closest('.sb-ink-opt'); if(b) setStatusBarInk(b.dataset.ink);
  });
  // Re-measure when the picker appears (fonts/layout settled) so the first glide is exact.
  document.getElementById('statusBarControl').addEventListener('mouseenter',moveInkThumb);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(moveInkThumb);
  requestAnimationFrame(moveInkThumb);
  function updateStatusBarInk(){
    if(!document.body.classList.contains('statusbar-on')) return;
    let dark;
    if(statusBarInk==='light') dark=false;        // light background → dark icons
    else if(statusBarInk==='dark') dark=true;     // dark background → white icons
    else{                                         // auto
      dark=frameInkDark();
      if(dark===null) dark=document.body.classList.contains('dark');   // fallback: scene tone
    }
    statusBar.classList.toggle('on-dark',!!dark);
  }
  let inkRaf;
  function scheduleInk(){ cancelAnimationFrame(inkRaf); inkRaf=requestAnimationFrame(updateStatusBarInk); }
  // Re-evaluate when the prototype finishes loading and whenever its top scrolls.
  frame.addEventListener('load',()=>{
    setTimeout(updateStatusBarInk,60);
    try{ frame.contentWindow.addEventListener('scroll',scheduleInk,{passive:true}); }catch(e){}
  });

  // Device switch (iOS / Android) — swaps the mockup image and refits the screen hole.
  // A click anywhere on the control switches device: hit a label to pick it directly,
  // or click the active one / empty area to flip to the other. The thumb slides across.
  const deviceSeg=document.getElementById('deviceSeg');
  let currentDevice='ios';
  function setDevice(name){
    if(name===currentDevice) return;
    currentDevice=name;
    deviceSeg.querySelectorAll('.seg-btn').forEach(x=>x.classList.toggle('is-active',x.dataset.device===name));
    deviceSeg.classList.toggle('is-android',name==='android');
    applyDevice(name);
  }
  deviceSeg.addEventListener('click',e=>{
    const b=e.target.closest('.seg-btn');
    // clicking an inactive label picks it; clicking the active one or empty area flips
    const target=(b && b.dataset.device!==currentDevice) ? b.dataset.device
               : (currentDevice==='ios' ? 'android' : 'ios');
    setDevice(target);
  });

  // Apply a device mockup: swap the image, recompute geometry + CSS vars, reflow.
  function applyDevice(name){
    const d=DEVICES[name]; if(!d) return;
    [IMG_W,IMG_H]=d.img;
    [SCR_L,SCR_T,SCR_W,SCR_H]=d.scr;
    SCR_CX=SCR_L+SCR_W/2; SCR_CY=SCR_T+SCR_H/2;
    DISP_W=SCR_W+BLEED*2; DISP_H=SCR_H+BLEED*2;
    // +1px overscan so the iframe fully covers the viewport (no hairline at the edges)
    FIT=Math.max((DISP_W+1)/VIEWPORT_W, (DISP_H+1)/VIEWPORT_H);

    const root=document.documentElement.style;
    root.setProperty('--imgW',IMG_W);   root.setProperty('--imgH',IMG_H);
    root.setProperty('--scrL',SCR_L+'px'); root.setProperty('--scrT',SCR_T+'px');
    root.setProperty('--scrW',SCR_W+'px'); root.setProperty('--scrH',SCR_H+'px');

    mock.src=d.src;

    frame.style.width=VIEWPORT_W+'px';
    frame.style.height=PREVIEW_H+'px';
    frame.style.transform='scale('+FIT+')';
    viewportEl.style.width =DISP_W+'px';
    viewportEl.style.height=DISP_H+'px';
    viewportEl.style.left  =(SCR_L+(SCR_W-DISP_W)/2)+'px';
    viewportEl.style.top   =(SCR_T+(SCR_H-DISP_H)/2)+'px';

    fit();
  }

  // fit the phone in the viewport, centered on the SCREEN (let the wrist bleed off-screen)
  let fitAnimated=false;
  function fit(){
    const s=Math.min((window.innerHeight*0.86)/SCR_H,(window.innerWidth*0.94)/IMG_W);
    const tx=window.innerWidth/2 - s*SCR_CX;
    const ty=window.innerHeight/2 - s*SCR_CY;
    if(!fitAnimated){
      fitAnimated=true;
      unit.style.transition='none';
      unit.style.transform='translate('+tx+'px,'+(ty+window.innerHeight)+'px) scale('+s+')';
      unit.offsetHeight; // force reflow
      setTimeout(()=>{
        unit.style.transition='transform 2.4s cubic-bezier(0.22,1,0.36,1)';
        requestAnimationFrame(()=>{
          unit.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';
          unit.addEventListener('transitionend',()=>{ unit.style.transition='none'; },{once:true});
        });
      },2400);
    } else {
      unit.style.transition='none';
      unit.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';
    }
  }
  applyDevice('ios'); window.addEventListener('resize',fit);

  // brand + dock → 2400ms (hand start) + 2400ms (hand duration) = show UI when hand arrives
  setTimeout(()=>{
    document.querySelector('.brand').classList.remove('ui-hidden');
    document.querySelector('.dock').classList.remove('ui-hidden');
    document.querySelector('.right-dock').classList.remove('ui-hidden');
  },4800);

  let cursorActive=false;
  window.addEventListener("mousemove",e=>{ cursorActive=true; moveCursor(e.clientX,e.clientY); });
  let pressTimer;
  window.addEventListener("mousedown",()=>{
    if(cursorActive){
      customCursor.classList.add("pressed");
      clearTimeout(pressTimer);
      pressTimer=setTimeout(()=>customCursor.classList.remove("pressed"),400);
    }
  });
  window.addEventListener("mouseup",()=>{ clearTimeout(pressTimer); customCursor.classList.remove("pressed"); });

  function attachFrameCursor(){
    try{
      const doc=frame.contentDocument;
      if(!doc) return;
      const style=doc.createElement("style");
      style.textContent="*{cursor:none!important;}";
      doc.head.appendChild(style);
      requestAnimationFrame(()=>{
        const target=doc.querySelector("#root,#__next,body>main:first-of-type,body>div:first-of-type");
        if(!target) return;
        const rect=target.getBoundingClientRect();
        if(!rect.width||!rect.height) return;
        const cover=Math.max(VIEWPORT_W/rect.width,PREVIEW_H/rect.height,1);
        target.style.transformOrigin="center center";
        target.style.transform="scale("+cover+")";
      });
      doc.addEventListener("mousemove",e=>{
        const rect=frame.getBoundingClientRect();
        cursorActive=true;
        const scaleX=rect.width/frame.clientWidth;
        const scaleY=rect.height/frame.clientHeight;
        moveCursor(rect.left + e.clientX*scaleX, rect.top + e.clientY*scaleY);
      });
      doc.addEventListener("mousedown",()=>customCursor.classList.add("pressed"));
      doc.addEventListener("mouseup",()=>customCursor.classList.remove("pressed"));
      doc.addEventListener("mouseleave",()=>customCursor.classList.remove("visible","pressed"));
    }catch(e){}
  }

  let current=null;

  function fixedPreviewHTML(html){
    const fixedStyle="<style data-preview-fixed-height>html,body{width:"+VIEWPORT_W+"px!important;height:"+PREVIEW_H+"px!important;min-height:"+PREVIEW_H+"px!important;margin:0!important;padding:0!important;overflow:hidden!important;}body{position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#fff!important;}body>div:first-of-type,body>main:first-of-type,#root,#__next{width:100%!important;height:100%!important;min-height:100%!important;margin:0!important;padding:0!important;flex:none!important;max-width:none!important;transform-origin:center center!important;overflow:hidden!important;}#root>div:first-child,#__next>div:first-child,body>div:first-of-type>div:first-child{margin:0!important;padding:0!important;}*{cursor:none!important;}</style>";
    return /<\/head>/i.test(html) ? html.replace(/<\/head>/i,fixedStyle+'</head>') : fixedStyle+html;
  }

  function showHTML(html,name){
    frameLoader.classList.remove('show');
    frame.onload=attachFrameCursor;
    frame.srcdoc=fixedPreviewHTML(html);
    cursorShield.classList.remove('active');
    empty.classList.add('hidden');
    resetBtn.disabled=false;
    const cleanName=(name||'Prototype').replace(/\.html?$/i,'');
    current={type:'html',src:html,title:cleanName};
    if(name){filename.textContent=cleanName;filepill.classList.add('show');}
    syncSaveBtn(); syncShareBtn();
  }
  function restartPrototype(){
    if(!current) return;                                  // reload the shown prototype, don't return to selection
    if(current.type==='url') showURL(current.src,current.title);
    else showHTML(current.src,current.title);
  }
  const ringDefault=drop.querySelector('.ring').innerHTML;
  function readHTMLFile(file){
    if(!file) return;
    if(!(file.type==='text/html'||/\.html?$/i.test(file.name))){
      const r=drop.querySelector('.ring'); r.textContent='This is not an HTML file';
      setTimeout(()=>{r.innerHTML=ringDefault;},1400); return;
    }
    const r=new FileReader();
    r.onload=e=>showHTML(e.target.result,file.name);
    r.readAsText(file);
  }

  // drag & drop on whole window
  let depth=0;
  const hasFiles=e=>e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files');
  window.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();depth++;drop.classList.add('show');});
  window.addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault();});
  window.addEventListener('dragleave',e=>{if(!hasFiles(e))return;depth--;if(depth<=0){depth=0;drop.classList.remove('show');}});
  window.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();depth=0;drop.classList.remove('show');readHTMLFile(e.dataTransfer.files[0]);});

  document.getElementById('uploadBtn').addEventListener('click',()=>fileInput.click());
  empty.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',e=>readHTMLFile(e.target.files[0]));
  resetBtn.addEventListener('click',()=>{
    resetBtn.classList.remove('spin');
    void resetBtn.offsetWidth;            // restart the animation on every click
    resetBtn.classList.add('spin');
    restartPrototype();
  });
  resetBtn.addEventListener('animationend',()=>resetBtn.classList.remove('spin'));

  // scenes
  const cls={studio:'scene-studio',living:'scene-living',desk:'scene-desk'};
  // drop the tick from the 3 preset swatches (used whenever a palette color or image takes over)
  const clearPresetTicks=()=>document.querySelectorAll('.sw-studio,.sw-living,.sw-desk').forEach(s=>s.setAttribute('aria-pressed','false'));
  const paletteSwatch=document.querySelector('.sw-palette');
  const palettePopover=document.getElementById('palettePopover');
  const paletteColors=[
    '#f8fafc','#f4f5f4','#e5e7eb','#d1d5db','#9ca3af','#303437',
    '#fff7ed','#fde68a','#fca5a5','#fb7185','#c084fc','#818cf8',
    '#bfdbfe','#7dd3fc','#99f6e4','#86efac','#bbf7d0','#e9d5ff',
    '#fed7aa','#cbd5e1','#64748b','#475569','#334155','#111827'
  ];
  let selectedPaletteColor='#303437';
  let paletteActive=false;   // true when the current scene comes from the palette (not one of the 3 presets)
  function isDarkColor(hex){
    const raw=hex.replace('#','');
    const r=parseInt(raw.slice(0,2),16), g=parseInt(raw.slice(2,4),16), b=parseInt(raw.slice(4,6),16);
    return ((r*299 + g*587 + b*114) / 1000) < 150;
  }
  // Sample the actual brightness of a background image (top band, where the status bar
  // sits) and report whether it's dark, so the status bar / chrome ink can adapt
  // automatically instead of relying on a hand-set flag. Falls back to dark on errors.
  function detectImageDark(url,cb){
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      try{
        const w=40,h=40,c=document.createElement('canvas');
        c.width=w; c.height=h;
        const ctx=c.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const band=Math.max(1,Math.round(h*0.3));   // top ~30% = where the status bar lives
        const d=ctx.getImageData(0,0,w,band).data;
        let sum=0,n=0;
        for(let i=0;i<d.length;i+=4){ sum+=(d[i]*299+d[i+1]*587+d[i+2]*114)/1000; n++; }
        cb((sum/n)<150);
      }catch(err){ cb(true); }   // cross-origin / tainted canvas → assume dark (safe default)
    };
    img.onerror=()=>cb(true);
    img.src=url;
  }
  function applyBgDark(url){ detectImageDark(url,dark=>{ document.body.classList.toggle('dark',dark); updateStatusBarInk(); }); }
  function setSolidScene(color,fromHex){
    selectedPaletteColor=color;
    if(!fromHex && typeof hexInput!=='undefined' && hexInput) hexInput.value=color.replace(/^#/,'');
    scene.className='';
    scene.style.backgroundImage='none';
    scene.style.backgroundColor=color;
    selectedBg=null; customSwatch.classList.remove('has-image');
    paletteSwatch.classList.add('has-color');
    paletteActive=true;
    // a palette color is now active → drop the tick from the 3 preset swatches
    clearPresetTicks();
    syncPaletteTicks();
    document.body.classList.toggle('dark',isDarkColor(color));
    updateStatusBarInk();
  }
  // tick the matching popover color only when a palette color is the active scene
  function syncPaletteTicks(){
    palettePopover.querySelectorAll('.palette-color').forEach(btn=>btn.setAttribute('aria-pressed',String(paletteActive && btn.dataset.color===selectedPaletteColor)));
  }
  function positionPalette(){
    const rect=paletteSwatch.getBoundingClientRect();
    const pop=palettePopover.getBoundingClientRect();
    const x=Math.min(Math.max(rect.left + rect.width/2, pop.width/2 + 8), window.innerWidth - pop.width/2 - 8);
    palettePopover.style.left=x+'px';                    // horizontal: centered over the swatch (as before)
    const dr=document.querySelector('.dock').getBoundingClientRect();
    palettePopover.style.bottom=(window.innerHeight - dr.top + 6)+'px';  // vertical: 6px above the dock — same gap as the gallery sheet
  }
  function openPalette(){
    closeBg();                                           // only one popover open at a time
    syncPaletteTicks();                                  // no tick if a preset color is active
    positionPalette();                                   // place it first (still invisible)
    requestAnimationFrame(()=>palettePopover.classList.add('open'));  // then fade + slide in
  }
  function closePalette(){
    palettePopover.classList.remove('open');
  }
  palettePopover.innerHTML=paletteColors.map(color=>'<button class="palette-color" type="button" data-color="'+color+'" aria-pressed="'+String(color===selectedPaletteColor)+'" title="'+color+'" style="background:'+color+';--chk:'+(isDarkColor(color)?'#fff':'#1f1c19')+'"></button>').join('')
    +'<div class="palette-hex"><span>#</span><input class="palette-hex-input" type="text" maxlength="6" spellcheck="false" placeholder="hex code" aria-label="Hex color" value="'+selectedPaletteColor.replace(/^#/,'')+'"><button class="palette-rand" type="button" title="Random color" aria-label="Random color"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none"/></svg></button></div>';
  const hexInput=palettePopover.querySelector('.palette-hex-input');
  function normHex(v){
    v=v.trim().replace(/^#/,'');
    if(/^[0-9a-fA-F]{3}$/.test(v)) v=v.split('').map(c=>c+c).join('');
    return /^[0-9a-fA-F]{6}$/.test(v) ? '#'+v.toLowerCase() : null;
  }
  // starting to type clears the previous code and begins fresh
  let hexFresh=false;
  hexInput.addEventListener('focus',()=>{ hexFresh=true; hexInput.select(); });
  hexInput.addEventListener('blur',()=>{ hexFresh=false; });
  hexInput.addEventListener('beforeinput',e=>{
    if(hexFresh && e.inputType && e.inputType.indexOf('insert')===0){ hexInput.value=''; hexFresh=false; }
  });
  hexInput.addEventListener('input',()=>{
    const hex=normHex(hexInput.value);
    if(hex) setSolidScene(hex,true);   // live preview; keep the field focused
  });
  // pleasant random color via HSL (controlled saturation/lightness)
  function hslToHex(h,s,l){
    s/=100; l/=100;
    const k=n=>(n+h/30)%12;
    const a=s*Math.min(l,1-l);
    const f=n=>{const c=l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return Math.round(255*c).toString(16).padStart(2,'0');};
    return '#'+f(0)+f(8)+f(4);
  }
  function randomNiceHex(){
    const h=Math.floor(Math.random()*360);
    const s=55+Math.floor(Math.random()*25);   // 55–80%
    const l=58+Math.floor(Math.random()*20);   // 58–78%
    return hslToHex(h,s,l);
  }
  const diceBtn=palettePopover.querySelector('.palette-rand');
  diceBtn.addEventListener('click',()=>{
    const hex=randomNiceHex();
    hexInput.value=hex.replace(/^#/,'');
    setSolidScene(hex,true);
  });
  // dice faces — standard pip layouts; cycle the face after each flip so it lands on a new number
  const diceSvg=diceBtn.querySelector('svg');
  const PIPS={
    1:[[12,12]],
    2:[[8,8],[16,16]],
    3:[[8,8],[12,12],[16,16]],
    4:[[8,8],[16,8],[8,16],[16,16]],
    5:[[8,8],[16,8],[12,12],[8,16],[16,16]],
    6:[[8,8],[16,8],[8,12],[16,12],[8,16],[16,16]]
  };
  const DICE_MS=2200, DICE_SPIN_DONE=0.58;   // must match the diceRoll animation (duration + when rotation completes)
  let diceFace=5, diceTimer;
  function renderDice(face){
    diceFace=face;
    const dots=PIPS[face].map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.3" fill="currentColor" stroke="none"/>').join('');
    diceSvg.innerHTML='<rect x="3" y="3" width="18" height="18" rx="4"/>'+dots;
  }
  function randomFace(){ let f; do{ f=1+Math.floor(Math.random()*6); }while(f===diceFace); return f; }   // random, never the same twice in a row
  renderDice(5);
  // schedule the face swap for the exact moment each flip finishes (rotation complete)
  function scheduleRoll(){ clearTimeout(diceTimer); diceTimer=setTimeout(()=>renderDice(randomFace()), DICE_MS*DICE_SPIN_DONE); }
  diceBtn.addEventListener('animationstart',scheduleRoll);
  diceBtn.addEventListener('animationiteration',scheduleRoll);
  diceBtn.addEventListener('animationcancel',()=>clearTimeout(diceTimer));
  palettePopover.addEventListener('click',e=>{
    const colorBtn=e.target.closest('.palette-color'); if(!colorBtn) return;
    setSolidScene(colorBtn.dataset.color);
    closePalette();
  });
  // Apply one of the 3 preset scenes (studio/living/desk) and sync the swatch tick.
  function setPresetScene(name){
    if(!cls[name]) return;
    document.querySelectorAll('.swatch').forEach(s=>s.setAttribute('aria-pressed','false'));
    const sw=document.querySelector('.sw-'+name); if(sw) sw.setAttribute('aria-pressed','true');
    closePalette(); closeBg();
    scene.style.backgroundImage='none'; scene.className=cls[name];
    scene.style.backgroundColor='';
    selectedBg=null; customSwatch.classList.remove('has-image');
    paletteSwatch.classList.remove('has-color');
    paletteActive=false; syncPaletteTicks();   // a preset is active → no palette tick
    document.body.classList.remove('dark');
    updateStatusBarInk();
  }
  document.getElementById('scenes').addEventListener('click',e=>{
    const b=e.target.closest('.swatch'); if(!b) return;
    const name=b.dataset.scene;
    // palette / custom are popover openers — they must not clear the active preset's tick
    if(name==='custom'){bgPopover.classList.contains('open')?closeBg():openBg();return;}
    if(name==='palette'){palettePopover.classList.contains('open')?closePalette():openPalette();return;}
    setPresetScene(name);
  });
  window.addEventListener('resize',()=>{
    if(palettePopover.classList.contains('open')) positionPalette();
    if(bgPopover.classList.contains('open')) positionBg();
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closePalette(); closeBg(); } });
  document.addEventListener('click',e=>{
    if(palettePopover.classList.contains('open') && !e.target.closest('#palettePopover') && !e.target.closest('.sw-palette')) closePalette();
    if(bgPopover.classList.contains('open') && !e.target.closest('#bgPopover') && !e.target.closest('.sw-custom')) closeBg();
  });
  bgInput.addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    selectedBg=null;
    const url=URL.createObjectURL(f);
    scene.className=''; scene.style.backgroundImage='url('+url+')';
    applyBgDark(url);   // auto: light image → dark ink, dark image → white ink
    customSwatch.classList.add('has-image');
    clearPresetTicks();
    paletteSwatch.classList.remove('has-color');
    paletteActive=false; syncPaletteTicks();
  });

  // ---- background images (ready-made + upload) ----
  const customSwatch=document.querySelector('.sw-custom');
  const bgPopover=document.getElementById('bgPopover');
  // Ready-made background images — add your own here ({src, dark}). dark:true uses light UI chrome over the image.
  const presetBackgrounds=[
    { src:'home.png', dark:false },
  ];
  let selectedBg=null;
  function applyBackground(src,dark){
    selectedBg=src;
    scene.className=''; scene.style.backgroundColor='';
    scene.style.backgroundImage='url("'+src+'")';
    document.body.classList.toggle('dark',dark!==false);   // instant default from the flag…
    applyBgDark(src);   // …then refine from the image's real brightness
    customSwatch.classList.add('has-image');
    clearPresetTicks();
    paletteSwatch.classList.remove('has-color');
    paletteActive=false; syncPaletteTicks();
    renderBgTiles();
  }
  function renderBgTiles(){
    const tiles=presetBackgrounds.map(bg=>'<button class="bg-tile" type="button" data-src="'+bg.src+'" data-dark="'+(bg.dark!==false)+'" aria-pressed="'+String(bg.src===selectedBg)+'" style="background-image:url(\''+bg.src+'\')"></button>').join('');
    const empty=presetBackgrounds.length?'':'<div class="bg-empty">No preset images yet — add your own</div>';
    const upload='<button class="bg-tile bg-upload" type="button" id="bgUploadTile" title="Upload your own image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L8 7m4-4l4 4"/><path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></button>';
    bgPopover.innerHTML=empty+tiles+upload;
  }
  function positionBg(){
    const rect=customSwatch.getBoundingClientRect();
    const pw=bgPopover.getBoundingClientRect().width||238;
    const x=Math.min(Math.max(rect.left+rect.width/2, pw/2+8), window.innerWidth-pw/2-8);
    bgPopover.style.left=x+'px';
    const dr=document.querySelector('.dock').getBoundingClientRect();
    bgPopover.style.bottom=(window.innerHeight-dr.top+6)+'px';   // same offset as the gallery sheet / palette
  }
  function openBg(){ closePalette(); renderBgTiles(); positionBg(); requestAnimationFrame(()=>bgPopover.classList.add('open')); }
  function closeBg(){ bgPopover.classList.remove('open'); }
  bgPopover.addEventListener('click',e=>{
    if(e.target.closest('#bgUploadTile')){ closeBg(); bgInput.click(); return; }
    const tile=e.target.closest('.bg-tile'); if(!tile) return;
    applyBackground(tile.dataset.src, tile.dataset.dark!=='false');
    closeBg();
  });
  // hovering a different dock button closes an open popover so its tooltip stays readable
  document.querySelector('.dock').addEventListener('mouseover',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    if(palettePopover.classList.contains('open') && !btn.classList.contains('sw-palette')) closePalette();
    if(bgPopover.classList.contains('open') && !btn.classList.contains('sw-custom')) closeBg();
  });

  // ---- prototype gallery ----
  function showURL(url,title){
    frame.onload=null;
    clearTimeout(loaderMaxTimer);
    frameLoader.classList.add('show');
    loaderMaxTimer=setTimeout(()=>frameLoader.classList.remove('show'), 12000);
    frame.removeAttribute('srcdoc'); frame.src=displaySrcFor({type:'url',src:url});
    cursorShield.classList.add('active');
    empty.classList.add('hidden'); resetBtn.disabled=false;
    current={type:'url',src:url,title:title||url};
    filename.textContent=title||url; filepill.classList.add('show');
    syncSaveBtn(); syncShareBtn();
  }

  const sheet=document.getElementById('sheet');
  const galGrid=document.getElementById('galGrid');
  const galEmpty=document.getElementById('galEmpty');
  const galInput=document.getElementById('galInput');
  const galAdd=document.getElementById('galAdd');
  const syncGalAdd=()=>{ galAdd.disabled=!galInput.value.trim(); };

  const store={
    async get(k){
      try{ if(window.storage){const r=await window.storage.get(k,false);return r?r.value:null;} }catch(e){}
      try{ return localStorage.getItem(k); }catch(e){}
      return null;
    },
    async set(k,v){
      try{ if(window.storage) await window.storage.set(k,v,false); }catch(e){}
      try{ localStorage.setItem(k,v); }catch(e){}
    }
  };
  let items=[];
  const persist=()=>store.set('gallery',JSON.stringify(items));

  function figmaEmbedURL(url){
    try{
      const u=new URL(url);
      if(!/(^|\.)figma\.com$/i.test(u.hostname)) return null;
      if(u.pathname.startsWith('/embed')) return url;
      return 'https://www.figma.com/embed?embed_host=premock&url='+encodeURIComponent(url);
    }catch(e){
      return null;
    }
  }
  function displaySrcFor(it){
    if(it.type!=='url') return it.src;
    return it.embedSrc||figmaEmbedURL(it.src)||it.src;
  }
  // pull the prototype name out of a Figma url slug: /proto/KEY/My-Prototype-Name
  function decodeName(s){
    if(!s) return s;
    try{ s=decodeURIComponent(s); }catch(e){}   // %26 -> &, etc.
    const ta=document.createElement('textarea'); ta.innerHTML=s; return ta.value;  // &amp; -> &
  }
  // Figma's URL slug drops symbols like & (B&M App -> .../B-M-App), so the real
  // file name can only come from Figma's oEmbed API. Falls back silently on error.
  async function fetchFigmaName(url){
    try{
      const r=await fetch('https://www.figma.com/api/oembed?url='+encodeURIComponent(url));
      if(!r.ok) return null;
      const j=await r.json();
      const name=j&&j.title?decodeName(String(j.title)).trim():'';
      return name||null;
    }catch(e){ return null; }
  }
  function refreshFigmaTitle(it){
    if(it.oembed || !(it.provider==='figma'||figmaEmbedURL(it.src))) return;
    fetchFigmaName(it.src).then(name=>{
      it.oembed=true;
      if(name && name!==it.title && items.includes(it)){ it.title=capTitle(name); persist(); render(); }
      else persist();
    });
  }
  function figmaTitle(url){
    try{
      const u=new URL(url);
      if(!/(^|\.)figma\.com$/i.test(u.hostname)) return null;
      const segs=u.pathname.split('/').filter(Boolean);
      if(segs.length<3 || !/^(proto|file|design|board)$/i.test(segs[0])) return null;
      const name=decodeName(segs[2]).replace(/-+/g,' ').trim();
      return name||null;
    }catch(e){ return null; }
  }
  function capTitle(s,n=40){ return (s && s.length>n) ? s.slice(0,n-1).trimEnd()+'…' : s; }
  function classify(raw){
    raw=raw.trim(); if(!raw) return null;
    if(/^https?:\/\//i.test(raw)){
      const embedSrc=figmaEmbedURL(raw);
      return embedSrc ? {type:'url',src:raw,embedSrc:embedSrc,provider:'figma',title:capTitle(figmaTitle(raw))} : {type:'url',src:raw};
    }
    if(raw.includes('<')) return {type:'html',src:raw};
    return null;
  }
  function titleFor(it,i=0){
    if(it.title) return it.title;
    if(it.provider==='figma'||figmaEmbedURL(it.src)) return 'Figma prototype '+(i+1);
    if(it.type==='url'){ try{const u=new URL(it.src);return (u.hostname.replace(/^www\./,'')+u.pathname).slice(0,42)||it.src;}catch(e){return it.src.slice(0,42);} }
    return 'Prototype '+(i+1);
  }
  function openItem(it){
    if(it.type==='url') showURL(it.src,titleFor(it));
    else showHTML(it.src,titleFor(it));
    closeSheet();
  }
  function render(){
    galGrid.innerHTML='';
    galEmpty.style.display=items.length?'none':'block';
    items.forEach((it,i)=>{
      const card=document.createElement('button'); card.className='protocard'; card.type='button';
      const thumb=document.createElement('div'); thumb.className='thumb';
      const f=document.createElement('iframe');
      f.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups');
      if(it.type==='url') f.src=displaySrcFor(it); else f.srcdoc=it.src;
      thumb.appendChild(f);
      const badge=document.createElement('span'); badge.className='badge';
      badge.textContent=(it.provider==='figma'||figmaEmbedURL(it.src))?'figma':(it.type==='url'?'link':'html');
      thumb.appendChild(badge);
      const rm=document.createElement('button'); rm.className='premove'; rm.type='button'; rm.textContent='×'; rm.title='Remove';
      rm.addEventListener('click',e=>{e.stopPropagation();items.splice(i,1);persist();render();});
      const t=document.createElement('span'); t.className='ptitle'; t.textContent=decodeName(titleFor(it,i));
      const ed=document.createElement('button'); ed.className='pedit'; ed.type='button'; ed.title='Rename';
      ed.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
      ed.addEventListener('click',e=>{ e.stopPropagation(); startRename(it,t); });
      const trow=document.createElement('div'); trow.className='trow'; trow.appendChild(t); trow.appendChild(ed);
      card.appendChild(thumb); card.appendChild(rm); card.appendChild(trow);
      card.addEventListener('click',()=>openItem(it));
      galGrid.appendChild(card);
    });
    syncSaveBtn();
  }
  function startRename(it,span){
    const input=document.createElement('input'); input.type='text'; input.className='ptitle prename';
    input.value=span.textContent; span.replaceWith(input);
    input.focus(); input.select();
    let done=false;
    const commit=keep=>{
      if(done) return; done=true;
      if(keep){ const v=input.value.trim(); if(v){ it.title=v; it.oembed=true; persist(); } }  // oembed flag: keep manual name, don't let Figma overwrite it
      render();
    };
    input.addEventListener('click',e=>e.stopPropagation());
    input.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') commit(true); else if(e.key==='Escape') commit(false); });
    input.addEventListener('blur',()=>commit(true));
  }
  function addFromInput(){
    const it=classify(galInput.value);
    if(!it){ galInput.style.borderColor='#e36a5b'; setTimeout(()=>galInput.style.borderColor='',1200); return; }
    items.unshift(it); galInput.value=''; syncGalAdd(); persist(); render(); refreshFigmaTitle(it);
  }
  function syncSheet(){
    const dr=dock.getBoundingClientRect();
    sheet.style.width=dr.width+'px';
    sheet.style.bottom=(window.innerHeight-dr.top+6)+'px';
  }
  function openSheet(){ syncSheet(); sheet.classList.add('open'); }
  function closeSheet(){ sheet.classList.remove('open'); }
  window.addEventListener('resize', ()=>{ if(sheet.classList.contains('open')) syncSheet(); });

  document.getElementById('galleryBtn').addEventListener('click',()=>{ sheet.classList.contains('open')?closeSheet():openSheet(); });
  galAdd.addEventListener('click',addFromInput);
  galInput.addEventListener('input',syncGalAdd);
  galInput.addEventListener('keydown',e=>{ if(e.key==='Enter') addFromInput(); });
  syncGalAdd();
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && sheet.classList.contains('open')) closeSheet(); });
  document.addEventListener('click',e=>{ if(sheet.classList.contains('open') && !sheet.contains(e.target) && !e.target.closest('#galleryBtn') && !e.target.closest('#guidePop')) closeSheet(); });

  // Fixed example prototype — shown in the gallery by default (before anything is saved).
  const DEFAULT_ITEMS=[
    {...classify('https://www.figma.com/proto/vTmm4cHysm2Wjmtadi6fcL/B-M---App?node-id=547-3831&viewport=1057%2C511%2C0.28&t=S724q85d7QmIdY3U-8&scaling=scale-down-width&content-scaling=fixed&starting-point-node-id=547%3A3831&show-proto-sidebar=1&page-id=533%3A5123&hide-ui=1'), title:'Example', oembed:true}
  ].filter(it=>it.type);
  (async()=>{
    const saved=await store.get('gallery');
    if(saved){ try{items=JSON.parse(saved)||[];}catch(e){} }
    // Ensure the fixed example is always present in the gallery (even after a prior save).
    DEFAULT_ITEMS.forEach(def=>{ if(!items.some(it=>it.src===def.src)) items.unshift(def); });
    render(); items.forEach(refreshFigmaTitle);
  })();

  // save / remove the currently shown prototype to the gallery
  const saveBtn=document.getElementById('saveBtn');
  function currentInGallery(){
    return !!current && items.some(it=>it.type===current.type && it.src===current.src);
  }
  function syncSaveBtn(){
    if(!current) return;
    const exists=currentInGallery();
    saveBtn.classList.toggle('done', exists);
    saveBtn.title = exists ? 'In gallery — click to remove' : 'Save to gallery';
  }

  // ---- share link: reproduce the current Figma prototype + background + device on open ----
  const shareBtn=document.getElementById('shareBtn');
  // Share is only meaningful for Figma links (HTML pasted/uploaded prototypes aren't URL-addressable).
  function syncShareBtn(){
    shareBtn.hidden = !(current && current.type==='url' && !!figmaEmbedURL(current.src));
  }
  // Serialize the active background: solid color (c:), preset image (i:) or one of the 3 scenes (s:).
  function getBgState(){
    if(paletteActive) return 'c:'+selectedPaletteColor.replace(/^#/,'');
    if(selectedBg) return 'i:'+selectedBg;
    const m=(scene.className||'').match(/scene-(\w+)/);
    return m ? 's:'+m[1] : 's:studio';
  }
  function applyBgState(s){
    if(!s) return;
    const v=s.slice(2);
    if(s.indexOf('c:')===0){ setSolidScene(/^#/.test(v)?v:'#'+v); }
    else if(s.indexOf('i:')===0){ const bg=presetBackgrounds.find(b=>b.src===v); applyBackground(v, bg?bg.dark!==false:true); }
    else if(s.indexOf('s:')===0){ setPresetScene(v); }
  }
  function buildShareLink(){
    const p=new URLSearchParams();
    p.set('proto', current.src);
    if(current.title) p.set('title', current.title);
    p.set('device', currentDevice);
    if(document.body.classList.contains('statusbar-on')) p.set('statusbar','1');
    if(statusBarInk!=='auto') p.set('sbink', statusBarInk);
    p.set('bg', getBgState());
    return location.origin+location.pathname+'?'+p.toString();
  }
  const ICON_SHARE=shareBtn.innerHTML;
  const ICON_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 9 17 19.5 6.5"/></svg>';
  const copiedLabel=filepill.querySelector('.copied-label');
  let shareResetTimer, nameW=0, labelW=0;
  shareBtn.addEventListener('click',async()=>{
    if(!current) return;
    const link=buildShareLink();
    // Lock the real pixel widths so the name collapses and the label expands over the FULL
    // duration in sync — animating max-width between content-sized values avoids the dead-zone
    // wobble (pill ballooning) you get when max-width travels far past the actual content width.
    nameW=filename.scrollWidth; labelW=copiedLabel.scrollWidth||110;
    filename.style.maxWidth=nameW+'px'; copiedLabel.style.maxWidth='0px';
    void filepill.offsetWidth;                 // commit the start widths before transitioning
    // show feedback immediately — don't gate the UI on the clipboard promise resolving
    filepill.classList.add('is-copied');
    filename.style.maxWidth='0px'; copiedLabel.style.maxWidth=labelW+'px';
    shareBtn.classList.add('copied'); shareBtn.innerHTML=ICON_CHECK; shareBtn.title='Link copied!';
    clearTimeout(shareResetTimer);
    shareResetTimer=setTimeout(()=>{
      filepill.classList.remove('is-copied');
      filename.style.maxWidth=nameW+'px'; copiedLabel.style.maxWidth='0px';   // animate back in sync
      setTimeout(()=>{ filename.style.maxWidth=''; copiedLabel.style.maxWidth=''; },420);   // release the locks after the (delayed) fade-in completes
      shareBtn.classList.remove('copied'); shareBtn.innerHTML=ICON_SHARE; shareBtn.title='Copy share link';
    },1600);
    try{ await navigator.clipboard.writeText(link); }
    catch(e){ const ta=document.createElement('textarea'); ta.value=link; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(_){} ta.remove(); }
  });
  // Restore shared state on load (?proto=…): device → background → status bar → open prototype.
  function applyShared(){
    const q=new URLSearchParams(location.search);
    const proto=q.get('proto'); if(!proto) return;
    if(q.get('device')==='android') setDevice('android');
    applyBgState(q.get('bg'));
    if(q.get('statusbar')==='1'){ document.body.classList.add('statusbar-on'); statusBarToggle.setAttribute('aria-pressed','true'); }
    { const ink=q.get('sbink'); if(ink==='light'||ink==='dark') setStatusBarInk(ink); }
    showURL(proto, q.get('title')||undefined);
  }

  // yes / no confirm popup
  const confirmPop=document.getElementById('confirmPop');
  const confirmMsg=document.getElementById('confirmMsg');
  let confirmResolve=null;
  function askConfirm(msg){
    confirmMsg.textContent=msg;
    confirmPop.classList.add('open');
    return new Promise(res=>{ confirmResolve=res; });
  }
  function closeConfirm(val){
    confirmPop.classList.remove('open');
    if(confirmResolve){ confirmResolve(val); confirmResolve=null; }
  }
  // Figma guide popup
  const guidePop=document.getElementById('guidePop');
  const openGuide=()=>guidePop.classList.add('open');
  const closeGuide=()=>guidePop.classList.remove('open');
  document.getElementById('guideLink').addEventListener('click',e=>{ e.stopPropagation(); openGuide(); });
  document.getElementById('guideClose').addEventListener('click',closeGuide);
  guidePop.addEventListener('click',e=>{ if(e.target===guidePop) closeGuide(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && guidePop.classList.contains('open')) closeGuide(); });

  document.getElementById('confirmYes').addEventListener('click',()=>closeConfirm(true));
  document.getElementById('confirmNo').addEventListener('click',()=>closeConfirm(false));
  confirmPop.addEventListener('click',e=>{ if(e.target===confirmPop) closeConfirm(false); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && confirmPop.classList.contains('open')) closeConfirm(false); });

  saveBtn.addEventListener('click',async()=>{
    if(!current) return;
    if(currentInGallery()){
      const ok=await askConfirm('Remove from gallery?');
      if(!ok) return;
      items=items.filter(it=>!(it.type===current.type && it.src===current.src));
    }else{
      items.unshift({type:current.type,src:current.src,title:current.title});
    }
    persist(); render(); syncSaveBtn();
  });

  // fullscreen / presentation mode
  const fullBtn=document.getElementById('fullBtn');
  const dock=document.querySelector('.dock');
  const ICON_EXPAND='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>';
  const ICON_COMPRESS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M16 21v-3a2 2 0 0 1 2-2h3M8 21v-3a2 2 0 0 0-2-2H3"/></svg>';
  const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
  fullBtn.addEventListener('click',()=>{
    if(!fsEl()){
      const el=document.documentElement;
      (el.requestFullscreen||el.webkitRequestFullscreen).call(el);
    }else{
      (document.exitFullscreen||document.webkitExitFullscreen).call(document);
    }
  });
  let idle=null;
  function armIdle(){
    clearTimeout(idle); dock.classList.remove('idle');
    idle=setTimeout(()=>{ if(fsEl()) dock.classList.add('idle'); },2600);
  }
  function onFs(){
    const on=!!fsEl();
    document.body.classList.toggle('present',on);
    fullBtn.innerHTML=on?ICON_COMPRESS:ICON_EXPAND;
    fullBtn.setAttribute('data-tip',on?'Exit Full Screen':'Full Screen');
    fullBtn.setAttribute('aria-pressed',String(on));
    if(on) armIdle();
    else { clearTimeout(idle); dock.classList.remove('idle'); }
  }
  document.addEventListener('mousemove',()=>{ if(fsEl()) armIdle(); });
  document.addEventListener('fullscreenchange',onFs);
  document.addEventListener('webkitfullscreenchange',onFs);

  // screen recording — capture the tab/screen with MediaRecorder, download the clip on stop
  const recBtn=document.getElementById('recBtn');
  const ICON_REC='<svg viewBox="0 0 24 24" fill="none"><path d="M12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>';
  const ICON_STOP='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
  // hover popover: recording label + microphone-audio opt-in checkbox
  const recPop=document.getElementById('recPop');
  const recPopTitle=document.getElementById('recPopTitle');
  const recAudioToggle=document.getElementById('recAudioToggle');
  let recPopTimer;
  function positionRecPop(){
    const r=recBtn.getBoundingClientRect();
    recPop.style.left=(r.left+r.width/2)+'px';
    recPop.style.bottom=(window.innerHeight-r.top+10)+'px';   // sit just above the button
  }
  function showRecPop(){ clearTimeout(recPopTimer); positionRecPop(); recPop.classList.add('open'); }
  function hideRecPop(){ recPopTimer=setTimeout(()=>recPop.classList.remove('open'),120); }  // small grace so you can move onto the popover
  recBtn.addEventListener('mouseenter',showRecPop);
  recBtn.addEventListener('mouseleave',hideRecPop);
  recPop.addEventListener('mouseenter',()=>clearTimeout(recPopTimer));
  recPop.addEventListener('mouseleave',hideRecPop);
  window.addEventListener('resize',()=>{ if(recPop.classList.contains('open')) positionRecPop(); });

  let mediaRecorder=null, recChunks=[], recStream=null, recMic=null;
  function recUI(on){
    recBtn.classList.toggle('is-rec',on);
    recBtn.setAttribute('aria-pressed',String(on));
    recBtn.innerHTML=on?ICON_STOP:ICON_REC;
    recPopTitle.textContent=on?'Stop & download':'Record Presentation';
    recAudioToggle.disabled=on;   // can't change the audio choice mid-recording
  }
  async function startRec(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia||typeof MediaRecorder==='undefined'){
      alert('Screen recording is not supported in this browser.'); return;
    }
    const wantAudio=recAudioToggle.checked;
    try{
      // selfBrowserSurface:'include' → Chrome hides the calling tab by default; this lets you pick this very tab
      recStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false,selfBrowserSurface:'include',preferCurrentTab:true});
    }catch(e){ return; }   // user cancelled the picker
    // when opted in, capture the microphone and mix its audio into the recording
    recMic=null;
    let tracks=recStream.getVideoTracks();
    if(wantAudio){
      try{
        recMic=await navigator.mediaDevices.getUserMedia({audio:true});
        tracks=tracks.concat(recMic.getAudioTracks());
      }catch(e){ recMic=null; }   // mic denied/unavailable → fall back to video only
    }
    const recordStream=recMic ? new MediaStream(tracks) : recStream;
    recChunks=[];
    const candidates=wantAudio
      ? ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
      : ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const mime=candidates.find(t=>MediaRecorder.isTypeSupported(t))||'video/webm';
    mediaRecorder=new MediaRecorder(recordStream,{mimeType:mime});
    mediaRecorder.ondataavailable=e=>{ if(e.data&&e.data.size) recChunks.push(e.data); };
    mediaRecorder.onstop=()=>{
      const blob=new Blob(recChunks,{type:'video/webm'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download='premock-'+Date.now()+'.webm';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      if(recStream){ recStream.getTracks().forEach(t=>t.stop()); recStream=null; }
      if(recMic){ recMic.getTracks().forEach(t=>t.stop()); recMic=null; }
      mediaRecorder=null; recUI(false);
    };
    // user can also end sharing from the browser's own bar → stop the recorder
    recStream.getVideoTracks()[0].addEventListener('ended',stopRec);
    mediaRecorder.start();
    recUI(true);
  }
  function stopRec(){ if(mediaRecorder && mediaRecorder.state!=='inactive') mediaRecorder.stop(); }
  recBtn.addEventListener('click',()=>{ (mediaRecorder && mediaRecorder.state==='recording') ? stopRec() : startRec(); });

  // open a shared prototype (?proto=…) once everything is wired up
  applyShared();
})();
