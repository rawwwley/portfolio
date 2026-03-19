document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.filter-nav button');
  const projects = document.querySelectorAll('.project');

  // 1. Filtering Logic
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      // Update active button styling
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Project filtering
      projects.forEach(proj => {
        const tags = proj.dataset.tags.split(' ');
        if (filter === 'all' || tags.includes(filter)) {
          proj.classList.remove('filtered-out');
          observer.observe(proj); // Ensure the scroll observer watches it again
        } else {
          proj.classList.add('filtered-out');
        }
      });

      // --- NEW: MOBILE SCROLL LOGIC GOES HERE ---
      // If the screen is mobile-sized, scroll to the top of the timeline
      // so the user sees the filtered results immediately.
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
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, observerOptions);

  projects.forEach(p => observer.observe(p));
});