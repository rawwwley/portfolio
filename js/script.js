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
          observer.observe(proj); // Re-trigger the scroll animation
        } else {
          proj.classList.add('filtered-out');
        }
      });

      // Mobile behavior: scroll to top of timeline when changing categories
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
    rootMargin: '0px 0px -5% 0px', // Triggers right as it enters the viewport
    threshold: 0.02 // Extremely low threshold so tall mobile cards trigger instantly
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