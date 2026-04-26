const fs = require('fs');
const files = ['public/index.html', 'public/app.html', 'public/login.html', 'public/checkout.html'];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Fonts
  content = content.replace(
    /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Syne[^"]+" rel="stylesheet">/g,
    '<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">'
  );

  // Variables
  content = content.replace(
    /:root\{[^}]+\}/,
    ':root{--bg:#FAFAF7;--surface:#F5F3EE;--surface2:#EDE9E0;--border:rgba(26,24,20,0.08);--border-hover:rgba(26,24,20,0.15);--accent:#C4813A;--accent-dim:#F0E4D0;--green:#C4813A;--green-dim:rgba(196,129,58,0.1);--amber:#C4813A;--amber-dim:rgba(196,129,58,0.1);--red:#C4813A;--red-dim:rgba(196,129,58,0.1);--text:#1A1814;--text-muted:#3D3A34;--text-dim:#7A7570;--radius:5px;--radius-sm:3px;--sidebar:290px}'
  );

  // Background gradient for paper
  content = content.replace(
    /body::before\{content:'';position:fixed;inset:0;background-image:linear-gradient[^}]+}/,
    "body::before{content:'';position:fixed;inset:0;background-image:repeating-linear-gradient(transparent, transparent 27px, var(--border) 28px);pointer-events:none;z-index:0}"
  );

  // Nav blur background
  content = content.replace(
    /background:rgba\(10,10,15,0\.88\)/g,
    'background:rgba(250,250,247,0.88)'
  );

  // Syne -> Instrument Serif
  content = content.replace(
    /font-family:'Syne',sans-serif;/g,
    "font-family:'Instrument Serif',serif;font-style:italic;"
  );

  // Section labels
  content = content.replace(
    /\.section-label\{font-size:11px;letter-spacing:\.1em;/g,
    '.section-label{font-size:9px;letter-spacing:.12em;font-family:\'DM Mono\',monospace;'
  );

  // Warmth moments
  content = content.replace(
    /\.hero-sub\{font-size:15px;/g,
    ".hero-sub{font-family:'Cormorant Garamond',serif;font-size:18px;"
  );
  content = content.replace(
    /\.section-sub\{font-size:14px;/g,
    ".section-sub{font-family:'Cormorant Garamond',serif;font-size:18px;"
  );
  content = content.replace(
    /\.plan-desc\{font-size:12px;/g,
    ".plan-desc{font-family:'Cormorant Garamond',serif;font-size:16px;"
  );
  
  // App specific updates for UI consistency
  content = content.replace(
    /background:rgba\(255,255,255,0\.03\)/g,
    'background:rgba(26,24,20,0.03)'
  );
  content = content.replace(
    /border-color:rgba\(124,107,255,\.4\)/g,
    'border-color:rgba(196,129,58,0.4)'
  );
  
  // Form inputs
  // bottom-border-only inputs
  content = content.replace(
    /input\[type=text\],input\[type=email\]\{background:var\(--surface2\);border:1px solid var\(--border\);border-radius:var\(--radius-sm\)/g,
    'input[type=text],input[type=email]{background:transparent;border:none;border-bottom:1px solid var(--border);border-radius:0'
  );
  content = content.replace(
    /input\[type=email\],input\[type=password\],input\[type=text\]\{background:var\(--surface2\);border:1px solid var\(--border\);border-radius:var\(--radius-sm\)/g,
    'input[type=email],input[type=password],input[type=text]{background:transparent;border:none;border-bottom:1px solid var(--border);border-radius:0'
  );

  fs.writeFileSync(file, content);
}
console.log('UI updated');
