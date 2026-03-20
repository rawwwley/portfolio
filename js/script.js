document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.filter-nav button');
  const projects = document.querySelectorAll('.project');

  // 1. Filtering Logic
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      projects.forEach(proj => {
        const tags = proj.dataset.tags.split(' ');
        if (filter === 'all' || tags.includes(filter)) {
          proj.classList.remove('filtered-out');
          observer.observe(proj);
        } else {
          proj.classList.add('filtered-out');
        }
      });

      // Mobile: scroll to top of timeline on filter change
      if (window.innerWidth < 1024) {
        window.scrollTo({
          top: document.querySelector('.timeline').offsetTop - 120,
          behavior: 'smooth'
        });
      }
    });
  });

  // 2. Intersection Observer (Scroll Reveal)
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.05
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, observerOptions);

  projects.forEach(p => observer.observe(p));

  // 3. Dynamic System Header
  // Status is time-conditional: active during business hours, standby otherwise
  function getStatus() {
    const h = new Date().getHours();
    return (h >= 8 && h < 18) ? 'STATUS_ACTIVE' : 'STATUS_STANDBY';
  }

  function updateSystemStatus() {
    const statusText = document.querySelector('.status-text');
    if (!statusText) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    statusText.innerHTML = `SEATTLE, WA // SYS_T_MIN_${timeStr} // ${getStatus()}`;
  }

  updateSystemStatus();
  setInterval(updateSystemStatus, 10000);
});