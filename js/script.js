document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.filter-nav button');
  const projects = document.querySelectorAll('.project');

  // 1. Filtering Logic
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      // Update active state
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Filter projects
      projects.forEach(proj => {
        const tags = proj.dataset.tags.split(' ');
        if (filter === 'all' || tags.includes(filter)) {
          proj.classList.remove('filtered-out');
          // Re-observe to trigger animations for newly shown items
          observer.observe(proj); 
        } else {
          proj.classList.add('filtered-out');
        }
      });

      // Mobile: Scroll to top of timeline on filter change
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
  function updateSystemStatus() {
    const statusText = document.querySelector('.status-text');
    if (!statusText) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Updates the display with a terminal-style status line
    statusText.innerHTML = `SEATTLE, WA // SYS_T_MIN_${timeStr} // STATUS_OPTIMAL`;
  }

  // Initial call and set interval for every 10 seconds
  updateSystemStatus();
  setInterval(updateSystemStatus, 10000);
});