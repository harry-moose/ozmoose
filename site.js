// Nav shadow once the page scrolls
const nav = document.getElementById('nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// Fade sections in as they enter the viewport
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// Event slideshow: every photo in data-photos, shuffled on each visit.
// Images load only when they're about to be shown, not all up front.
const show = document.getElementById('slideshow');
if (show) {
  const photos = show.dataset.photos.trim().split(/\s+/).map((n) => `pako/${n}.jpg`);
  for (let i = photos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [photos[i], photos[j]] = [photos[j], photos[i]];
  }

  const track = show.querySelector('.slides');
  track.innerHTML = '';
  const slides = photos.map((src) => {
    const div = document.createElement('div');
    div.className = 'slide';
    const img = document.createElement('img');
    img.alt = 'Pako Festa event photograph';
    img.dataset.src = src;
    div.appendChild(img);
    track.appendChild(div);
    return div;
  });

  const counter = show.querySelector('.counter');
  const bar = show.querySelector('.bar span');
  const pad = (n) => String(n).padStart(2, '0');
  let index = 0, timer;

  const load = (i) => {
    const img = slides[(i + slides.length) % slides.length].firstChild;
    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
  };

  function go(i) {
    index = (i + slides.length) % slides.length;
    load(index);
    load(index + 1); // preload neighbours so either arrow fades in instantly
    load(index - 1);
    slides.forEach((s, n) => s.classList.toggle('active', n === index));
    counter.innerHTML = `<b>${pad(index + 1)}</b> <i>/ ${pad(slides.length)}</i>`;
    bar.style.width = `${((index + 1) / slides.length) * 100}%`;
    clearTimeout(timer);
    timer = setTimeout(() => go(index + 1), 4500);
  }

  show.querySelectorAll('.arrow').forEach((b) =>
    b.addEventListener('click', () => go(index + Number(b.dataset.step))));
  go(0);
}

// Enquiry form → Google Forms. Google doesn't allow reading the reply cross-origin
// (no-cors), so a request that reaches Google counts as sent. Without JS the form
// still posts normally and shows Google's own confirmation page.
const enquiry = document.getElementById('enquiry');
if (enquiry) {
  const status = enquiry.querySelector('.form-status');
  const button = enquiry.querySelector('button[type="submit"]');

  enquiry.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Sending…';
    try {
      await fetch(enquiry.action, {
        method: 'POST',
        mode: 'no-cors',
        body: new URLSearchParams(new FormData(enquiry)),
      });
      enquiry.classList.add('sent');
      status.textContent = "Thanks! We'll be in touch soon.";
    } catch {
      status.classList.add('error');
      status.textContent = 'Something went wrong. Please check your connection and try again.';
      button.disabled = false;
    }
  });
}

// Gallery lightbox
const lightbox = document.getElementById('lightbox');
if (lightbox) {
  const items = [...document.querySelectorAll('.masonry img')];
  const big = lightbox.querySelector('img');
  let current = 0;

  const open = (i) => {
    current = (i + items.length) % items.length;
    big.src = items[current].src;
    big.alt = items[current].alt;
    lightbox.classList.add('open');
  };
  const close = () => lightbox.classList.remove('open');

  items.forEach((img, i) => img.parentElement.parentElement.addEventListener('click', () => open(i)));
  lightbox.querySelector('.close').addEventListener('click', close);
  lightbox.querySelector('.prev').addEventListener('click', (e) => { e.stopPropagation(); open(current - 1); });
  lightbox.querySelector('.next').addEventListener('click', (e) => { e.stopPropagation(); open(current + 1); });
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') open(current - 1);
    if (e.key === 'ArrowRight') open(current + 1);
  });
}
