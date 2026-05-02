// Year
document.getElementById('year').textContent = new Date().getFullYear();

// Cursor blob follows mouse with easing
const blob = document.querySelector('.cursor-blob');
let bx = window.innerWidth / 2, by = window.innerHeight / 2;
let tx = bx, ty = by;

window.addEventListener('mousemove', (e) => {
  tx = e.clientX;
  ty = e.clientY;
});
function animateBlob() {
  bx += (tx - bx) * 0.18;
  by += (ty - by) * 0.18;
  blob.style.transform = `translate(${bx}px, ${by}px)`;
  requestAnimationFrame(animateBlob);
}
animateBlob();

// Theme toggle (light/dark)
const root = document.documentElement;
const toggle = document.querySelector('.theme-toggle');
let light = false;
toggle.addEventListener('click', () => {
  light = !light;
  if (light) {
    root.style.setProperty('--bg', '#f7f7fb');
    root.style.setProperty('--bg-2', '#ffffff');
    root.style.setProperty('--text', '#0b0f14');
    root.style.setProperty('--muted', '#4b5563');
    root.style.setProperty('--card', '#ffffff');
    root.style.setProperty('--accent', '#2563eb');   // blue accent
    root.style.setProperty('--accent-2', '#10b981'); // green accent
    root.style.setProperty('--ring', 'rgba(37,99,235,0.35)');
    document.body.style.background =
      'radial-gradient(1200px 600px at 20% 10%, #ffffff 0%, #f7f7fb 40%, #e5e7eb 100%)';
  } else {
    root.style.setProperty('--bg', '#0b0f14');
    root.style.setProperty('--bg-2', '#0f141a');
    root.style.setProperty('--text', '#e6e6e6');
    root.style.setProperty('--muted', '#9aa4ad');
    root.style.setProperty('--card', '#121821');
    root.style.setProperty('--accent', '#7c3aed');
    root.style.setProperty('--accent-2', '#10b981');
    root.style.setProperty('--ring', 'rgba(124,58,237,0.35)');
    document.body.style.background =
      'radial-gradient(1200px 600px at 20% 10%, #0f141a 0%, #0b0f14 40%, #090c10 100%)';
  }
});

// Intersection reveal
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Magnetic buttons
const magnets = document.querySelectorAll('.magnetic');
magnets.forEach(btn => {
  let rect, hover = false;
  const color = btn.dataset.color || '#7c3aed';

  btn.addEventListener('mouseenter', () => {
    hover = true;
    rect = btn.getBoundingClientRect();
    btn.style.transition = 'transform 0.05s ease';
    btn.style.boxShadow = `0 14px 28px ${hexToRgba(color, 0.35)}`;
    btn.style.borderColor = hexToRgba(color, 0.6);
    btn.style.background = `linear-gradient(180deg, ${hexToRgba(color, 0.35)}, ${hexToRgba(color, 0.2)})`;
  });
  btn.addEventListener('mouseleave', () => {
    hover = false;
    btn.style.transform = 'translate3d(0,0,0)';
    btn.style.boxShadow = '';
    btn.style.borderColor = '';
    btn.style.background = '';
  });
  window.addEventListener('mousemove', (e) => {
    if (!hover) return;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const dist = Math.hypot(x, y);
    const maxPull = 18;
    const pull = Math.max(0, maxPull - dist / 10);
    btn.style.transform = `translate3d(${x * 0.08}px, ${y * 0.08}px, 0) scale(${1 + pull / 300})`;
  });
});

// Helper: hex to rgba
function hexToRgba(hex, alpha = 1) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Dynamic gradient hue shift on scroll
const bg = document.querySelector('.bg-gradient');
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  const hue = (y / 10) % 360;
  bg.style.filter = `blur(80px) hue-rotate(${hue}deg)`;
});

// Parallax rings in hero
const rings = document.querySelectorAll('.ring');
window.addEventListener('scroll', () => {
  const s = window.scrollY * 0.05;
  rings.forEach((r, i) => {
    r.style.transform = `translateY(${Math.sin(s + i) * 10}px) rotate(${s * (i + 1)}deg)`;
  });
});

// Load projects from JSON
const projectList = document.getElementById('project-list');
fetch('assets/projects.json')
  .then(res => res.json())
  .then(projects => {
    projectList.innerHTML = projects.map(p => `
      <article class="project-card reveal">
        <div class="project-thumb" style="background:
          radial-gradient(400px 200px at 20% 20%, ${p.gradientStart}, ${p.gradientEnd});"></div>
        <div class="project-body">
          <h3 class="project-title">${p.title}</h3>
          <p class="project-desc">${p.description}</p>
          <div class="project-tags">
            ${(p.tags || []).map(t => `<span>${t}</span>`).join('')}
          </div>
          ${p.link ? `<a class="btn ghost magnetic" data-color="#7C3AED" href="${p.link}" target="_blank" rel="noopener">Live Demo</a>` : ''}
        </div>
      </article>
    `).join('');
  })
  .catch(err => {
    projectList.innerHTML = `<p style="color:red">Error loading projects.json: ${err}</p>`;
  });

// Contact form (demo only)
const form = document.getElementById('contactForm');
const statusEl = document.getElementById('formStatus');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  statusEl.textContent = 'Sending...';
  setTimeout(() => {
    statusEl.textContent = 'Thanks, RajRatna will get back to you soon!';
    form.reset();
  }, 800);
});

const menuBtn = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav nav');

menuBtn.addEventListener('click', () => {
  navMenu.classList.toggle('active');
});