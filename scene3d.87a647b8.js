/* Dependency-free WebGL architecture scene. All content lives in HTML;
   this canvas adds orbiting, object picking and depth without changing navigation. */
(function () {
  'use strict';
  async function init() {
    var scene = document.querySelector('.platform-scene');
    var canvas = document.getElementById('architecture-3d');
    if (!canvas || !scene) return;
    var labels=scene.querySelector('.package-markers');
    var nameNodes=Array.from(labels.querySelectorAll('[data-package]'));
    function placeNames(points,width,height) {
      labels.setAttribute('viewBox','0 0 '+width+' '+height);
      points.forEach(function(p,i){
        nameNodes[i].setAttribute('transform','translate('+Math.max(18,Math.min(width-18,p[0])).toFixed(1)+' '+Math.max(18,Math.min(height-18,p[1])).toFixed(1)+')');
      });
    }
    function fallbackNames(){
      var world=scene.querySelector('.scene-world').getBoundingClientRect();
      var scale=Math.min(world.width/680,world.height/490),offsetX=(world.width-680*scale)/2,offsetY=(world.height-490*scale)/2;
      placeNames([[150,245],[275,245],[400,245],[525,245]].map(function(p){return [offsetX+p[0]*scale,offsetY+p[1]*scale];}),world.width,world.height);
    }
    window.addEventListener('resize',function(){if(!scene.classList.contains('has-3d'))fallbackNames();});
    fallbackNames();
    var gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) return;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var vertex = 'attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor; attribute float aId; attribute float aPart; uniform vec3 uEye; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uForward; uniform float uAspect; uniform vec4 uLifts; uniform vec4 uReveal; varying vec3 vColor; varying vec3 vNormal; varying vec3 vPosition; varying float vId; void main(){vec3 p=aPosition; if(aId>0.5 && aId<1.5)p.y+=uLifts.x;else if(aId>1.5 && aId<2.5)p.y+=uLifts.y;else if(aId>2.5 && aId<3.5)p.y+=uLifts.z;else if(aId>3.5 && aId<4.5)p.y+=uLifts.w; if(aPart>0.5){float reveal=aId<1.5?uReveal.x:(aId<2.5?uReveal.y:(aId<3.5?uReveal.z:uReveal.w));p.y+=reveal*0.65;} vec3 d=p-uEye; vec3 v=vec3(dot(d,uRight),dot(d,uUp),dot(d,uForward)); gl_Position=vec4(v.x*2.25/uAspect,v.y*2.25,1.005*v.z-0.2005,v.z);vColor=aColor;vNormal=aNormal;vPosition=p;vId=aId;}';
    var fragment = 'precision mediump float; varying vec3 vColor; varying vec3 vNormal; varying vec3 vPosition; varying float vId; uniform float uPick; uniform float uHover; uniform vec3 uPulse; void main(){if(uPick>0.5){gl_FragColor=vec4(vId/255.0,0.0,0.0,1.0);return;} vec3 n=normalize(vNormal); float light=0.78+0.22*max(dot(n,normalize(vec3(-0.6,1.0,0.5))),0.0); if(vPosition.y<0.09){float d=min(min(length(vPosition.xz-vec2(-3.6,0.6)),length(vPosition.xz-vec2(-1.2,0.6))),min(length(vPosition.xz-vec2(1.2,0.6)),length(vPosition.xz-vec2(3.6,0.6))));light=0.85+0.15*smoothstep(0.3,1.25,d);} if(vId>0.5 && abs(vId-uHover)<0.1)light+=0.09; vec3 col=vColor*light; if(vPosition.y<0.09 && uPulse.z>=0.0 && uPulse.z<1.4){float r=length(vPosition.xz-uPulse.xy);float wave=(1.0-smoothstep(0.03,0.13,abs(r-uPulse.z*4.5)))*(1.0-uPulse.z/1.4);col=mix(col,vec3(0.63,0.38,0.95),wave*0.6);} gl_FragColor=vec4(col,1.0);}';
    function shader(type, source) {
      var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      return s;
    }
    var program, buffer;
    try {
      program = gl.createProgram();
      var vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      var parallel = gl.getExtension('KHR_parallel_shader_compile');
      if(parallel) {
        while(!gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR)){if(gl.isContextLost())return;await new Promise(requestAnimationFrame);}
      } else {
        // Give the browser a paint before the driver's synchronous link check.
        await new Promise(requestAnimationFrame);
      }
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('3D shader linking failed');
      buffer = gl.createBuffer();
    } catch (e) { if (program) gl.deleteProgram(program); return; }
    var vertices = [], part=0;
    function color(hex) { return [parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255]; }
    var violet=color('9361ff'), white=color('ffffff'), gray=color('b9b9c4');
    function tri(a,b,c,n,col,id) { [a,b,c].forEach(function(p){vertices.push.apply(vertices,p.concat(n,col,[id||0,part]));}); }
    function quad(a,b,c,d,n,col,id) { tri(a,b,c,n,col,id); tri(a,c,d,n,col,id); }
    function box(x,y,z,w,h,d,col,id) {
      var l=x-w/2,r=x+w/2,b=y,t=y+h,f=z+d/2,k=z-d/2;
      quad([l,b,f],[r,b,f],[r,t,f],[l,t,f],[0,0,1],col,id);
      quad([r,b,k],[l,b,k],[l,t,k],[r,t,k],[0,0,-1],col,id);
      quad([r,b,f],[r,b,k],[r,t,k],[r,t,f],[1,0,0],col,id);
      quad([l,b,k],[l,b,f],[l,t,f],[l,t,k],[-1,0,0],col,id);
      quad([l,t,f],[r,t,f],[r,t,k],[l,t,k],[0,1,0],col,id);
      quad([l,b,k],[r,b,k],[r,b,f],[l,b,f],[0,-1,0],col,id);
    }
    function roundedBox(x,y,z,w,h,d,radius,col,id) {
      var halves=[w/2,h/2,d/2],center=[x,y+h/2,z],steps=3;
      [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]].forEach(function(face){
        var axis=face[0],sign=face[1],u=(axis+1)%3,v=(axis+2)%3;
        function point(i,j){var p=[0,0,0];p[axis]=sign*halves[axis];p[u]=(i/steps*2-1)*halves[u];p[v]=(j/steps*2-1)*halves[v];
          var base=p.map(function(a,k){return Math.max(-halves[k]+radius,Math.min(halves[k]-radius,a));});
          var n=normalize(p.map(function(a,k){return a-base[k];}));return {p:base.map(function(a,k){return a+n[k]*radius+center[k];}),n:n};}
        function triangle(a,b,c){[a,b,c].forEach(function(q){vertices.push.apply(vertices,q.p.concat(q.n,col,[id||0,part]));});}
        for(var i=0;i<steps;i++)for(var j=0;j<steps;j++){var a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),e=point(i,j+1);triangle(a,b,c);triangle(a,c,e);}
      });
    }
    function ring(x,y,z,inner,outer,col,id) {
      for(var i=0;i<48;i++) {
        var a=i*Math.PI/24,b=(i+1)*Math.PI/24;
        quad([x+Math.cos(a)*inner,y,z+Math.sin(a)*inner],[x+Math.cos(a)*outer,y,z+Math.sin(a)*outer],[x+Math.cos(b)*outer,y,z+Math.sin(b)*outer],[x+Math.cos(b)*inner,y,z+Math.sin(b)*inner],[0,1,0],col,id);
      }
    }
    // Layered warehouse diorama. Decorative geometry never intercepts package picks.
    var stone=color('e8e4ed'), trim=color('736780'), ink=color('322a40');
    box(0,-.12,0,32,.12,20,white);
    roundedBox(0,-.08,-.1,12.1,.13,8.6,.12,stone);
    box(0,.052,.2,10.8,.022,5.9,color('f4f1f8'));
    // A full-height facade, inset loading doors and a slim violet cornice.
    box(0,.075,-2.65,10,2.25,2.7,color('e2dce9'));
    box(0,2.325,-2.65,10.3,.16,2.95,white);
    box(0,2.20,-1.27,10.1,.16,.10,color('8551ce'));
    box(5.015,.09,-2.65,.045,2.12,2.65,color('c4bbd0'));
    for(var seam=-4.85;seam<4.95;seam+=.24)box(seam,.16,-1.29,.018,1.98,.024,color('cdc5d8'));
    for(var roof=-4.9;roof<5;roof+=.45)box(roof,2.49,-2.65,.018,.015,2.8,color('e0d9e9'));
    [-3,0,3].forEach(function(x){
      box(x,.08,-1.24,1.83,1.70,.11,ink);
      box(x,.12,-1.17,1.56,1.45,.05,color('f8f6fb'));
      for(var line=.28;line<1.5;line+=.17)box(x,line,-1.135,1.52,.016,.025,color('c7bed3'));
      box(x,.20,-1.10,1.56,.14,.09,color('62566f'));
      box(x,.075,-.94,1.96,.09,.72,color('a69ab7'));
      box(x,1.82,-1.06,2.14,.1,.82,white);
      box(x,1.72,-.66,2.14,.10,.055,color('a282cd'));
      box(x,1.97,-1.10,.42,.12,.06,color('9361ff'));
      [-1,1].forEach(function(side){
        roundedBox(x+side*1.02,.09,-.67,.12,.58,.12,.025,ink);
        box(x+side*1.02,.40,-.67,.125,.10,.125,color('c5a5f0'));
      });
      // Lane guides lead toward each pallet; leave the selection circles clear.
      [-1,1].forEach(function(side){box(x+side*.97,.079,.75,.035,.012,2.65,color('d1b5ef'));});
      box(x,.079,2.06,1.96,.012,.035,color('d1b5ef'));
    });
    // Roof details: inset lavender skylights and a pair of quiet ventilation units.
    [-2.7,.4].forEach(function(x){
      box(x,2.49,-2.65,1.9,.045,.95,trim);
      box(x,2.54,-2.65,1.72,.025,.78,color('c8b9e5'));
      box(x,2.57,-2.65,.04,.025,.8,white);
      box(x,2.57,-2.65,1.74,.025,.035,white);
    });
    [2.7,3.65].forEach(function(x){
      roundedBox(x,2.49,-2.8,.65,.37,.72,.05,color('b9b0c5'));
      ring(x,2.87,-2.8,.14,.23,ink);
      box(x,2.875,-2.8,.025,.015,.41,white);
      box(x,2.875,-2.8,.41,.015,.025,white);
    });
    // Two restrained topiary planters frame the scene without a fence or road.
    [-5.45,5.45].forEach(function(x){
      roundedBox(x,.055,-1.6,.62,.32,.62,.06,color('a99cb9'));
      box(x,.37,-1.6,.50,.045,.50,ink);
      box(x,.38,-1.6,.09,.52,.09,color('7b6e8b'));
      roundedBox(x,.73,-1.6,.74,.79,.74,.30,color('b6a5ce'));
    });
    // A small parked forklift: obsidian frame, violet body, pale forks.
    var fx=4.8,fz=2.45;
    roundedBox(fx,.24,fz,.62,.40,.88,.06,color('8751d1'));
    [-1,1].forEach(function(side){[-.28,.28].forEach(function(z){roundedBox(fx+side*.32,.085,fz+z,.15,.30,.24,.065,ink);});});
    box(fx,.64,fz-.17,.42,.22,.26,ink);
    [-1,1].forEach(function(side){
      box(fx+side*.26,.6,fz-.34,.035,.88,.035,trim);
      box(fx+side*.26,.6,fz+.20,.035,.88,.035,trim);
      box(fx+side*.24,.20,fz+.47,.045,1.10,.045,ink);
      box(fx+side*.21,.11,fz+.82,.055,.05,.63,trim);
    });
    box(fx,1.48,fz-.07,.70,.06,.72,white);
    box(fx,1.01,fz+.49,.50,.035,.025,trim);
    // Four portfolio destinations represented by selectable pallet clusters.
    var objects=[[-3.6,.6,gray],[-1.2,.6,violet],[1.2,.6,white],[3.6,.6,color('554466')]];
    for(var i=0;i<objects.length;i++){
      var o=objects[i],x=o[0],z=o[1],id=i+1;
      box(x,.06,z,1.45,.13,1.22,color('9e92b4'),id);
      for(var slat=-.56;slat<=.56;slat+=.28)box(x+slat,.19,z,.20,.06,1.22,color('c0b4d4'),id);
      for(var row=0;row<2;row++)for(var col=0;col<2;col++){
        var bx=x-.32+col*.64,bz=z-.27+row*.54;
        roundedBox(bx,.25,bz,.59,.63,.5,.05,o[2],id);
        box(bx,.26,bz+.255,.045,.60,.016,i===2?gray:white,id);
        box(bx,.89,bz,.045,.012,.5,i===2?gray:white,id);
      }
      part=1;
      roundedBox(x,.88,z,.63,.5,.57,.05,o[2],id);
      box(x,.89,z+.292,.045,.48,.02,white,id);
      part=0;
      await new Promise(requestAnimationFrame);
    }
    // Quiet grounding marks, without roads, fences or peripheral props.
    objects.forEach(function(o){ring(o[0],.055,.6,.85,.87,color('d8cbe9'));});
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    [['aPosition',3,0],['aNormal',3,3],['aColor',3,6],['aId',1,9],['aPart',1,10]].forEach(function(a){
      var loc=gl.getAttribLocation(program,a[0]); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,a[1],gl.FLOAT,false,44,a[2]*4);
    });
    var uniforms={}; ['Eye','Right','Up','Forward','Aspect','Lifts','Reveal','Pulse','Pick','Hover'].forEach(function(n){uniforms[n]=gl.getUniformLocation(program,'u'+n);});
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    var theta=.47, elevation=.62, distance=23, targetTheta=.47, targetElevation=.62, targetDistance=23, lifts=[0,0,0,0], visible=true, raf=null, last=0, hoverTime=0, lost=false;
    var aim=[0,.45,0],targetAim=[0,.45,0],reveals=[0,0,0,0],selectedAt=-10000,activeIndex=-1;
    var keys=['infra','delivery','observe','experience'];
    function normalize(a) { var l=Math.hypot(a[0],a[1],a[2]); return a.map(function(v){return v/l;}); }
    function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    function draw(pick) {
      if(lost) return;
      var eye=[aim[0]+distance*Math.cos(elevation)*Math.sin(theta),aim[1]+distance*Math.sin(elevation),aim[2]+distance*Math.cos(elevation)*Math.cos(theta)];
      var forward=normalize([aim[0]-eye[0],aim[1]-eye[1],aim[2]-eye[2]]),right=normalize(cross(forward,[0,1,0])),up=cross(right,forward);
      gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(uniforms.Eye,eye);gl.uniform3fv(uniforms.Right,right);gl.uniform3fv(uniforms.Up,up);gl.uniform3fv(uniforms.Forward,forward);
      gl.uniform1f(uniforms.Aspect,canvas.width/canvas.height);gl.uniform4fv(uniforms.Lifts,lifts);gl.uniform4fv(uniforms.Reveal,reveals);
      var age=(performance.now()-selectedAt)/1000;
      gl.uniform3fv(uniforms.Pulse,activeIndex>=0&&!reduced.matches?[objects[activeIndex][0],objects[activeIndex][1],age]:[0,0,-1]);gl.uniform1f(uniforms.Pick,pick?1:0);gl.uniform1f(uniforms.Hover,keys.indexOf(scene.dataset.highlight)+1);
      if(pick) gl.disable(gl.DITHER); else gl.enable(gl.DITHER);
      gl.drawArrays(gl.TRIANGLES,0,vertices.length/11);
      if(!pick){
        var rect=canvas.getBoundingClientRect(),dot=function(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];};
        placeNames(objects.map(function(o,i){var p=[o[0]-eye[0],1.65+lifts[i]+reveals[i]*.65-eye[1],o[1]-eye[2]],depth=dot(p,forward);return [rect.width/2+dot(p,right)*2.25/(rect.width/rect.height)/depth*rect.width/2,rect.height/2-dot(p,up)*2.25/depth*rect.height/2];}),rect.width,rect.height);
      }
    }
    function render() {
      if(reduced.matches) { theta=targetTheta;elevation=targetElevation;distance=targetDistance;aim=targetAim.slice();lifts=[0,0,0,0];reveals=[0,0,0,0]; }
      draw(false);
    }
    function frame(t) {
      raf=null;
      if(lost || !visible || document.hidden || reduced.matches) return;
      var elapsed=Math.min(50,t-last||16), ease=1-Math.exp(-elapsed/180);
      theta+=(targetTheta-theta)*ease;elevation+=(targetElevation-elevation)*ease;distance+=(targetDistance-distance)*ease;
      aim=aim.map(function(v,i){return v+(targetAim[i]-v)*ease;});
      var age=(t-selectedAt)/1000;
      lifts=lifts.map(function(v,i){var target=i===activeIndex?.22+Math.sin(Math.min(1,age)*Math.PI)*.16:0;return v+(target-v)*ease;});
      reveals=reveals.map(function(v,i){var target=i===activeIndex?(age<.65?1:.45):0;return v+(target-v)*ease;});draw(false);last=t;
      var settling=Math.abs(targetTheta-theta)+Math.abs(targetElevation-elevation)+Math.abs(targetDistance-distance)+aim.reduce(function(sum,v,i){return sum+Math.abs(targetAim[i]-v);},0);
      if(settling>.001||age<1.8)raf=requestAnimationFrame(frame);
    }
    function resume() { render(); if(!lost&&visible&&!document.hidden&&!reduced.matches&&raf===null) raf=requestAnimationFrame(frame); }
    function stop() { if(raf!==null) cancelAnimationFrame(raf);raf=null; }
    function homeDistance() { return canvas.clientWidth<420?15.5:15; }
    var home=23;
    function resize() {
      var nextHome=homeDistance();
      if(nextHome!==home){home=nextHome;distance=targetDistance=home;}
      var r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.75);
      canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));render();
    }
    function pick(e) {
      var r=canvas.getBoundingClientRect(),pixel=new Uint8Array(4);
      draw(true);
      gl.readPixels(Math.min(canvas.width-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*canvas.width))),Math.min(canvas.height-1,Math.max(0,Math.floor((r.bottom-e.clientY)/r.height*canvas.height))),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      draw(false);return pixel[0]>=1&&pixel[0]<=keys.length?keys[pixel[0]-1]:null;
    }
    var drag=null;
    canvas.addEventListener('pointerdown',function(e){if(e.isPrimary&&e.button===0){drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,touch:e.pointerType==='touch',moved:false};canvas.setPointerCapture(e.pointerId);}});
    canvas.addEventListener('pointermove',function(e){
      if(drag&&drag.id===e.pointerId){var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
        // Let the browser claim vertical touch gestures for page scrolling.
        if(drag.touch&&!drag.moved){var totalX=e.clientX-drag.startX,totalY=e.clientY-drag.startY;if(Math.abs(totalX)<=8||Math.abs(totalX)<=Math.abs(totalY))return;drag.moved=true;}
        if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
        targetTheta-=dx*.006;if(!drag.touch)targetElevation=Math.max(.4,Math.min(1.05,targetElevation+dy*.004));drag.x=e.clientX;drag.y=e.clientY;resume();}
      else if(e.pointerType==='mouse'&&performance.now()-hoverTime>80){
        hoverTime=performance.now();var key=pick(e);scene.dataset.highlight=key||'';canvas.classList.toggle('over-object',!!key);render();
      }
    });
    canvas.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;
      if(!drag.moved){var key=pick(e);if(key)scene.querySelector('.package-name[data-system="'+key+'"]').click();}
      drag=null;canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerleave',function(){if(!drag){delete scene.dataset.highlight;canvas.classList.remove('over-object');render();}});
    canvas.addEventListener('pointercancel',function(){drag=null;});
    canvas.addEventListener('lostpointercapture',function(){drag=null;});
    canvas.addEventListener('keydown',function(e){
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','Escape','+','-','1','2','3','4'].indexOf(e.key)<0)return;e.preventDefault();
      if(e.key==='ArrowLeft')targetTheta-=.15;if(e.key==='ArrowRight')targetTheta+=.15;
      if(e.key==='ArrowUp')targetElevation=Math.min(1.05,targetElevation+.1);if(e.key==='ArrowDown')targetElevation=Math.max(.4,targetElevation-.1);
      if(e.key==='Home'||e.key==='Escape')returnToYard();
      if(e.key==='+')targetDistance=Math.max(homeDistance()*.7,targetDistance-.8);if(e.key==='-')targetDistance=Math.min(homeDistance()*1.35,targetDistance+.8);
      if(/^[1234]$/.test(e.key))scene.querySelector('.package-name[data-system="'+keys[Number(e.key)-1]+'"]').click();resume();
    });
    function returnToYard(){targetTheta=.47;targetElevation=.62;targetDistance=homeDistance();targetAim=[0,.45,0];activeIndex=-1;selectedAt=-10000;resume();}
    canvas.addEventListener('dblclick',function(e){if(!pick(e))returnToYard();});
    scene.addEventListener('package-select',function(e){
      activeIndex=keys.indexOf(e.detail.key);if(activeIndex<0)return;selectedAt=performance.now();
      if(!reduced.matches){var o=objects[activeIndex];targetAim=[o[0]*.22,.5,.1];targetTheta=[.34,.43,.52,.61][activeIndex];targetElevation=.68;targetDistance=homeDistance()*.97;}
      render();resume();
    });
    new MutationObserver(render).observe(scene,{attributes:true,attributeFilter:['data-focus','data-highlight']});
    if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
    if('IntersectionObserver' in window)new IntersectionObserver(function(es){visible=es[0].isIntersecting;if(visible)resume();else stop();}).observe(canvas);
    document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else resume();});
    reduced.addEventListener('change',function(){stop();resume();});
    canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();lost=true;stop();scene.classList.remove('has-3d');canvas.tabIndex=-1;fallbackNames();});
    scene.classList.add('has-3d');canvas.tabIndex=0;resize();
    if(scene.dataset.engaged)scene.dispatchEvent(new CustomEvent('package-select',{detail:{key:scene.dataset.focus}}));
    resume();
  }
  document.addEventListener('DOMContentLoaded',function(){
    var world=document.querySelector('.scene-world');
    if(!world)return;
    var scene=world.closest('.platform-scene'),started=false;
    function start(){
      if(started)return;started=true;
      requestAnimationFrame(function(){setTimeout(function(){init().catch(function(){/* The HTML/SVG view remains usable. */});},0);});
    }
    function engage(){scene.dataset.engaged='true';start();}
    // Mobile gets useful content immediately; build 3D only on actual intent.
    if(window.matchMedia('(max-width: 800px), (pointer: coarse)').matches){
      scene.addEventListener('pointerdown',engage,{once:true});
      scene.addEventListener('focusin',engage,{once:true});
    }else if('IntersectionObserver' in window){
      var observer=new IntersectionObserver(function(entries){if(entries[0].isIntersecting){observer.disconnect();start();}},{rootMargin:'80px'});
      observer.observe(world);
    }else start();
  });
})();
