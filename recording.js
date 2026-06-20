// PreMock — screen recording + scene capture.
//
// A self-contained subsystem: it owns its own DOM (the Record / Capture buttons and the
// record popover) and shares no state with app.js, so it lives in its own file. It talks
// to the rest of the app only through the DOM — `body.capturing` hides the chrome for a
// clean shot — and the live recording stream is reused for a capture when one is running,
// so the browser only prompts once.
(function(){
  // ---- screen recording — capture the tab/screen with MediaRecorder, download the clip on stop ----
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

  // ---- snapshot — grab a single frame of the scene (UI chrome hidden) and download it as PNG ----
  // the prototype lives in a (possibly cross-origin) iframe, so we capture via a display
  // stream rather than html2canvas; reuse the live recording stream when one exists to
  // avoid a second picker prompt.
  const shotBtn=document.getElementById('shotBtn');
  async function captureShot(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){
      alert('Image capture is not supported in this browser.'); return;
    }
    let stream, reuse=false;
    if(mediaRecorder && mediaRecorder.state==='recording' && recStream){ stream=recStream; reuse=true; }
    else{
      try{ stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false,selfBrowserSurface:'include',preferCurrentTab:true}); }
      catch(e){ return; }   // user cancelled the picker
    }
    shotBtn.classList.add('is-busy');
    document.body.classList.add('capturing');   // hide dock, brand, popovers, cursor…
    try{
      const video=document.createElement('video');
      video.srcObject=stream; video.muted=true; video.playsInline=true;
      await video.play();
      // let the hidden UI paint into the capture before grabbing — the dock/popovers
      // normally fade over ~0.35s, so we kill their transitions in CSS (body.capturing)
      // for an instant hide and still give the capture compositor a short safety margin
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      await new Promise(r=>setTimeout(r,120));
      const w=video.videoWidth, h=video.videoHeight;
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(video,0,0,w,h);
      video.pause(); video.srcObject=null;
      await new Promise(res=>canvas.toBlob(blob=>{
        if(blob){
          const url=URL.createObjectURL(blob);
          const a=document.createElement('a');
          a.href=url; a.download='premock-'+Date.now()+'.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(()=>URL.revokeObjectURL(url),2000);
        }
        res();
      },'image/png'));
    }catch(err){ alert('Could not capture the scene.'); }
    finally{
      document.body.classList.remove('capturing');
      shotBtn.classList.remove('is-busy');
      if(!reuse && stream){ stream.getTracks().forEach(t=>t.stop()); }
    }
  }
  shotBtn.addEventListener('click',captureShot);
})();
