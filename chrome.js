// Liquid glass lenses — raymarched fluid blobs that magnify the hero behind them.
// Blob motion adapted from the "Liquid Chrome - Hero Page" template on 21st.dev,
// running on raw WebGL instead of Three.js so the page has no dependencies.
//
// How the magnifying works: the hero's dot grid and any [data-lens] text are
// redrawn into an offscreen 2D canvas and uploaded as a texture. The WebGL
// canvas sits above the headline but is transparent outside the blobs; inside a
// blob it samples that texture pulled toward the blob's centre, which magnifies
// it like a convex lens. Real DOM text stays crisp everywhere else.
(function () {
  const GRID = 28; // must match .hero background-size in styles.css

  const VERT = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform sampler2D uScene;

    #define MAX_STEPS 90
    #define MAX_DIST 40.0
    #define SURF_DIST 0.001
    #define LENS_POWER 0.13    // how far samples are pulled inward (uv units)
    #define DISPERSION 0.035   // spread between R/G/B samples for the rainbow fringe

    float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    float getSceneSDF(vec3 p) {
      float t = uTime * 0.12;
      vec2 mPos = (uMouse - 0.5) * 6.5;
      float d = length(p - vec3(mPos.x, mPos.y, 1.2)) - 0.9;

      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        vec3 pos = vec3(
          sin(t * 0.7 + fi * 1.5) * 3.8,
          cos(t * 0.5 + fi * 2.2) * 2.2,
          sin(t * 0.9 + fi * 0.8) * 1.0
        );
        vec3 p_str = p - pos;
        p_str.y *= 0.8 + 0.3 * sin(t + fi);
        float r = 0.5 + 0.3 * sin(t * 0.8 + fi);
        d = smin(d, length(p_str) - r, 1.1);
      }

      for (int j = 0; j < 16; j++) {
        float fj = float(j);
        vec3 pos = vec3(
          sin(t * 1.3 + fj * 4.1) * 5.2,
          cos(t * 1.0 + fj * 2.8) * 3.6,
          sin(t * 1.6 + fj * 0.7) * 0.8
        );
        float r = 0.08 + 0.2 * abs(cos(t * 1.8 + fj * 1.2));
        d = smin(d, length(p - pos) - r, 0.45);
      }

      d += sin(p.x * 2.5 + t) * sin(p.y * 2.5 + t) * 0.04;
      return d;
    }

    vec3 getNormal(vec3 p) {
      vec2 e = vec2(0.001, 0.0);
      return normalize(vec3(
        getSceneSDF(p + e.xyy) - getSceneSDF(p - e.xyy),
        getSceneSDF(p + e.yxy) - getSceneSDF(p - e.yxy),
        getSceneSDF(p + e.yyx) - getSceneSDF(p - e.yyx)
      ));
    }

    void main() {
      vec2 suv = gl_FragCoord.xy / uResolution;
      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
      vec3 ro = vec3(0.0, 0.0, -8.2);
      vec3 rd = normalize(vec3(uv, 3.2));

      float dTotal = 0.0;
      for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dTotal;
        float dS = getSceneSDF(p);
        dTotal += dS;
        if (dTotal > MAX_DIST || abs(dS) < SURF_DIST) break;
      }

      // Outside the glass: fully transparent so the page shows through.
      if (dTotal >= MAX_DIST) { gl_FragColor = vec4(0.0); return; }

      vec3 p = ro + rd * dTotal;
      vec3 n = getNormal(p);
      vec3 v = -rd;
      float facing = max(0.0, dot(n, v));

      // Convex-lens refraction: pull samples toward the blob centre along the
      // surface normal. On a sphere this gives an even zoom; tiny beads overshoot
      // and flip the image, like real water droplets.
      vec2 bend = vec2(n.x * uResolution.y / uResolution.x, n.y) * LENS_POWER;
      vec3 col;
      col.r = texture2D(uScene, suv - bend * (1.0 - DISPERSION)).r;
      col.g = texture2D(uScene, suv - bend).g;
      col.b = texture2D(uScene, suv - bend * (1.0 + DISPERSION)).b;

      // Faint sage glass tint
      col *= vec3(0.97, 1.0, 0.975);

      // Edge darkening where light bends away (gives the glass its outline)
      float rim = pow(1.0 - facing, 2.5);
      col = mix(col, vec3(0.36, 0.48, 0.42), rim * 0.5);

      // Bright inner caustic ring just inside the edge
      float ring = smoothstep(0.18, 0.32, facing) * (1.0 - smoothstep(0.32, 0.5, facing));
      col += vec3(0.95, 1.0, 0.94) * ring * 0.18;

      // Studio reflections: overhead softbox + cursor-driven glint
      vec3 r = reflect(rd, n);
      float softbox = pow(max(0.0, dot(r, normalize(vec3(-0.35, 0.85, -0.4)))), 28.0);
      col += vec3(1.0, 0.99, 0.96) * softbox * 0.85;

      vec3 lightPos = normalize(vec3((uMouse.x - 0.5) * 15.0, (uMouse.y - 0.5) * 15.0 + 5.0, -3.5));
      float specPeak = pow(max(0.0, dot(reflect(-lightPos, n), v)), 900.0);
      float specSoft = pow(max(0.0, dot(reflect(-lightPos, n), v)), 48.0);
      col += vec3(2.2) * specPeak + vec3(0.85, 1.0, 0.9) * specSoft * 0.25;

      // Pearlescent fringe at the very edge
      col += vec3(0.65, 0.9, 0.75) * pow(1.0 - facing, 6.0) * 0.35;

      // Soft silhouette for anti-aliasing at the reduced render resolution
      float alpha = smoothstep(0.0, 0.12, facing);
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(col * alpha, alpha);
    }
  `;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // Paint what sits "behind the glass": white, the dot grid, and the [data-lens]
  // text, character by character at its exact on-screen position.
  function paintScene(host, ctx, dpr) {
    const W = host.clientWidth, H = host.clientHeight;
    const hostRect = host.getBoundingClientRect();
    // Colours come from the CSS palette tokens so the lenses always match the page.
    const theme = getComputedStyle(host);
    const token = (name, fallback) => theme.getPropertyValue(name).trim() || fallback;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.backgroundColor || '#fff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = token('--grid', 'rgba(0, 0, 0, 0.14)');
    for (let y = GRID / 2; y < H; y += GRID) {
      for (let x = GRID / 2; x < W; x += GRID) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const range = document.createRange();
    host.querySelectorAll('[data-lens]').forEach((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        const cs = getComputedStyle(parent);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const ascent = ctx.measureText('Mg').fontBoundingBoxAscent;

        // Gradient text (.liquid-text) gets the same top-to-bottom gradient.
        if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') {
          const pr = parent.getBoundingClientRect();
          const g = ctx.createLinearGradient(0, pr.top - hostRect.top, 0, pr.bottom - hostRect.top);
          g.addColorStop(0, token('--liquid-from', '#111'));
          g.addColorStop(1, token('--liquid-to', '#777'));
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = cs.color;
        }

        const text = node.textContent;
        for (let i = 0; i < text.length; i++) {
          if (text[i].trim() === '') continue;
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rc = range.getBoundingClientRect();
          if (!rc.width) continue;
          ctx.fillText(text[i], rc.left - hostRect.left, rc.top - hostRect.top + ascent);
        }
      }
    });
  }

  function initChrome(canvas) {
    const host = canvas.parentElement;
    const gl = canvas.getContext('webgl', {
      antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance',
    });
    if (!gl) { host.classList.add('no-webgl'); return; }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { host.classList.add('no-webgl'); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uRes = gl.getUniformLocation(prog, 'uResolution');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');

    // Scene texture (what the lenses magnify), drawn at full device resolution
    // so zoomed text stays sharp even though the raymarch itself runs lower.
    const sceneCanvas = document.createElement('canvas');
    const sceneCtx = sceneCanvas.getContext('2d');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    function updateScene() {
      const w = host.clientWidth, h = host.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, maxTex / Math.max(w, h));
      sceneCanvas.width = Math.round(w * dpr);
      sceneCanvas.height = Math.round(h * dpr);
      paintScene(host, sceneCtx, dpr);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
    }

    // The raymarcher is heavy; render below native resolution, lower still on phones.
    const isSmall = window.matchMedia('(max-width: 768px)').matches;
    const scale = Math.min(window.devicePixelRatio || 1, isSmall ? 0.75 : 1.25);

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      updateScene();
      if (!raf) frame(performance.now());
    }

    // The attractor lens rests below the fold so it never parks over the
    // headline (touch devices never send hover moves to pull it away).
    const mouse = { x: 0.5, y: -0.6 }, target = { x: 0.5, y: -0.6 };
    window.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = 1 - (e.clientY - r.top) / r.height;
    });

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true, raf = 0;

    function frame(now) {
      mouse.x += (target.x - mouse.x) * 0.08;
      mouse.y += (target.y - mouse.y) * 0.08;
      gl.uniform1f(uTime, reduced ? 24.0 : now * 0.001);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = (!reduced && visible && !document.hidden) ? requestAnimationFrame(frame) : 0;
    }

    function wake() {
      if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    // Repaint the texture once web fonts arrive, or zoomed text uses the fallback font.
    if (document.fonts) document.fonts.ready.then(() => { updateScene(); if (!raf) frame(performance.now()); });

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(host);
    document.addEventListener('visibilitychange', wake);
    wake();
    host.classList.add('chrome-ready');
  }

  document.querySelectorAll('canvas[data-chrome]').forEach(initChrome);
})();
